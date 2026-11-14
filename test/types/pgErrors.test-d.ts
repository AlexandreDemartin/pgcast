// Copyright (C) 2026 Alexandre Demartin
//
// The types of isDatabaseError() (src/db/pgErrors.ts): the values it takes, the
// names it takes, and its result, which narrows nothing.

import type pg from 'pg';
import { describe, expectTypeOf, test } from 'vitest';
import * as db from 'zapatos/db';

declare const pgError: pg.DatabaseError;
declare const error: Error;
declare const unknownValue: unknown;

describe('isDatabaseError()', () => {
  test('takes each value Zapatos 6.6.1 took', () => {
    db.isDatabaseError(pgError as any, 'DataException');
    db.isDatabaseError({} as { code?: string }, 'DataException');
    db.isDatabaseError({} as { code: string }, 'DataException');
    db.isDatabaseError({} as object, 'DataException');
    db.isDatabaseError({}, 'DataException');
    db.isDatabaseError({} as Record<string, unknown>, 'DataException');
    db.isDatabaseError({ code: '23505' }, 'DataException');
    db.isDatabaseError({} as { code?: string });
  });

  test('takes unknown, a catch variable, Error and null too (#178)', () => {
    db.isDatabaseError(unknownValue, 'DataException');
    try { /* empty */ } catch (err) { db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation'); }
    db.isDatabaseError(error, 'DataException');
    db.isDatabaseError(new TypeError('x'), 'DataException');
    db.isDatabaseError({} as Error | null, 'DataException');
    db.isDatabaseError({} as pg.DatabaseError | undefined, 'DataException');
    db.isDatabaseError(null, 'DataException');
    db.isDatabaseError(undefined, 'DataException');
    db.isDatabaseError('23505', 'DataException');
    db.isDatabaseError({ code: 23505 }, 'DataException');
  });

  test('takes pg.DatabaseError and NodeJS.ErrnoException under exactOptionalPropertyTypes too, whose code is string | undefined (#178)', () => {
    db.isDatabaseError(pgError, 'DataException');
    db.isDatabaseError({} as NodeJS.ErrnoException, 'DataException');
    db.isDatabaseError(pgError);
  });

  test('refuses a name that is not one of the Postgres error codes', () => {
    // @ts-expect-error 'UniqueViolation' alone is not a name: the condition is IntegrityConstraintViolation_UniqueViolation
    db.isDatabaseError(pgError, 'UniqueViolation');
    // @ts-expect-error a SQLSTATE is not a name
    db.isDatabaseError(pgError, '23505');
    // @ts-expect-error the value to check is required
    db.isDatabaseError();
  });

  test('returns a boolean, and narrows nothing in either branch', () => {
    expectTypeOf(db.isDatabaseError(pgError, 'DataException')).toEqualTypeOf<boolean>();
    expectTypeOf(db.isDatabaseError(pgError, 'DataException')).not.toBeAny();
    if (db.isDatabaseError(pgError, 'DataException')) expectTypeOf(pgError).toEqualTypeOf<pg.DatabaseError>();
    else expectTypeOf(pgError).toEqualTypeOf<pg.DatabaseError>();
    if (db.isDatabaseError(error, 'DataException')) expectTypeOf(error).toEqualTypeOf<Error>();
    else expectTypeOf(error).toEqualTypeOf<Error>();
    if (db.isDatabaseError(unknownValue, 'DataException')) expectTypeOf(unknownValue).toEqualTypeOf<unknown>();
    else expectTypeOf(unknownValue).toEqualTypeOf<unknown>();
  });
});
