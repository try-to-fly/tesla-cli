import { getGrafanaClient, CarService } from '../../core/index.js';
import { formatCarsTable, outputResult, type OutputFormat } from '../utils/formatters.js';

export interface CarsOptions {
  output: OutputFormat;
}

export async function carsCommand(options: CarsOptions): Promise<void> {
  const client = await getGrafanaClient();
  const carService = new CarService(client);

  const cars = await carService.getCars();

  if (options.output === 'json') {
    outputResult(cars, 'json');
  } else {
    formatCarsTable(cars);
  }
}
