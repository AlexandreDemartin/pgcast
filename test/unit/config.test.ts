// Copyright (C) 2026 Alexandre Demartin
//
// getConfig() and setConfig() (src/db/config.ts): what they return shares no
// object with the live config (#245). No database.

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
    upsertRequiresSameKeys: false,
    undefinedMeansMissing: false,
    transactionRequiresCommit: false,
    selectExactlyOneChecksForSecondRow: false,
  };
  const changed = {
    transactionAttemptsMax: 2,
    transactionRetryDelay: { minMs: 0, maxMs: 0 },
    castArrayParamsToJson: true,
    castObjectParamsToJson: true,
    upsertRequiresSameKeys: true,
    undefinedMeansMissing: true,
    transactionRequiresCommit: true,
    selectExactlyOneChecksForSecondRow: true,
  };

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
