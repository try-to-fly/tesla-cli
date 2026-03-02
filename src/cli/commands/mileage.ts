import { getGrafanaClient, MileageService } from '../../core/index.js';
import { outputResult, type OutputFormat } from '../utils/formatters.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface MileageOptions {
  output: OutputFormat;
  from: string;
  to: string;
}

export async function mileageCommand(carId: string, options: MileageOptions): Promise<void> {
  const client = await getGrafanaClient();
  const mileageService = new MileageService(client);

  const id = parseInt(carId, 10);
  if (isNaN(id)) {
    console.error('Error: Invalid car ID');
    process.exit(1);
  }

  const [stats, daily] = await Promise.all([
    mileageService.getMileageStats(id),
    mileageService.getDailyMileage({ carId: id, from: options.from, to: options.to }),
  ]);

  const result = { stats, daily };

  if (options.output === 'json') {
    outputResult(result, 'json');
    return;
  }

  // Mileage Statistics
  console.log(chalk.cyan.bold('\n📊 Mileage Statistics'));
  const statsTable = new Table();
  statsTable.push(
    { 'Current Odometer': `${stats.current_odometer.toFixed(1)} km` },
    { 'Total Logged': `${stats.total_logged.toFixed(1)} km` },
    { 'Avg Daily': `${stats.avg_daily.toFixed(1)} km` },
    { 'Avg Monthly': `${stats.avg_monthly.toFixed(1)} km` }
  );
  console.log(statsTable.toString());

  // Daily Mileage
  if (daily.length > 0) {
    console.log(chalk.cyan.bold('\n📅 Daily Mileage'));
    const dailyTable = new Table({
      head: ['Date', 'Odometer', 'Distance'],
      style: { head: ['cyan'] },
    });

    for (const d of daily.slice(0, 20)) {
      dailyTable.push([
        d.date,
        `${d.odometer.toFixed(1)} km`,
        `${d.daily_distance.toFixed(1)} km`,
      ]);
    }
    console.log(dailyTable.toString());

    if (daily.length > 20) {
      console.log(chalk.gray(`... and ${daily.length - 20} more days`));
    }
  }
}
