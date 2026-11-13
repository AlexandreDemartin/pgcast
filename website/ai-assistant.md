# Use an AI assistant

Give an assistant that writes your queries three things: these docs, your generated schema and a short rules file, so that it writes them the pgcast way. Then check its work with the type checker and `.compile()`. It assumes the basics of the [tutorial](/tutorial).
{.lede}

## Give it the docs

The site publishes itself for assistants, in two files at its root:

```txt
https://pgcast.dev/llms.txt
https://pgcast.dev/llms-full.txt
```

- [`llms.txt`](/llms.txt): an index, each page with its URL and its summary. For an assistant that fetches the pages it needs.
- [`llms-full.txt`](/llms-full.txt): every page in one Markdown file, each cast panel with the SQL, values and type it shows. For one that reads a whole file at once.

Paste a URL into the chat, or let the rules file below name it.

## Give it your schema

`npx pgcast` writes `zapatos/schema.d.ts` into your [`outDir`](/generator#generate.outDir): `src/zapatos/schema.d.ts` in the tutorial. It holds what an assistant would otherwise guess: each table's columns, the type of each in a row, a filter, an insert and an update ([The files it writes](/generator#the-files-it-writes)), and a comment on each column with its Postgres type, whether it is `NOT NULL`, and its default.

- Tell the assistant to read it before writing a query, and never to edit it: the next run writes it again. The rules file below does both; change its path if your `outDir` differs.
- A `COMMENT ON COLUMN` on a table's column, in a migration, reaches that comment too ([`schemaJSDoc`](/generator#generate.schemaJSDoc)): the place to tell the assistant what a column means. A view's, a foreign table's or a partitioned table's does not yet ([#47](https://github.com/AlexandreDemartin/pgcast/issues/47)).
- After each migration, run `npx pgcast` again, so that the assistant reads the schema as it is.

## Add the rules file

Copy it into your project, and change `src/zapatos/schema.d.ts` if your `outDir` differs. Each rule ends with the page that backs it, for the assistant to read:

```md
# Postgres with pgcast

This project queries Postgres with pgcast, a maintained fork of Zapatos,
installed under the `zapatos` alias. The index of its docs, each page with its
URL and summary:
https://pgcast.dev/llms.txt
For an assistant that reads one whole file, every page in one:
https://pgcast.dev/llms-full.txt

- The database is the source of the types. Before writing a query on a table,
  read its columns and their types in `src/zapatos/schema.d.ts`; never guess a
  column. Never edit that file: it is generated.
  https://pgcast.dev/generator#the-files-it-writes
- After a migration, run `npx pgcast` to generate the types again, then fix
  what no longer compiles.
  https://pgcast.dev/first-query#when-the-schema-changes
- Import the run-time code as `import * as db from 'zapatos/db'` and the types
  as `import type * as s from 'zapatos/schema'`, never from `pgcast`.
  https://pgcast.dev/install
- Prefer the shortcuts to hand-written SQL: `db.select()`, `db.selectOne()`,
  `db.count()` and the other aggregates, `db.insert()`, `db.upsert()`,
  `db.update()`, `db.deletes()`; filters from `db.conditions`; related rows
  through `lateral`.
  https://pgcast.dev/select
  https://pgcast.dev/insert
  https://pgcast.dev/conditions
  https://pgcast.dev/lateral
- Write what no shortcut covers in a `db.sql` template, typed with the table's
  names and its rows: `` db.sql<s.films.SQL, s.films.Selectable[]>`…` ``.
  https://pgcast.dev/raw-sql
- Never concatenate a value into SQL, and never pass one to `db.raw()`. A value
  goes in a shortcut's object, in a Whereable (`${{ studio_id }}`) or in
  `db.param()`, and Postgres gets it as a parameter, `$1`.
  https://pgcast.dev/raw-sql#pass-each-value-as-a-parameter
- An interpolated string is a table or column name. Never interpolate a string
  from outside the code (a request, a user, a file): map it to a name written
  in the code, and never cast it to make it compile.
  https://pgcast.dev/raw-sql#choose-sql-at-run-time-from-your-own-constants
- A shortcut's object and a Whereable take their keys as column names: build
  them from fields you name, never pass a request's body or query whole. An
  empty Whereable is `TRUE`: check that a filter has a key before
  `db.update()` or `db.deletes()`.
  https://pgcast.dev/raw-sql#pass-each-value-as-a-parameter
- Run each query on the pool or client you are given; inside a transaction, on
  its `txnClient`. Its callback may run again (40001, 40P01): keep side effects
  out of it.
  https://pgcast.dev/transaction#transaction
  https://pgcast.dev/retries#keep-side-effects-out-of-the-callback
- Read the SQL of a new query: `.compile()` in place of `.run()` gives
  `{ text, values }` and sends nothing.
  https://pgcast.dev/sql-template#compile
- Before calling a change done, run the type check, `npx tsc --noEmit`, and fix
  each error in the code, never with `any`, a type assertion (`as` a type;
  `as const` is fine), `@ts-ignore` or `@ts-expect-error`.
  https://pgcast.dev/ai-assistant#run-the-type-check
- Write `columns` and `returning` without `as const` (#41): for now it types
  the result as `never`, which is assignable to any type.
  https://pgcast.dev/select#columns
```

Put it where your assistant reads its instructions:

| As | File | Above the rules |
|---|---|---|
| `AGENTS.md`, which most assistants read | `AGENTS.md` at the root of the repository, or at the end of yours | nothing |
| a Cursor rule | `.cursor/rules/pgcast.mdc` | front matter with a `description` and `alwaysApply: false` |
| a Claude skill | `.claude/skills/pgcast/SKILL.md` | front matter with a `description` |

- Claude Code reads `AGENTS.md` only when the project has no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`. With one, it reads `AGENTS.md` only if that file imports it, with a line `@AGENTS.md` ([Claude Code's docs](https://code.claude.com/docs/en/memory#agents-md)).
- For the last two, the `description` says when the rules apply: the assistant reads it and pulls the rules in when a task needs them. A Cursor rule with `globs` would instead be attached whenever a matching file is in context, whatever its `description` ([Cursor's docs](https://cursor.com/docs/context/rules)).

::: code-group

```md [.cursor/rules/pgcast.mdc]
---
description: Querying Postgres with pgcast (zapatos/db). Use when writing or changing a database query.
alwaysApply: false
---
```

```md [.claude/skills/pgcast/SKILL.md]
---
description: Querying Postgres with pgcast (zapatos/db). Use when writing or changing a database query.
---
```

:::

## Check its work

### Run the type check

```sh
npx tsc --noEmit
```

Or your project's own script, through `npm run`. A column the assistant made up fails, and so does a string from a request used as a name:

```ts twoslash
// @errors: 2353 2345
import * as db from 'zapatos/db';
// ---cut---
declare const sort: string;  // from the request

db.select('films', { year: 1974 });
db.sql`SELECT * FROM ${'films'} ORDER BY ${sort}`;
```

Fix the code, not the type: with `as any`, or `as s.films.Column`, both compile, and both sort by whatever name the request sends. Map the request to names written in the code instead ([Write raw SQL safely](/raw-sql#choose-sql-at-run-time-from-your-own-constants)), and let a shortcut do the rest, here [`select()`](/select#select) with [`db.all`](/sql-template#all) and [`order`](/select#order-limit-offset-and-withties):

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
declare const sort: string;  // from the request

const by = sort === 'length' ? 'runtime_minutes' : 'release_year';
db.select('films', db.all, { order: { by, direction: 'ASC' } });
```

### Read the SQL

Call [`.compile()`](/sql-template#compile) where the code calls `.run()`, and print it: it gives `{ text, values }`, the SQL and its values. Here, the assistant's answer to "the three longest films of studio 1000", with [`columns`](/select#columns), [`order` and `limit`](/select#order-limit-offset-and-withties), and what Postgres runs:

<CastPanel example="ai_assistant_longest">

<<< ./examples/ai_assistant_longest.ts{ts twoslash}

</CastPanel>

With `.compile()` in place of `.run(pool)`, `console.log()` prints the same SQL as `text`, on one line, and the same values as `values`:

- Each value is a `$n` in `text` and an item of `values`: here `1000` and `3`. The column names among the values are the keys of the JSON object each row comes back as ([`select()`](/select#select)).
- Each name is in double quotes: `"films"`<!-- probe: examples/ai_assistant_longest.ts -->, `"studio_id"`<!-- probe: examples/ai_assistant_longest.ts -->.
- A value written into `text`, with no `$n` and no item in `values` for it, was pasted into the SQL: a `raw()` or a concatenation. Ask for a parameter instead.

`.compile()` sends nothing, so it is safe on an `insert()` or a `deletes()` too.

::: info Coming
`npx pgcast --check` will say whether `schema.d.ts` still matches the database, without writing it, once [#52](https://github.com/AlexandreDemartin/pgcast/issues/52) lands: one more check to run before calling a change done.
:::

## See also

- [Write raw SQL safely](/raw-sql): the queries no shortcut writes, their names and their values.
- [The `sql` template](/sql-template#sql): what each interpolation compiles to.
- [Your first typed query](/first-query): the generator, the types it writes, and `.compile()`, step by step.
