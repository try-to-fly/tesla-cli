#!/usr/bin/env node
import mqtt from 'mqtt';
import { config } from '../dist/config/index.js';

function parseArgs(argv) {
  const out = { seconds: 60, outPath: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seconds' && argv[i + 1]) out.seconds = Number(argv[++i]);
    else if (a === '--out' && argv[i + 1]) out.outPath = argv[++i];
  }
  if (!Number.isFinite(out.seconds) || out.seconds <= 0) out.seconds = 60;
  return out;
}

const { seconds, outPath } = parseArgs(process.argv.slice(2));

const host = config.mqtt.host;
const port = config.mqtt.port;
const carId = config.mqtt.carId;
const prefix = config.mqtt.topicPrefix;

const url = `mqtt://${host}:${port}`;
const base = `${prefix}/cars/${carId}/#`;

/** @type {Record<string, {count:number, firstTs:string, lastTs:string, sample:string}>} */
const stats = {};

console.log(`[mqtt-scan] connect ${url}`);
console.log(`[mqtt-scan] subscribe ${base}`);
console.log(`[mqtt-scan] duration ${seconds}s`);

const client = mqtt.connect(url);
client.on('connect', () => {
  client.subscribe(base, (err) => {
    if (err) {
      console.error('[mqtt-scan] subscribe error:', err);
      process.exitCode = 1;
      client.end();
      return;
    }
    console.log('[mqtt-scan] subscribed');
  });
});

client.on('message', (topic, payload) => {
  const ts = new Date().toISOString();
  const msg = payload.toString('utf8');
  const s = stats[topic] || (stats[topic] = { count: 0, firstTs: ts, lastTs: ts, sample: msg });
  s.count += 1;
  s.lastTs = ts;
  // Keep a small sample (avoid huge JSON)
  if (s.sample.length < 200 && msg.length < 200) s.sample = msg;
});

client.on('error', (err) => {
  console.error('[mqtt-scan] error:', err);
});

setTimeout(async () => {
  client.end(true);
  const topics = Object.entries(stats)
    .map(([topic, s]) => ({ topic, ...s }))
    .sort((a, b) => b.count - a.count);

  const result = {
    meta: {
      url,
      carId,
      prefix,
      seconds,
      capturedAt: new Date().toISOString(),
    },
    topics,
  };

  const json = JSON.stringify(result, null, 2);
  if (outPath) {
    const fs = await import('node:fs/promises');
    await fs.writeFile(outPath, json, 'utf8');
    console.log(`[mqtt-scan] wrote ${outPath}`);
  } else {
    console.log(json);
  }
}, seconds * 1000);
