import { getGrafanaClient, ChargeService } from '../../../core/index.js';
import { outputResult, type OutputFormat } from '../../utils/formatters.js';
import { formatDuration } from '../../utils/units.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface ChargeDetailOptions {
  output: OutputFormat;
}

export async function chargeDetailCommand(
  chargeId: string,
  options: ChargeDetailOptions
): Promise<void> {
  const client = await getGrafanaClient();
  const chargeService = new ChargeService(client);

  const id = parseInt(chargeId, 10);
  if (isNaN(id)) {
    console.error('Error: Invalid charge ID');
    process.exit(1);
  }

  const query = `
    SELECT
      cp.id,
      cp.start_date,
      cp.end_date,
      cp.duration_min,
      cp.charge_energy_added,
      cp.charge_energy_used,
      cp.start_battery_level,
      cp.end_battery_level,
      cp.start_rated_range_km,
      cp.end_rated_range_km,
      cp.cost,
      COALESCE(g.name, a.name) AS location,
      a.city,
      a.country
    FROM charging_processes cp
    LEFT JOIN addresses a ON a.id = cp.address_id
    LEFT JOIN geofences g ON ST_Contains(g.geofence, a.position)
    WHERE cp.id = $charge_id
  `;

  const result = await client.query<{
    id: number;
    start_date: string;
    end_date: string;
    duration_min: number;
    charge_energy_added: number;
    charge_energy_used: number;
    start_battery_level: number;
    end_battery_level: number;
    start_rated_range_km: number;
    end_rated_range_km: number;
    cost: number;
    location: string;
    city: string;
    country: string;
  }>(query, { variables: { charge_id: id } });

  if (result.length === 0) {
    console.error('Error: Charge not found');
    process.exit(1);
  }

  const charge = result[0];

  if (options.output === 'json') {
    outputResult(charge, 'json');
    return;
  }

  console.log(chalk.cyan.bold(`\n⚡ Charge #${charge.id} Details`));
  const table = new Table();
  table.push(
    { 'Location': charge.location || 'Unknown' },
    { 'City': charge.city || '-' },
    { 'Country': charge.country || '-' },
    { 'Start': new Date(charge.start_date).toLocaleString() },
    { 'End': charge.end_date ? new Date(charge.end_date).toLocaleString() : 'Ongoing' },
    { 'Duration': formatDuration(charge.duration_min) },
    { 'SOC': `${charge.start_battery_level}% → ${charge.end_battery_level}%` },
    { 'Range': `${charge.start_rated_range_km?.toFixed(0) || 0} → ${charge.end_rated_range_km?.toFixed(0) || 0} km` },
    { 'Energy Added': `${charge.charge_energy_added?.toFixed(2) || 0} kWh` },
    { 'Energy Used': `${charge.charge_energy_used?.toFixed(2) || 0} kWh` },
    { 'Cost': charge.cost ? `$${charge.cost.toFixed(2)}` : '-' }
  );
  console.log(table.toString());
}
