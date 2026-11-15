// Copyright (C) 2026 Alexandre Demartin
//
// The JSDoc of a column whose comment holds a JSDoc tag (#309), or whose default (#308) or name (#473) holds a
// line break, fuzzed with TypeScript as the oracle: comments, defaults and names drawn from a small alphabet go
// through definitionForRelationInSchema(), then TypeScript reads the JSDoc written and the one master wrote (the
// comment's lines, then the generated ones; the default's or the name's lines behind no *). Seeded, so every run
// checks the same texts. TypeScript reads each JSDoc as it lands in schema.d.ts, in an unprefixed and a prefixed
// schema. No database.

import ts from 'typescript';
import type * as pg from 'pg';
import { describe, expect, it } from 'vitest';
import { definitionForRelationInSchema, finaliseConfig, type Relation } from '../../src/generate';
import { jsdocText } from '../../src/generate/quote';

const
  atoms = ['@', '{', '}', '{@link', '{@linkcode', '{@linkplain', '{@see', '\n', '\r\n', '\r', '\u2028', ' ', '  ', '\t',
    '\u00a0', 'a', 'lead', 'x.y', '\\u{41}', '`', "'", '"', '/', '*', ' @x', '@deprecated'],
  count = 4000,
  // the schema named by unprefixedSchema, at the module's top level, and one in its own namespace
  shapes = [['an unprefixed', 'public'], ['a prefixed', 'ns']],
  relIn = (schema: string): Relation => ({ schema, name: 'roles', type: 'table', insertable: true }),
  titleIn = (schema: string) => schema === 'public' ? 'roles' : `${schema}.roles`;

/**
 * `fragment` as it lands in schema.d.ts: in a prefixed schema behind the 2 spaces of its namespace on every line
 * (indentAll() in src/generate/tsOutput.ts), then behind the 2 of declareModule() on every line holding text.
 */
const inSchemaFile = (fragment: string, schema: string) =>
  (schema === 'public' ? fragment : fragment.replace(/^/gm, '  ')).replace(/^(?=[ \t]*\S)/gm, '  ');

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
const masterDoc = (schema: string, i: number, comment: string) => `/**
    * **${titleIn(schema)}.c${i}**
    *
    * ${jsdocText(comment).split(/\r\n?|\n/).join('\n    * ')}
    * - \`int4\` in database
    * - Nullable, no default
    */`;

/** The JSDoc master wrote for column `c<i>` with default `value`: its lines after the first behind no `*`. */
const masterDefaultDoc = (schema: string, i: number, value: string) => `/**
    * **${titleIn(schema)}.c${i}**
    * - \`int4\` in database
    * - Nullable, default: \`${jsdocText(value)}\`
    */`;

/** The JSDoc master wrote for a column named `name`: its lines after the first behind no `*`. */
const masterNameDoc = (schema: string, name: string) => `/**
    * ${jsdocText(`**${titleIn(schema)}.${name}**`)}
    * - \`int4\` in database
    * - Nullable, no default
    */`;

/** Whether the names of `part` all come in `whole`, in their order. */
const isSubsequence = (part: string[], whole: string[]) => {
  let at = 0;
  for (const name of whole) if (name === part[at]) at++;
  return at === part.length;
};

/**
 * Each property's JSDoc as TypeScript reads it, in the first interface of `source` as it lands in schema.d.ts: its
 * text, and its tags.
 */
const docs = (source: string, schema: string) => {
  const first = (node: ts.Node): ts.InterfaceDeclaration | undefined =>
    ts.isInterfaceDeclaration(node) ? node : ts.forEachChild(node, first);
  return first(ts.createSourceFile('schema.ts', inSchemaFile(source, schema), ts.ScriptTarget.Latest, true))!
    .members.map(member => {
      const doc = member.getChildren().find(ts.isJSDoc)!;
      return { text: doc.getText(), tags: (doc.tags ?? []).map(tag => ({ name: tag.tagName.text, text: tag.getText() })) };
    });
};

/**
 * How the tags TypeScript reads in the JSDoc of `value`, a default or a name on several lines, differ from master's:
 * none (`undefined`), or one of three cases, else `'changed'`:
 * - dropped: a line led by * (after white space) opens no tag, where master read that * as the margin;
 * - opened: master's inline link left open ran on through a blank line, or a line holding only its name, and
 *   took in the next line; the prefix's * ends it a line earlier, so an @ on that next line can open a tag;
 * - split: in a prefixed schema, master's namespace put its 2 spaces between a \r and its \n, a line more,
 *   after which an @ past a link left open could open a tag; the prefixed lines have no such line.
 */
const tagChange = (value: string, tags: { name: string }[], tagsBefore: { name: string }[], schema: string) => {
  const
    [names, namesBefore] = [tags, tagsBefore].map(t => t.map(tag => tag.name)),
    lines = value.split(/\r\n?|\n/),
    afterOpenLink = lines.slice(0, -1).some(line => /\{@link(?:code|plain)?(?![^}]*\})/.test(line));
  if (JSON.stringify(names) === JSON.stringify(namesBefore)) return undefined;
  if (isSubsequence(names, namesBefore) && lines.slice(1).some(line => /^\s*\*/.test(line))) return 'dropped';
  if (isSubsequence(namesBefore, names) && afterOpenLink) return 'opened';
  if (isSubsequence(names, namesBefore) && afterOpenLink && schema !== 'public' && value.includes('\r\n')) return 'split';
  return 'changed';
};

describe('the JSDoc of a column comment, against TypeScript', () => {
  it.each(shapes)('keeps master\'s JSDoc for a comment with no tag, and keeps the tags of one whose tag lines move, in %s schema', async (_, schema) => {
    const
      texts = comments(),
      rows = texts.map((description, i) => ({
        column: `c${i}`, isGenerated: false, isNullable: true, hasDefault: false, defaultValue: null,
        udtName: 'int4', domainName: null, udtSchema: 'public', domainSchema: null, description,
      })),
      // the columns, then no unique index
      queryFn = async (query: pg.QueryConfig) => ({ rows: query.text.includes('pg_indexes') ? [] : rows }) as unknown as pg.QueryResult,
      config = finaliseConfig({ warningListener: false }),
      written = docs(await definitionForRelationInSchema(relIn(schema), schema, {}, {}, config, queryFn), schema),
      master = docs(`interface Master {\n    ${texts.map((comment, i) => `${masterDoc(schema, i, comment)}\n    c${i}: number;`).join('\n    ')}\n}`, schema),
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

  it.each(shapes)('puts every line of a default behind its *, keeps master\'s JSDoc for one of one line, and master\'s tags but at a * or an open link, in %s schema', async (_, schema) => {
    const
      // lines led by *, which master's JSDoc read as its margin, a line after a link left open over a blank line, an
      // @ after a \r\n that a namespace splits, then the fuzzed defaults
      texts = ['a\n*@x', 'a\r\n  *@deprecated b', 'see {@link\n\n@deprecated b', 'see {@linkcode@x\r\n@ b', ...fuzzed(308)],
      rows = texts.map((defaultValue, i) => ({
        column: `c${i}`, isGenerated: false, isNullable: true, hasDefault: true, defaultValue,
        udtName: 'int4', domainName: null, udtSchema: 'public', domainSchema: null, description: null,
      })),
      queryFn = async (query: pg.QueryConfig) => ({ rows: query.text.includes('pg_indexes') ? [] : rows }) as unknown as pg.QueryResult,
      config = finaliseConfig({ warningListener: false }),
      written = docs(await definitionForRelationInSchema(relIn(schema), schema, {}, {}, config, queryFn), schema),
      master = docs(`interface Master {\n    ${texts.map((value, i) => `${masterDefaultDoc(schema, i, value)}\n    c${i}: number;`).join('\n    ')}\n}`, schema),
      changedOnOneLine: string[] = [],
      unprefixed: string[] = [],
      cut: string[] = [],
      tagsChanged: string[] = [];
    let multiLine = 0, tagged = 0, dropped = 0, opened = 0, split = 0;

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
      if (!text.endsWith(inSchemaFile(`    * ${jsdocText(value).split(/\r\n?|\n/).at(-1)}\`\n    */`, schema))) cut.push(value);
      // the tags master read, but for three cases, each counted (tagChange())
      const change = tagChange(value, tags, before.tags, schema);
      if (change === 'dropped') dropped++;
      else if (change === 'opened') opened++;
      else if (change === 'split') split++;
      else if (change) tagsChanged.push(value);
    });

    expect(changedOnOneLine).toEqual([]);
    expect(unprefixed).toEqual([]);
    expect(cut).toEqual([]);
    expect(tagsChanged).toEqual([]);
    // the fuzz reaches every case, and the exceptions stay rare
    expect(multiLine).toBeGreaterThan(1000);
    expect(tagged).toBeGreaterThan(100);
    expect(dropped).toBeGreaterThan(0);
    expect(opened).toBeGreaterThan(0);
    expect(split > 0).toBe(schema !== 'public');
    expect(dropped + opened + split).toBeLessThan(multiLine / 50);
  });

  it.each(shapes)('puts every line of a column name behind its *, keeps master\'s JSDoc for one of one line, and master\'s tags but at a * or an open link, in %s schema', async (_, schema) => {
    const
      // a line led by *, which master's JSDoc read as its margin, a line after a link left open over a blank line,
      // then the fuzzed names
      texts = ['a\n*@x', 'see {@link\n\n@deprecated b', ...fuzzed(473)],
      rows = texts.map(column => ({
        column, isGenerated: false, isNullable: true, hasDefault: false, defaultValue: null,
        udtName: 'int4', domainName: null, udtSchema: 'public', domainSchema: null, description: null,
      })),
      queryFn = async (query: pg.QueryConfig) => ({ rows: query.text.includes('pg_indexes') ? [] : rows }) as unknown as pg.QueryResult,
      config = finaliseConfig({ warningListener: false }),
      written = docs(await definitionForRelationInSchema(relIn(schema), schema, {}, {}, config, queryFn), schema),
      master = docs(`interface Master {\n    ${texts.map((name, i) => `${masterNameDoc(schema, name)}\n    c${i}: number;`).join('\n    ')}\n}`, schema),
      changedOnOneLine: string[] = [],
      unprefixed: string[] = [],
      cut: string[] = [],
      tagsChanged: string[] = [];
    let multiLine = 0, tagged = 0, dropped = 0, opened = 0, split = 0;

    expect(written).toHaveLength(texts.length);
    texts.forEach((name, i) => {
      const [{ text, tags }, before] = [written[i], master[i]];
      if (before.tags.length) tagged++;
      if (!/[\r\n]/.test(name)) {
        if (text !== before.text) changedOnOneLine.push(name);
        return;
      }
      multiLine++;
      if (text.split(/\r\n?|\n/).slice(1).some(line => !/^ *\*/.test(line))) unprefixed.push(name);
      // the comment ends at its own */, after the generated lines
      if (!text.endsWith(inSchemaFile('    * - `int4` in database\n    * - Nullable, no default\n    */', schema))) cut.push(name);
      const change = tagChange(name, tags, before.tags, schema);
      if (change === 'dropped') dropped++;
      else if (change === 'opened') opened++;
      else if (change === 'split') split++;
      else if (change) tagsChanged.push(name);
    });

    expect(changedOnOneLine).toEqual([]);
    expect(unprefixed).toEqual([]);
    expect(cut).toEqual([]);
    expect(tagsChanged).toEqual([]);
    // the fuzz reaches every case, and the exceptions stay rare
    expect(multiLine).toBeGreaterThan(1000);
    expect(tagged).toBeGreaterThan(100);
    expect(dropped).toBeGreaterThan(0);
    expect(opened).toBeGreaterThan(0);
    expect(dropped + opened + split).toBeLessThan(multiLine / 50);
  });
});
