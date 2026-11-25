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

  test('Config has the keys of Zapatos 6.6.1, then those pgcast adds', () => {
    expectTypeOf<keyof db.Config>().toEqualTypeOf<
      | 'transactionAttemptsMax' | 'transactionRetryDelay' | 'castArrayParamsToJson' | 'castObjectParamsToJson'
      | 'queryListener' | 'resultListener' | 'transactionListener'
      | 'selectExactlyOneChecksForSecondRow' | 'aggregatesTypedByColumn' | 'topLevelSelectAsRows'
      | 'transactionEventListener' | 'shortcutsUseJson'
    >();
  });

  test('a key 8.0 removed is no key of Config: set in an object literal, TS2353; in a variable beside a kept key, it compiles', () => {
    // @ts-expect-error undefinedMeansMissing is no key of Config from 8.0
    db.setConfig({ undefinedMeansMissing: true });
    // @ts-expect-error upsertRequiresSameKeys is no key of Config from 8.0
    db.setConfig({ upsertRequiresSameKeys: true });
    // @ts-expect-error undefinedMeansMissing is no key of Config from 8.0, beside a kept key too
    db.setConfig({ transactionAttemptsMax: 3, undefinedMeansMissing: false });
    // @ts-expect-error upsertRequiresSameKeys is no key of Config from 8.0, beside a kept key too
    db.setConfig({ transactionAttemptsMax: 3, upsertRequiresSameKeys: false });
    // @ts-expect-error undefinedMeansMissing is no key of the config getConfig() gives
    db.getConfig().undefinedMeansMissing;
    // @ts-expect-error upsertRequiresSameKeys is no key of the config getConfig() gives
    db.getConfig().upsertRequiresSameKeys;
    // @ts-expect-error transactionRequiresCommit is no key of Config from 8.0
    db.setConfig({ transactionRequiresCommit: true });
    // @ts-expect-error transactionRequiresIdleClient is no key of Config from 8.0
    db.setConfig({ transactionRequiresIdleClient: true });
    // @ts-expect-error transactionRequiresSatisfyingLevel is no key of Config from 8.0
    db.setConfig({ transactionRequiresSatisfyingLevel: true });
    // @ts-expect-error transactionRequiresCommit is no key of Config from 8.0, beside a kept key too
    db.setConfig({ transactionAttemptsMax: 3, transactionRequiresCommit: false });
    // @ts-expect-error transactionRequiresIdleClient is no key of Config from 8.0, beside a kept key too
    db.setConfig({ transactionAttemptsMax: 3, transactionRequiresIdleClient: false });
    // @ts-expect-error transactionRequiresSatisfyingLevel is no key of Config from 8.0, beside a kept key too
    db.setConfig({ transactionAttemptsMax: 3, transactionRequiresSatisfyingLevel: false });
    // @ts-expect-error transactionRequiresCommit is no key of the config getConfig() gives
    db.getConfig().transactionRequiresCommit;
    // @ts-expect-error transactionRequiresIdleClient is no key of the config getConfig() gives
    db.getConfig().transactionRequiresIdleClient;
    // @ts-expect-error transactionRequiresSatisfyingLevel is no key of the config getConfig() gives
    db.getConfig().transactionRequiresSatisfyingLevel;
    const built = {
      transactionAttemptsMax: 3, undefinedMeansMissing: false, upsertRequiresSameKeys: false,
      transactionRequiresCommit: false, transactionRequiresIdleClient: false, transactionRequiresSatisfyingLevel: false,
    };
    expectTypeOf(db.setConfig).toBeCallableWith(built);  // hence setConfig()'s refusal at run time
  });

  test('shortcutsUseJson is an optional boolean, so a Config written for Zapatos 6.6.1 still compiles', () => {
    expectTypeOf<db.Config['shortcutsUseJson']>().toEqualTypeOf<boolean | undefined>();
    db.setConfig({ shortcutsUseJson: true });
    // @ts-expect-error the option is a boolean
    db.setConfig({ shortcutsUseJson: 'json' });
  });
});

// #725: the events of transaction()'s retries, beside the messages of Zapatos 6.6.1's transactionListener
describe('transactionEventListener and TransactionEvent', () => {
  /** An exhaustive switch over the three types: a fourth would leave `event` short of `never`. */
  const describeEvent = (event: db.TransactionEvent): string => {
    switch (event.type) {
      case 'rollback': return `${event.code} on attempt ${event.attempt} of ${event.maxAttempts}, ${event.delayMs}ms`;
      case 'retry': return `attempt ${event.attempt} of ${event.maxAttempts}`;
      case 'giveUp': return `${event.code} on attempt ${event.attempt} of ${event.maxAttempts}`;
      default: { const unknownEvent: never = event; return unknownEvent; }
    }
  };

  test('a listener takes the event, without txnId, narrowed on its type', () => {
    db.setConfig({
      transactionEventListener: event => {
        expectTypeOf(event).toEqualTypeOf<db.TransactionEvent>();
        expectTypeOf(event.type).toEqualTypeOf<'rollback' | 'retry' | 'giveUp'>();
        expectTypeOf(event.attempt).toEqualTypeOf<number>();
        expectTypeOf(event.maxAttempts).toEqualTypeOf<number>();
        if (event.type === 'rollback') {
          expectTypeOf(event.code).toEqualTypeOf<'40001' | '40P01'>();
          expectTypeOf(event.delayMs).toEqualTypeOf<number>();
        }
        if (event.type === 'giveUp') {
          expectTypeOf(event.code).toEqualTypeOf<'40001' | '40P01'>();
          // @ts-expect-error giving up waits for no retry
          event.delayMs;
        }
        if (event.type === 'retry') {
          // @ts-expect-error a retry has no code
          event.code;
        }
        // @ts-expect-error delayMs is on rollback only, so not before narrowing
        event.delayMs;
        // @ts-expect-error 'commit' is none of the three types
        if (event.type === 'commit') return;
        describeEvent(event);
      },
    });
  });

  test('a listener takes the txnId, as the other listeners do', () => {
    db.setConfig({ transactionEventListener: (event, txnId) => { expectTypeOf(txnId).toEqualTypeOf<number | undefined>(); describeEvent(event); } });
    expectTypeOf(db.getConfig().transactionEventListener).toEqualTypeOf<((event: db.TransactionEvent, txnId?: number) => void) | undefined>();
    expectTypeOf(db.getConfig().transactionEventListener).not.toBeAny();
    expectTypeOf(db.setConfig({}).transactionEventListener).toEqualTypeOf<((event: db.TransactionEvent, txnId?: number) => void) | undefined>();
  });

  // a listener typed for one event would read a key that the other two don't have, and throw in the retry loop
  test('a listener typed for some of the events is refused, as a function or as a class method', () => {
    const onRollback = (event: Extract<db.TransactionEvent, { type: 'rollback' }>) => event.code.toLowerCase();
    // @ts-expect-error a retry event has no code: the listener takes all three types
    db.setConfig({ transactionEventListener: onRollback });
    class RollbackListener implements db.NewConfig {
      // @ts-expect-error a class method typed for one event, likewise
      transactionEventListener(event: Extract<db.TransactionEvent, { type: 'rollback' }>) { event.code.toLowerCase(); }
    }
    class EventListener implements db.NewConfig {
      transactionEventListener(event: db.TransactionEvent, txnId?: number) { describeEvent(event); return txnId; }
    }
    db.setConfig(new EventListener());
    db.setConfig({ transactionEventListener: (event: unknown) => event });
    expectTypeOf(RollbackListener).not.toBeAny();
  });

  test('an event of a fourth type is refused', () => {
    // @ts-expect-error 'commit' is none of the three types
    describeEvent({ type: 'commit', attempt: 1, maxAttempts: 5 });
    // @ts-expect-error a retry carries no code
    describeEvent({ type: 'retry', code: '40001', attempt: 2, maxAttempts: 5 });
    // @ts-expect-error a code is 40001 or 40P01
    describeEvent({ type: 'giveUp', code: '23505', attempt: 5, maxAttempts: 5 });
    expectTypeOf(describeEvent({ type: 'retry', attempt: 2, maxAttempts: 5 })).toEqualTypeOf<string>();
  });

  test('a Config of Zapatos 6.6.1, and its transactionListener, compile as before', () => {
    const config661: db.Config = {
      transactionAttemptsMax: 5,
      transactionRetryDelay: { minMs: 25, maxMs: 250 },
      castArrayParamsToJson: false,
      castObjectParamsToJson: false,
      queryListener: (query, txnId) => [query.text, txnId],
      resultListener: (result, txnId, elapsedMs, query) => [result, txnId, elapsedMs, query],
      transactionListener: (message, txnId) => [message, txnId],
    };
    db.setConfig(config661);
    db.setConfig({
      transactionListener: (message, txnId) => {
        expectTypeOf(message).toEqualTypeOf<string>();
        expectTypeOf(txnId).toEqualTypeOf<number | undefined>();
      },
    });
    expectTypeOf(db.getConfig().transactionListener).toEqualTypeOf<((message: string, txnId?: number) => void) | undefined>();
    class Config661 implements db.Config {
      transactionAttemptsMax = 5;
      transactionRetryDelay = { minMs: 25, maxMs: 250 };
      castArrayParamsToJson = false;
      castObjectParamsToJson = false;
      queryListener(query: db.SQLQuery, txnId?: number) { return [query.text, txnId]; }
      transactionListener(message: string, txnId?: number) { return [message, txnId]; }
    }
    db.setConfig(new Config661());
  });
});
