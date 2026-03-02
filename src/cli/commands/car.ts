import { getGrafanaClient, CarService } from '../../core/index.js';
import { formatCarOverviewTable, outputResult, type OutputFormat } from '../utils/formatters.js';

export interface CarOptions {
  output: OutputFormat;
}

export async function carCommand(carId: string, options: CarOptions): Promise<void> {
  const client = await getGrafanaClient();
  const carService = new CarService(client);

  const id = parseInt(carId, 10);
  if (isNaN(id)) {
    console.error('Error: Invalid car ID');
    process.exit(1);
  }

  const overview = await carService.getCarOverview(id);

  if (options.output === 'json') {
    outputResult({ carId: id, ...overview }, 'json');
  } else {
    formatCarOverviewTable(id, overview);
  }
}
