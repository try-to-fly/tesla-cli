import { Command } from 'commander';
import mqtt from 'mqtt';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { MqttService } from '../../core/services/mqtt-service.js';
import { config } from '../../config/index.js';

interface ListenOptions {
  host?: string;
  port?: string;
  carId?: string;
}

async function listenAction(options: ListenOptions): Promise<void> {
  const host = options.host || config.mqtt.host;
  const port = options.port ? parseInt(options.port, 10) : config.mqtt.port;
  const carId = options.carId ? parseInt(options.carId, 10) : config.mqtt.carId;
  const topicPrefix = config.mqtt.topicPrefix;

  console.log('MQTT 服务配置:');
  console.log(`  Host: ${host}`);
  console.log(`  Port: ${port}`);
  console.log(`  Car ID: ${carId}`);
  console.log(`  Topic Prefix: ${topicPrefix}`);
  console.log('');

  const service = new MqttService({ host, port, carId, topicPrefix });

  process.on('SIGINT', () => {
    console.log('\n收到 SIGINT，正在停止服务...');
    service.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n收到 SIGTERM，正在停止服务...');
    service.stop();
    process.exit(0);
  });

  await service.start();
}

const listenSubcommand = new Command('listen')
  .description('启动 MQTT 监听服务，自动截图行程和充电记录')
  .option('--host <host>', 'MQTT Broker 地址')
  .option('--port <port>', 'MQTT Broker 端口')
  .option('--car-id <id>', '车辆 ID')
  .action(listenAction);

// ============ Test Subcommand ============

interface TestOptions {
  carId?: string;
  prefix?: string;
  delay?: string;
  range?: string;
  battery?: string;
  version?: string;
  resetRecommend?: boolean;

  // nav simulation
  destination?: string;
  minutes?: string;
  miles?: string;
  lat?: string;
  lng?: string;
}

interface TestContext {
  client: mqtt.MqttClient;
  carId: number;
  prefix: string;
  delay: number;
}

function getTestContext(options: TestOptions): Promise<TestContext> {
  const host = config.mqtt.host;
  const port = config.mqtt.port;
  const carId = options.carId ? parseInt(options.carId, 10) : config.mqtt.carId;
  const prefix = options.prefix || config.mqtt.topicPrefix;
  const delay = options.delay ? parseInt(options.delay, 10) : 2000;

  return new Promise((resolve, reject) => {
    const client = mqtt.connect(`mqtt://${host}:${port}`);
    client.on('connect', () => {
      resolve({ client, carId, prefix, delay });
    });
    client.on('error', reject);
  });
}

function publish(ctx: TestContext, topic: string, message: string): Promise<void> {
  const fullTopic = `${ctx.prefix}/cars/${ctx.carId}/${topic}`;
  return new Promise((resolve, reject) => {
    ctx.client.publish(fullTopic, message, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`发送: ${topic} = ${message}`);
        resolve();
      }
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clearParkRecommendCenter(carId: number): Promise<void> {
  const stateFile = path.join(process.cwd(), 'data', 'cars', `car-${carId}`, 'mqtt-state.json');
  try {
    const content = await fs.readFile(stateFile, 'utf-8');
    const state = JSON.parse(content);
    state.lastParkRecommendCenter = null;
    state.lastParkRecommendTime = 0;
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
    console.log('已清除上次周边推荐位置');
  } catch {
    // ignore
  }
}

async function resetRecommend(options: TestOptions): Promise<void> {
  const carId = options.carId ? parseInt(options.carId, 10) : config.mqtt.carId;
  await clearParkRecommendCenter(carId);
  console.log('请重启 PM2 服务: pm2 restart tesla-mqtt');
  console.log('然后运行: pnpm dev mqtt test drive-cycle');
}

async function driveCycle(options: TestOptions): Promise<void> {
  const carId = options.carId ? parseInt(options.carId, 10) : config.mqtt.carId;
  if (options.resetRecommend) {
    await clearParkRecommendCenter(carId);
  }

  const ctx = await getTestContext(options);
  const range = options.range || '350.5';
  const battery = options.battery || '80';

  try {
    console.log(`=== 模拟行程周期${options.resetRecommend ? '（已跳过周边推荐去重）' : ''} ===`);
    await publish(ctx, 'rated_battery_range_km', range);
    await publish(ctx, 'usable_battery_level', battery);
    await publish(ctx, 'state', 'driving');
    await sleep(ctx.delay);
    const endRange = (parseFloat(range) - 30).toFixed(1);
    const endBattery = (parseInt(battery, 10) - 8).toString();
    await publish(ctx, 'rated_battery_range_km', endRange);
    await publish(ctx, 'usable_battery_level', endBattery);
    await publish(ctx, 'state', 'online');
    console.log('=== 行程周期完成 ===');
  } finally {
    ctx.client.end();
  }
}

async function parkDrive(options: TestOptions): Promise<void> {
  const ctx = await getTestContext(options);
  const range = options.range || '300.0';
  const battery = options.battery || '70';

  try {
    console.log('=== 模拟停车->驾驶 ===');
    await publish(ctx, 'rated_battery_range_km', range);
    await publish(ctx, 'usable_battery_level', battery);
    await publish(ctx, 'state', 'driving');
    console.log('=== 停车->驾驶完成 ===');
  } finally {
    ctx.client.end();
  }
}

async function chargeCycle(options: TestOptions): Promise<void> {
  const ctx = await getTestContext(options);
  const range = options.range || '350.0';
  const battery = options.battery || '80';

  try {
    console.log('=== 模拟充电周期 ===');
    await publish(ctx, 'charging_state', 'Charging');
    await sleep(ctx.delay);
    const endRange = (parseFloat(range) + 50).toFixed(1);
    const endBattery = Math.min(parseInt(battery, 10) + 10, 100).toString();
    await publish(ctx, 'rated_battery_range_km', endRange);
    await publish(ctx, 'usable_battery_level', endBattery);
    await publish(ctx, 'charging_state', 'Complete');
    console.log('=== 充电周期完成 ===');
  } finally {
    ctx.client.end();
  }
}

async function fullCycle(options: TestOptions): Promise<void> {
  const ctx = await getTestContext(options);
  let range = parseFloat(options.range || '350.0');
  let battery = parseInt(options.battery || '80', 10);

  try {
    console.log('=== 模拟完整周期: 驾驶->停车->充电->驾驶 ===');

    console.log('1. 驾驶中...');
    await publish(ctx, 'rated_battery_range_km', range.toFixed(1));
    await publish(ctx, 'usable_battery_level', battery.toString());
    await publish(ctx, 'state', 'driving');
    await sleep(ctx.delay);

    console.log('2. 停车（行程结束）...');
    range -= 50;
    battery -= 10;
    await publish(ctx, 'rated_battery_range_km', range.toFixed(1));
    await publish(ctx, 'usable_battery_level', battery.toString());
    await publish(ctx, 'state', 'online');
    await sleep(ctx.delay);

    console.log('3. 开始充电...');
    await publish(ctx, 'charging_state', 'Charging');
    await sleep(ctx.delay);

    console.log('4. 充电完成...');
    range += 120;
    battery = Math.min(battery + 25, 100);
    await publish(ctx, 'rated_battery_range_km', range.toFixed(1));
    await publish(ctx, 'usable_battery_level', battery.toString());
    await publish(ctx, 'charging_state', 'Complete');
    await sleep(ctx.delay);

    console.log('5. 停车待机（模拟损耗）...');
    range -= 2;
    battery -= 1;
    await publish(ctx, 'rated_battery_range_km', range.toFixed(1));
    await publish(ctx, 'usable_battery_level', battery.toString());
    await sleep(ctx.delay);

    console.log('6. 开始驾驶...');
    await publish(ctx, 'state', 'driving');

    console.log('=== 完整周期完成 ===');
  } finally {
    ctx.client.end();
  }
}

async function updateNotify(options: TestOptions): Promise<void> {
  const ctx = await getTestContext(options);
  const version = options.version || '2024.38.1';

  try {
    console.log('=== 模拟软件更新 ===');
    await publish(ctx, 'update_version', version);
    await publish(ctx, 'update_available', 'true');
    console.log('=== 软件更新通知完成 ===');
  } finally {
    ctx.client.end();
  }
}

async function setRange(km: string, percent: string, options: TestOptions): Promise<void> {
  const ctx = await getTestContext(options);

  try {
    await publish(ctx, 'rated_battery_range_km', km);
    await publish(ctx, 'usable_battery_level', percent);
  } finally {
    ctx.client.end();
  }
}

async function setState(state: string, options: TestOptions): Promise<void> {
  const ctx = await getTestContext(options);

  try {
    await publish(ctx, 'state', state);
  } finally {
    ctx.client.end();
  }
}

async function setCharging(state: string, options: TestOptions): Promise<void> {
  const ctx = await getTestContext(options);

  try {
    await publish(ctx, 'charging_state', state);
  } finally {
    ctx.client.end();
  }
}

async function pubCustom(topic: string, message: string, options: TestOptions): Promise<void> {
  const ctx = await getTestContext(options);

  try {
    await publish(ctx, topic, message);
  } finally {
    ctx.client.end();
  }
}

function toNumberOrUndefined(v: string | undefined): number | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function nav(options: TestOptions): Promise<void> {
  const ctx = await getTestContext(options);

  const destination = options.destination || '国科大杭州高等研究院';
  const minutes = toNumberOrUndefined(options.minutes) ?? 12;
  const miles = toNumberOrUndefined(options.miles) ?? 3.1;
  const lat = toNumberOrUndefined(options.lat) ?? 30.23855;
  const lng = toNumberOrUndefined(options.lng) ?? 120.16291;

  const payload = {
    error: null,
    location: { latitude: lat, longitude: lng },
    destination,
    miles_to_arrival: miles,
    minutes_to_arrival: minutes,
  };

  try {
    await publish(ctx, 'active_route', JSON.stringify(payload));
  } finally {
    ctx.client.end();
  }
}

async function navCycle(options: TestOptions): Promise<void> {
  const destination = options.destination || '国科大杭州高等研究院';
  const delay = options.delay ? parseInt(options.delay, 10) : 1500;

  // A simple countdown that should hit thresholds and then arrival.
  const seq = [20, 15, 14, 10, 9, 5, 4, 1, 0];
  for (const m of seq) {
    await nav({ ...options, destination, minutes: String(m) });
    await sleep(delay);
  }

  // End route (inactive) to exercise "route ended" arrival handling.
  await pubCustom('active_route', JSON.stringify({ error: null }), options);
}

const testSubcommand = new Command('test')
  .description('MQTT 测试命令，模拟各种车辆状态');

testSubcommand
  .command('drive-cycle')
  .description('模拟完整行程周期 (driving -> online)')
  .option('-c, --car-id <id>', '车辆 ID')
  .option('--prefix <prefix>', 'Topic 前缀')
  .option('--delay <ms>', '步骤间延迟毫秒数', '2000')
  .option('--range <km>', '初始续航 km')
  .option('--battery <percent>', '初始电量 %')
  .option('--reset-recommend', '模拟前清除周边推荐去重状态，便于重复测试')
  .action((opts) => driveCycle(opts));

testSubcommand
  .command('reset-recommend')
  .description('清除周边推荐位置（需重启 PM2 后生效）')
  .option('-c, --car-id <id>', '车辆 ID')
  .action((opts) => resetRecommend(opts));

testSubcommand
  .command('park-drive')
  .description('模拟停车后开始驾驶')
  .option('-c, --car-id <id>', '车辆 ID')
  .option('--prefix <prefix>', 'Topic 前缀')
  .option('--range <km>', '续航 km')
  .option('--battery <percent>', '电量 %')
  .action((opts) => parkDrive(opts));

testSubcommand
  .command('charge-cycle')
  .description('模拟充电周期 (Charging -> Complete)')
  .option('-c, --car-id <id>', '车辆 ID')
  .option('--prefix <prefix>', 'Topic 前缀')
  .option('--delay <ms>', '步骤间延迟毫秒数', '2000')
  .option('--range <km>', '初始续航 km')
  .option('--battery <percent>', '初始电量 %')
  .action((opts) => chargeCycle(opts));

testSubcommand
  .command('full-cycle')
  .description('模拟完整周期 (驾驶->停车->充电->驾驶)')
  .option('-c, --car-id <id>', '车辆 ID')
  .option('--prefix <prefix>', 'Topic 前缀')
  .option('--delay <ms>', '步骤间延迟毫秒数', '2000')
  .option('--range <km>', '初始续航 km')
  .option('--battery <percent>', '初始电量 %')
  .action((opts) => fullCycle(opts));

testSubcommand
  .command('update')
  .description('模拟软件更新通知')
  .option('-c, --car-id <id>', '车辆 ID')
  .option('--prefix <prefix>', 'Topic 前缀')
  .option('--version <ver>', '更新版本号', '2024.38.1')
  .action((opts) => updateNotify(opts));

testSubcommand
  .command('range <km> <percent>')
  .description('设置续航值和电量')
  .option('-c, --car-id <id>', '车辆 ID')
  .option('--prefix <prefix>', 'Topic 前缀')
  .action((km, percent, opts) => setRange(km, percent, opts));

testSubcommand
  .command('state <state>')
  .description('设置车辆状态 (online/driving/asleep/...)')
  .option('-c, --car-id <id>', '车辆 ID')
  .option('--prefix <prefix>', 'Topic 前缀')
  .action((state, opts) => setState(state, opts));

testSubcommand
  .command('charging <state>')
  .description('设置充电状态 (Charging/Complete/Disconnected/...)')
  .option('-c, --car-id <id>', '车辆 ID')
  .option('--prefix <prefix>', 'Topic 前缀')
  .action((state, opts) => setCharging(state, opts));

testSubcommand
  .command('pub <topic> <message>')
  .description('发布自定义消息')
  .option('-c, --car-id <id>', '车辆 ID')
  .option('--prefix <prefix>', 'Topic 前缀')
  .action((topic, message, opts) => pubCustom(topic, message, opts));

testSubcommand
  .command('nav')
  .description('模拟导航 active_route（触发导航推送逻辑）')
  .option('-c, --car-id <id>', '车辆 ID')
  .option('--prefix <prefix>', 'Topic 前缀')
  .option('--destination <text>', '目的地（需命中 navAlert.destinationKeywords 才会推送）')
  .option('--minutes <n>', '剩余分钟（minutes_to_arrival）', '12')
  .option('--miles <n>', '剩余里程（miles_to_arrival）', '3.1')
  .option('--lat <n>', '当前位置纬度', '30.23855')
  .option('--lng <n>', '当前位置经度', '120.16291')
  .action((opts) => nav(opts));

testSubcommand
  .command('nav-cycle')
  .description('模拟一段导航倒计时（依次触发阈值 + 到达 + 结束路线）')
  .option('-c, --car-id <id>', '车辆 ID')
  .option('--prefix <prefix>', 'Topic 前缀')
  .option('--delay <ms>', '步骤间延迟毫秒数', '1500')
  .option('--destination <text>', '目的地（需命中 navAlert.destinationKeywords 才会推送）')
  .action((opts) => navCycle(opts));

export const mqttCommand = new Command('mqtt')
  .description('MQTT 相关命令')
  .addCommand(listenSubcommand)
  .addCommand(testSubcommand);
