import { getGrafanaClient, UpdateService } from '../../core/index.js';
import { outputResult, type OutputFormat } from '../utils/formatters.js';
import { formatDuration } from '../utils/units.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface UpdatesOptions {
  output: OutputFormat;
  from: string;
  to: string;
  limit: string;
}

export async function updatesCommand(carId: string, options: UpdatesOptions): Promise<void> {
  const client = await getGrafanaClient();
  const updateService = new UpdateService(client);

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

  const [updates, stats] = await Promise.all([
    updateService.getUpdates({ carId: id, from: options.from, to: options.to, limit }),
    updateService.getUpdateStats(id),
  ]);

  const result = { stats, history: updates };

  if (options.output === 'json') {
    outputResult(result, 'json');
    return;
  }

  // Update Statistics
  console.log(chalk.cyan.bold('\n📊 Update Statistics'));
  const statsTable = new Table();
  statsTable.push(
    { 'Current Version': stats.current_version },
    { 'Total Updates': stats.total_updates },
    { 'Median Interval': `${stats.median_interval_days.toFixed(1)} days` }
  );
  console.log(statsTable.toString());

  // Update History
  if (updates.length > 0) {
    console.log(chalk.cyan.bold('\n📜 Update History'));
    const historyTable = new Table({
      head: ['Version', 'Date', 'Duration'],
      style: { head: ['cyan'] },
    });

    for (const u of updates) {
      historyTable.push([
        u.version,
        new Date(u.start_date).toLocaleString(),
        formatDuration(u.duration_min),
      ]);
    }
    console.log(historyTable.toString());
  }
}
