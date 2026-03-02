import { getGrafanaClient, LocationService } from '../../core/index.js';
import { outputResult, type OutputFormat } from '../utils/formatters.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface VisitedOptions {
  output: OutputFormat;
  from: string;
  to: string;
  top: string;
}

export async function visitedCommand(carId: string, options: VisitedOptions): Promise<void> {
  const client = await getGrafanaClient();
  const locationService = new LocationService(client);

  const id = parseInt(carId, 10);
  if (isNaN(id)) {
    console.error('Error: Invalid car ID');
    process.exit(1);
  }

  const top = parseInt(options.top, 10);
  if (isNaN(top) || top <= 0) {
    console.error('Error: Invalid top value');
    process.exit(1);
  }

  const locations = await locationService.getTopLocations({
    carId: id,
    from: options.from,
    to: options.to,
    top,
  });

  if (options.output === 'json') {
    outputResult(locations, 'json');
    return;
  }

  console.log(chalk.cyan.bold('\n🗺️ Visited Places'));
  const table = new Table({
    head: ['Name', 'City', 'State', 'Country', 'Visits'],
    style: { head: ['cyan'] },
  });

  for (const l of locations) {
    table.push([
      l.name || 'Unknown',
      l.city || '-',
      l.state || '-',
      l.country || '-',
      l.visit_count,
    ]);
  }

  console.log(table.toString());
}
