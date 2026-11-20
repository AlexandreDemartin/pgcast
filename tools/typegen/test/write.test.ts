// Copyright (C) 2026 Alexandre Demartin

import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/helpers/db';
import { describeQuery } from '../src/describe';
import { writeQueries } from '../src/write';

let dir: string, path: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'pgcast-rows-')); path = join(dir, 'queries.ts'); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const field = (name: string) => ({ name, dataTypeID: 114 });
it('sorts query names, preserves field order and round-trips names and text', async () => {
  const odd = '"\'\\\n\r\t`$${x}*/\u2028\u2029',
    queries = new Map([['z', { text: '', fields: [] }], [odd, { text: odd, fields: [field(odd), field('a')] }]]);
  await writeQueries(path, 'pgcast/db', queries);
  const first = await readFile(path, 'utf8'), before = await stat(path),
    quoted = JSON.stringify(odd).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  expect(first).toContain('from "pgcast/db"');
  expect(first).not.toMatch(/[\u2028\u2029]/);
  expect(first.split(quoted)).toHaveLength(4); // query name, text and field name
  expect(first.indexOf(quoted)).toBeLessThan(first.indexOf('"z"'));
  expect(first.indexOf(quoted + ': JSONValue')).toBeLessThan(first.indexOf('"a": JSONValue'));
  await writeQueries(path, 'pgcast/db', new Map([...queries].reverse()));
  expect(await readFile(path, 'utf8')).toBe(first);
  expect((await stat(path)).ino).not.toBe(before.ino);
});

it('accepts an empty scan and preserves an existing file on duplicate fields', async () => {
  await writeQueries(path, 'zapatos/db', new Map());
  expect(await readFile(path, 'utf8')).toContain('export interface Queries {\n}');
  await writeFile(path, 'previous result');
  const queries = new Map([
    ['first', { text: 'SELECT 1', fields: [field('a')] }],
    ['second', { text: 'SELECT 1 AS a, 2 AS a', fields: [field('a'), field('a')] }],
  ]);
  await expect(writeQueries(path, 'zapatos/db', queries)).rejects.toThrow(/second.*"a".*alias/i);
  expect(await readFile(path, 'utf8')).toBe('previous result');
  expect(await readdir(dir)).toEqual(['queries.ts']);
});

describe('the compiled fixture', () => {
  const db = useTestDatabase();
  it('matches the module written from ordered fields, a zero-column row and NoData', async () => {
    const queries = new Map<string, {text: string; fields: Awaited<ReturnType<typeof describeQuery>>['fields']}>();
    const client = await db.pool.connect();
    try {
      for (const [name, text] of [
        ['values', 'SELECT ARRAY[1,NULL] AS items, id, settings FROM public.users'],
        ["odd\"\u2028\u2029", "SELECT $q$' \"` ${} */ \\\n\u2028\u2029$q$ AS \"field\"\"\u2028\u2029\""],
        ['empty', 'SELECT FROM public.users'], ['delete', 'DELETE FROM public.users'],
      ]) queries.set(name, { text, fields: (await describeQuery(client, text)).fields });
    } finally {
      client.release();
    }
    await writeQueries(path, 'zapatos/db', queries);
    expect(await readFile(path, 'utf8')).toBe(await readFile(join(__dirname, 'types/queries.ts'), 'utf8'));
  });
});
