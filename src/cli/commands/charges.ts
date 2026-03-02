import { getGrafanaClient, ChargeService } from '../../core/index.js';
import { formatChargesTable, outputResult, type OutputFormat } from '../utils/formatters.js';

export interface ChargesOptions {
  output: OutputFormat;
  from: string;
  to: string;
  limit: string;
}

export async function chargesCommand(carId: string, options: ChargesOptions): Promise<void> {
  const client = await getGrafanaClient();
  const chargeService = new ChargeService(client);

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

  const charges = await chargeService.getCharges(id, {
    from: options.from,
    to: options.to,
    limit,
  });

  if (options.output === 'json') {
    outputResult(charges, 'json');
  } else {
    formatChargesTable(charges);
  }
}
