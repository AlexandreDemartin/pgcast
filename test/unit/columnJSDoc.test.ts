// Copyright (C) 2026 Alexandre Demartin
//
// The JSDoc of a column whose comment holds a JSDoc tag (#309), fuzzed with TypeScript as the oracle:
// comments drawn from a small alphabet go through definitionForRelationInSchema(), then TypeScript reads
// the JSDoc written and the one master wrote (the comment's lines, then the generated ones). Seeded, so
// every run checks the same comments. No database.

import ts from 'typescript';
import type * as pg from 'pg';
import { describe, expect, it } from 'vitest';
import { definitionForRelationInSchema, finaliseConfig, type Relation } from '../../src/generate';
import { jsdocText } from '../../src/generate/quote';

const
  atoms = ['@', '{', '}', '{@link', '{@linkcode', '{@linkplain', '{@see', '\n', '\r\n', '\r', '\u2028', ' ', '  ', '\t',
    '\u00a0', 'a', 'lead', 'x.y', '\\u{41}', '`', "'", '"', '/', '*', ' @x', '@deprecated'],
  count = 4000,
  rel: Relation = { schema: 'public', name: 'roles', type: 'table', insertable: true };

/**
 * The comments a review found, then `count` comments of 1 to 10 atoms, from a linear congruential generator with
 * a fixed seed.
 */
const comments = () => {
  let seed = 309;
  const random = (n: number) => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 8) % n;
  return [
    // TypeScript reads `\u{41}` as an identifier, and a conflict marker after a line separator as a comment
    '{@link lead \\u{41} @casting}', '{@link a\u2028<<<<<<< } @x',
    ...Array.from({ length: count }, () =>
      Array.from({ length: 1 + random(10) }, () => atoms[random(atoms.length)]).join('')),
  ];
};

/** The JSDoc master wrote for column `c<i>`: the comment's lines, then the type and nullability lines. */
const masterDoc = (i: number, comment: string) => `/**
    * **roles.c${i}**
    *
    * ${jsdocText(comment).split(/\r\n?|\n/).join('\n    * ')}
    * - \`int4\` in database
    * - Nullable, no default
    */`;

/** Each property's JSDoc as TypeScript reads it, in the first interface of `source`: its text, and its tags. */
const docs = (source: string) => {
  const first = (node: ts.Node): ts.InterfaceDeclaration | undefined =>
    ts.isInterfaceDeclaration(node) ? node : ts.forEachChild(node, first);
  return first(ts.createSourceFile('schema.ts', source, ts.ScriptTarget.Latest, true))!.members.map(member => {
    const doc = member.getChildren().find(ts.isJSDoc)!;
    return { text: doc.getText(), tags: (doc.tags ?? []).map(tag => ({ name: tag.tagName.text, text: tag.getText() })) };
  });
};

describe('the JSDoc of a column comment, against TypeScript', () => {
  it('keeps master\'s JSDoc for a comment with no tag, and keeps the tags of one whose tag lines move', async () => {
    const
      texts = comments(),
      rows = texts.map((description, i) => ({
        column: `c${i}`, isGenerated: false, isNullable: true, hasDefault: false, defaultValue: null,
        udtName: 'int4', domainName: null, udtSchema: 'public', domainSchema: null, description,
      })),
      // the columns, then no unique index
      queryFn = async (query: pg.QueryConfig) => ({ rows: query.text.includes('pg_indexes') ? [] : rows }) as unknown as pg.QueryResult,
      config = finaliseConfig({ warningListener: false }),
      written = docs(await definitionForRelationInSchema(rel, 'public', {}, {}, config, queryFn)),
      master = docs(`interface Master {\n    ${texts.map((comment, i) => `${masterDoc(i, comment)}\n    c${i}: number;`).join('\n    ')}\n}`),
      changedWithNoTag: string[] = [],
      tagsLost: string[] = [];
    let tagged = 0, moved = 0;

    expect(written).toHaveLength(texts.length);
    texts.forEach((comment, i) => {
      const [{ text, tags }, before] = [written[i], master[i]];
      if (before.tags.length) tagged++;
      if (text === before.text) return;
      moved++;
      if (!before.tags.length) changedWithNoTag.push(comment);
      // the same tags, none of them holding the generated lines
      else if (tags.map(tag => tag.name).join() !== before.tags.map(tag => tag.name).join() ||
        tags.some(tag => tag.text.includes('int4'))) tagsLost.push(comment);
    });

    expect(changedWithNoTag).toEqual([]);
    expect(tagsLost).toEqual([]);
    // the rule still moves most tagged comments: it keeps master's JSDoc only where it cannot be sure of the tag
    expect(moved).toBeGreaterThan(tagged / 2);
  });
});
