// Copyright (C) 2026 Alexandre Demartin
//
// getConfig() and setConfig() (src/db/config.ts): what they return shares no
// object with the live config (#245), and they never throw, whatever was stored
// (#257, #508); setConfig() refuses a key 8.0 removed (decision 019 § 4). No database.

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { resetConfig } from '../helpers/config';

afterEach(resetConfig);

describe('getConfig()', () => {
  it('returns a copy: changing it leaves the config unchanged', () => {
    const copy = db.getConfig();
    copy.transactionAttemptsMax = 1;
    copy.transactionRetryDelay.minMs = 1;
    expect(db.getConfig().transactionAttemptsMax).toBe(5);
    expect(db.getConfig().transactionRetryDelay).toEqual({ minMs: 25, maxMs: 250 });
  });

  it('keeps a listener as the same function', () => {
    const queryListener = () => undefined;
    db.setConfig({ queryListener });
    expect(db.getConfig().queryListener).toBe(queryListener);
  });

  it('copies minMs and maxMs of a transactionRetryDelay that has them as getters', () => {
    class Delay { get minMs() { return 5; } get maxMs() { return 6; } }
    db.setConfig({ transactionRetryDelay: new Delay() });
    expect(db.getConfig().transactionRetryDelay).toEqual({ minMs: 5, maxMs: 6 });
  });

  // #257: as in Zapatos 6.6.1, only transaction(), which reads the delay, throws; not every query, which calls getConfig()
  it.each([
    ['minMs', class { get minMs(): number { throw new Error('no delay'); } get maxMs() { return 0; } }],
    ['maxMs', class { get minMs() { return 0; } get maxMs(): number { throw new Error('no delay'); } }],
  ])('gives a transactionRetryDelay whose %s getter throws as it is, without throwing', (_, Delay) => {
    const delay = new Delay();
    expect(db.setConfig({ transactionRetryDelay: delay }).transactionRetryDelay).toBe(delay);
    expect(db.getConfig().transactionRetryDelay).toBe(delay);
  });

  it('gives a transactionRetryDelay whose getter starts throwing after setConfig() as it is, without throwing', () => {
    let broken = false;
    class Delay { get minMs() { if (broken) throw new Error('no delay'); return 1; } get maxMs() { return 2; } }
    const delay = new Delay();
    expect(db.setConfig({ transactionRetryDelay: delay }).transactionRetryDelay).toEqual({ minMs: 1, maxMs: 2 });
    broken = true;
    expect(db.getConfig().transactionRetryDelay).toBe(delay);
  });
});

describe('setConfig()', () => {
  it('returns a copy: changing it leaves the config unchanged', () => {
    const returned = db.setConfig({ transactionAttemptsMax: 3 });
    expect(returned.transactionAttemptsMax).toBe(3);
    returned.transactionAttemptsMax = 1;
    returned.transactionRetryDelay.minMs = 1;
    expect(db.getConfig().transactionAttemptsMax).toBe(3);
    expect(db.getConfig().transactionRetryDelay).toEqual({ minMs: 25, maxMs: 250 });
  });

  // #246: a key set to undefined compiles in a consumer project, not under exactOptionalPropertyTypes (hence the casts)
  const defaults = {
    transactionAttemptsMax: 5,
    transactionRetryDelay: { minMs: 25, maxMs: 250 },
    castArrayParamsToJson: false,
    castObjectParamsToJson: false,
    selectExactlyOneChecksForSecondRow: false,
    shortcutsUseJson: false,
    topLevelSelectAsRows: false,
  };
  const changed = {
    transactionAttemptsMax: 2,
    transactionRetryDelay: { minMs: 0, maxMs: 0 },
    castArrayParamsToJson: true,
    castObjectParamsToJson: true,
    selectExactlyOneChecksForSecondRow: true,
    shortcutsUseJson: true,
    topLevelSelectAsRows: true,
  };

  // decision 019 § 4: a key 8.0 removed passes as the value 8.0 always behaves as, null or undefined, and is not kept;
  // any other value throws before the config changes
  const removed = {
    undefinedMeansMissing: true, upsertRequiresSameKeys: true,
    transactionRequiresCommit: true, transactionRequiresIdleClient: true, transactionRequiresSatisfyingLevel: true,
    aggregatesTypedByColumn: true,
  };
  const set = (config: object) => db.setConfig(config as db.NewConfig);
  const message = (key: string, kept: boolean) => `${key} was removed in 8.0, which always does what ${key}: ${kept} ` +
    `did; delete it from setConfig(): https://pgcast.dev/switching#from-8-0-${key}`;

  describe.each(Object.entries(removed))('the removed key %s', (key, kept) => {
    it.each([false, 0, '', 'yes', 1, {}])('throws for %j, naming the key, what 8.0 does and its entry, and changes nothing', value => {
      const before = db.getConfig();
      expect(() => set({ transactionAttemptsMax: 2, [key]: value })).toThrow(new Error(message(key, kept)));
      expect(db.getConfig()).toEqual(before);
      expect(db.getConfig()).not.toHaveProperty(key);
    });

    it.each([kept, null, undefined])('passes for %j, and getConfig() does not hold it', value => {
      expect(set({ transactionAttemptsMax: 2, [key]: value })).not.toHaveProperty(key);
      expect(db.getConfig()).not.toHaveProperty(key);
      expect(db.getConfig().transactionAttemptsMax).toBe(2);
    });

    it('reads it from the object given, not from Object.prototype', () => {
      const proto = Object.prototype as Record<string, unknown>;
      proto[key] = false;
      try { expect(() => db.setConfig({ transactionAttemptsMax: 2 })).not.toThrow(); }
      finally { delete proto[key]; }
    });

    it.each(['switching.md', 'fr/switching.md'])('links an entry of website/%s', page => {
      expect(readFileSync(new URL(`../../website/${page}`, import.meta.url), 'utf8')).toContain(`{#from-8-0-${key}}`);
    });
  });

  it('keeps a key that was never an option, as before', () => {
    expect(set({ fooBarRemoved: false })).toHaveProperty('fooBarRemoved', false);
  });

  it.each([undefined, null])('sets a key that has a default back to it when given as %s', value => {
    expect(db.setConfig(changed)).toMatchObject(changed);
    const unset = Object.fromEntries(Object.keys(defaults).map(key => [key, value])) as unknown as db.NewConfig;
    expect(db.setConfig(unset)).toMatchObject(defaults);
    expect(db.getConfig()).toMatchObject(defaults);
  });

  it('keeps a falsy value it is given: a transactionAttemptsMax of 0 stays 0', () => {
    expect(db.setConfig({ transactionAttemptsMax: 0 }).transactionAttemptsMax).toBe(0);
    expect(db.getConfig().transactionAttemptsMax).toBe(0);
  });

  it('removes a listener given as undefined: it has no default', () => {
    db.setConfig({ queryListener: () => undefined });
    db.setConfig({ queryListener: undefined } as unknown as db.NewConfig);
    expect(db.getConfig().queryListener).toBeUndefined();
  });

  it('keeps the transactionRetryDelay it is given, as Zapatos 6.6.1 does: changing it later changes the config', () => {
    const delay = { minMs: 50, maxMs: 500 };
    db.setConfig({ transactionRetryDelay: delay });
    delay.maxMs = 1000;
    expect(db.getConfig().transactionRetryDelay).toEqual({ minMs: 50, maxMs: 1000 });
  });
});

// #508: getConfig() runs on every query, so a value stored from JavaScript that throws when read must not break them all
describe('getConfig() and setConfig()', () => {
  const boom = (): never => { throw new Error('no delay'); };
  const store = (transactionRetryDelay: unknown) => db.setConfig({ transactionRetryDelay } as db.NewConfig);

  it.each([
    ['an object whose minMs getter throws', () => { store({ get minMs() { return boom(); }, maxMs: 2 }); }],
    ['an object whose minMs getter throws only after setConfig()', () => {
      let broken = false;
      store({ get minMs() { return broken ? boom() : 1; }, maxMs: 2 });
      broken = true;
    }],
    ['a Proxy whose get trap throws', () => { store(new Proxy({ minMs: 1, maxMs: 2 }, { get: boom })); }],
    ['a Proxy revoked after setConfig()', () => {
      const { proxy, revoke } = Proxy.revocable({ minMs: 1, maxMs: 2 }, {});
      store(proxy);
      revoke();
    }],
    ['a primitive', () => { store(100); }],
    ['an Object.create(null)', () => { store(Object.assign(Object.create(null), { minMs: 1, maxMs: 2 })); }],
    ['null', () => { store(null); }],
  ])('never throw once setConfig() is given a transactionRetryDelay that is %s', (_, storeIt) => {
    expect(storeIt).not.toThrow();
    expect(() => db.getConfig()).not.toThrow();
    expect(() => db.setConfig({ transactionAttemptsMax: 3 })).not.toThrow();
  });
});
