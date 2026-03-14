import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import { exec } from 'node:child_process';
import * as os from 'node:os';
import { promisify } from 'node:util';
import handler from 'serve-handler';
import { getGrafanaClient, DriveService, ChargeService, StatsService, TPMSService, getMessageService } from '../../core/index.js';
import { getWeekRange, getMonthRange } from '../../core/utils/time.js';
import { browserPool } from '../../core/utils/browser-pool.js';
import { SCREENSHOT } from '../../constants.js';
import { config } from '../../config/index.js';
import type { DriveRecord, DrivePosition } from '../../types/drive.js';
import type { ChargeRecord, ChargeCurvePoint } from '../../types/charge.js';
import { getMockDriveData, getMockChargeData, getMockDailyData } from './screenshot-mock.js';
import { executeQuery } from '../../core/query-executor.js';
import type { TeslaQuery } from '../../types/query-protocol.js';

interface DriveData {
  drive: DriveRecord;
  positions: DrivePosition[];
}

interface ChargeData {
  charge: ChargeRecord;
  curve: ChargeCurvePoint[];
}

interface DailyData {
  date: string;
  drives: DriveRecord[];
  charges: ChargeRecord[];
  allPositions: DrivePosition[][];
  stats: {
    totalDistance: number;
    totalDuration: number;
    totalEnergyUsed: number;
    totalEnergyAdded: number;
  };
  tpms?: {
    fl: number | null;
    fr: number | null;
    rl: number | null;
    rr: number | null;
    outside_temp?: number | null;
  };
}

interface WeeklyData {
  period: string;
  periodLabel: string;
  drives: DriveRecord[];
  charges: ChargeRecord[];
  allPositions: DrivePosition[][];
  stats: {
    totalDistance: number;
    totalDuration: number;
    totalDrives: number;
    totalCharges: number;
    totalEnergyUsed: number;
    totalEnergyAdded: number;
    totalCost: number;
    avgEfficiency: number;
  };
  comparison?: {
    distanceChange: number;
    distanceChangePercent: number;
    energyChange: number;
    energyChangePercent: number;
  };
}

interface MonthlyData {
  period: string;
  periodLabel: string;
  drives: DriveRecord[];
  charges: ChargeRecord[];
  allPositions: DrivePosition[][];
  stats: {
    totalDistance: number;
    totalDuration: number;
    totalDrives: number;
    totalCharges: number;
    totalEnergyUsed: number;
    totalEnergyAdded: number;
    totalCost: number;
    avgEfficiency: number;
  };
  comparison?: {
    distanceChange: number;
    distanceChangePercent: number;
    energyChange: number;
    energyChangePercent: number;
  };
}

interface YearlyData {
  year: number;
  periodLabel: string;
  stats: {
    totalDistance: number;
    totalDuration: number;
    totalDrives: number;
    totalCharges: number;
    totalEnergyUsed: number;
    totalEnergyAdded: number;
    totalCost: number;
    avgEfficiency: number;
  };
  monthlyBreakdown: Array<{
    month: number;
    distance: number;
    duration: number;
    drives: number;
    charges: number;
    energyUsed: number;
    energyAdded: number;
    cost: number;
  }>;
  comparison?: {
    distanceChange: number;
    distanceChangePercent: number;
    energyChange: number;
    energyChangePercent: number;
  };
}

const execAsync = promisify(exec);

function getNewestMtime(dir: string): number {
  let newest = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, getNewestMtime(fullPath));
    } else {
      const stat = fs.statSync(fullPath);
      newest = Math.max(newest, stat.mtimeMs);
    }
  }
  return newest;
}

async function ensureWebBuild(): Promise<string> {
  const cwd = process.cwd();
  const distPath = path.resolve(cwd, 'dist/web');
  const srcWebPath = path.resolve(cwd, 'src/web');

  const needsBuild = !fs.existsSync(distPath) ||
    getNewestMtime(srcWebPath) > getNewestMtime(distPath);

  if (needsBuild) {
    console.log('检测到 Web 源码更新，正在打包...');
    await execAsync('pnpm build:web', { cwd });
    console.log('打包完成');
  }

  return distPath;
}

interface ScreenshotOptions {
  output?: string;
  width?: string;
  scale?: string;
  carId?: string;
  send?: boolean;
  target?: string;
  message?: string;
  theme?: string;
  mock?: boolean;
}

async function startServer(distPath: string): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    return handler(req, res, {
      public: distPath,
      cleanUrls: true,
      rewrites: [
        { source: '/drive', destination: '/index.html' },
        { source: '/charge', destination: '/index.html' },
        { source: '/daily', destination: '/index.html' },
        { source: '/weekly', destination: '/index.html' },
        { source: '/monthly', destination: '/index.html' },
        { source: '/yearly', destination: '/index.html' },
      ],
    });
  });

  return new Promise((resolve) => {
    server.listen(0, () => {
      resolve(server);
    });
  });
}

function getServerPort(server: http.Server): number {
  const address = server.address();
  if (typeof address === 'object' && address !== null) {
    return address.port;
  }
  throw new Error('Failed to get server port');
}

async function takeScreenshot(
  url: string,
  data: DriveData | ChargeData | DailyData | WeeklyData | MonthlyData | YearlyData,
  outputPath: string,
  width: number,
  scale: number
): Promise<void> {
  const browser = await browserPool.getBrowser();
  const page = await browser.newPage();

  try {
    // 设置初始视口，高度设置较大以减少视口调整次数
    await page.setViewport({
      width,
      height: 2000,
      deviceScaleFactor: scale,
    });

    // 注入 CSS 变量设置固定宽度
    await page.evaluateOnNewDocument((w) => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.setProperty('--screenshot-width', `${w}px`);
      });
    }, width);

    // 注入数据
    await page.evaluateOnNewDocument((injectedData) => {
      (window as any).__TESLA_DATA__ = injectedData;
    }, data);

    console.log('正在加载页面...');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log('页面 DOM 加载完成');

    // 等待内容渲染
    console.log('等待内容渲染...');
    await page.waitForSelector('#root > div', { timeout: 10000 });

    // Debug: verify injected data vs rendered list count.
    // This helps catch UI truncation/overflow issues where not all drives appear.
    try {
      const injectedCount = await page.evaluate(() => (window as any).__TESLA_DATA__?.drives?.length ?? null);
      const renderedCount = await page.evaluate(() => {
        const header = Array.from(document.querySelectorAll('span')).find((el) =>
          (el.textContent || '').includes('行程 (')
        );
        if (!header) return null;
        const m = (header.textContent || '').match(/\((\d+)\)/);
        return m ? parseInt(m[1], 10) : null;
      });
      console.log(`[debug] injected drives=${injectedCount}, rendered drives=${renderedCount}`);
    } catch (e) {
      console.log('[debug] failed to inspect drive counts:', e instanceof Error ? e.message : String(e));
    }

    // 等待地图加载完成（如果页面有地图）
    console.log('等待地图加载...');
    try {
      await page.waitForSelector('[data-map-ready="true"]', { timeout: 8000 });
      console.log('地图加载完成');

      // 地图在 fitView/瓦片加载过程中截图容易出现“轨迹未居中”的瞬间。
      // 多等一会儿，尽量等到 complete 事件后再截。
      await page.waitForSelector('[data-map-centered="true"]', { timeout: 8000 });
      // 多条轨迹的 daily 图层、瓦片和 fitView 后的重绘有时会比 complete 更晚一点。
      // 这里保守一些，多等几秒，减少“轨迹还没完全连起来就截图”的概率。
      await new Promise(resolve => setTimeout(resolve, 3500));
      console.log('地图视野稳定，准备截图');
    } catch {
      console.log('页面无地图或地图加载超时，继续执行');
    }

    // 等待一小段时间确保页面完全渲染
    await new Promise(resolve => setTimeout(resolve, 500));

    // 获取容器元素
    const container = await page.$('#root > div');
    if (!container) {
      throw new Error('Container element not found');
    }

    // 获取容器实际尺寸
    const boundingBox = await container.boundingBox();
    if (!boundingBox) {
      throw new Error('Failed to get container bounding box');
    }

    console.log(`容器尺寸: ${boundingBox.width}x${boundingBox.height}`);

    // 使用元素截图替代 clip，避免 deviceScaleFactor 兼容问题
    await container.screenshot({
      path: outputPath,
      type: 'png',
    });

    console.log(`截图已保存: ${outputPath}`);
  } finally {
    await page.close();
  }
}

async function sendAndCleanup(
  outputPath: string,
  options: ScreenshotOptions,
  defaultMessage: string
): Promise<void> {
  if (!options.send) return;

  const target = options.target || config.openclaw.target;
  const message = options.message || defaultMessage;

  console.log(`正在发送截图...`);

  try {
    const messageService = getMessageService();
    await messageService.sendMedia(message, outputPath, { target });
    console.log('发送成功');

    fs.unlinkSync(outputPath);
    console.log(`已清理: ${outputPath}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('发送失败:', errorMsg);
    console.log(`截图保留在: ${outputPath}`);

    // 发送失败通知
    await sendFailureNotification(defaultMessage, errorMsg, options);
  }
}

/**
 * 发送截图前的预通知
 */
async function sendPreNotification(
  type: string,
  identifier: string | number,
  options: ScreenshotOptions
): Promise<void> {
  if (!options.send) return;

  try {
    const messageService = getMessageService();
    const target = options.target || config.openclaw.target;
    const message = `📸 正在生成${type} #${identifier} 截图...`;
    await messageService.sendText(message, { target });
  } catch (error) {
    // 预通知失败不影响主流程
    console.warn('预通知发送失败:', error instanceof Error ? error.message : error);
  }
}

/**
 * 发送失败通知
 */
async function sendFailureNotification(
  context: string,
  errorMsg: string,
  options: ScreenshotOptions
): Promise<void> {
  try {
    const messageService = getMessageService();
    const target = options.target || config.openclaw.target;
    const message = `❌ ${context}失败\n错误: ${errorMsg}`;
    await messageService.sendText(message, { target });
  } catch (error) {
    // 失败通知本身失败，只记录日志
    console.warn('失败通知发送失败:', error instanceof Error ? error.message : error);
  }
}


async function getDriveData(carId: number, driveId: number): Promise<DriveData> {
  const client = await getGrafanaClient();
  const driveService = new DriveService(client);

  const drives = await driveService.getDrives(carId, { limit: 100 });
  const drive = drives.find((d) => d.id === driveId);

  if (!drive) {
    throw new Error(`Drive ${driveId} not found`);
  }

  const positions = await driveService.getDrivePositions(carId, driveId);

  return { drive, positions };
}

async function getChargeData(carId: number, chargeId: number): Promise<ChargeData> {
  const client = await getGrafanaClient();
  const chargeService = new ChargeService(client);

  const charges = await chargeService.getCharges(carId, { limit: 100 });
  const charge = charges.find((c) => c.id === chargeId);

  if (!charge) {
    throw new Error(`Charge ${chargeId} not found`);
  }

  const curve = await chargeService.getChargeCurve(chargeId);

  return { charge, curve };
}

async function getDailyData(carId: number, dateStr: string): Promise<DailyData> {
  const client = await getGrafanaClient();
  const driveService = new DriveService(client);
  const chargeService = new ChargeService(client);
  const tpmsService = new TPMSService(client);

  // Interpret dateStr (YYYY-MM-DD) as a local calendar day.
  // IMPORTANT: `new Date('YYYY-MM-DD')` is parsed as UTC midnight by JS,
  // which becomes 08:00 local time in Asia/Shanghai. Build the local day
  // boundaries explicitly to avoid missing early-morning drives.
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0);
  const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);

  const from = startOfDay.toISOString();
  const to = endOfDay.toISOString();

  const [drives, charges, tpmsStats] = await Promise.all([
    driveService.getDrives(carId, { from, to, limit: 50 }),
    chargeService.getCharges(carId, { from, to, limit: 50 }),
    tpmsService.getStats(carId, { from, to }),
  ]);

  // 并行获取所有行程的轨迹数据
  const allPositions = await Promise.all(
    drives.map((drive) => driveService.getDrivePositions(carId, drive.id))
  );

  const stats = {
    totalDistance: drives.reduce((sum, d) => sum + d.distance, 0),
    totalDuration: drives.reduce((sum, d) => sum + d.duration_min, 0),
    // Daily 里展示的是“驾驶能耗/效率”，不应该用充电能耗（charge_energy_used）。
    // 这里用当天所有 drives 的 rated range 掉电量 * 车辆效率估算 (kWh)。
    // 0.153 来自 TeslaMate cars.efficiency (kWh/km) 的典型值。
    totalEnergyUsed: drives.reduce(
      (sum, d: any) => sum + ((Number(d.start_rated_range_km) - Number(d.end_rated_range_km)) * 0.153 || 0),
      0
    ),
    totalEnergyAdded: charges.reduce((sum, c) => sum + c.charge_energy_added, 0),
  };

  // 构建 TPMS 数据
  const tpms = tpmsStats.latest
    ? {
        fl: tpmsStats.latest.fl,
        fr: tpmsStats.latest.fr,
        rl: tpmsStats.latest.rl,
        rr: tpmsStats.latest.rr,
        outside_temp: tpmsStats.latest.outside_temp,
      }
    : undefined;

  return { date: dateStr, drives, charges, allPositions, stats, tpms };
}

async function getWeeklyData(carId: number, dateStr?: string): Promise<WeeklyData> {
  const client = await getGrafanaClient();
  const driveService = new DriveService(client);
  const chargeService = new ChargeService(client);
  const statsService = new StatsService(client);

  const currentRange = getWeekRange(dateStr);
  const { from, to, label } = currentRange;

  const [drives, charges, aggregatedStats] = await Promise.all([
    driveService.getDrives(carId, { from, to, limit: 100 }),
    chargeService.getCharges(carId, { from, to, limit: 100 }),
    statsService.getWeeklyStats({ carId, date: dateStr, includePrevious: true }),
  ]);

  const allPositions = await Promise.all(
    drives.map((drive) => driveService.getDrivePositions(carId, drive.id))
  );

  return {
    period: from.split('T')[0],
    periodLabel: label,
    drives,
    charges,
    allPositions,
    stats: {
      totalDistance: aggregatedStats.totalDistance,
      totalDuration: aggregatedStats.totalDuration,
      totalDrives: aggregatedStats.totalDrives,
      totalCharges: aggregatedStats.totalCharges,
      totalEnergyUsed: aggregatedStats.totalEnergyUsed,
      totalEnergyAdded: aggregatedStats.totalEnergyAdded,
      totalCost: aggregatedStats.totalCost,
      avgEfficiency: aggregatedStats.avgEfficiency,
    },
    comparison: aggregatedStats.comparison,
  };
}

async function getMonthlyData(carId: number, dateStr?: string): Promise<MonthlyData> {
  const client = await getGrafanaClient();
  const driveService = new DriveService(client);
  const chargeService = new ChargeService(client);
  const statsService = new StatsService(client);

  const currentRange = getMonthRange(dateStr);
  const { from, to, label } = currentRange;

  const [drives, charges, aggregatedStats] = await Promise.all([
    driveService.getDrives(carId, { from, to, limit: 200 }),
    chargeService.getCharges(carId, { from, to, limit: 200 }),
    statsService.getMonthlyStats({ carId, date: dateStr, includePrevious: true }),
  ]);

  const allPositions = await Promise.all(
    drives.map((drive) => driveService.getDrivePositions(carId, drive.id))
  );

  return {
    period: from.split('T')[0],
    periodLabel: label,
    drives,
    charges,
    allPositions,
    stats: {
      totalDistance: aggregatedStats.totalDistance,
      totalDuration: aggregatedStats.totalDuration,
      totalDrives: aggregatedStats.totalDrives,
      totalCharges: aggregatedStats.totalCharges,
      totalEnergyUsed: aggregatedStats.totalEnergyUsed,
      totalEnergyAdded: aggregatedStats.totalEnergyAdded,
      totalCost: aggregatedStats.totalCost,
      avgEfficiency: aggregatedStats.avgEfficiency,
    },
    comparison: aggregatedStats.comparison,
  };
}

async function getYearlyData(carId: number, yearStr?: string): Promise<YearlyData> {
  const client = await getGrafanaClient();
  const statsService = new StatsService(client);

  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();

  console.log(`正在获取 ${year} 年度数据...`);
  const yearlyStats = await statsService.getYearlyStats({ carId, year, includePrevious: true });

  return {
    year: yearlyStats.year,
    periodLabel: yearlyStats.periodLabel,
    stats: {
      totalDistance: yearlyStats.stats.totalDistance,
      totalDuration: yearlyStats.stats.totalDuration,
      totalDrives: yearlyStats.stats.totalDrives,
      totalCharges: yearlyStats.stats.totalCharges,
      totalEnergyUsed: yearlyStats.stats.totalEnergyUsed,
      totalEnergyAdded: yearlyStats.stats.totalEnergyAdded,
      totalCost: yearlyStats.stats.totalCost,
      avgEfficiency: yearlyStats.stats.avgEfficiency,
    },
    monthlyBreakdown: yearlyStats.monthlyBreakdown,
    comparison: yearlyStats.comparison,
  };
}

async function screenshotDrive(
  id: string | undefined,
  options: ScreenshotOptions
): Promise<void> {
  const width = parseInt(options.width || String(SCREENSHOT.DEFAULT_WIDTH), 10);
  const scale = parseInt(options.scale || String(SCREENSHOT.DEFAULT_SCALE), 10);

  let data: DriveData;
  let driveId: number;

  if (options.mock) {
    console.log('使用 Mock 数据...');
    data = getMockDriveData();
    driveId = data.drive.id;
  } else {
    const carId = parseInt(options.carId || '1', 10);
    if (id) {
      driveId = parseInt(id, 10);
    } else {
      const client = await getGrafanaClient();
      const driveService = new DriveService(client);
      const drives = await driveService.getDrives(carId, { limit: 1 });
      if (drives.length === 0) {
        throw new Error('No drives found');
      }
      driveId = drives[0].id;
    }
    data = await getDriveData(carId, driveId);
  }

  // Default output to system temp dir so OpenClaw can attach it safely.
  // (OpenClaw media allowlist includes os.tmpdir().)
  const outputPath = options.output || path.join(os.tmpdir(), `drive-${driveId}.png`);

  // 发送预通知
  await sendPreNotification('行程', driveId, options);

  const distPath = await ensureWebBuild();

  const server = await startServer(distPath);
  const port = getServerPort(server);

  try {
    const theme = options.theme || 'tesla';
    await takeScreenshot(
      `http://localhost:${port}/drive?theme=${theme}`,
      data,
      outputPath,
      width,
      scale
    );
    await sendAndCleanup(outputPath, options, `行程 #${driveId} 截图`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await sendFailureNotification(`行程 #${driveId} 截图`, errorMsg, options);
    throw error;
  } finally {
    server.close();
  }
}


async function screenshotCharge(
  id: string | undefined,
  options: ScreenshotOptions
): Promise<void> {
  const width = parseInt(options.width || String(SCREENSHOT.DEFAULT_WIDTH), 10);
  const scale = parseInt(options.scale || String(SCREENSHOT.DEFAULT_SCALE), 10);

  let data: ChargeData;
  let chargeId: number;

  if (options.mock) {
    console.log('使用 Mock 数据...');
    data = getMockChargeData();
    chargeId = data.charge.id;
  } else {
    const carId = parseInt(options.carId || '1', 10);
    if (id) {
      chargeId = parseInt(id, 10);
    } else {
      const client = await getGrafanaClient();
      const chargeService = new ChargeService(client);
      const charges = await chargeService.getCharges(carId, { limit: 1 });
      if (charges.length === 0) {
        throw new Error('No charges found');
      }
      chargeId = charges[0].id;
    }
    data = await getChargeData(carId, chargeId);
  }

  // Default output to system temp dir so OpenClaw can attach it safely.
  // (OpenClaw media allowlist includes os.tmpdir().)
  const outputPath = options.output || path.join(os.tmpdir(), `charge-${chargeId}.png`);

  // 发送预通知
  await sendPreNotification('充电', chargeId, options);

  const distPath = await ensureWebBuild();

  const server = await startServer(distPath);
  const port = getServerPort(server);

  try {
    const theme = options.theme || 'tesla';
    await takeScreenshot(
      `http://localhost:${port}/charge?theme=${theme}`,
      data,
      outputPath,
      width,
      scale
    );
    await sendAndCleanup(outputPath, options, `充电 #${chargeId} 截图`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await sendFailureNotification(`充电 #${chargeId} 截图`, errorMsg, options);
    throw error;
  } finally {

    server.close();
  }
}

async function screenshotDaily(
  dateStr: string | undefined,
  options: ScreenshotOptions
): Promise<void> {
  const width = parseInt(options.width || String(SCREENSHOT.DEFAULT_WIDTH), 10);
  const scale = parseInt(options.scale || String(SCREENSHOT.DEFAULT_SCALE), 10);

  let data: DailyData;
  let date: string;

  if (options.mock) {
    console.log('使用 Mock 数据...');
    data = getMockDailyData();
    date = data.date;
  } else {
    const carId = parseInt(options.carId || '1', 10);
    // Default to local calendar date; ISO date would be UTC and can shift the day in UTC+8.
    date = dateStr || new Date().toLocaleDateString('en-CA');
    data = await getDailyData(carId, date);
  }

  // Default output to system temp dir so OpenClaw can attach it safely.
  const outputPath = options.output || path.join(os.tmpdir(), `daily-${date}.png`);

  // 发送预通知
  await sendPreNotification('日报', date, options);

  const distPath = await ensureWebBuild();

  const server = await startServer(distPath);
  const port = getServerPort(server);

  try {
    const theme = options.theme || 'tesla';
    await takeScreenshot(
      `http://localhost:${port}/daily?theme=${theme}`,
      data,
      outputPath,
      width,
      scale
    );
    await sendAndCleanup(outputPath, options, `${date} 日报截图`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await sendFailureNotification(`${date} 日报截图`, errorMsg, options);
    throw error;
  } finally {
    server.close();
  }
}


async function screenshotWeekly(
  dateStr: string | undefined,
  options: ScreenshotOptions
): Promise<void> {
  const width = parseInt(options.width || String(SCREENSHOT.DEFAULT_WIDTH), 10);
  const scale = parseInt(options.scale || String(SCREENSHOT.DEFAULT_SCALE), 10);
  const carId = parseInt(options.carId || '1', 10);

  console.log('正在获取周报数据...');
  const data = await getWeeklyData(carId, dateStr);

  // Default output to system temp dir so OpenClaw can attach it safely.
  const outputPath = options.output || path.join(os.tmpdir(), `weekly-${data.period}.png`);

  // 发送预通知
  await sendPreNotification('周报', data.periodLabel, options);

  const distPath = await ensureWebBuild();

  const server = await startServer(distPath);
  const port = getServerPort(server);

  try {
    const theme = options.theme || 'tesla';
    await takeScreenshot(
      `http://localhost:${port}/weekly?theme=${theme}`,
      data,
      outputPath,
      width,
      scale
    );
    await sendAndCleanup(outputPath, options, `${data.periodLabel} 周报截图`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await sendFailureNotification(`${data.periodLabel} 周报截图`, errorMsg, options);
    throw error;
  } finally {
    server.close();
  }
}


async function screenshotMonthly(
  dateStr: string | undefined,
  options: ScreenshotOptions
): Promise<void> {
  const width = parseInt(options.width || String(SCREENSHOT.DEFAULT_WIDTH), 10);
  const scale = parseInt(options.scale || String(SCREENSHOT.DEFAULT_SCALE), 10);
  const carId = parseInt(options.carId || '1', 10);

  console.log('正在获取月报数据...');
  const data = await getMonthlyData(carId, dateStr);

  // Default output to system temp dir so OpenClaw can attach it safely.
  const outputPath = options.output || path.join(os.tmpdir(), `monthly-${data.period}.png`);

  // 发送预通知
  await sendPreNotification('月报', data.periodLabel, options);

  const distPath = await ensureWebBuild();

  const server = await startServer(distPath);
  const port = getServerPort(server);

  try {
    const theme = options.theme || 'tesla';
    await takeScreenshot(
      `http://localhost:${port}/monthly?theme=${theme}`,
      data,
      outputPath,
      width,
      scale
    );
    await sendAndCleanup(outputPath, options, `${data.periodLabel} 月报截图`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await sendFailureNotification(`${data.periodLabel} 月报截图`, errorMsg, options);
    throw error;
  } finally {
    server.close();
  }
}


async function screenshotYearly(
  yearStr: string | undefined,
  options: ScreenshotOptions
): Promise<void> {
  const width = parseInt(options.width || String(SCREENSHOT.DEFAULT_WIDTH), 10);
  const scale = parseInt(options.scale || String(SCREENSHOT.DEFAULT_SCALE), 10);
  const carId = parseInt(options.carId || '1', 10);

  const data = await getYearlyData(carId, yearStr);

  // Default output to system temp dir so OpenClaw can attach it safely.
  const outputPath = options.output || path.join(os.tmpdir(), `yearly-${data.year}.png`);

  // 发送预通知
  await sendPreNotification('年报', data.periodLabel, options);

  const distPath = await ensureWebBuild();

  const server = await startServer(distPath);
  const port = getServerPort(server);

  try {
    const theme = options.theme || 'tesla';
    await takeScreenshot(
      `http://localhost:${port}/yearly?theme=${theme}`,
      data,
      outputPath,
      width,
      scale
    );
    await sendAndCleanup(outputPath, options, `${data.periodLabel} 年报截图`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await sendFailureNotification(`${data.periodLabel} 年报截图`, errorMsg, options);
    throw error;
  } finally {
    server.close();
  }
}


/**
 * 解析查询输入（支持 JSON 字符串或文件路径）
 */
function parseQueryInput(input: string): TeslaQuery {
  const trimmed = input.trim();

  if (fs.existsSync(trimmed)) {
    const content = fs.readFileSync(trimmed, 'utf-8');
    return JSON.parse(content);
  }

  return JSON.parse(trimmed);
}

/**
 * 验证查询协议
 */
function validateQuery(query: unknown): query is TeslaQuery {
  if (!query || typeof query !== 'object') return false;
  const q = query as Record<string, unknown>;
  if (q.version !== '1.0') return false;
  if (typeof q.type !== 'string') return false;
  return true;
}

type PageType = 'drive' | 'charge' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * 根据查询类型确定页面类型
 */
function determinePageType(query: TeslaQuery): PageType {
  // 如果有 screenshot 配置，使用其 type
  if (query.screenshot?.type) {
    return query.screenshot.type;
  }

  // 根据 query.type 推断
  switch (query.type) {
    case 'detail.drive':
    case 'drives':
      return 'drive';
    case 'detail.charge':
    case 'charges':
      return 'charge';
    case 'screenshot':
      return query.screenshot?.type || 'daily';
    default:
      return 'daily';
  }
}

/**
 * 为截图获取数据
 */
async function fetchDataForScreenshot(
  query: TeslaQuery,
  pageType: PageType,
  carId: number
): Promise<DriveData | ChargeData | DailyData | WeeklyData | MonthlyData | YearlyData> {
  switch (pageType) {
    case 'drive': {
      // 如果有明确的 recordId
      if (query.recordId) {
        return getDriveData(carId, query.recordId);
      }
      // 如果有 screenshot.id
      if (query.screenshot?.id) {
        return getDriveData(carId, query.screenshot.id);
      }
      // 否则查询最近的行程
      const result = await executeQuery({
        ...query,
        type: 'drives',
        pagination: { limit: 1 },
      });
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch drives');
      }
      const drives = result.data as DriveRecord[];
      if (drives.length === 0) {
        throw new Error('No drives found');
      }
      return getDriveData(carId, drives[0].id);
    }

    case 'charge': {
      // 如果有明确的 recordId
      if (query.recordId) {
        return getChargeData(carId, query.recordId);
      }
      // 如果有 screenshot.id
      if (query.screenshot?.id) {
        return getChargeData(carId, query.screenshot.id);
      }
      // 否则查询最近的充电
      const result = await executeQuery({
        ...query,
        type: 'charges',
        pagination: { limit: 1 },
      });
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch charges');
      }
      const charges = result.data as ChargeRecord[];
      if (charges.length === 0) {
        throw new Error('No charges found');
      }
      return getChargeData(carId, charges[0].id);
    }

    case 'daily': {
      const date = query.screenshot?.date || new Date().toLocaleDateString('en-CA');
      return getDailyData(carId, date);
    }

    case 'weekly': {
      const date = query.screenshot?.date;
      return getWeeklyData(carId, date);
    }

    case 'monthly': {
      const date = query.screenshot?.date;
      return getMonthlyData(carId, date);
    }

    case 'yearly': {
      const date = query.screenshot?.date;
      const year = date ? date.split('-')[0] : undefined;
      return getYearlyData(carId, year);
    }
  }
}

/**
 * 生成输出文件路径
 */
function generateOutputPath(
  query: TeslaQuery,
  pageType: PageType,
  data: DriveData | ChargeData | DailyData | WeeklyData | MonthlyData | YearlyData
): string {
  const timestamp = Date.now();
  switch (pageType) {
    case 'drive':
      return `drive-${(data as DriveData).drive.id}-${timestamp}.png`;
    case 'charge':
      return `charge-${(data as ChargeData).charge.id}-${timestamp}.png`;
    case 'daily':
      return `daily-${(data as DailyData).date}-${timestamp}.png`;
    case 'weekly':
      return `weekly-${(data as WeeklyData).period}-${timestamp}.png`;
    case 'monthly':
      return `monthly-${(data as MonthlyData).period}-${timestamp}.png`;
    case 'yearly':
      return `yearly-${(data as YearlyData).year}-${timestamp}.png`;
  }
}

/**
 * 生成消息
 */
function generateMessage(
  query: TeslaQuery,
  pageType: PageType,
  data: DriveData | ChargeData | DailyData | WeeklyData | MonthlyData | YearlyData
): string {
  switch (pageType) {
    case 'drive':
      return `行程 #${(data as DriveData).drive.id} 截图`;
    case 'charge':
      return `充电 #${(data as ChargeData).charge.id} 截图`;
    case 'daily':
      return `${(data as DailyData).date} 日报截图`;
    case 'weekly':
      return `${(data as WeeklyData).periodLabel} 周报截图`;
    case 'monthly':
      return `${(data as MonthlyData).periodLabel} 月报截图`;
    case 'yearly':
      return `${(data as YearlyData).periodLabel} 年报截图`;
  }
}

/**
 * 从 TeslaQuery JSON 生成截图
 */
async function screenshotQuery(
  jsonInput: string,
  options: ScreenshotOptions
): Promise<void> {
  // 1. 解析查询
  let query: TeslaQuery;
  try {
    query = parseQueryInput(jsonInput);
  } catch (error) {
    console.error('Error: 无效的 JSON 输入');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // 2. 验证查询
  if (!validateQuery(query)) {
    console.error('Error: 无效的查询协议');
    console.error('查询必须包含 version: "1.0" 和有效的 type');
    process.exit(1);
  }

  const width = parseInt(options.width || String(SCREENSHOT.DEFAULT_WIDTH), 10);
  const scale = parseInt(options.scale || String(SCREENSHOT.DEFAULT_SCALE), 10);
  const carId = parseInt(options.carId || String(query.carId || 1), 10);

  // 3. 确定页面类型
  const pageType = determinePageType(query);
  console.log(`页面类型: ${pageType}`);

  // 4. 获取数据
  console.log('正在获取数据...');
  const data = await fetchDataForScreenshot(query, pageType, carId);

  // 5. 生成输出路径
  const outputPath = options.output || generateOutputPath(query, pageType, data);

  // 6. 构建并启动服务器
  const distPath = await ensureWebBuild();
  const server = await startServer(distPath);
  const port = getServerPort(server);

  try {
    // 7. 生成截图
    const theme = options.theme || 'tesla';
    await takeScreenshot(
      `http://localhost:${port}/${pageType}?theme=${theme}`,
      data,
      outputPath,
      width,
      scale
    );

    // 8. 发送到 Telegram（如果需要）
    const message = options.message || generateMessage(query, pageType, data);
    await sendAndCleanup(outputPath, options, message);
  } finally {
    server.close();
  }
}

export const screenshotCommand = new Command('screenshot')
  .description('Generate screenshot of Tesla data visualization')
  .addCommand(
    new Command('drive')
      .description('Screenshot drive details')
      .argument('[id]', 'Drive ID (defaults to latest)')
      .option('-o, --output <path>', 'Output file path')
      .option('-w, --width <number>', 'Viewport width', String(SCREENSHOT.DEFAULT_WIDTH))
      .option('--scale <number>', 'Device pixel ratio', String(SCREENSHOT.DEFAULT_SCALE))
      .option('-c, --car-id <number>', 'Car ID', '1')
      .option('-s, --send', '发送消息后删除文件')
      .option('-t, --target <id>', '消息目标 ID (默认: openclaw.target)')
      .option('-m, --message <text>', '自定义消息')
      .option('--theme <name>', '主题风格 (tesla/cyberpunk/glass)', 'tesla')
      .option('--mock', '使用 Mock 数据（无需连接 Grafana）')
      .action(screenshotDrive)
  )
  .addCommand(
    new Command('charge')
      .description('Screenshot charge details')
      .argument('[id]', 'Charge ID (defaults to latest)')
      .option('-o, --output <path>', 'Output file path')
      .option('-w, --width <number>', 'Viewport width', String(SCREENSHOT.DEFAULT_WIDTH))
      .option('--scale <number>', 'Device pixel ratio', String(SCREENSHOT.DEFAULT_SCALE))
      .option('-c, --car-id <number>', 'Car ID', '1')
      .option('-s, --send', '发送消息后删除文件')
      .option('-t, --target <id>', '消息目标 ID (默认: openclaw.target)')
      .option('-m, --message <text>', '自定义消息')
      .option('--theme <name>', '主题风格 (tesla/cyberpunk/glass)', 'tesla')
      .option('--mock', '使用 Mock 数据（无需连接 Grafana）')
      .action(screenshotCharge)
  )
  .addCommand(
    new Command('daily')
      .description('Screenshot daily overview')
      .argument('[date]', 'Date (YYYY-MM-DD, defaults to today)')
      .option('-o, --output <path>', 'Output file path')
      .option('-w, --width <number>', 'Viewport width', String(SCREENSHOT.DEFAULT_WIDTH))
      .option('--scale <number>', 'Device pixel ratio', String(SCREENSHOT.DEFAULT_SCALE))
      .option('-c, --car-id <number>', 'Car ID', '1')
      .option('-s, --send', '发送消息后删除文件')
      .option('-t, --target <id>', '消息目标 ID (默认: openclaw.target)')
      .option('-m, --message <text>', '自定义消息')
      .option('--theme <name>', '主题风格 (tesla/cyberpunk/glass)', 'tesla')
      .option('--mock', '使用 Mock 数据（无需连接 Grafana）')
      .action(screenshotDaily)
  )
  .addCommand(
    new Command('weekly')
      .description('Screenshot weekly overview')
      .argument('[date]', 'Date within the week (YYYY-MM-DD, defaults to current week)')
      .option('-o, --output <path>', 'Output file path')
      .option('-w, --width <number>', 'Viewport width', String(SCREENSHOT.DEFAULT_WIDTH))
      .option('--scale <number>', 'Device pixel ratio', String(SCREENSHOT.DEFAULT_SCALE))
      .option('-c, --car-id <number>', 'Car ID', '1')
      .option('-s, --send', '发送消息后删除文件')
      .option('-t, --target <id>', '消息目标 ID (默认: openclaw.target)')
      .option('-m, --message <text>', '自定义消息')
      .option('--theme <name>', '主题风格 (tesla/cyberpunk/glass)', 'tesla')
      .action(screenshotWeekly)
  )
  .addCommand(
    new Command('monthly')
      .description('Screenshot monthly overview')
      .argument('[date]', 'Date within the month (YYYY-MM-DD, defaults to current month)')
      .option('-o, --output <path>', 'Output file path')
      .option('-w, --width <number>', 'Viewport width', String(SCREENSHOT.DEFAULT_WIDTH))
      .option('--scale <number>', 'Device pixel ratio', String(SCREENSHOT.DEFAULT_SCALE))
      .option('-c, --car-id <number>', 'Car ID', '1')
      .option('-s, --send', '发送消息后删除文件')
      .option('-t, --target <id>', '消息目标 ID (默认: openclaw.target)')
      .option('-m, --message <text>', '自定义消息')
      .option('--theme <name>', '主题风格 (tesla/cyberpunk/glass)', 'tesla')
      .action(screenshotMonthly)
  )
  .addCommand(
    new Command('yearly')
      .description('Screenshot yearly overview')
      .argument('[year]', 'Year (YYYY, defaults to current year)')
      .option('-o, --output <path>', 'Output file path')
      .option('-w, --width <number>', 'Viewport width', String(SCREENSHOT.DEFAULT_WIDTH))
      .option('--scale <number>', 'Device pixel ratio', String(SCREENSHOT.DEFAULT_SCALE))
      .option('-c, --car-id <number>', 'Car ID', '1')
      .option('-s, --send', '发送消息后删除文件')
      .option('-t, --target <id>', '消息目标 ID (默认: openclaw.target)')
      .option('-m, --message <text>', '自定义消息')
      .option('--theme <name>', '主题风格 (tesla/cyberpunk/glass)', 'tesla')
      .action(screenshotYearly)
  )
  .addCommand(
    new Command('query')
      .description('Screenshot from TeslaQuery JSON')
      .argument('<json>', 'TeslaQuery JSON string or file path')
      .option('-o, --output <path>', 'Output file path')
      .option('-w, --width <number>', 'Viewport width', String(SCREENSHOT.DEFAULT_WIDTH))
      .option('--scale <number>', 'Device pixel ratio', String(SCREENSHOT.DEFAULT_SCALE))
      .option('-c, --car-id <number>', 'Car ID')
      .option('-s, --send', '发送消息后删除文件')
      .option('-t, --target <id>', '消息目标 ID (默认: openclaw.target)')
      .option('-m, --message <text>', '自定义消息')
      .option('--theme <name>', '主题风格 (tesla/cyberpunk/glass)', 'tesla')
      .action(screenshotQuery)
  );
