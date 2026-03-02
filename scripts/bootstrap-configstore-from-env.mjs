#!/usr/bin/env node
import Configstore from 'configstore';

function requireEnv(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

function optionalEnv(key, fallback) {
  return process.env[key] ?? fallback;
}

const store = new Configstore('tesla-service');

// Grafana
store.set('grafana.url', requireEnv('GRAFANA_URL'));
store.set('grafana.token', requireEnv('GRAFANA_TOKEN'));

// OpenClaw
store.set('openclaw.channel', requireEnv('OPENCLAW_CHANNEL'));
store.set('openclaw.target', requireEnv('OPENCLAW_TARGET'));
if (process.env.OPENCLAW_ACCOUNT) store.set('openclaw.account', process.env.OPENCLAW_ACCOUNT);

// MQTT
store.set('mqtt.host', optionalEnv('MQTT_HOST', 'localhost'));
store.set('mqtt.port', Number(optionalEnv('MQTT_PORT', '1883')));
store.set('mqtt.carId', Number(optionalEnv('MQTT_CAR_ID', '1')));
store.set('mqtt.topicPrefix', optionalEnv('MQTT_TOPIC_PREFIX', 'teslamate'));

console.log('OK');
console.log(store.path);
