// Copyright (C) 2026 Alexandre Demartin
//
// The JSDoc of a column whose comment holds a JSDoc tag (#309), or whose default holds a line break (#308),
// fuzzed with TypeScript as the oracle: comments and defaults drawn from a small alphabet go through
// definitionForRelationInSchema(), then TypeScript reads the JSDoc written and the one master wrote (the
// comment's lines, then the generated ones; the default's lines behind no *). Seeded, so every run checks
// the same comments. No database.

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

/** `count` texts of 1 to 10 atoms, from a linear congruential generator with a fixed seed. */
const fuzzed = (seed: number) => {
  const random = (n: number) => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 8) % n;
  return Array.from({ length: count }, () =>
    Array.from({ length: 1 + random(10) }, () => atoms[random(atoms.length)]).join(''));
};

/** The comments a review found, then the fuzzed ones. */
const comments = () => [
  // TypeScript reads `\u{41}` as an identifier, and a conflict marker after a line separator as a comment
  '{@link lead \\u{41} @casting}', '{@link a\u2028<<<<<<< } @x',
  ...fuzzed(309),
];

/** The JSDoc master wrote for column `c<i>`: the comment's lines, then the type and nullability lines. */
const masterDoc = (i: number, comment: string) => `/**
    * **roles.c${i}**
    *
    * ${jsdocText(comment).split(/\r\n?|\n/).join('\n    * ')}
    * - \`int4\` in database
    * - Nullable, no default
    */`;

/** The JSDoc master wrote for column `c<i>` with default `value`: its lines after the first behind no `*`. */
const masterDefaultDoc = (i: number, value: string) => `/**
    * **roles.c${i}**
    * - \`int4\` in database
    * - Nullable, default: \`${jsdocText(value)}\`
    */`;

/** Whether the names of `part` all come in `whole`, in their order. */
const isSubsequence = (part: string[], whole: string[]) => {
  let at = 0;
  for (const name of whole) if (name === part[at]) at++;
  return at === part.length;
};

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

  it('puts every line of a default behind its *, keeps master\'s JSDoc for one of one line, and master\'s tags but at a * or an open link', async () => {
    const
      // a line led by *, which master's JSDoc read as its margin, a line after an open link, then the fuzzed defaults
      texts = ['a\n*@x', 'a\r\n  *@deprecated b', 'see {@link\n{ \n@deprecated b', ...fuzzed(308)],
      rows = texts.map((defaultValue, i) => ({
        column: `c${i}`, isGenerated: false, isNullable: true, hasDefault: true, defaultValue,
        udtName: 'int4', domainName: null, udtSchema: 'public', domainSchema: null, description: null,
      })),
      queryFn = async (query: pg.QueryConfig) => ({ rows: query.text.includes('pg_indexes') ? [] : rows }) as unknown as pg.QueryResult,
      config = finaliseConfig({ warningListener: false }),
      written = docs(await definitionForRelationInSchema(rel, 'public', {}, {}, config, queryFn)),
      master = docs(`interface Master {\n    ${texts.map((value, i) => `${masterDefaultDoc(i, value)}\n    c${i}: number;`).join('\n    ')}\n}`),
      changedOnOneLine: string[] = [],
      unprefixed: string[] = [],
      cut: string[] = [],
      tagsChanged: string[] = [];
    let multiLine = 0, tagged = 0, dropped = 0, opened = 0;

    expect(written).toHaveLength(texts.length);
    texts.forEach((value, i) => {
      const [{ text, tags }, before] = [written[i], master[i]];
      if (before.tags.length) tagged++;
      if (!/[\r\n]/.test(value)) {
        if (text !== before.text) changedOnOneLine.push(value);
        return;
      }
      multiLine++;
      if (text.split(/\r\n?|\n/).slice(1).some(line => !/^ *\*/.test(line))) unprefixed.push(value);
      // the comment ends at its own */, after the default's last line
      if (!text.endsWith(`${jsdocText(value).split(/\r\n?|\n/).at(-1)}\`\n    */`)) cut.push(value);
      // the tags master read, but for two cases. A line led by * opens none: master read that * as the margin. A
      // line after an inline link left open can open one: TypeScript ends the link at the line break and reads the
      // line's * as text, so an @ after it starts a tag, where master's line began at the @, after no space
      const
        [names, namesBefore] = [tags, before.tags].map(t => t.map(tag => tag.name)),
        lines = value.split(/\r\n?|\n/);
      if (JSON.stringify(names) === JSON.stringify(namesBefore)) return;
      if (isSubsequence(names, namesBefore) && lines.slice(1).some(line => /^[ \t]*\*/.test(line))) dropped++;
      else if (isSubsequence(namesBefore, names) &&
        lines.slice(0, -1).some(line => /\{@link(?:code|plain)?(?![^}]*\})/.test(line))) opened++;
      else tagsChanged.push(value);
    });

    expect(changedOnOneLine).toEqual([]);
    expect(unprefixed).toEqual([]);
    expect(cut).toEqual([]);
    expect(tagsChanged).toEqual([]);
    // the fuzz reaches every case, and the two exceptions stay rare
    expect(multiLine).toBeGreaterThan(1000);
    expect(tagged).toBeGreaterThan(100);
    expect(dropped).toBeGreaterThan(0);
    expect(opened).toBeGreaterThan(0);
    expect(dropped + opened).toBeLessThan(multiLine / 50);
  });
});
