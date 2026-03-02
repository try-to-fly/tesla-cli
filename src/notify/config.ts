import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type NotifyChannel = 'telegram' | 'discord';

export interface MessageSenderConfig {
  default: {
    channel: NotifyChannel;
    target: string;
  };
}

function expandHome(p: string): string {
  if (!p.startsWith('~')) return p;
  return path.join(os.homedir(), p.slice(1));
}

export function getMessageSenderConfigPath(): string {
  // Preferred: file path explicitly set by caller.
  // Fallback: standard config path.
  return (
    process.env.MESSAGE_SENDER_CONFIG ||
    path.join(os.homedir(), '.config', 'openclaw', 'message-sender.json')
  );
}

export function loadMessageSenderConfig(): MessageSenderConfig {
  const p = expandHome(getMessageSenderConfigPath());
  const raw = fs.readFileSync(p, 'utf8');
  const json = JSON.parse(raw) as MessageSenderConfig;

  const channel = (json as any)?.default?.channel;
  const target = (json as any)?.default?.target;

  if (!channel || !target) {
    throw new Error(
      `Invalid message-sender config at ${p}: expected { default: { channel, target } }`
    );
  }

  return json;
}
