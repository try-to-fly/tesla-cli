import type { TeslaQuery } from '../types/query-protocol.js';
import { resolveTimeRange } from './semantic-time.js';
import { queryToCommand } from './query-command.js';
import {
  getGrafanaClient,
  CarService,
  ChargeService,
  DriveService,
  BatteryService,
  EfficiencyService,
  StateService,
  UpdateService,
  MileageService,
  VampireService,
  LocationService,
  TimelineService,
  ProjectedRangeService,
  StatsService,
} from './index.js';
import { TPMSService } from './services/tpms-service.js';

export { queryToCommand } from './query-command.js';

export interface QueryResult {
  success: boolean;
  data?: unknown;
  error?: string;
  command?: string;
}

/**
 * 执行查询协议
 */
export async function executeQuery(query: TeslaQuery): Promise<QueryResult> {
  const client = await getGrafanaClient();
  const { from, to } = resolveTimeRange(query.timeRange);
  const carId = query.carId ?? 1;
  const limit = query.pagination?.limit ?? 50;

  try {
    let data: unknown;

    switch (query.type) {
      case 'cars': {
        const service = new CarService(client);
        data = await service.getCars();
        break;
      }

      case 'car': {
        const service = new CarService(client);
        data = await service.getCarOverview(carId);
        break;
      }

      case 'drives': {
        const service = new DriveService(client);
        data = await service.getDrives(carId, { from, to, limit });
        break;
      }

      case 'charges': {
        const service = new ChargeService(client);
        data = await service.getCharges(carId, { from, to, limit });
        break;
      }

      case 'battery': {
        const service = new BatteryService(client);
        data = await service.getBatteryHealth(carId);
        break;
      }

      case 'efficiency': {
        const service = new EfficiencyService(client);
        const [efficiency, byTemp] = await Promise.all([
          service.getEfficiency(carId),
          service.getEfficiencyByTemperature({
            carId,
            minDistance: query.extra?.minDistance,
          }),
        ]);
        data = { efficiency, byTemperature: byTemp };
        break;
      }

      case 'states': {
        const service = new StateService(client);
        data = await service.getStates({ carId, from, to, limit });
        break;
      }

      case 'updates': {
        const service = new UpdateService(client);
        data = await service.getUpdates({ carId, from, to, limit });
        break;
      }

      case 'mileage': {
        const service = new MileageService(client);
        data = await service.getMileageStats(carId);
        break;
      }

      case 'vampire': {
        const service = new VampireService(client);
        data = await service.getVampireRecords({
          carId,
          from,
          to,
          minDuration: query.extra?.minDuration ?? 60,
        });
        break;
      }

      case 'locations': {
        const service = new LocationService(client);
        const [stats, locations] = await Promise.all([
          service.getLocationStats(carId),
          service.getTopLocations({
            carId,
            from,
            to,
            top: query.extra?.top ?? 10,
          }),
        ]);
        data = { stats, locations };
        break;
      }

      case 'locations.charging': {
        const service = new LocationService(client);
        data = await service.getChargingStations({
          carId,
          from,
          to,
          top: query.extra?.top ?? 20,
        });
        break;
      }

      case 'timeline': {
        const service = new TimelineService(client);
        data = await service.getTimeline({ carId, from, to, limit });
        break;
      }

      case 'visited': {
        const service = new LocationService(client);
        data = await service.getTopLocations({
          carId,
          from,
          to,
          top: query.extra?.top ?? 20,
        });
        break;
      }

      case 'projected-range': {
        const service = new ProjectedRangeService(client);
        data = await service.getProjectedRangeHistory({ carId, from, to, limit });
        break;
      }

      case 'stats.charging': {
        const service = new StatsService(client);
        data = await service.getChargingStats({
          carId,
          from,
          to,
          minDuration: query.extra?.minDuration ?? 0,
        });
        break;
      }

      case 'stats.driving': {
        const service = new StatsService(client);
        data = await service.getDrivingStats({ carId, from, to });
        break;
      }

      case 'stats.period': {
        const service = new StatsService(client);
        data = await service.getPeriodStats({
          carId,
          from,
          to,
          period: query.period ?? 'day',
        });
        break;
      }

      case 'tpms': {
        const service = new TPMSService(client);
        data = await service.getStats(carId, { from, to });
        break;
      }

      case 'detail.drive': {
        if (!query.recordId) {
          return { success: false, error: 'recordId is required for detail.drive' };
        }
        const service = new DriveService(client);
        const drives = await service.getDrives(carId, { limit: 100 });
        const drive = drives.find((d) => d.id === query.recordId);
        if (!drive) {
          return { success: false, error: `Drive ${query.recordId} not found` };
        }
        const positions = await service.getDrivePositions(carId, query.recordId);
        data = { drive, positions };
        break;
      }

      case 'detail.charge': {
        if (!query.recordId) {
          return { success: false, error: 'recordId is required for detail.charge' };
        }
        const service = new ChargeService(client);
        const charges = await service.getCharges(carId, { limit: 100 });
        const charge = charges.find((c) => c.id === query.recordId);
        if (!charge) {
          return { success: false, error: `Charge ${query.recordId} not found` };
        }
        const curve = await service.getChargeCurve(query.recordId);
        data = { charge, curve };
        break;
      }

      case 'screenshot': {
        return {
          success: false,
          error: 'screenshot type should be executed via CLI command',
          command: queryToCommand(query),
        };
      }

      default:
        return { success: false, error: `Unknown query type: ${query.type}` };
    }

    return {
      success: true,
      data,
      command: queryToCommand(query),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      command: queryToCommand(query),
    };
  }
}
