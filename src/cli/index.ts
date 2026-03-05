import { Command } from 'commander';
import { carsCommand } from './commands/cars.js';
import { carCommand } from './commands/car.js';
import { chargesCommand } from './commands/charges.js';
import { drivesCommand } from './commands/drives.js';
import { batteryCommand } from './commands/battery.js';
import { efficiencyCommand } from './commands/efficiency.js';
import { statesCommand } from './commands/states.js';
import { updatesCommand } from './commands/updates.js';
import { mileageCommand } from './commands/mileage.js';
import { vampireCommand } from './commands/vampire.js';
import { locationsCommand } from './commands/locations.js';
import { timelineCommand } from './commands/timeline.js';
import { visitedCommand } from './commands/visited.js';
import { projectedRangeCommand } from './commands/projected-range.js';
import { statsCommand } from './commands/stats/index.js';
import { detailCommand } from './commands/detail/index.js';
import { screenshotCommand } from './commands/screenshot.js';
import { mqttCommand } from './commands/mqtt.js';
import { queryCommandDef } from './commands/query.js';
import { tpmsCommand } from './commands/tpms.js';
import { whereCommand } from './commands/where.js';
import { notifyCommand } from './commands/notify.js';
import { configCommand } from './commands/config.js';
import { navCommand } from './commands/nav.js';

const program = new Command();

program
  .name('tesla')
  .description('Tesla Service CLI')
  .version('1.0.0');

program
  .command('cars')
  .description('List all vehicles')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .action(carsCommand);

program
  .command('car <id>')
  .description('Get vehicle overview')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .action(carCommand);

program
  .command('charges <car-id>')
  .description('Get charge records')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .option('-f, --from <date>', 'Start time', 'now-90d')
  .option('-t, --to <date>', 'End time', 'now')
  .option('-l, --limit <number>', 'Record limit', '50')
  .action(chargesCommand);

program
  .command('drives <car-id>')
  .description('Get drive records')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .option('-f, --from <date>', 'Start time', 'now-90d')
  .option('-t, --to <date>', 'End time', 'now')
  .option('-l, --limit <number>', 'Record limit', '50')
  .action(drivesCommand);

program
  .command('battery <car-id>')
  .description('Battery health and statistics')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .action(batteryCommand);

program
  .command('efficiency <car-id>')
  .description('Efficiency analysis')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .option('--min-distance <km>', 'Minimum distance for temperature analysis', '5')
  .action(efficiencyCommand);

program
  .command('states <car-id>')
  .description('Vehicle state history')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .option('-f, --from <date>', 'Start time', 'now-30d')
  .option('-t, --to <date>', 'End time', 'now')
  .option('-l, --limit <number>', 'Record limit', '50')
  .action(statesCommand);

program
  .command('updates <car-id>')
  .description('Software update history')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .option('-f, --from <date>', 'Start time', 'now-1y')
  .option('-t, --to <date>', 'End time', 'now')
  .option('-l, --limit <number>', 'Record limit', '50')
  .action(updatesCommand);

program
  .command('mileage <car-id>')
  .description('Mileage statistics')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .option('-f, --from <date>', 'Start time', 'now-30d')
  .option('-t, --to <date>', 'End time', 'now')
  .action(mileageCommand);

program
  .command('vampire <car-id>')
  .description('Vampire drain analysis')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .option('-f, --from <date>', 'Start time', 'now-90d')
  .option('-t, --to <date>', 'End time', 'now')
  .option('--min-duration <minutes>', 'Minimum idle duration in minutes', '60')
  .action(vampireCommand);

program
  .command('locations <car-id>')
  .description('Location statistics')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .option('-f, --from <date>', 'Start time', 'now-1y')
  .option('-t, --to <date>', 'End time', 'now')
  .option('--top <number>', 'Number of top locations', '10')
  .action(locationsCommand);

program
  .command('timeline <car-id>')
  .description('Activity timeline')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .option('-f, --from <date>', 'Start time', 'now-7d')
  .option('-t, --to <date>', 'End time', 'now')
  .option('-l, --limit <number>', 'Record limit', '50')
  .action(timelineCommand);

program
  .command('visited <car-id>')
  .description('Visited places')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .option('-f, --from <date>', 'Start time', 'now-1y')
  .option('-t, --to <date>', 'End time', 'now')
  .option('--top <number>', 'Number of places', '20')
  .action(visitedCommand);

program
  .command('projected-range <car-id>')
  .description('Projected range analysis')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .option('-f, --from <date>', 'Start time', 'now-30d')
  .option('-t, --to <date>', 'End time', 'now')
  .option('-l, --limit <number>', 'Record limit', '30')
  .action(projectedRangeCommand);

program
  .command('tpms <car-id>')
  .description('Tire pressure monitoring (TPMS)')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .option('-f, --from <date>', 'Start time', 'now-30d')
  .option('-t, --to <date>', 'End time', 'now')
  .action(tpmsCommand);

program
  .command('where <car-id>')
  .description('Get latest known position (lat/lng)')
  .option('-o, --output <format>', 'Output format: table | json', 'table')
  .option('--amap', 'Reverse geocode with AMap (requires AMP_WEB_API)')
  .option('--radius <meters>', 'AMap reverse geocode radius', '200')
  .action(whereCommand);

program.addCommand(statsCommand);
program.addCommand(detailCommand);
program.addCommand(screenshotCommand);
program.addCommand(mqttCommand);
program.addCommand(queryCommandDef);
program.addCommand(notifyCommand);
program.addCommand(configCommand);
program.addCommand(navCommand);

export { program };
