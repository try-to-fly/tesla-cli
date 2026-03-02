import { GrafanaClient } from './grafana-client.js';
import type { GrafanaClientConfig } from '../types/grafana.js';
import {
  CarService,
  ChargeService,
  DriveService,
  SettingsService,
  BatteryService,
  StatsService,
  EfficiencyService,
  StateService,
  UpdateService,
  MileageService,
  VampireService,
  LocationService,
  PositionService,
  TimelineService,
  ProjectedRangeService,
  TPMSService,
  getMessageService,
} from './services/index.js';

let clientInstance: GrafanaClient | null = null;
let clientConfig: GrafanaClientConfig | null = null;

/**
 * 配置 GrafanaClient（用于插件模式）
 */
export function configureGrafanaClient(cfg: GrafanaClientConfig): void {
  clientConfig = cfg;
  clientInstance = null; // 重置实例以使用新配置
}

/**
 * 从本地配置加载（configstore），避免依赖环境变量。
 */
/**
 * 获取 GrafanaClient 单例
 */
export async function getGrafanaClient(): Promise<GrafanaClient> {
  if (!clientInstance) {
    if (clientConfig) {
      // 使用外部配置（插件模式）
      clientInstance = new GrafanaClient(clientConfig);
    } else {
      // CLI 模式：使用本地 configstore 配置（ESM-safe）
      const { config } = await import('../config/index.js');
      clientInstance = new GrafanaClient({
        baseUrl: config.grafana.url,
        token: config.grafana.token,
      });
    }
  }
  return clientInstance;
}

// ============ 服务工厂函数 ============

// Note: these factory helpers are not used by the CLI entrypoints today.
// If we ever use them, they should become async (await getGrafanaClient()).

/** 创建车辆服务 */
export function createCarService(): CarService {
  throw new Error('createCarService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建充电服务 */
export function createChargeService(): ChargeService {
  throw new Error('createChargeService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建行程服务 */
export function createDriveService(): DriveService {
  throw new Error('createDriveService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建设置服务 */
export function createSettingsService(): SettingsService {
  throw new Error('createSettingsService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建电池服务 */
export function createBatteryService(): BatteryService {
  throw new Error('createBatteryService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建统计服务 */
export function createStatsService(): StatsService {
  throw new Error('createStatsService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建效率服务 */
export function createEfficiencyService(): EfficiencyService {
  throw new Error('createEfficiencyService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建状态服务 */
export function createStateService(): StateService {
  throw new Error('createStateService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建更新服务 */
export function createUpdateService(): UpdateService {
  throw new Error('createUpdateService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建里程服务 */
export function createMileageService(): MileageService {
  throw new Error('createMileageService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建待机能耗服务 */
export function createVampireService(): VampireService {
  throw new Error('createVampireService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建位置服务 */
export function createLocationService(): LocationService {
  throw new Error('createLocationService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建时间线服务 */
export function createTimelineService(): TimelineService {
  throw new Error('createTimelineService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建续航预测服务 */
export function createProjectedRangeService(): ProjectedRangeService {
  throw new Error('createProjectedRangeService is deprecated; construct services with an explicit GrafanaClient');
}

/** 创建 TPMS 服务 */
export function createTPMSService(): TPMSService {
  throw new Error('createTPMSService is deprecated; construct services with an explicit GrafanaClient');
}

/** 获取消息服务单例 */
export { getMessageService };

export { GrafanaClient, GrafanaApiError, GrafanaQueryError } from './grafana-client.js';
export * from './services/index.js';
