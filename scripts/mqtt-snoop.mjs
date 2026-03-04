#!/usr/bin/env node
import mqtt from 'mqtt';
import { config } from '../dist/config/index.js';

const host = config.mqtt.host;
const port = config.mqtt.port;
const carId = config.mqtt.carId;
const prefix = config.mqtt.topicPrefix;

const topics = [
  `${prefix}/cars/${carId}/active_route`,
  `${prefix}/cars/${carId}/state`,
  `${prefix}/cars/${carId}/charging_state`,
];

const url = `mqtt://${host}:${port}`;
console.log(`[mqtt-snoop] connect ${url}`);
console.log(`[mqtt-snoop] carId=${carId} prefix=${prefix}`);
console.log(`[mqtt-snoop] subscribe:`);
for (const t of topics) console.log(`  - ${t}`);

const client = mqtt.connect(url);

client.on('connect', () => {
  client.subscribe(topics, (err) => {
    if (err) {
      console.error('[mqtt-snoop] subscribe error:', err);
      process.exitCode = 1;
      client.end();
      return;
    }
    console.log('[mqtt-snoop] subscribed. waiting messages... (Ctrl+C to exit)');
  });
});

client.on('message', (topic, payload) => {
  const ts = new Date().toISOString();
  const msg = payload.toString('utf8');
  console.log(`\n[${ts}] ${topic}`);
  console.log(msg);
});

client.on('error', (err) => {
  console.error('[mqtt-snoop] error:', err);
});

process.on('SIGINT', () => {
  console.log('\n[mqtt-snoop] exit');
  client.end(true);
  process.exit(0);
});
