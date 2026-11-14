// Copyright (C) 2026 Alexandre Demartin
//
// isDatabaseError() (src/db/pgErrors.ts) on values built by hand: what each name
// matches, and what it gives for null, undefined and other shapes. No database:
// test/integration/pgErrors.test.ts runs it on errors raised by Postgres.

import { describe, expect, it } from 'vitest';
import * as db from '../../src/db';

describe('isDatabaseError()', () => {
  it.each([null, undefined])('gives false for %s, which Zapatos 6.6.1 destructured and threw a TypeError on (#178)', value => {
    expect(db.isDatabaseError(value, 'IntegrityConstraintViolation')).toBe(false);
  });

  it.each([null, undefined])('gives false for %s with no names too', value => {
    expect(db.isDatabaseError(value)).toBe(false);
  });

  it('lets a rejection with no reason through a catch that rethrows what it does not match', async () => {
    const handled = Promise.reject(undefined).catch(err => {
      if (db.isDatabaseError(err, 'IntegrityConstraintViolation')) return 'matched';
      throw err;
    });
    await expect(handled).rejects.toBeUndefined();
  });

  it('matches a class name to every code of its class, and a condition name to its code only', () => {
    const unique = { code: '23505' };
    expect(db.isDatabaseError(unique, 'IntegrityConstraintViolation')).toBe(true);
    expect(db.isDatabaseError(unique, 'IntegrityConstraintViolation_UniqueViolation')).toBe(true);
    expect(db.isDatabaseError(unique, 'IntegrityConstraintViolation_CheckViolation')).toBe(false);
    expect(db.isDatabaseError(unique, 'DataException', 'IntegrityConstraintViolation_UniqueViolation')).toBe(true);
    expect(db.isDatabaseError(unique)).toBe(false);
  });

  it('matches DiskFull, OutOfMemory, TooManyConnections and ConfigurationLimitExceeded to all of class 53, as Zapatos 6.6.1 does', () => {
    for (const code of ['53000', '53100', '53200', '53300', '53400']) {
      for (const name of ['InsufficientResources', 'DiskFull', 'OutOfMemory', 'TooManyConnections', 'ConfigurationLimitExceeded'] as const) {
        expect(db.isDatabaseError({ code }, name), `${name} on ${code}`).toBe(true);
      }
    }
    expect(db.isDatabaseError({ code: '23505' }, 'DiskFull')).toBe(false);
  });

  it('matches InsufficientResources_DiskFull and the other conditions of class 53 to their own code only', () => {
    const conditions = {
      InsufficientResources_InsufficientResources: '53000',
      InsufficientResources_DiskFull: '53100',
      InsufficientResources_OutOfMemory: '53200',
      InsufficientResources_TooManyConnections: '53300',
      InsufficientResources_ConfigurationLimitExceeded: '53400',
    } as const;
    for (const [name, own] of Object.entries(conditions) as [keyof typeof conditions, string][]) {
      for (const code of Object.values(conditions)) {
        expect(db.isDatabaseError({ code }, name), `${name} on ${code}`).toBe(code === own);
      }
    }
  });

  it('gives each other shape what Zapatos 6.6.1 gives', () => {
    const name = 'IntegrityConstraintViolation';
    expect(db.isDatabaseError('23505', name)).toBe(false);
    expect(db.isDatabaseError(23505, name)).toBe(false);
    expect(db.isDatabaseError(0, name)).toBe(false);
    expect(db.isDatabaseError(false, name)).toBe(false);
    expect(db.isDatabaseError({}, name)).toBe(false);
    expect(db.isDatabaseError({ code: 23505 }, name)).toBe(false);
    expect(db.isDatabaseError({ code: '2350' }, name)).toBe(false);
    expect(db.isDatabaseError(new Error('boom'), name)).toBe(false);
    expect(db.isDatabaseError(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }), name)).toBe(false);
    expect(db.isDatabaseError(Object.assign(new Error('boom'), { code: '23505' }), name)).toBe(true);
    expect(db.isDatabaseError({ get code() { return '23505'; } }, name)).toBe(true);
    expect(db.isDatabaseError(Object.assign(Object.create(null), { code: '23505' }), name)).toBe(true);
    // a String object, which 6.6.1 reads as a string
    expect(db.isDatabaseError({ code: new String('23505') }, name)).toBe(true);
  });
});
