import { getGrafanaClient, DriveService } from '../../../core/index.js';
import { outputResult, type OutputFormat } from '../../utils/formatters.js';
import { formatDuration } from '../../utils/units.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface DriveDetailOptions {
  output: OutputFormat;
}

export async function driveDetailCommand(
  driveId: string,
  options: DriveDetailOptions
): Promise<void> {
  const client = await getGrafanaClient();
  const driveService = new DriveService(client);

  const id = parseInt(driveId, 10);
  if (isNaN(id)) {
    console.error('Error: Invalid drive ID');
    process.exit(1);
  }

  const query = `
    SELECT
      d.id,
      d.start_date,
      d.end_date,
      d.duration_min,
      d.distance,
      d.start_km,
      d.end_km,
      d.speed_avg,
      d.speed_max,
      d.outside_temp_avg,
      d.start_rated_range_km,
      d.end_rated_range_km,
      (d.start_rated_range_km - d.end_rated_range_km) * c.efficiency AS energy_consumed,
      COALESCE(sg.name, sa.name) AS start_location,
      COALESCE(eg.name, ea.name) AS end_location,
      sa.city AS start_city,
      ea.city AS end_city
    FROM drives d
    JOIN cars c ON c.id = d.car_id
    LEFT JOIN addresses sa ON sa.id = d.start_address_id
    LEFT JOIN addresses ea ON ea.id = d.end_address_id
    LEFT JOIN geofences sg ON ST_Contains(sg.geofence, sa.position)
    LEFT JOIN geofences eg ON ST_Contains(eg.geofence, ea.position)
    WHERE d.id = $drive_id
  `;

  const result = await client.query<{
    id: number;
    start_date: string;
    end_date: string;
    duration_min: number;
    distance: number;
    start_km: number;
    end_km: number;
    speed_avg: number;
    speed_max: number;
    outside_temp_avg: number;
    start_rated_range_km: number;
    end_rated_range_km: number;
    energy_consumed: number;
    start_location: string;
    end_location: string;
    start_city: string;
    end_city: string;
  }>(query, { variables: { drive_id: id } });

  if (result.length === 0) {
    console.error('Error: Drive not found');
    process.exit(1);
  }

  const drive = result[0];

  if (options.output === 'json') {
    outputResult(drive, 'json');
    return;
  }

  console.log(chalk.cyan.bold(`\n🚗 Drive #${drive.id} Details`));
  const table = new Table();
  table.push(
    { 'From': `${drive.start_location || 'Unknown'} (${drive.start_city || '-'})` },
    { 'To': `${drive.end_location || 'Unknown'} (${drive.end_city || '-'})` },
    { 'Start': new Date(drive.start_date).toLocaleString() },
    { 'End': drive.end_date ? new Date(drive.end_date).toLocaleString() : 'Ongoing' },
    { 'Duration': formatDuration(drive.duration_min) },
    { 'Distance': `${drive.distance?.toFixed(1) || 0} km` },
    { 'Odometer': `${drive.start_km?.toFixed(0) || 0} → ${drive.end_km?.toFixed(0) || 0} km` },
    { 'Avg Speed': `${drive.speed_avg?.toFixed(1) || 0} km/h` },
    { 'Max Speed': `${drive.speed_max?.toFixed(0) || 0} km/h` },
    { 'Outside Temp': drive.outside_temp_avg ? `${drive.outside_temp_avg.toFixed(1)}°C` : '-' },
    { 'Range Used': `${(drive.start_rated_range_km - drive.end_rated_range_km)?.toFixed(1) || 0} km` },
    { 'Energy Consumed': `${drive.energy_consumed?.toFixed(2) || 0} kWh` }
  );
  console.log(table.toString());
}
