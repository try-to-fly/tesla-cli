import { getGrafanaClient, BatteryService } from '../../core/index.js';
import { outputResult, type OutputFormat } from '../utils/formatters.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface BatteryOptions {
  output: OutputFormat;
}

export async function batteryCommand(carId: string, options: BatteryOptions): Promise<void> {
  const client = await getGrafanaClient();
  const batteryService = new BatteryService(client);

  const id = parseInt(carId, 10);
  if (isNaN(id)) {
    console.error('Error: Invalid car ID');
    process.exit(1);
  }

  const [health, chargingStats, driveStats] = await Promise.all([
    batteryService.getBatteryHealth(id),
    batteryService.getChargingStats(id),
    batteryService.getDriveStats(id),
  ]);

  const result = {
    battery_health: health,
    charging_stats: chargingStats,
    drive_stats: driveStats,
  };

  if (options.output === 'json') {
    outputResult(result, 'json');
    return;
  }

  // Battery Health Table
  console.log(chalk.cyan.bold('\n📊 Battery Health'));
  const healthTable = new Table();
  healthTable.push(
    { 'Battery Health': `${health.battery_health_percent.toFixed(1)}%` },
    { 'Degradation': `${health.degradation_percent.toFixed(1)}%` },
    { 'Capacity (now)': `${health.usable_capacity_now.toFixed(1)} kWh` },
    { 'Capacity (new)': `${health.usable_capacity_new.toFixed(1)} kWh` },
    { 'Capacity Lost': `${health.capacity_difference.toFixed(1)} kWh` },
    { 'Current SOC': `${health.current_soc.toFixed(0)}%` },
    { 'Stored Energy': `${health.current_stored_energy.toFixed(1)} kWh` },
    { 'Efficiency': `${(health.efficiency * 10).toFixed(0)} Wh/km` }
  );
  console.log(healthTable.toString());

  // Charging Stats Table
  console.log(chalk.cyan.bold('\n⚡ Charging Statistics'));
  const chargingTable = new Table();
  chargingTable.push(
    { 'Total Charges': chargingStats.total_charges },
    { 'Charging Cycles': chargingStats.charging_cycles },
    { 'Energy Added': `${chargingStats.total_energy_added.toFixed(1)} kWh` },
    { 'Energy Used': `${chargingStats.total_energy_used.toFixed(1)} kWh` },
    { 'Charging Efficiency': `${(chargingStats.charging_efficiency * 100).toFixed(1)}%` },
    { 'AC Energy': `${chargingStats.ac_energy.toFixed(1)} kWh` },
    { 'DC Energy': `${chargingStats.dc_energy.toFixed(1)} kWh` }
  );
  console.log(chargingTable.toString());

  // Drive Stats Table
  console.log(chalk.cyan.bold('\n🚗 Drive Statistics'));
  const driveTable = new Table();
  driveTable.push(
    { 'Logged Distance': `${driveStats.logged_distance.toFixed(1)} km` },
    { 'Mileage': `${driveStats.mileage.toFixed(1)} km` },
    { 'Odometer': `${driveStats.odometer.toFixed(1)} km` },
    { 'Data Lost': `${driveStats.data_lost.toFixed(1)} km` }
  );
  console.log(driveTable.toString());
}
