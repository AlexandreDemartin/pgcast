// Copyright (C) 2026 Alexandre Demartin
//
// The declared returns of getConfig() and setConfig() (src/db/config.ts): an object
// type, as on Zapatos 6.6.1, which a `Record<string, unknown>` accepts. The `Config`
// interface would not, having no implicit index signature (#245).

import { describe, expectTypeOf, test } from 'vitest';
import * as db from 'zapatos/db';

const logObj = (o: Record<string, unknown>) => o;

describe('getConfig() and setConfig()', () => {
  test('return what a Record<string, unknown> accepts', () => {
    const got: Record<string, unknown> = db.getConfig();
    const set: { [k: string]: unknown } = db.setConfig({});
    logObj(db.getConfig());
    logObj(db.setConfig({}));
    expectTypeOf(got).not.toBeAny();
    expectTypeOf(set).not.toBeAny();
    expectTypeOf(db.getConfig()).not.toBeAny();
    expectTypeOf(db.setConfig({})).not.toBeAny();
  });

  test('return the keys of Config, typed', () => {
    expectTypeOf(db.getConfig().transactionAttemptsMax).toEqualTypeOf<number>();
    expectTypeOf(db.setConfig({}).transactionRetryDelay).toEqualTypeOf<{ minMs: number; maxMs: number }>();
    // @ts-expect-error retries is no key of the config
    db.getConfig().retries;
    // @ts-expect-error retries is no key of the config
    db.setConfig({}).retries;
  });
});
