import { loadStoredConfig } from './store.js';

function requireCfg(v: unknown, keyPath: string): string {
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Missing required config: ${keyPath} (run: tesla config init)`);
  }
  return v;
}

function optionalString(v: unknown, defaultValue: string): string {
  return typeof v === 'string' && v.trim() ? v : defaultValue;
}

function optionalNumber(v: unknown, defaultValue: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : defaultValue;
}

export const config = (() => {
  const stored = loadStoredConfig();

  const mqtt = stored.mqtt || {};
  const grafana = stored.grafana || {};
  const openclaw = stored.openclaw || {};
  const amap = stored.amap || {};
  const navAlert = stored.navAlert || {};
  const navOpenclaw = {
    channel: typeof navAlert.openclawChannel === 'string' ? navAlert.openclawChannel.trim() : '',
    target: typeof navAlert.openclawTarget === 'string' ? navAlert.openclawTarget.trim() : '',
    account: typeof navAlert.openclawAccount === 'string' ? navAlert.openclawAccount.trim() : '',
  };

  return {
    grafana: {
      url: requireCfg(grafana.url, 'grafana.url'),
      token: requireCfg(grafana.token, 'grafana.token'),
      datasource: {
        uid: requireCfg(grafana.datasourceUid, 'grafana.datasourceUid'),
        type: optionalString(grafana.datasourceType, 'grafana-postgresql-datasource'),
      },
    },
    openclaw: {
      channel: requireCfg(openclaw.channel, 'openclaw.channel'),
      target: requireCfg(openclaw.target, 'openclaw.target'),
      account: typeof openclaw.account === 'string' ? openclaw.account : undefined,
    },
    mqtt: {
      host: optionalString(mqtt.host, 'localhost'),
      port: optionalNumber(mqtt.port, 1883),
      carId: optionalNumber(mqtt.carId, 1),
      topicPrefix: optionalString(mqtt.topicPrefix, 'teslamate'),
    },
    amap: {
      webApiKey:
        typeof amap.webApiKey === 'string' && amap.webApiKey.trim()
          ? amap.webApiKey.trim()
          : undefined,
    },
    navAlert: {
      enabled: typeof navAlert.enabled === 'boolean' ? navAlert.enabled : false,
      destinationKeywords: (() => {
        const out: string[] = [];
        const pushValue = (input: unknown): void => {
          if (Array.isArray(input)) {
            for (const item of input) pushValue(item);
            return;
          }
          if (typeof input !== 'string') return;
          const trimmed = input.trim();
          if (!trimmed) return;
          if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('"[') && trimmed.endsWith(']"'))) {
            try {
              pushValue(JSON.parse(trimmed));
              return;
            } catch {
              // ignore and keep original string
            }
          }
          out.push(trimmed);
        };
        pushValue((navAlert as any).destinationKeywords);
        return Array.from(new Set(out));
      })(),
      thresholdsMinutes: Array.isArray(navAlert.thresholdsMinutes)
        ? navAlert.thresholdsMinutes
            .filter((n) => typeof n === 'number' && Number.isFinite(n))
            .map((n) => Math.max(0, Math.round(n)))
        : [15, 10, 5],

      // Optional override for navigation alert routing.
      openclaw: {
        channel: navOpenclaw.channel || undefined,
        target: navOpenclaw.target || undefined,
        account: navOpenclaw.account || undefined,
      },
    },
  } as const;
})();

export type Config = typeof config;
