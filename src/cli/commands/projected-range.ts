import { getGrafanaClient, ProjectedRangeService } from '../../core/index.js';
import { outputResult, type OutputFormat } from '../utils/formatters.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface ProjectedRangeOptions {
  output: OutputFormat;
  from: string;
  to: string;
  limit: string;
}

export async function projectedRangeCommand(
  carId: string,
  options: ProjectedRangeOptions
): Promise<void> {
  const client = await getGrafanaClient();
  const projectedRangeService = new ProjectedRangeService(client);

  const id = parseInt(carId, 10);
  if (isNaN(id)) {
    console.error('Error: Invalid car ID');
    process.exit(1);
  }

  const limit = parseInt(options.limit, 10);
  if (isNaN(limit) || limit <= 0) {
    console.error('Error: Invalid limit value');
    process.exit(1);
  }

  const [stats, history] = await Promise.all([
    projectedRangeService.getProjectedRangeStats(id),
    projectedRangeService.getProjectedRangeHistory({
      carId: id,
      from: options.from,
      to: options.to,
      limit,
    }),
  ]);

  const result = { stats, history };

  if (options.output === 'json') {
    outputResult(result, 'json');
    return;
  }

  // Statistics
  console.log(chalk.cyan.bold('\n📊 Projected Range Statistics'));
  const statsTable = new Table();
  statsTable.push(
    { 'Projected Range': `${stats.projected_range.toFixed(0)} km` },
    { 'Avg Battery Level': `${stats.avg_battery_level.toFixed(1)}%` },
    { 'Avg Usable Battery': `${stats.avg_usable_battery_level.toFixed(1)}%` },
    { 'Current Odometer': `${stats.current_odometer.toFixed(0)} km` }
  );
  console.log(statsTable.toString());

  // History
  if (history.length > 0) {
    console.log(chalk.cyan.bold('\n📅 Projected Range History'));
    const historyTable = new Table({
      head: ['Date', 'Projected Range', 'Odometer'],
      style: { head: ['cyan'] },
    });

    for (const h of history) {
      historyTable.push([
        h.date,
        `${h.projected_range.toFixed(0)} km`,
        `${h.odometer.toFixed(0)} km`,
      ]);
    }
    console.log(historyTable.toString());
  }
}
