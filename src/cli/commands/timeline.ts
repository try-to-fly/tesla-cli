import { getGrafanaClient, TimelineService } from '../../core/index.js';
import { outputResult, type OutputFormat } from '../utils/formatters.js';
import { formatDuration } from '../utils/units.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface TimelineOptions {
  output: OutputFormat;
  from: string;
  to: string;
  limit: string;
}

export async function timelineCommand(carId: string, options: TimelineOptions): Promise<void> {
  const client = await getGrafanaClient();
  const timelineService = new TimelineService(client);

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

  const events = await timelineService.getTimeline({
    carId: id,
    from: options.from,
    to: options.to,
    limit,
  });

  if (options.output === 'json') {
    outputResult(events, 'json');
    return;
  }

  console.log(chalk.cyan.bold('\n📅 Activity Timeline'));
  const table = new Table({
    head: ['Time', 'Action', 'From', 'To', 'Duration', 'SOC', 'Energy'],
    style: { head: ['cyan'] },
  });

  for (const e of events) {
    const actionColor = e.action === 'Drive' ? chalk.blue : chalk.green;
    table.push([
      new Date(e.start_date).toLocaleString(),
      actionColor(e.action),
      e.start_address || '-',
      e.end_address || '-',
      formatDuration(e.duration_min),
      `${e.soc_start}% → ${e.soc_end}%`,
      `${e.energy_kwh.toFixed(1)} kWh`,
    ]);
  }

  console.log(table.toString());
}
