import { getGrafanaClient } from '../../core/index.js';
import { TPMSService } from '../../core/services/tpms-service.js';
import { outputResult, type OutputFormat } from '../utils/formatters.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface TPMSOptions {
  output: OutputFormat;
  from?: string;
  to?: string;
}

export async function tpmsCommand(carId: string, options: TPMSOptions): Promise<void> {
  const client = await getGrafanaClient();
  const tpmsService = new TPMSService(client);

  const id = parseInt(carId, 10);
  if (isNaN(id)) {
    console.error('Error: Invalid car ID');
    process.exit(1);
  }

  const stats = await tpmsService.getStats(id, {
    from: options.from,
    to: options.to,
  });

  if (options.output === 'json') {
    outputResult(stats, 'json');
    return;
  }

  console.log(chalk.cyan.bold('\n🛞 Tire Pressure (TPMS)'));

  if (!stats.latest) {
    console.log(chalk.yellow('No TPMS data available'));
    return;
  }

  // 当前压力表格
  const pressureTable = new Table({
    head: ['Position', 'Pressure (bar)', 'Status'],
    style: { head: ['cyan'] },
  });

  const formatPressure = (value: number | null, label: string) => {
    if (value === null) return [label, '-', '-'];
    const status = value < 2.0 ? chalk.red('Low') : value > 3.0 ? chalk.yellow('High') : chalk.green('OK');
    return [label, value.toFixed(2), status];
  };

  pressureTable.push(
    formatPressure(stats.latest.fl, 'Front Left'),
    formatPressure(stats.latest.fr, 'Front Right'),
    formatPressure(stats.latest.rl, 'Rear Left'),
    formatPressure(stats.latest.rr, 'Rear Right')
  );

  console.log(pressureTable.toString());

  // 统计信息
  if (stats.avg.fl !== null) {
    console.log(chalk.cyan.bold('\n📊 Average Pressure (30 days)'));
    const avgTable = new Table();
    avgTable.push(
      { 'Front Left': `${stats.avg.fl?.toFixed(2) ?? '-'} bar` },
      { 'Front Right': `${stats.avg.fr?.toFixed(2) ?? '-'} bar` },
      { 'Rear Left': `${stats.avg.rl?.toFixed(2) ?? '-'} bar` },
      { 'Rear Right': `${stats.avg.rr?.toFixed(2) ?? '-'} bar` }
    );
    console.log(avgTable.toString());
  }

  // 异常警告
  if (stats.hasAlert) {
    console.log(chalk.red.bold(`\n⚠️  ${stats.alertMessage}`));
  }

  // 温度信息
  if (stats.latest.outside_temp !== null) {
    console.log(chalk.gray(`\nOutside Temperature: ${stats.latest.outside_temp}°C`));
  }

  console.log(chalk.gray(`Last Updated: ${new Date(stats.latest.date).toLocaleString()}`));
}
