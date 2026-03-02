import { getGrafanaClient } from '../../core/index.js';
import { PositionService } from '../../core/services/position-service.js';
import { outputResult, type OutputFormat } from '../utils/formatters.js';

export interface WhereOptions {
  output: OutputFormat;
  amap?: boolean;
  radius?: string;
}

export async function whereCommand(carId: string, options: WhereOptions): Promise<void> {
  const id = parseInt(carId, 10);
  if (isNaN(id)) {
    console.error('Error: Invalid car ID');
    process.exit(1);
  }

  const client = await getGrafanaClient();
  const service = new PositionService(client);
  const latest = await service.getLatestPosition(id);

  if (!latest) {
    console.error('No position found');
    process.exit(2);
  }

  let address: any = null;
  if (options.amap) {
    const key = process.env.AMP_WEB_API;
    if (!key) {
      console.error('Missing required env: AMP_WEB_API');
      process.exit(3);
    }
    const { amapReverseGeocode } = await import('../../core/utils/amap-regeo.js');
    const radius = options.radius ? parseInt(options.radius, 10) : 200;
    address = await amapReverseGeocode({
      key,
      lng: latest.longitude,
      lat: latest.latitude,
      radius: Number.isFinite(radius) ? radius : 200,
    });
  }

  if (options.output === 'json') {
    outputResult({ carId: id, ...latest, address }, 'json');
    return;
  }

  const time = new Date(latest.date).toLocaleString('zh-CN');
  console.log(`Car ${id} latest position:`);
  console.log(`  lat: ${latest.latitude}`);
  console.log(`  lng: ${latest.longitude}`);
  console.log(`  time: ${time}`);
  if (address?.formatted_address) {
    console.log(`  address: ${address.formatted_address}`);
  }
}
