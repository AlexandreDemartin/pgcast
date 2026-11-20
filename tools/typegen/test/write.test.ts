// Copyright (C) 2026 Alexandre Demartin

import { promises as fs } from 'node:fs';
import { chmod, mkdtemp, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { urlForDatabase } from '../../../test/helpers/databases';
import { useTestDatabase } from '../../../test/helpers/db';
import { describeQuery } from '../src/describe';
import { writeQueries } from '../src/write';

vi.mock(import('node:fs/promises'), async importOriginal => {
  const fs = await importOriginal();
  return { ...fs, open: vi.fn(fs.open), rename: vi.fn(fs.rename) };
});

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
  expect(first).not.toContain('/// <reference types="node" />');
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

it.each(['new', 'existing'])('writes privately and sets the final mode for a %s file', async destination => {
  const previousMask = process.umask(0o027);
  try {
    if (destination === 'existing') {
      await writeFile(path, 'previous result');
      await chmod(path, 0o604);
    }
    let modeDuringWrite: number | undefined;
    vi.mocked(open).mockImplementationOnce(async (...args) => {
      const file = await fs.open(...args);
      const write = file.writeFile.bind(file);
      vi.spyOn(file, 'writeFile').mockImplementation(async (...args) => {
        modeDuringWrite = (await file.stat()).mode & 0o777;
        return write(...args);
      });
      return file;
    });
    await writeQueries(path, 'zapatos/db', new Map());
    expect.soft(modeDuringWrite).toBe(0o600);
    expect((await stat(path)).mode & 0o777).toBe(destination === 'existing' ? 0o604 : 0o640);
  } finally {
    process.umask(previousMask);
  }
});

it('keeps the original bytes and removes the temporary when rename fails', async () => {
  const previous = Buffer.from('previous result'), error = Object.assign(new Error('rename denied'), { code: 'EACCES' });
  await writeFile(path, previous);
  vi.mocked(rename).mockRejectedValueOnce(error);
  await expect(writeQueries(path, 'zapatos/db', new Map())).rejects.toBe(error);
  expect(await readFile(path)).toEqual(previous);
  expect(await readdir(dir)).toEqual(['queries.ts']);
});

describe('writing live descriptions', () => {
  const db = useTestDatabase();
  let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: urlForDatabase(inject('pgcastDb')!.url, db.name) });
    await client.connect();
  });
  afterAll(async () => { await client?.end(); });

  it('requires an SQL alias for a field named __proto__', async () => {
    const text = 'SELECT 1 AS "__proto__"', { fields } = await describeQuery(client, text);
    await expect(writeQueries(path, 'zapatos/db', new Map([['reserved', { text, fields }]])))
      .rejects.toThrow(/reserved.*"__proto__".*distinct SQL alias/);
  });

  it('matches the module written from ordered fields, a zero-column row and NoData', async () => {
    const queries = new Map<string, {text: string; fields: Awaited<ReturnType<typeof describeQuery>>['fields']}>();
    for (const [name, text] of [
      ['values', 'SELECT ARRAY[1,NULL] AS items, id, settings FROM public.users'],
      ["odd\"\u2028\u2029", "SELECT $q$' \"` ${} */ \\\n\u2028\u2029$q$ AS \"field\"\"\u2028\u2029\""],
      ['empty', 'SELECT FROM public.users'], ['delete', 'DELETE FROM public.users'],
    ]) queries.set(name, { text, fields: (await describeQuery(client, text)).fields });
    await writeQueries(path, 'zapatos/db', queries);
    expect(await readFile(path, 'utf8')).toBe(await readFile(join(__dirname, 'types/queries.ts'), 'utf8'));
  });
});
