import { getGrafanaClient, StatsService } from '../../../core/index.js';
import { outputResult, type OutputFormat } from '../../utils/formatters.js';
import { formatDuration } from '../../utils/units.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface DrivingStatsOptions {
  output: OutputFormat;
  from: string;
  to: string;
}

export async function drivingStatsCommand(
  carId: string,
  options: DrivingStatsOptions
): Promise<void> {
  const client = await getGrafanaClient();
  const statsService = new StatsService(client);

  const id = parseInt(carId, 10);
  if (isNaN(id)) {
    console.error('Error: Invalid car ID');
    process.exit(1);
  }

  const stats = await statsService.getDrivingStats({
    carId: id,
    from: options.from,
    to: options.to,
  });

  if (options.output === 'json') {
    outputResult(stats, 'json');
    return;
  }

  console.log(chalk.cyan.bold('\n🚗 Driving Statistics'));
  const table = new Table();
  table.push(
    { 'Total Drives': stats.total_drives },
    { 'Total Distance': `${stats.total_distance.toFixed(1)} km` },
    { 'Median Distance': `${stats.median_distance.toFixed(1)} km` },
    { 'Total Duration': formatDuration(stats.total_duration_min) },
    { 'Energy Consumed': `${stats.total_energy_consumed.toFixed(2)} kWh` },
    { 'Avg Speed': `${stats.avg_speed.toFixed(1)} km/h` },
    { 'Max Speed': `${stats.max_speed.toFixed(0)} km/h` }
  );
  console.log(table.toString());
}
