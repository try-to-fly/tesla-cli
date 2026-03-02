import { getGrafanaClient, VampireService } from '../../core/index.js';
import { outputResult, type OutputFormat } from '../utils/formatters.js';
import { formatDuration } from '../utils/units.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface VampireOptions {
  output: OutputFormat;
  from: string;
  to: string;
  minDuration: string;
}

export async function vampireCommand(carId: string, options: VampireOptions): Promise<void> {
  const client = await getGrafanaClient();
  const vampireService = new VampireService(client);

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

  const params = { carId: id, from: options.from, to: options.to, minDuration };
  const [records, stats] = await Promise.all([
    vampireService.getVampireRecords(params),
    vampireService.getVampireStats(params),
  ]);

  const result = { stats, records };

  if (options.output === 'json') {
    outputResult(result, 'json');
    return;
  }

  // Statistics
  console.log(chalk.cyan.bold('\n🧛 Vampire Drain Statistics'));
  const statsTable = new Table();
  statsTable.push(
    { 'Total Records': stats.total_records },
    { 'Total Energy Drained': `${stats.total_energy_drained.toFixed(2)} kWh` },
    { 'Avg Range Loss/Hour': `${stats.avg_range_loss_per_hour.toFixed(2)} km/h` }
  );
  console.log(statsTable.toString());

  // Records
  if (records.length > 0) {
    console.log(chalk.cyan.bold('\n📜 Vampire Drain Records'));
    const recordsTable = new Table({
      head: ['Start', 'Duration', 'SOC Diff', 'Range Loss', 'Energy', 'Avg Power'],
      style: { head: ['cyan'] },
    });

    for (const r of records) {
      recordsTable.push([
        new Date(r.start_date).toLocaleString(),
        formatDuration(Math.floor(r.duration_sec / 60)),
        `${r.soc_diff}%`,
        `${r.range_loss.toFixed(1)} km`,
        `${r.energy_drained.toFixed(2)} kWh`,
        `${r.avg_power.toFixed(0)} W`,
      ]);
    }
    console.log(recordsTable.toString());
  }
}
