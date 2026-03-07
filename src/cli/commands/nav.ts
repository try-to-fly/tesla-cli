import { Command } from 'commander';
import { getConfigStore } from '../../config/store.js';

function readDestinations(): string[] {
  const store = getConfigStore();
  const v = store.get('navAlert.destinationKeywords') as unknown;
  if (v == null) return [];
  if (!Array.isArray(v)) {
    throw new Error('Invalid config: navAlert.destinationKeywords must be a string[]');
  }

  const invalid = v.find((x) => typeof x !== 'string' || !x.trim());
  if (invalid !== undefined) {
    throw new Error('Invalid config: navAlert.destinationKeywords must be a non-empty string[]');
  }

  return Array.from(new Set(v.map((x) => x.trim())));
}

function writeDestinations(list: string[]): void {
  const store = getConfigStore();
  const uniq = Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)));
  store.set('navAlert.destinationKeywords', uniq);
}

function readThresholds(): number[] {
  const store = getConfigStore();
  const v = store.get('navAlert.thresholdsMinutes') as any;
  if (!Array.isArray(v)) return [15, 10, 5];
  const arr = v
    .filter((n) => typeof n === 'number' && Number.isFinite(n))
    .map((n) => Math.max(0, Math.round(n)));
  return arr.length ? arr : [15, 10, 5];
}

function writeThresholds(list: number[]): void {
  const store = getConfigStore();
  const uniq = Array.from(new Set(list.filter((n) => Number.isFinite(n) && n >= 0).map((n) => Math.round(n))));
  store.set('navAlert.thresholdsMinutes', uniq);
}

export const navCommand = new Command('nav').description('Navigation alert config helpers');

navCommand
  .command('destinations')
  .description('Manage nav destination whitelist (strict match)')
  .addCommand(
    new Command('list').description('List destination whitelist').action(() => {
      const list = readDestinations();
      if (!list.length) {
        console.log('(empty)');
        return;
      }
      for (const d of list) console.log(d);
    })
  )
  .addCommand(
    new Command('add')
      .description('Add a destination (exact string)')
      .argument('<destination>', 'Exact destination string as reported by TeslaMate')
      .action((destination: string) => {
        const list = readDestinations();
        list.push(destination);
        writeDestinations(list);
        console.log('OK');
      })
  )
  .addCommand(
    new Command('remove')
      .description('Remove a destination (exact string)')
      .argument('<destination>', 'Exact destination string')
      .action((destination: string) => {
        const list = readDestinations().filter((d) => d !== destination);
        writeDestinations(list);
        console.log('OK');
      })
  );

navCommand
  .command('thresholds')
  .description('Manage nav alert thresholds (minutes)')
  .addCommand(
    new Command('get').description('Print thresholds list').action(() => {
      console.log(JSON.stringify(readThresholds()));
    })
  )
  .addCommand(
    new Command('set')
      .description('Set thresholds, e.g. "15,10,5"')
      .argument('<csv>', 'Comma-separated minutes')
      .action((csv: string) => {
        const list = csv
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n));
        writeThresholds(list);
        console.log('OK');
      })
  );
