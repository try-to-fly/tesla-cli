import mqtt from 'mqtt';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  VehicleState,
  ChargingState,
  StateTracker,
  PersistedMqttState,
  ParkingSnapshot,
} from '../../types/mqtt.js';
import { getMessageService } from './message-service.js';
import { getGrafanaClient } from '../index.js';
import { recommendAroundAndFormat, distanceMeters } from '../utils/amap-recommend.js';
import { amapReverseGeocode } from '../utils/amap-regeo.js';
import { config } from '../../config/index.js';

const execAsync = promisify(exec);

const DEBOUNCE_MS = 60 * 1000; // 60 秒防抖
const TRIGGER_DELAY_MS = 30 * 1000; // 30 秒延迟等待数据入库
const PERSIST_DEBOUNCE_MS = 5 * 1000; // 5 秒防抖持久化
const UPDATE_NOTIFY_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 小时更新通知间隔
const PARK_NOTIFY_MIN_MS = 60 * 60 * 1000; // 停车->驾驶推送最小间隔（默认 1h）

export interface MqttServiceOptions {
  host: string;
  port: number;
  carId: number;
  topicPrefix: string;
}

export class MqttService {
  private client: mqtt.MqttClient | null = null;
  private options: MqttServiceOptions;
  private state: StateTracker = {
    vehicleState: null,
    chargingState: null,
    lastDriveTrigger: 0,
    lastChargeTrigger: 0,
    updateAvailable: false,
    updateVersion: null,
    lastUpdateNotifyTime: 0,
    lastParkStart: null,
    lastParkNotifyTime: 0,
    lastChargeStart: null,
    lastParkRecommendCenter: null,
    lastParkRecommendTime: 0,

    lastNavDestination: null,
    lastNavThresholdNotifiedMinutes: [],
    lastNavArrivedNotified: false,
  };

  private lastRatedRangeKm: number | null = null;
  private lastUsableBatteryLevel: number | null = null;
  private lastLatitude: number | null = null;
  private lastLongitude: number | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: MqttServiceOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    const { host, port, carId, topicPrefix } = this.options;
    const brokerUrl = `mqtt://${host}:${port}`;

    // 加载持久化状态
    await this.loadPersistedState();

    console.log(`正在连接 MQTT Broker: ${brokerUrl}`);

    this.client = mqtt.connect(brokerUrl, {
      clientId: `tesla-service-${Date.now()}`,
      reconnectPeriod: 5000,
      keepalive: 30,           // 30秒心跳，更频繁保持连接
      connectTimeout: 30000,   // 30秒连接超时
      clean: true,             // 清除旧会话
      resubscribe: true,       // 重连后自动重订阅
    });

    this.client.on('connect', () => {
      console.log('MQTT 连接成功');
      this.subscribe();
    });

    this.client.on('error', (err) => {
      const error = err as Error & { code?: string | number };
      console.error('MQTT 错误:', error.message, error.code ? `(${error.code})` : '');
    });

    this.client.on('reconnect', () => {
      console.log('正在重新连接 MQTT...');
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message.toString());
    });

    this.client.on('close', () => {
      console.log('MQTT 连接已关闭');
    });

    this.client.on('offline', () => {
      console.log('MQTT 客户端离线（网络不可用）');
    });

    this.client.on('disconnect', (packet) => {
      console.log('收到 Broker 断开请求:', packet?.reasonCode || '未知原因');
    });
  }

  stop(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
      console.log('MQTT 服务已停止');
    }
  }

  private subscribe(): void {
    if (!this.client) return;

    const { carId, topicPrefix } = this.options;
    const topics = [
      `${topicPrefix}/cars/${carId}/state`,
      `${topicPrefix}/cars/${carId}/charging_state`,
      `${topicPrefix}/cars/${carId}/update_available`,
      `${topicPrefix}/cars/${carId}/update_version`,
      // TeslaMate MQTT: rated range + usable battery percent for park-loss tracking
      `${topicPrefix}/cars/${carId}/rated_battery_range_km`,
      `${topicPrefix}/cars/${carId}/usable_battery_level`,
      // TeslaMate MQTT: navigation (active route)
      `${topicPrefix}/cars/${carId}/active_route`,
      // TeslaMate MQTT: real-time location
      `${topicPrefix}/cars/${carId}/latitude`,
      `${topicPrefix}/cars/${carId}/longitude`,
    ];

    topics.forEach((topic) => {
      this.client!.subscribe(topic, (err) => {
        if (err) {
          console.error(`订阅失败 ${topic}:`, err.message);
        } else {
          console.log(`已订阅: ${topic}`);
        }
      });
    });
  }

  private handleMessage(topic: string, message: string): void {
    const { carId, topicPrefix } = this.options;
    const stateTopic = `${topicPrefix}/cars/${carId}/state`;
    const chargingTopic = `${topicPrefix}/cars/${carId}/charging_state`;
    const updateAvailableTopic = `${topicPrefix}/cars/${carId}/update_available`;
    const updateVersionTopic = `${topicPrefix}/cars/${carId}/update_version`;
    const ratedRangeTopic = `${topicPrefix}/cars/${carId}/rated_battery_range_km`;
    const usableBatteryTopic = `${topicPrefix}/cars/${carId}/usable_battery_level`;
    const activeRouteTopic = `${topicPrefix}/cars/${carId}/active_route`;
    const latitudeTopic = `${topicPrefix}/cars/${carId}/latitude`;
    const longitudeTopic = `${topicPrefix}/cars/${carId}/longitude`;

    if (process.env.MQTT_DEBUG === '1') {
      console.log(`[mqtt] ${topic} = ${message}`);
    }

    if (topic === stateTopic) {
      this.handleVehicleStateChange(message as VehicleState);
    } else if (topic === chargingTopic) {
      this.handleChargingStateChange(message as ChargingState);
    } else if (topic === updateAvailableTopic) {
      this.handleUpdateAvailable(message === 'true');
    } else if (topic === updateVersionTopic) {
      this.handleUpdateVersion(message);
    } else if (topic === ratedRangeTopic) {
      this.handleRatedRange(message);
    } else if (topic === usableBatteryTopic) {
      this.handleUsableBatteryLevel(message);
    } else if (topic === latitudeTopic) {
      const n = Number(message);
      if (Number.isFinite(n)) this.lastLatitude = n;
    } else if (topic === longitudeTopic) {
      const n = Number(message);
      if (Number.isFinite(n)) this.lastLongitude = n;
    } else if (topic === activeRouteTopic) {
      this.handleActiveRoute(message);
    }
  }

  private async handleVehicleStateChange(newState: VehicleState): Promise<void> {
    const prevState = this.state.vehicleState;
    this.state.vehicleState = newState;

    console.log(`车辆状态: ${prevState || '(初始化)'} -> ${newState}`);

    // 事件 2: driving → 非driving (行程结束)
    if (prevState === 'driving' && newState !== 'driving') {
      this.markParkStart();           // 记录停车起点
      this.triggerDriveScreenshot();  // 行程截图
      this.triggerParkRecommend();    // 周边推荐
    }

    // 事件 4: 非driving → driving (开始驾驶)
    if (prevState && prevState !== 'driving' && newState === 'driving') {
      await this.notifyParkDeltaOnDriveStart();  // 推送续航变化
      this.logParkLoss('drive_start');           // 记录日志
    }

    this.schedulePersist();
  }

  private handleChargingStateChange(newState: ChargingState): void {
    const prevState = this.state.chargingState;
    this.state.chargingState = newState;

    console.log(`充电状态: ${prevState || '(初始化)'} -> ${newState}`);

    // 开始充电: 记录充电起点
    if (newState === 'Charging' && prevState !== 'Charging') {
      this.markChargeStart();
    }

    // 充电结束: Charging -> Complete 或 Disconnected
    if (prevState === 'Charging' && (newState === 'Complete' || newState === 'Disconnected')) {
      this.notifyChargeDelta();       // 推送充电增益
      this.triggerChargeScreenshot(); // 充电截图
    }

    this.schedulePersist();
  }

  private triggerDriveScreenshot(): void {
    const now = Date.now();
    if (now - this.state.lastDriveTrigger < DEBOUNCE_MS) {
      console.log('行程截图触发被防抖，跳过');
      return;
    }
    this.state.lastDriveTrigger = now;

    console.log(`行程结束，${TRIGGER_DELAY_MS / 1000} 秒后执行截图...`);
    setTimeout(async () => {
      try {
        // Skip very short drives: they are usually noise (e.g. repositioning).
        const minMinutes = Number(process.env.DRIVE_SCREENSHOT_MIN_MINUTES ?? '2');
        const minKm = Number(process.env.DRIVE_SCREENSHOT_MIN_KM ?? '0.2');

        try {
          const carId = this.options.carId;
          const client = await getGrafanaClient();
          const { DriveService } = await import('./drive-service.js');
          const driveService = new DriveService(client);
          const drives = await driveService.getDrives(carId, { from: 'now-1d', to: 'now', limit: 1 });
          const lastDrive = drives[0];

          if (lastDrive) {
            const dMin = Number(lastDrive.duration_min);
            const dKm = Number(lastDrive.distance);
            if (
              (Number.isFinite(minMinutes) && Number.isFinite(dMin) && dMin < minMinutes) ||
              (Number.isFinite(minKm) && Number.isFinite(dKm) && dKm < minKm)
            ) {
              console.log(
                `[drive] skip screenshot: duration=${dMin}min distance=${dKm}km (min ${minMinutes}min / ${minKm}km)`
              );
              return;
            }
          }
        } catch (e) {
          // Grafana query failed: do not block screenshots; just log and proceed.
          console.error('[drive] precheck failed, fallback to screenshot:', e instanceof Error ? e.message : e);
        }

        console.log('正在执行行程截图...');
        const { stdout, stderr } = await execAsync('pnpm dev screenshot drive --send -o /tmp/openclaw/drive-latest.png');
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
        console.log('行程截图完成');
      } catch (error) {
        console.error('行程截图失败:', error instanceof Error ? error.message : error);
      }
    }, TRIGGER_DELAY_MS);
  }

  private triggerParkRecommend(): void {
    const now = Date.now();

    const minMs = Number(process.env.PARK_RECOMMEND_MIN_MS ?? String(30 * 60 * 1000));
    if (this.state.lastParkRecommendTime && now - this.state.lastParkRecommendTime < minMs) {
      console.log('停车周边推荐在最小间隔内，跳过');
      return;
    }

    console.log(`检测到停车，${TRIGGER_DELAY_MS / 1000} 秒后查询周边并推送...`);
    setTimeout(async () => {
      try {
        const carId = this.options.carId;
        const client = await getGrafanaClient();

        // Use the last drive's last point as the park center.
        const { DriveService } = await import('./drive-service.js');
        const driveService = new DriveService(client);
        const drives = await driveService.getDrives(carId, { from: 'now-3d', to: 'now', limit: 1 });
        const lastDrive = drives[0];
        if (!lastDrive) {
          console.log('未找到最近行程，跳过周边推荐');
          return;
        }

        const positions = await driveService.getDrivePositions(carId, lastDrive.id);
        const lastPos = positions.length ? positions[positions.length - 1] : null;
        if (!lastPos) {
          console.log('最近行程没有轨迹点，跳过周边推荐');
          return;
        }

        const center = { latitude: lastPos.latitude, longitude: lastPos.longitude };

        const minMoveMeters = Number(process.env.PARK_RECOMMEND_MIN_MOVE_METERS ?? '1000');
        if (this.state.lastParkRecommendCenter) {
          const moved = distanceMeters(this.state.lastParkRecommendCenter, center);
          if (moved < minMoveMeters) {
            console.log(`停车位置变化 ${Math.round(moved)}m < ${minMoveMeters}m，跳过推送`);
            return;
          }
        }

        const message = await recommendAroundAndFormat({
          center,
          radiusMeters: Number(process.env.AMAP_AROUND_RADIUS ?? '2000'),
          topN: Number(process.env.AMAP_AROUND_TOPN ?? '3'),
        });

        const messageService = getMessageService();
        await messageService.sendText(message);

        this.state.lastParkRecommendCenter = center;
        this.state.lastParkRecommendTime = Date.now();
        this.schedulePersist();

        console.log('停车周边推荐已发送');
      } catch (error) {
        console.error('停车周边推荐失败:', error instanceof Error ? error.message : error);
      }
    }, TRIGGER_DELAY_MS);
  }

  private triggerChargeScreenshot(): void {
    const now = Date.now();
    if (now - this.state.lastChargeTrigger < DEBOUNCE_MS) {
      console.log('充电截图触发被防抖，跳过');
      return;
    }
    this.state.lastChargeTrigger = now;

    console.log(`充电结束，${TRIGGER_DELAY_MS / 1000} 秒后执行截图...`);
    setTimeout(async () => {
      try {
        console.log('正在执行充电截图...');
        const { stdout, stderr } = await execAsync('pnpm dev screenshot charge --send -o /tmp/openclaw/charge-latest.png');
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
        console.log('充电截图完成');
      } catch (error) {
        console.error('充电截图失败:', error instanceof Error ? error.message : error);
      }
    }, TRIGGER_DELAY_MS);
  }

  private handleRatedRange(message: string): void {
    const parsed = Number(message);
    if (Number.isFinite(parsed)) {
      // TeslaMate provides a float; we keep a 0.1km precision.
      this.lastRatedRangeKm = Math.round(parsed * 10) / 10;
    }
  }

  private handleUsableBatteryLevel(message: string): void {
    const parsed = Number(message);
    if (Number.isFinite(parsed)) {
      // TeslaMate provides a float; we keep a 0.1% precision.
      this.lastUsableBatteryLevel = Math.round(parsed * 10) / 10;
    }
  }

  private shouldNavNotifyForDestination(destination: string): boolean {
    const keywords = config.navAlert.destinationKeywords;
    if (!config.navAlert.enabled) return false;
    if (!keywords.length) return false;

    // Strict match only (after trim). No fuzzy/substring matching.
    const dest = destination.trim();
    return keywords.some((k) => dest === k.trim());
  }

  private async handleActiveRoute(message: string): Promise<void> {
    // TeslaMate publishes JSON as a single MQTT message.
    // Example:
    // {"error":null,"location":{"latitude":...},"destination":"...","miles_to_arrival":...,"minutes_to_arrival":...}
    let parsed: any;
    try {
      parsed = JSON.parse(message);
    } catch {
      console.log('[nav] active_route parse failed');
      return;
    }

    // Always log the raw nav fields (for debugging / observability), but throttle:
    // only log when minutes_to_arrival changes (rounded to integer).
    try {
      const d = typeof parsed?.destination === 'string' ? parsed.destination : null;
      const m0 = typeof parsed?.minutes_to_arrival === 'number' ? parsed.minutes_to_arrival : null;
      const mi = typeof parsed?.miles_to_arrival === 'number' ? parsed.miles_to_arrival : null;
      const loc = parsed?.location;
      const latRoute = typeof loc?.latitude === 'number' ? loc.latitude : null;
      const lngRoute = typeof loc?.longitude === 'number' ? loc.longitude : null;

      const latRt = this.lastLatitude;
      const lngRt = this.lastLongitude;

      const mInt = m0 == null ? null : Math.max(0, Math.round(m0));
      const lastLogged = (this.state as any).lastNavLoggedMinutes as number | null | undefined;

      if (mInt == null || lastLogged !== mInt) {
        (this.state as any).lastNavLoggedMinutes = mInt;

        const fmt = (n: number | null) => (n == null ? 'n/a' : n.toFixed(6));
        console.log(
          `[nav] rx: destination=${d ?? 'n/a'} minutes=${m0 ?? 'n/a'} miles=${mi ?? 'n/a'}` +
            ` latRt=${fmt(latRt)} lngRt=${fmt(lngRt)}` +
            ` latRoute=${fmt(latRoute)} lngRoute=${fmt(lngRoute)}`
        );
      }
    } catch {
      // ignore
    }

    const destination = typeof parsed?.destination === 'string' ? parsed.destination : null;
    const minutesToArrival = typeof parsed?.minutes_to_arrival === 'number' ? parsed.minutes_to_arrival : null;
    const milesToArrival = typeof parsed?.miles_to_arrival === 'number' ? parsed.miles_to_arrival : null;
    const loc = parsed?.location;
    const latRoute = typeof loc?.latitude === 'number' ? loc.latitude : null;
    const lngRoute = typeof loc?.longitude === 'number' ? loc.longitude : null;

    // Use real-time latitude/longitude topics if available.
    const lat = this.lastLatitude ?? latRoute;
    const lng = this.lastLongitude ?? lngRoute;

    // No active route (or route error) => reset nav state.
    if (!destination || minutesToArrival == null || parsed?.error) {
      if (process.env.MQTT_DEBUG === '1') {
        console.log('[nav] inactive route -> reset');
      }
      // If we had an active route and haven't sent arrival yet, treat this as arrival.
      if (this.state.lastNavDestination && !this.state.lastNavArrivedNotified) {
        try {
          const messageService = getMessageService();
          const navOc = config.navAlert.openclaw;
          let text = `✅ 已到达`;
          text += `\n目的地: ${this.state.lastNavDestination}`;
          await messageService.sendText(text, {
            channel: navOc?.channel,
            target: navOc?.target,
            account: navOc?.account,
          });
          this.state.lastNavArrivedNotified = true;
          console.log(`[nav] sent(arrived): ${this.state.lastNavDestination} (route ended)`);
        } catch (error) {
          console.error('发送到达推送失败:', error instanceof Error ? error.message : error);
        }
      }

      if (this.state.lastNavDestination || this.state.lastNavThresholdNotifiedMinutes.length) {
        this.state.lastNavDestination = null;
        this.state.lastNavThresholdNotifiedMinutes = [];
        this.state.lastNavArrivedNotified = false;
        this.schedulePersist();
      }
      return;
    }

    if (!this.shouldNavNotifyForDestination(destination)) {
      if (process.env.MQTT_DEBUG === '1') {
        console.log(`[nav] destination not matched -> reset (destination=${destination})`);
      }
      // Destination does not match; reset so next time matching route starts, it can notify immediately.
      if (this.state.lastNavDestination || this.state.lastNavThresholdNotifiedMinutes.length) {
        this.state.lastNavDestination = null;
        this.state.lastNavThresholdNotifiedMinutes = [];
        this.state.lastNavArrivedNotified = false;
        this.schedulePersist();
      }
      return;
    }

    const now = Date.now();

    const minutes = Math.max(0, Math.round(minutesToArrival));
    const distKm = milesToArrival != null ? Math.round(milesToArrival * 1.609344 * 10) / 10 : null;

    let locStr = lat != null && lng != null ? `${lat.toFixed(5)},${lng.toFixed(5)}` : 'n/a';

    // Prefer existing AMap key env used elsewhere in this project.
    const amapKey =
      config.amap.webApiKey ||
      process.env.AMP_WEB_API ||
      process.env.AMAP_WEB_API ||
      process.env.AMAP_KEY ||
      process.env.VITE_AMAP_KEY ||
      '';

    if (amapKey && lat != null && lng != null) {
      try {
        const regeo = await amapReverseGeocode({
          key: amapKey,
          lat,
          lng,
          radius: 200,
        });
        // Short human-readable address.
        const parts = [regeo.district, regeo.township, regeo.neighborhood]
          .filter((v) => typeof v === 'string' && v.trim());
        if (parts.length) locStr = parts.join('');
        else if (regeo.formatted_address) locStr = regeo.formatted_address;
      } catch {
        if (process.env.MQTT_DEBUG === '1') {
          console.log('[nav] regeo failed, fallback to lat,lng');
        }
      }
    }

    // Reset per-route state when destination changes.
    // Also send an immediate "route started" push when a matching destination starts.
    if (this.state.lastNavDestination !== destination) {
      const prev = this.state.lastNavDestination;
      if (process.env.MQTT_DEBUG === '1') {
        console.log(`[nav] destination changed: ${prev || '(none)'} -> ${destination}`);
      }
      this.state.lastNavDestination = destination;
      this.state.lastNavThresholdNotifiedMinutes = [];
      this.state.lastNavArrivedNotified = false;
      this.schedulePersist();

      try {
        const messageService = getMessageService();
        const navOc = config.navAlert.openclaw;

        let text = `🧭 已开始导航`;
        text += `\n目的地: ${destination}`;
        text += `\n当前位置: ${locStr}`;
        text += `\n剩余: ${minutes} 分钟`;
        if (distKm != null) text += ` / ${distKm} km`;

        const eta = new Date(Date.now() + minutes * 60_000);
        const hh = String(eta.getHours()).padStart(2, '0');
        const mm = String(eta.getMinutes()).padStart(2, '0');
        text += `\n预计到达: ${hh}:${mm}`;

        await messageService.sendText(text, {
          channel: navOc?.channel,
          target: navOc?.target,
          account: navOc?.account,
        });
        console.log(`[nav] sent(started): ${destination} (${minutes}min${distKm != null ? `/${distKm}km` : ''})`);
      } catch (error) {
        console.error('发送导航开始推送失败:', error instanceof Error ? error.message : error);
      }
    }

    // minutes/distKm/locStr/regeo already computed above

    const thresholds = [...new Set(config.navAlert.thresholdsMinutes)]
      .filter((n) => Number.isFinite(n) && n >= 0)
      .sort((a, b) => b - a);

    const messageService = getMessageService();
    const navOc = config.navAlert.openclaw;

    // Threshold-based pushes: 15/10/5 ... (send once when crossing).
    for (const t of thresholds) {
      if (minutes <= t && !this.state.lastNavThresholdNotifiedMinutes.includes(t)) {
        let text = `🧭 导航提醒`;
        text += `\n目的地: ${destination}`;
        text += `\n当前位置: ${locStr}`;
        text += `\n剩余: ${minutes} 分钟`;
        if (distKm != null) text += ` / ${distKm} km`;

        const eta = new Date(Date.now() + minutes * 60_000);
        const hh = String(eta.getHours()).padStart(2, '0');
        const mm = String(eta.getMinutes()).padStart(2, '0');
        text += `\n预计到达: ${hh}:${mm}`;

        try {
          if (process.env.MQTT_DEBUG === '1') {
            console.log(`[nav] threshold hit: ${t} (minutes=${minutes}) -> sending`);
          }
          await messageService.sendText(text, {
            channel: navOc?.channel,
            target: navOc?.target,
            account: navOc?.account,
          });
          this.state.lastNavThresholdNotifiedMinutes.push(t);
          this.schedulePersist();
          console.log(`[nav] sent(threshold=${t}): ${destination} (${minutes}min${distKm != null ? `/${distKm}km` : ''})`);
        } catch (error) {
          console.error('发送导航推送失败:', error instanceof Error ? error.message : error);
        }

        // Important: avoid sending multiple thresholds in one MQTT tick.
        break;
      }
    }

    // Arrival push: when minutes reaches 0.
    if (minutes <= 0 && !this.state.lastNavArrivedNotified) {
      let text = `✅ 已到达`;
      text += `\n目的地: ${destination}`;
      text += `\n当前位置: ${locStr}`;
      text += `\n预计到达: 已到达`;

      try {
        if (process.env.MQTT_DEBUG === '1') {
          console.log('[nav] arrived -> sending');
        }
        await messageService.sendText(text, {
          channel: navOc?.channel,
          target: navOc?.target,
          account: navOc?.account,
        });
        this.state.lastNavArrivedNotified = true;
        this.schedulePersist();
        console.log(`[nav] sent(arrived): ${destination}`);
      } catch (error) {
        console.error('发送到达推送失败:', error instanceof Error ? error.message : error);
      }
    }
  }

  private currentParkingSnapshot(): ParkingSnapshot {
    const rated = this.lastRatedRangeKm;
    const level = this.lastUsableBatteryLevel;

    return {
      timestamp: Date.now(),
      rated_range_km: typeof rated === 'number' ? rated : null,
      usable_battery_level: typeof level === 'number' ? level : null,
    };
  }

  private markParkStart(): void {
    this.state.lastParkStart = this.currentParkingSnapshot();

    const r = this.state.lastParkStart.rated_range_km;
    const l = this.state.lastParkStart.usable_battery_level;
    console.log(
      `ParkStart: rated=${r ?? 'n/a'}km usable=${l ?? 'n/a'}%`
    );
  }

  private markChargeStart(): void {
    this.state.lastChargeStart = this.currentParkingSnapshot();

    const r = this.state.lastChargeStart.rated_range_km;
    const l = this.state.lastChargeStart.usable_battery_level;
    console.log(
      `ChargeStart: rated=${r ?? 'n/a'}km usable=${l ?? 'n/a'}%`
    );
  }

  private async notifyChargeDelta(): Promise<void> {
    if (!this.state.lastChargeStart) {
      console.log('无充电起点记录，跳过充电增益推送');
      // 仍然更新 lastParkStart，以便后续停车损耗计算正确
      this.markParkStart();
      return;
    }

    const start = this.state.lastChargeStart;
    const end = this.currentParkingSnapshot();
    const dtMs = end.timestamp - start.timestamp;

    const rangeDelta =
      start.rated_range_km != null && end.rated_range_km != null
        ? Math.round((end.rated_range_km - start.rated_range_km) * 10) / 10
        : null;

    const levelDelta =
      start.usable_battery_level != null && end.usable_battery_level != null
        ? Math.round((end.usable_battery_level - start.usable_battery_level) * 10) / 10
        : null;

    // 充电增益为 0 或负数时省略推送
    if ((rangeDelta === null || rangeDelta <= 0) && (levelDelta === null || levelDelta <= 0)) {
      console.log('充电增益为 0 或负数，省略推送');
    } else {
      try {
        let message = `🔋 充电完成`;
        message += `\n充电时长: ${this.formatDuration(dtMs)}`;

        if (rangeDelta != null || levelDelta != null) {
          const r = rangeDelta != null ? this.fmtDelta(rangeDelta) : 'n/a';
          const l = levelDelta != null ? this.fmtDelta(levelDelta) : 'n/a';
          message += `\n充电增益: ${r} km (${l}%)`;
        }

        const messageService = getMessageService();
        await messageService.sendText(message);
        console.log('充电增益推送已发送');
      } catch (error) {
        console.error('发送充电增益推送失败:', error instanceof Error ? error.message : error);
      }
    }

    // 充电结束后更新 lastParkStart，这样开始驾驶时只计算充电后的停车损耗
    this.markParkStart();
    this.state.lastChargeStart = null;
    this.schedulePersist();
  }

  private fmtDelta(n: number): string {
    return n > 0 ? `+${n}` : `${n}`;
  }

  private async notifyParkDeltaOnDriveStart(): Promise<void> {
    if (!this.state.lastParkStart) return;

    const now = Date.now();
    if (now - this.state.lastParkNotifyTime < PARK_NOTIFY_MIN_MS) {
      console.log('停车->驾驶推送在最小间隔内，跳过');
      // Still reset, otherwise the next drive start might incorrectly include a short park window.
      this.state.lastParkStart = null;
      this.schedulePersist();
      return;
    }

    const start = this.state.lastParkStart;
    const end = this.currentParkingSnapshot();
    const dtMs = end.timestamp - start.timestamp;

    const rangeDelta =
      start.rated_range_km != null && end.rated_range_km != null
        ? Math.round((end.rated_range_km - start.rated_range_km) * 10) / 10
        : null;

    const levelDelta =
      start.usable_battery_level != null && end.usable_battery_level != null
        ? Math.round((end.usable_battery_level - start.usable_battery_level) * 10) / 10
        : null;

    // Only suppress when both are exactly unchanged.
    if (rangeDelta === 0 && levelDelta === 0) {
      console.log('停车->驾驶待机变化为 0，省略推送');
      this.state.lastParkStart = null;
      this.schedulePersist();
      return;
    }

    try {
      let message = `🚗 开始驾驶`;
      message += `\n待机时长: ${this.formatDuration(dtMs)}`;

      if (rangeDelta != null || levelDelta != null) {
        const r = rangeDelta != null ? this.fmtDelta(rangeDelta) : 'n/a';
        const l = levelDelta != null ? this.fmtDelta(levelDelta) : 'n/a';
        message += `\n待机变化: ${r} km (${l}%)`;
      }

      const messageService = getMessageService();
      await messageService.sendText(message);

      this.state.lastParkNotifyTime = now;
      console.log('停车->驾驶推送已发送');
    } catch (error) {
      console.error('发送停车->驾驶推送失败:', error instanceof Error ? error.message : error);
    } finally {
      // Reset after reporting, so next park window is a new segment.
      this.state.lastParkStart = null;
      this.schedulePersist();
    }
  }

  private logParkLoss(reason: 'drive_start'): void {
    if (!this.state.lastParkStart) return;

    const start = this.state.lastParkStart;
    const end = this.currentParkingSnapshot();
    const dtHours = (end.timestamp - start.timestamp) / 3600000;

    const rangeLoss =
      start.rated_range_km != null && end.rated_range_km != null
        ? Math.round((start.rated_range_km - end.rated_range_km) * 10) / 10
        : null;

    const levelLoss =
      start.usable_battery_level != null && end.usable_battery_level != null
        ? Math.round((start.usable_battery_level - end.usable_battery_level) * 10) / 10
        : null;

    const startRange = start.rated_range_km != null ? `${start.rated_range_km}km` : 'n/a';
    const endRange = end.rated_range_km != null ? `${end.rated_range_km}km` : 'n/a';
    const startLevel = start.usable_battery_level != null ? `${start.usable_battery_level}%` : 'n/a';
    const endLevel = end.usable_battery_level != null ? `${end.usable_battery_level}%` : 'n/a';

    console.log(
      `ParkLoss(${reason}): dt=${dtHours.toFixed(2)}h ` +
        `usable=${startLevel}->${endLevel}` +
        (levelLoss != null ? ` (-${levelLoss}%)` : '') +
        ` rated=${startRange}->${endRange}` +
        (rangeLoss != null ? ` (-${rangeLoss}km)` : '')
    );

    // Note: we intentionally do not reset here; reset is handled by notifyParkDeltaOnDriveStart().
  }

  /**
   * 处理更新可用状态
   */
  private handleUpdateAvailable(available: boolean): void {
    const prevAvailable = this.state.updateAvailable;
    this.state.updateAvailable = available;

    console.log(`更新可用状态: ${prevAvailable} -> ${available}`);

    if (available && this.state.updateVersion) {
      this.checkAndSendUpdateNotification();
    }

    this.schedulePersist();
  }

  /**
   * 处理更新版本
   */
  private handleUpdateVersion(version: string): void {
    const prevVersion = this.state.updateVersion;
    this.state.updateVersion = version;

    console.log(`更新版本: ${prevVersion || '(无)'} -> ${version}`);

    if (this.state.updateAvailable && version) {
      this.checkAndSendUpdateNotification();
    }

    this.schedulePersist();
  }

  /**
   * 检查并发送更新通知（4小时间隔）
   */
  private async checkAndSendUpdateNotification(): Promise<void> {
    const now = Date.now();
    if (now - this.state.lastUpdateNotifyTime < UPDATE_NOTIFY_INTERVAL_MS) {
      console.log('更新通知在 4 小时间隔内，跳过');
      return;
    }

    try {
      const message = `🔄 软件更新可用\n新版本: ${this.state.updateVersion}`;
      const messageService = getMessageService();
      await messageService.sendText(message);
      this.state.lastUpdateNotifyTime = now;
      this.schedulePersist();
      console.log('更新通知已发送');
    } catch (error) {
      console.error('发送更新通知失败:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * 格式化时长
   */
  private formatDuration(ms: number): string {
    const totalMinutes = Math.floor(ms / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}小时${minutes}分钟`;
    }
    return `${minutes}分钟`;
  }

  /**
   * 获取持久化文件路径
   */
  private getStatePath(): string {
    return path.join(process.cwd(), 'data', 'cars', `car-${this.options.carId}`, 'mqtt-state.json');
  }

  /**
   * 加载持久化状态
   */
  private async loadPersistedState(): Promise<void> {
    const statePath = this.getStatePath();
    try {
      const content = await fs.readFile(statePath, 'utf-8');
      const persisted: PersistedMqttState = JSON.parse(content);

      this.state.vehicleState = persisted.vehicleState;
      this.state.chargingState = persisted.chargingState;
      this.state.lastDriveTrigger = persisted.lastDriveTrigger;
      this.state.lastChargeTrigger = persisted.lastChargeTrigger;
      this.state.updateAvailable = persisted.updateAvailable;
      this.state.updateVersion = persisted.updateVersion;
      this.state.lastUpdateNotifyTime = persisted.lastUpdateNotifyTime;
      this.state.lastParkStart = persisted.lastParkStart || null;
      this.state.lastParkNotifyTime = persisted.lastParkNotifyTime || 0;
      this.state.lastChargeStart = persisted.lastChargeStart || null;
      this.state.lastParkRecommendCenter = persisted.lastParkRecommendCenter || null;
      this.state.lastParkRecommendTime = persisted.lastParkRecommendTime || 0;

      this.state.lastNavDestination = persisted.lastNavDestination || null;
      this.state.lastNavThresholdNotifiedMinutes = Array.isArray(persisted.lastNavThresholdNotifiedMinutes)
        ? persisted.lastNavThresholdNotifiedMinutes.filter((n) => typeof n === 'number' && Number.isFinite(n))
        : [];
      this.state.lastNavArrivedNotified = typeof persisted.lastNavArrivedNotified === 'boolean'
        ? persisted.lastNavArrivedNotified
        : false;

      console.log(`已加载持久化状态: ${statePath}`);
      console.log(`  车辆状态: ${this.state.vehicleState || '(无)'}`);
      console.log(`  充电状态: ${this.state.chargingState || '(无)'}`);
      if (this.state.updateAvailable) {
        console.log(`  待更新版本: ${this.state.updateVersion}`);
      }
      if (this.state.lastParkStart) {
        console.log(
          `  停车开始: ${new Date(this.state.lastParkStart.timestamp).toLocaleString()} rated=${this.state.lastParkStart.rated_range_km ?? 'n/a'}km usable=${this.state.lastParkStart.usable_battery_level ?? 'n/a'}%`
        );
      }
      if (this.state.lastChargeStart) {
        console.log(
          `  充电开始: ${new Date(this.state.lastChargeStart.timestamp).toLocaleString()} rated=${this.state.lastChargeStart.rated_range_km ?? 'n/a'}km usable=${this.state.lastChargeStart.usable_battery_level ?? 'n/a'}%`
        );
      }
      if (this.state.lastParkNotifyTime) {
        console.log(
          `  停车推送: ${new Date(this.state.lastParkNotifyTime).toLocaleString()}`
        );
      }
      if (this.state.lastParkRecommendTime) {
        console.log(
          `  周边推荐: ${new Date(this.state.lastParkRecommendTime).toLocaleString()}`
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('无持久化状态文件，使用默认状态');
      } else {
        console.error('加载持久化状态失败:', error instanceof Error ? error.message : error);
      }
    }
  }

  /**
   * 保存状态到文件
   */
  private async persistState(): Promise<void> {
    const statePath = this.getStatePath();
    const persisted: PersistedMqttState = {
      vehicleState: this.state.vehicleState,
      chargingState: this.state.chargingState,
      lastDriveTrigger: this.state.lastDriveTrigger,
      lastChargeTrigger: this.state.lastChargeTrigger,
      updateAvailable: this.state.updateAvailable,
      updateVersion: this.state.updateVersion,
      lastUpdateNotifyTime: this.state.lastUpdateNotifyTime,
      lastParkStart: this.state.lastParkStart,
      lastParkNotifyTime: this.state.lastParkNotifyTime,
      lastChargeStart: this.state.lastChargeStart,
      lastParkRecommendCenter: this.state.lastParkRecommendCenter,
      lastParkRecommendTime: this.state.lastParkRecommendTime,

      lastNavDestination: this.state.lastNavDestination,
      lastNavThresholdNotifiedMinutes: this.state.lastNavThresholdNotifiedMinutes,
      lastNavArrivedNotified: this.state.lastNavArrivedNotified,

      lastUpdated: Date.now(),
    };

    try {
      const dir = path.dirname(statePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(statePath, JSON.stringify(persisted, null, 2));
      console.log('状态已持久化');
    } catch (error) {
      console.error('持久化状态失败:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * 防抖持久化（5秒）
   */
  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistState();
      this.persistTimer = null;
    }, PERSIST_DEBOUNCE_MS);
  }
}
