// Copyright (C) 2026 Alexandre Demartin
//
// enableCustomJSONParsingForLargeNumbers(): the parser it gives pg for json and jsonb, with no database.

import { describe, expect, it } from 'vitest';
import type * as pgLib from 'pg';
import { enableCustomJSONParsingForLargeNumbers } from '../../src/db';

/** The parser enableCustomJSONParsingForLargeNumbers() registers for jsonb. */
const parse = (() => {
  const parsers = new Map<number, (s: string) => unknown>();
  const pg = { types: { builtins: { JSON: 114, JSONB: 3802 }, setTypeParser: (oid: number, f: (s: string) => unknown) => parsers.set(oid, f) } };
  enableCustomJSONParsingForLargeNumbers(pg as unknown as typeof pgLib);
  return parsers.get(3802)!;
})();

/** How the parser gives the number written as `s`: a number, or its text. */
const num = (s: string) => (parse(`[${s}]`) as unknown[])[0];

describe('enableCustomJSONParsingForLargeNumbers()', () => {
  it('registers the same parser for json and jsonb', () => {
    const parsers: unknown[] = [];
    const pg = { types: { builtins: { JSON: 114, JSONB: 3802 }, setTypeParser: (_: number, f: unknown) => parsers.push(f) } };
    enableCustomJSONParsingForLargeNumbers(pg as unknown as typeof pgLib);
    expect(parsers).toHaveLength(2);
    expect(parsers[0]).toBe(parsers[1]);
  });

  it('keeps a number a double holds exactly, and the text of any other', () => {
    // 15 characters or fewer: always a number
    expect(num('123456789012345')).toBe(123456789012345);
    expect(num('0.1')).toBe(0.1);
    // beyond 2^53 without a point: the text
    expect(num('9007199254740993')).toBe('9007199254740993');
    expect(num('-9007199254740993')).toBe('-9007199254740993');
    // a long text whose value a double holds exactly: the number
    expect(num('9007199254740991')).toBe(9007199254740991);
    expect(num('1.000000000000000')).toBe(1);
    expect(num('0.000000000000001')).toBe(1e-15);
    expect(num('0.000000000000005e20')).toBe(500000);
    expect(num('1020304050607.08')).toBe(1020304050607.08);
    expect(num('-9999990.099999990e-10')).toBe(-0.000999999009999999);
    expect(num('8000000000080.080e080')).toBe(8.00000000008008e+92);
    expect(num('0.00000090909e+3')).toBe(0.00090909);
    expect(num('123456789012345.67')).toBe(123456789012345.67);
    // more digits than a double holds: the text
    expect(num('0.12345678901234567')).toBe('0.12345678901234567');
    expect(num('1.0000000000000001')).toBe('1.0000000000000001');
    expect(num('-8000000000008.80800001')).toBe('-8000000000008.80800001');
    expect(num(`1${'0'.repeat(30)}.5e-31`)).toBe(`1${'0'.repeat(30)}.5e-31`);
    // beyond a double's range: the text
    expect(num('1e400')).toBe('1e400');
    expect(num('-1E+400')).toBe('-1E+400');
    // zero, however written
    expect(num('0.000000000000000')).toBe(0);
    expect(num('-0.00000000000000e-00')).toBe(-0);
  });

  it('stays fast on long runs of digits', () => {
    // Zapatos 6.6.1 and pgcast up to 6.7.1 backtracked in O(n²) on a run of zeros followed by a non-zero digit
    const n = 1_000_000;
    // a run of zeros after the point
    expect(num(`0.5${'0'.repeat(n)}1`)).toBe(`0.5${'0'.repeat(n)}1`);
    // a run of zeros before the point: a negative exponent keeps the value finite, so it reaches the check
    expect(num(`1${'0'.repeat(n)}1.5e-${n + 2}`)).toBe(`1${'0'.repeat(n)}1.5e-${n + 2}`);
    // long runs elsewhere: trailing zeros, leading zeros after the point, the exponent, nines on both sides
    expect(num(`1.${'1'.repeat(n)}${'0'.repeat(n)}`)).toBe(`1.${'1'.repeat(n)}${'0'.repeat(n)}`);
    expect(num(`1.5${'0'.repeat(n)}`)).toBe(1.5);
    expect(num(`-0.${'0'.repeat(n)}7e-3`)).toBe(`-0.${'0'.repeat(n)}7e-3`);
    expect(num(`1.5e${'0'.repeat(n)}5`)).toBe(150000);
    expect(num(`${'9'.repeat(n)}.${'9'.repeat(n)}e-${n}`)).toBe(`${'9'.repeat(n)}.${'9'.repeat(n)}e-${n}`);
  });
});
