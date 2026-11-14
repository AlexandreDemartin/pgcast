// Copyright (C) 2026 Alexandre Demartin
//
// isDatabaseError() (src/db/pgErrors.ts) on the DatabaseError that .run() rejects
// with, each raised by Postgres with its SQLSTATE (a DO block with RAISE ... USING ERRCODE).

import { describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql } from '../../src/db';
import { useTestDatabase } from '../helpers/db';

const t = useTestDatabase();

const raised = (sqlstate: string) =>
  sql`DO $$BEGIN RAISE EXCEPTION 'simulated' USING ERRCODE = '${db.raw(sqlstate)}'; END$$`.run(t.client).then(() => undefined, (err: unknown) => err);

describe('isDatabaseError() on errors from Postgres', () => {
  it('matches a 23505 to its class and its condition, not to another condition', async () => {
    const err = await raised('23505');
    expect(db.isDatabaseError(err, 'IntegrityConstraintViolation')).toBe(true);
    expect(db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')).toBe(true);
    expect(db.isDatabaseError(err, 'IntegrityConstraintViolation_CheckViolation')).toBe(false);
  });

  it('matches a 53100 to DiskFull and to TooManyConnections, as Zapatos 6.6.1 does, and to InsufficientResources_DiskFull only of the conditions', async () => {
    const err = await raised('53100');
    expect(db.isDatabaseError(err, 'DiskFull')).toBe(true);
    expect(db.isDatabaseError(err, 'TooManyConnections')).toBe(true);
    expect(db.isDatabaseError(err, 'InsufficientResources_DiskFull')).toBe(true);
    expect(db.isDatabaseError(err, 'InsufficientResources_TooManyConnections')).toBe(false);
  });
});
