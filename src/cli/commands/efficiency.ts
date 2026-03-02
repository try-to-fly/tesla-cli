import { getGrafanaClient, EfficiencyService } from '../../core/index.js';
import { outputResult, type OutputFormat } from '../utils/formatters.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface EfficiencyOptions {
  output: OutputFormat;
  minDistance: string;
}

export async function efficiencyCommand(carId: string, options: EfficiencyOptions): Promise<void> {
  const client = await getGrafanaClient();
  const efficiencyService = new EfficiencyService(client);

  const id = parseInt(carId, 10);
  if (isNaN(id)) {
    console.error('Error: Invalid car ID');
    process.exit(1);
  }

  const minDistance = parseFloat(options.minDistance);
  if (isNaN(minDistance) || minDistance < 0) {
    console.error('Error: Invalid min-distance value');
    process.exit(1);
  }

  const [efficiency, byTemperature] = await Promise.all([
    efficiencyService.getEfficiency(id),
    efficiencyService.getEfficiencyByTemperature({ carId: id, minDistance }),
  ]);

  const result = {
    efficiency,
    by_temperature: byTemperature,
  };

  if (options.output === 'json') {
    outputResult(result, 'json');
    return;
  }

  // Summary Table
  console.log(chalk.cyan.bold('\n⚡ Efficiency Summary'));
  const summaryTable = new Table();
  summaryTable.push(
    { 'Net Consumption': `${efficiency.net_consumption_wh_per_km.toFixed(0)} Wh/km` },
    { 'Gross Consumption': `${efficiency.gross_consumption_wh_per_km.toFixed(0)} Wh/km` },
    { 'Total Distance': `${efficiency.total_distance.toFixed(1)} km` }
  );
  console.log(summaryTable.toString());

  // By Temperature Table
  if (byTemperature.length > 0) {
    console.log(chalk.cyan.bold('\n🌡️ Efficiency by Temperature'));
    const tempTable = new Table({
      head: ['Temp (°C)', 'Avg Distance', 'Efficiency'],
      style: { head: ['cyan'] },
    });

    for (const t of byTemperature) {
      const effPercent = (t.efficiency_ratio * 100).toFixed(1);
      tempTable.push([
        `${t.temperature}°C`,
        `${t.avg_distance.toFixed(1)} km`,
        `${effPercent}%`,
      ]);
    }
    console.log(tempTable.toString());
  }
}
