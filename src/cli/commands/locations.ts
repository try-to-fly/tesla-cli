import { getGrafanaClient, LocationService } from '../../core/index.js';
import { outputResult, type OutputFormat } from '../utils/formatters.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface LocationsOptions {
  output: OutputFormat;
  from: string;
  to: string;
  top: string;
}

export async function locationsCommand(carId: string, options: LocationsOptions): Promise<void> {
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

  const [stats, locations] = await Promise.all([
    locationService.getLocationStats(id),
    locationService.getTopLocations({ carId: id, from: options.from, to: options.to, top }),
  ]);

  const result = { stats, locations };

  if (options.output === 'json') {
    outputResult(result, 'json');
    return;
  }

  // Statistics
  console.log(chalk.cyan.bold('\n📍 Location Statistics'));
  const statsTable = new Table();
  statsTable.push(
    { 'Total Addresses': stats.total_addresses },
    { 'Total Cities': stats.total_cities },
    { 'Total States': stats.total_states },
    { 'Total Countries': stats.total_countries }
  );
  console.log(statsTable.toString());

  // Top Locations
  if (locations.length > 0) {
    console.log(chalk.cyan.bold('\n🏆 Top Locations'));
    const locationsTable = new Table({
      head: ['Name', 'City', 'Visits', 'Charges', 'Energy Added'],
      style: { head: ['cyan'] },
    });

    for (const l of locations) {
      locationsTable.push([
        l.name || 'Unknown',
        l.city || '-',
        l.visit_count,
        l.total_charges,
        `${l.total_energy_added.toFixed(1)} kWh`,
      ]);
    }
    console.log(locationsTable.toString());
  }
}
