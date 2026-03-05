import { getConfigStore, type StoredConfig } from '../../config/store.js';

export type NavConfig = {
  enabled: boolean;
  destinationKeywords: string[];
  thresholdsMinutes: number[];
  openclaw?: {
    channel?: string;
    target?: string;
    account?: string;
  };
};

function normalizeStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

function normalizeThresholds(v: unknown): number[] {
  if (!Array.isArray(v)) return [15, 10, 5];
  const arr = v
    .filter((n) => typeof n === 'number' && Number.isFinite(n))
    .map((n) => Math.max(0, Math.round(n)));
  return arr.length ? arr : [15, 10, 5];
}

/**
 * Load nav config from configstore for real-time effect.
 * Also performs a one-time migration: if destinationKeywords is a string in store,
 * rewrite it into a string[] on read.
 */
export function loadNavConfigRealtime(): NavConfig {
  const store = getConfigStore();
  const all = (store.all || {}) as StoredConfig;
  const navAlert: any = all.navAlert || {};

  const enabled = typeof navAlert.enabled === 'boolean' ? navAlert.enabled : false;

  const destRaw = navAlert.destinationKeywords;
  const destinationKeywords = normalizeStringArray(destRaw);

  // One-time migration: string -> string[]
  if (typeof destRaw === 'string' && destRaw.trim()) {
    store.set('navAlert.destinationKeywords', [destRaw.trim()]);
  }

  const thresholdsMinutes = normalizeThresholds(navAlert.thresholdsMinutes);

  const ocChannel = typeof navAlert.openclawChannel === 'string' && navAlert.openclawChannel.trim()
    ? navAlert.openclawChannel.trim()
    : undefined;
  const ocTarget = typeof navAlert.openclawTarget === 'string' && navAlert.openclawTarget.trim()
    ? navAlert.openclawTarget.trim()
    : undefined;
  const ocAccount = typeof navAlert.openclawAccount === 'string' && navAlert.openclawAccount.trim()
    ? navAlert.openclawAccount.trim()
    : undefined;

  const openclaw = ocChannel || ocTarget || ocAccount ? { channel: ocChannel, target: ocTarget, account: ocAccount } : undefined;

  return {
    enabled,
    destinationKeywords,
    thresholdsMinutes,
    openclaw,
  };
}
