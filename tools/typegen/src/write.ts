// Copyright (C) 2026 Alexandre Demartin

import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { FieldDef } from 'pg';
import { textTypes } from './values';

interface Query {
  text: string;
  fields: readonly Pick<FieldDef, 'name' | 'dataTypeID'>[] | null;
}

const literal = (value: string) => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** Write a module of named rows from statement descriptions, replacing the destination after all fields are checked. */
export async function writeQueries(path: string, dbModule: 'zapatos/db' | 'pgcast/db', queries: ReadonlyMap<string, Query>) {
  const lines = ['export interface Queries {'], imports = new Set<string>();
  for (const name of [...queries.keys()].sort()) {
    const { text, fields } = queries.get(name)!;
    lines.push(`  ${literal(name)}: {`, `    text: ${literal(text)};`);
    if (fields !== null) {
      const names = new Set<string>();
      lines.push('    row: {');
      for (const field of fields) {
        if (names.has(field.name)) {
          throw new Error(`Query ${literal(name)} repeats field ${literal(field.name)}. Give it a distinct SQL alias.`);
        }
        names.add(field.name);
        const type = textTypes[field.dataTypeID] ?? 'string';
        for (const imported of ['JSONValue', 'PostgresInterval']) {
          if (type.includes(imported)) imports.add(imported);
        }
        lines.push(`      ${literal(field.name)}: ${type} | null;`);
      }
      lines.push('    };');
    }
    lines.push('  };');
  }
  lines.push('}', '', "export type Row<N extends keyof Queries> = Extract<Queries[N], { row: unknown }>['row'];",
    'export type PgArray<T> = (T | null | PgArray<T>)[];', '');
  if (imports.size) lines.unshift(`import type { ${[...imports].sort().join(', ')} } from ${literal(dbModule)};`, '');

  const content = lines.join('\n'), temporary = join(dirname(path), '.pgcast-' + randomUUID()),
    file = await open(temporary, 'wx');
  try {
    try {
      await file.writeFile(content);
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
