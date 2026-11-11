// Phase 0 smoke test: proves the harness runs against src/ without a database.
// The real characterization suite lands in phase 1 (see docs/ROADMAP.md).
import { describe, expect, it } from 'vitest';
import * as db from '../src/db';

describe('harness smoke test', () => {
  it('compiles a parameterised fragment', () => {
    expect(db.sql`SELECT ${db.param(1)} AS one`.compile()).toEqual({
      text: 'SELECT $1 AS one',
      values: [1],
    });
  });
});
