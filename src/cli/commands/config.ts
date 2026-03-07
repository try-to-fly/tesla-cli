import { Command } from 'commander';
import { getConfigStore, loadStoredConfig, getStoredValue, type StoredConfig } from '../../config/store.js';

function parseJsonValue(value: string): unknown {
  return JSON.parse(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function maskSecret(v: string): string {
  if (v.length <= 8) return '***';
  return `${v.slice(0, 3)}***${v.slice(-3)}`;
}

function printConfig(cfg: StoredConfig): void {
  const safe: any = JSON.parse(JSON.stringify(cfg || {}));
  if (safe?.grafana?.token && typeof safe.grafana.token === 'string') {
    safe.grafana.token = maskSecret(safe.grafana.token);
  }
  // datasourceUid is not a secret; keep as-is for easier debugging.
  console.log(JSON.stringify(safe, null, 2));
}

export const configCommand = new Command('config').description(
  'Manage local tesla-cli config (stored via configstore)'
);

configCommand
  .command('path')
  .description('Print config file path used by configstore')
  .action(() => {
    const store = getConfigStore();
    console.log(store.path);
  });

configCommand
  .command('get')
  .description('Print current config (secrets masked)')
  .action(() => {
    printConfig(loadStoredConfig());
  });

configCommand
  .command('doctor')
  .description('Check whether required config keys are present')
  .action(() => {
    const requiredKeys = [
      'grafana.url',
      'grafana.token',
      'grafana.datasourceUid',
      'openclaw.channel',
      'openclaw.target',
    ];

    const missing = requiredKeys.filter((k) => {
      const v = getStoredValue(k);
      return typeof v !== 'string' || !v.trim();
    });

    if (missing.length) {
      console.log('Missing keys:');
      for (const k of missing) console.log(`- ${k}`);
      console.log('Run: tesla config init');
      process.exitCode = 1;
      return;
    }

    console.log('OK');
  });

configCommand
  .command('set')
  .description('Set a config key')
  .addHelpText(
    'after',
    `\nExamples:\n  tesla config set openclaw.channel discord\n  tesla config set mqtt.port 1883\n  tesla config set navAlert.enabled true\n  tesla config set navAlert.thresholdsMinutes "[20,15,10,5]"\n  tesla config set navAlert.destinationKeywords "[\\"公司\\",\\"聚橙路文一西路口\\"]"\n\nNotes:\n  - navAlert.enabled must be a JSON boolean: true / false\n  - navAlert.thresholdsMinutes must be a JSON number[]\n  - navAlert.destinationKeywords must be a JSON string[]\n  - Invalid formats will fail fast; no compatibility coercion is applied.\n`
  )
  .argument('<key>', 'Dot-path key, e.g. openclaw.channel')
  .argument('<value>', 'Value')
  .action((key: string, value: string) => {
    const store = getConfigStore();

    // Basic coercion for common numeric fields.
    if (key === 'mqtt.port' || key === 'mqtt.carId') {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`Expected number for ${key}`);
      store.set(key, n);
      return;
    }

    if (key === 'navAlert.enabled') {
      const parsed = parseJsonValue(value);
      if (!isBoolean(parsed)) throw new Error(`Expected boolean for ${key}`);
      store.set(key, parsed);
      return;
    }

    if (key === 'navAlert.thresholdsMinutes') {
      const parsed = parseJsonValue(value);
      if (!isNumberArray(parsed)) throw new Error(`Expected JSON number[] for ${key}`);
      store.set(
        key,
        parsed.map((n) => Math.max(0, Math.round(n)))
      );
      return;
    }

    if (key === 'navAlert.destinationKeywords') {
      const parsed = parseJsonValue(value);
      if (!isStringArray(parsed)) throw new Error(`Expected JSON string[] for ${key}`);
      store.set(
        key,
        parsed.map((s) => s.trim()).filter(Boolean)
      );
      return;
    }

    // Trim common string fields.
    if (
      key === 'grafana.url' ||
      key === 'grafana.token' ||
      key === 'grafana.datasourceUid' ||
      key === 'grafana.datasourceType' ||
      key === 'openclaw.channel' ||
      key === 'openclaw.target' ||
      key === 'openclaw.account' ||
      key === 'mqtt.host' ||
      key === 'mqtt.topicPrefix' ||
      key === 'navAlert.openclawChannel' ||
      key === 'navAlert.openclawTarget' ||
      key === 'navAlert.openclawAccount'
    ) {
      store.set(key, String(value).trim());
      return;
    }

    store.set(key, value);
  });

configCommand
  .command('delete')
  .description('Delete a config key')
  .argument('<key>', 'Dot-path key')
  .action((key: string) => {
    const store = getConfigStore();
    store.delete(key);
  });

configCommand
  .command('init')
  .description('Initialize required config keys interactively')
  .action(async () => {
    // Lazy import to keep non-interactive runs clean.
    const readline = await import('node:readline/promises');
    const { stdin: input, stdout: output } = await import('node:process');

    const rl = readline.createInterface({ input, output, terminal: true });
    const store = getConfigStore();

    const current = loadStoredConfig();

    const grafanaUrl =
      (await rl.question(`grafana.url [${current.grafana?.url || ''}]: `)) ||
      current.grafana?.url ||
      '';

    const grafanaToken =
      (await rl.question(
        `grafana.token (will be stored locally) [${current.grafana?.token ? '***' : ''}]: `
      )) ||
      current.grafana?.token ||
      '';

    const grafanaDatasourceUid =
      (await rl.question(
        `grafana.datasourceUid (Grafana datasource UID) [${current.grafana?.datasourceUid || ''}]: `
      )) ||
      current.grafana?.datasourceUid ||
      '';

    const grafanaDatasourceType =
      (await rl.question(
        `grafana.datasourceType (optional) [${current.grafana?.datasourceType || 'grafana-postgresql-datasource'}]: `
      )) ||
      current.grafana?.datasourceType ||
      'grafana-postgresql-datasource';

    const ocChannel =
      (await rl.question(
        `openclaw.channel [${current.openclaw?.channel || 'discord'}]: `
      )) ||
      current.openclaw?.channel ||
      'discord';

    const ocTarget =
      (await rl.question(`openclaw.target [${current.openclaw?.target || ''}]: `)) ||
      current.openclaw?.target ||
      '';

    const ocAccount =
      (await rl.question(
        `openclaw.account (optional) [${current.openclaw?.account || ''}]: `
      )) ||
      current.openclaw?.account ||
      '';

    const mqttHost =
      (await rl.question(`mqtt.host [${current.mqtt?.host || 'localhost'}]: `)) ||
      current.mqtt?.host ||
      'localhost';

    const mqttPortRaw =
      (await rl.question(`mqtt.port [${current.mqtt?.port ?? 1883}]: `)) ||
      String(current.mqtt?.port ?? 1883);
    const mqttPort = Number(mqttPortRaw);

    const mqttCarIdRaw =
      (await rl.question(`mqtt.carId [${current.mqtt?.carId ?? 1}]: `)) ||
      String(current.mqtt?.carId ?? 1);
    const mqttCarId = Number(mqttCarIdRaw);

    const mqttPrefix =
      (await rl.question(
        `mqtt.topicPrefix [${current.mqtt?.topicPrefix || 'teslamate'}]: `
      )) ||
      current.mqtt?.topicPrefix ||
      'teslamate';

    rl.close();

    if (!grafanaUrl.trim()) throw new Error('grafana.url is required');
    if (!grafanaToken.trim()) throw new Error('grafana.token is required');
    if (!grafanaDatasourceUid.trim()) throw new Error('grafana.datasourceUid is required');
    if (!ocChannel.trim()) throw new Error('openclaw.channel is required');
    if (!ocTarget.trim()) throw new Error('openclaw.target is required');
    if (!Number.isFinite(mqttPort)) throw new Error('mqtt.port must be a number');
    if (!Number.isFinite(mqttCarId)) throw new Error('mqtt.carId must be a number');

    store.set('grafana.url', grafanaUrl);
    store.set('grafana.token', grafanaToken);
    store.set('grafana.datasourceUid', grafanaDatasourceUid);
    store.set('grafana.datasourceType', grafanaDatasourceType);
    store.set('openclaw.channel', ocChannel);
    store.set('openclaw.target', ocTarget);
    if (ocAccount.trim()) store.set('openclaw.account', ocAccount);

    store.set('mqtt.host', mqttHost);
    store.set('mqtt.port', mqttPort);
    store.set('mqtt.carId', mqttCarId);
    store.set('mqtt.topicPrefix', mqttPrefix);

    console.log('OK');
    console.log(store.path);
  });
