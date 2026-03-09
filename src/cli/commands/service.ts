import { Command } from 'commander';
import Configstore from 'configstore';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_NAME = 'tesla-mqtt';
const STORE_NAME = 'tesla-cli';

type ExecResult = { code: number; stdout: string; stderr: string };

function getServiceDir(): string {
  return path.join(os.homedir(), '.tesla-cli');
}

function getLogsDir(): string {
  return path.join(getServiceDir(), 'logs');
}

function getEcosystemPath(): string {
  return path.join(getServiceDir(), 'ecosystem.config.cjs');
}

function getCurrentEntrypoint(): string {
  return fileURLToPath(new URL('../../index.js', import.meta.url));
}

function ensureDirs(): void {
  fs.mkdirSync(getLogsDir(), { recursive: true });
}

function runCommand(command: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

async function resolvePm2Command(): Promise<{ command: string; prefixArgs: string[] }> {
  const direct = await runCommand('pm2', ['-v']).catch(() => null);
  if (direct && direct.code === 0) return { command: 'pm2', prefixArgs: [] };

  const viaNpx = await runCommand('npx', ['pm2', '-v']).catch(() => null);
  if (viaNpx && viaNpx.code === 0) return { command: 'npx', prefixArgs: ['pm2'] };

  throw new Error('PM2 not found. Please install it first: npm install -g pm2');
}

async function runPm2(args: string[]): Promise<ExecResult> {
  const { command, prefixArgs } = await resolvePm2Command();
  return runCommand(command, [...prefixArgs, ...args]);
}

function writeEcosystemConfig(): string {
  ensureDirs();

  const entry = JSON.stringify(getCurrentEntrypoint());
  const cwd = JSON.stringify(process.cwd());
  const outFile = JSON.stringify(path.join(getLogsDir(), 'mqtt-out.log'));
  const errFile = JSON.stringify(path.join(getLogsDir(), 'mqtt-error.log'));

  const content = `module.exports = {
  apps: [
    {
      name: ${JSON.stringify(APP_NAME)},
      script: process.execPath,
      args: [${entry}, 'mqtt', 'listen'],
      cwd: ${cwd},
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: ${outFile},
      error_file: ${errFile},
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
`;

  const file = getEcosystemPath();
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

async function installService(): Promise<void> {
  const store = new Configstore(STORE_NAME);
  const ecosystemPath = writeEcosystemConfig();
  store.set('service.pm2AppName', APP_NAME);
  store.set('service.ecosystemPath', ecosystemPath);

  const start = await runPm2(['start', ecosystemPath]);
  if (start.stdout.trim()) process.stdout.write(start.stdout);
  if (start.stderr.trim()) process.stderr.write(start.stderr);
  if (start.code !== 0) throw new Error(`pm2 start failed with code ${start.code}`);

  const save = await runPm2(['save']).catch(() => null);
  if (save?.stdout?.trim()) process.stdout.write(save.stdout);

  console.log(`Service installed: ${APP_NAME}`);
  console.log(`Ecosystem: ${ecosystemPath}`);
}

async function simplePm2Action(action: 'start' | 'stop' | 'restart' | 'delete'): Promise<void> {
  const result = await runPm2([action, APP_NAME]);
  if (result.stdout.trim()) process.stdout.write(result.stdout);
  if (result.stderr.trim()) process.stderr.write(result.stderr);
  if (result.code !== 0) throw new Error(`pm2 ${action} failed with code ${result.code}`);
  if (action === 'delete') {
    const save = await runPm2(['save']).catch(() => null);
    if (save?.stdout?.trim()) process.stdout.write(save.stdout);
  }
}

async function statusService(): Promise<void> {
  const result = await runPm2(['describe', APP_NAME]);
  if (result.stdout.trim()) process.stdout.write(result.stdout);
  if (result.stderr.trim()) process.stderr.write(result.stderr);
  if (result.code !== 0) throw new Error(`pm2 describe failed with code ${result.code}`);
}

function printLogsHint(): void {
  console.log(`Logs:`);
  console.log(`- ${path.join(getLogsDir(), 'mqtt-out.log')}`);
  console.log(`- ${path.join(getLogsDir(), 'mqtt-error.log')}`);
  console.log(`Or run: pm2 logs ${APP_NAME}`);
}

export const serviceCommand = new Command('service').description('Manage Tesla MQTT background service with PM2');

serviceCommand
  .command('install')
  .description('Install and start the Tesla MQTT service in PM2')
  .action(async () => {
    await installService();
  });

serviceCommand
  .command('start')
  .description('Start the Tesla MQTT service')
  .action(async () => {
    await simplePm2Action('start');
  });

serviceCommand
  .command('stop')
  .description('Stop the Tesla MQTT service')
  .action(async () => {
    await simplePm2Action('stop');
  });

serviceCommand
  .command('restart')
  .description('Restart the Tesla MQTT service')
  .action(async () => {
    await simplePm2Action('restart');
  });

serviceCommand
  .command('status')
  .description('Show Tesla MQTT service status')
  .action(async () => {
    await statusService();
  });

serviceCommand
  .command('logs')
  .description('Show where service logs are stored')
  .action(() => {
    printLogsHint();
  });

serviceCommand
  .command('uninstall')
  .description('Remove the Tesla MQTT service from PM2')
  .action(async () => {
    await simplePm2Action('delete');
    console.log(`Service removed: ${APP_NAME}`);
  });
