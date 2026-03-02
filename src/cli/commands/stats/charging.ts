import { getGrafanaClient, StatsService } from '../../../core/index.js';
import { outputResult, type OutputFormat } from '../../utils/formatters.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface ChargingStatsOptions {
  output: OutputFormat;
  from: string;
  to: string;
  minDuration: string;
}

export async function chargingStatsCommand(
  carId: string,
  options: ChargingStatsOptions
): Promise<void> {
  const client = await getGrafanaClient();
  const statsService = new StatsService(client);

  const id = parseInt(carId, 10);
  if (isNaN(id)) {
    console.error('Error: Invalid car ID');
    process.exit(1);
  }

  const minDuration = parseInt(options.minDuration, 10);
  if (isNaN(minDuration) || minDuration < 0) {
    console.error('Error: Invalid min-duration value');
    process.exit(1);
  }

  const stats = await statsService.getChargingStats({
    carId: id,
    from: options.from,
    to: options.to,
    minDuration,
  });

  if (options.output === 'json') {
    outputResult(stats, 'json');
    return;
  }

  console.log(chalk.cyan.bold('\n⚡ Charging Statistics'));
  const table = new Table();
  table.push(
    { 'Total Charges': stats.total_charges },
    { 'Energy Added': `${stats.total_energy_added.toFixed(2)} kWh` },
    { 'Energy Used': `${stats.total_energy_used.toFixed(2)} kWh` },
    { 'Total Cost': `$${stats.total_cost.toFixed(2)}` },
    { 'Supercharger Cost': `$${stats.suc_cost.toFixed(2)}` },
    { 'Avg Cost/kWh': `$${stats.avg_cost_per_kwh.toFixed(3)}` },
    { 'Charging Efficiency': `${(stats.charging_efficiency * 100).toFixed(1)}%` }
  );
  console.log(table.toString());
}
