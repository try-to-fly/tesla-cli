import { getGrafanaClient, StateService } from '../../core/index.js';
import { outputResult, type OutputFormat } from '../utils/formatters.js';
import { formatDuration } from '../utils/units.js';
import Table from 'cli-table3';
import chalk from 'chalk';

export interface StatesOptions {
  output: OutputFormat;
  from: string;
  to: string;
  limit: string;
}

export async function statesCommand(carId: string, options: StatesOptions): Promise<void> {
  const client = await getGrafanaClient();
  const stateService = new StateService(client);

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

  const [states, currentState, stats] = await Promise.all([
    stateService.getStates({ carId: id, from: options.from, to: options.to, limit }),
    stateService.getCurrentState(id),
    stateService.getStateStats(id),
  ]);

  const result = { current: currentState, stats, history: states };

  if (options.output === 'json') {
    outputResult(result, 'json');
    return;
  }

  // Current State
  if (currentState) {
    console.log(chalk.cyan.bold('\n📍 Current State'));
    const currentTable = new Table();
    currentTable.push(
      { 'State': currentState.state },
      { 'Since': new Date(currentState.start_date).toLocaleString() }
    );
    console.log(currentTable.toString());
  }

  // State Statistics
  if (stats.length > 0) {
    console.log(chalk.cyan.bold('\n📊 State Statistics'));
    const statsTable = new Table({
      head: ['State', 'Count', 'Total Duration', 'Percentage'],
      style: { head: ['cyan'] },
    });

    for (const s of stats) {
      statsTable.push([
        s.state,
        s.count,
        formatDuration(s.total_duration_min),
        `${s.percentage}%`,
      ]);
    }
    console.log(statsTable.toString());
  }

  // State History
  if (states.length > 0) {
    console.log(chalk.cyan.bold('\n📜 State History'));
    const historyTable = new Table({
      head: ['State', 'Start', 'End', 'Duration'],
      style: { head: ['cyan'] },
    });

    for (const s of states) {
      historyTable.push([
        s.state,
        new Date(s.start_date).toLocaleString(),
        s.end_date ? new Date(s.end_date).toLocaleString() : 'Ongoing',
        formatDuration(s.duration_min),
      ]);
    }
    console.log(historyTable.toString());
  }
}
