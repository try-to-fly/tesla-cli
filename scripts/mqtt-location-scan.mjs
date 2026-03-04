#!/usr/bin/env node
import mqtt from "mqtt";
import { config } from "../dist/config/index.js";

const host = config.mqtt.host;
const port = config.mqtt.port;
const carId = config.mqtt.carId;
const prefix = config.mqtt.topicPrefix;

const url = `mqtt://${host}:${port}`;
const base = `${prefix}/cars/${carId}/#`;

const allow = [
  "latitude",
  "longitude",
  "heading",
  "speed",
  "elevation",
  "geofence",
  "geofence_id",
  "geofence_name",
  "native_location_supported",
  "active_route",
  "active_route_latitude",
  "active_route_longitude",
  "active_route_destination",
];

function shouldPrint(topic) {
  return allow.some((k) => topic.endsWith(`/${k}`));
}

console.log(`[mqtt-location-scan] connect ${url}`);
console.log(`[mqtt-location-scan] subscribe ${base}`);
console.log(`[mqtt-location-scan] printing topics endsWith: ${allow.join(", ")}`);

const client = mqtt.connect(url);
client.on("connect", () => {
  client.subscribe(base, (err) => {
    if (err) {
      console.error("subscribe error:", err);
      process.exitCode = 1;
      client.end();
      return;
    }
    console.log("[mqtt-location-scan] subscribed; scanning for 60s...");
  });
});

client.on("message", (topic, payload) => {
  if (!shouldPrint(topic)) return;
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${topic} ${payload.toString("utf8")}`);
});

client.on("error", (err) => {
  console.error("mqtt error:", err);
});

setTimeout(() => {
  console.log("[mqtt-location-scan] done");
  client.end(true);
}, 60_000);
