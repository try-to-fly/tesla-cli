import { getGrafanaClient, StatsService } from '../../../core/index.js';
import { outputResult, type OutputFormat } from '../../utils/formatters.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface PeriodStatsOptions {
  output: OutputFormat;
  from: string;
  to: string;
  period: 'day' | 'week' | 'month' | 'year';
}

export async function periodStatsCommand(
  carId: string,
  options: PeriodStatsOptions
): Promise<void> {
  const client = await getGrafanaClient();
  const statsService = new StatsService(client);

  const id = parseInt(carId, 10);
  if (isNaN(id)) {
    console.error('Error: Invalid car ID');
    process.exit(1);
  }

  const stats = await statsService.getPeriodStats({
    carId: id,
    from: options.from,
    to: options.to,
    period: options.period,
  });

  if (options.output === 'json') {
    outputResult(stats, 'json');
    return;
  }

  console.log(chalk.cyan.bold(`\n📅 Statistics by ${options.period}`));
  const table = new Table({
    head: ['Period', 'Drives', 'Distance', 'Energy', 'Charges', 'Added', 'Cost'],
    style: { head: ['cyan'] },
  });

  for (const s of stats) {
    table.push([
      s.period,
      s.drives,
      `${s.distance.toFixed(1)} km`,
      `${s.energy_consumed.toFixed(1)} kWh`,
      s.charges,
      `${s.energy_added.toFixed(1)} kWh`,
      `$${s.cost.toFixed(2)}`,
    ]);
  }

  console.log(table.toString());
}
