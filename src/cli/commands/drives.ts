import { getGrafanaClient, DriveService } from '../../core/index.js';
import { formatDrivesTable, outputResult, type OutputFormat } from '../utils/formatters.js';

export interface DrivesOptions {
  output: OutputFormat;
  from: string;
  to: string;
  limit: string;
}

export async function drivesCommand(carId: string, options: DrivesOptions): Promise<void> {
  const client = await getGrafanaClient();
  const driveService = new DriveService(client);

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

  const drives = await driveService.getDrives(id, {
    from: options.from,
    to: options.to,
    limit,
  });

  if (options.output === 'json') {
    outputResult(drives, 'json');
  } else {
    formatDrivesTable(drives);
  }
}
