# 011 — Several databases: how a program types queries on more than one

- **Status**: accepted (2026-11-17), by delegation from the owner: each choice below is decided under the philosophy, and carries its own status.
- **Scope**: feature [#68](https://github.com/AlexandreDemartin/pgcast/issues/68) and its planned PRs, under note [002](./002-module-names.md) (module names, option C).
- **In short**: **not built in the core**. No program of the corpus types queries on more than one database: one project generates four schemas from two databases, each in a package of its own that compiles alone, and its one program that reaches both types its own and copies the other's rows with SQL text, which no option would type. What D0 costs: one compilation per database, and a boundary between them typed by hand, as the corpus does; what building would have cost: a copy of `src/db`'s declarations per database and a runtime file in the user's tree (D1), or a rewrite of every signature of `src/db`, `core.ts` included (D2). What #68 keeps: a docs section on generating and compiling one database per project, with the two ways it fails when they meet (§ Context). For a revival, D1 (§ 2).

## Context

What the code gives today:

- **One schema per compilation.** The generated `schema.d.ts` is `declare module 'zapatos/schema' { … }`, an ambient module, and `src/db`'s declarations import it (`dist/db/core.d.ts`, `shortcuts.d.ts`, `conditions.d.ts`): `db.select()`'s `Table` is whichever `zapatos/schema` the compilation holds. Note 002's `moduleNames: 'pgcast'` changes the name, not the count: its file declares `zapatos/schema` again, for `src/db`.
- **Zapatos was asked**: jawj/zapatos#54 (2020, closed into #49), "Conflicts in the `module 'zapatos/schema'` when multiple schemas for different dbs used in same project"; Zapatos: "I'm not sure there's any way to support multiple DBs in [one] codebase", and of a module name per database, "I don't think this would work, … since the shortcuts all refer to `zapatos/schema` to get their types". jawj/zapatos#49, open, 28 comments, mostly about sharing the types across packages: "I think the ambient approach is here to stay"; its users' workarounds are this note's options, a script that copies `dist/db/*.d.ts` and rewrites `'zapatos/schema'` (D1), several databases' schemas in one generated file (D4), generic structural types (D2).
- **Zapatos's copied sources** ("srcMode", before 3.0): each project held a copy of the runtime, typed by its `../schema`, so two folders typed two databases. 3.0 dropped them: "now it's just a normal module, updates won't pollute your diffs"; `legacy.ts` still warns about the old layout. Its docs, § What's next: "it did enable some advanced use-cases, such as interfacing with multiple databases. This approach may return as a configurable option."

How TypeScript and the runtime answer each form, replayed with TypeScript 5.9.3 on two databases, the fixture's generated schema (A) and the docs' (B), each with the bench's options; 4.1.6 (`check:floor`'s) where a type form is new:

| Written | TypeScript or the runtime |
|---|---|
| A's and B's `schema.d.ts` in one compilation (a root `tsconfig.json` that includes both folders) | TS6200 on `Table`, `Selectable`… and TS2300 on the placeholders both databases have (`PgPoint`, `PgTsvector`); **the first file in program order wins**, and every query on the other is refused: 25 errors on B's calls, or 115 on A's with the folders swapped. Under `skipLibCheck` the `.d.ts` errors go, the refusals stay |
| B's project emits declarations for its queries (`declaration: true`), and A's project reads them, as a package of the corpus is read | the emitted types name tables by string through `zapatos/db`, `db.JSONOnlyColsForTable<"films", …>`, resolved in **A's** schema: `"films"` is TS2344 in the `.d.ts`, hidden by `skipLibCheck`, and `page.film.title` is `unknown` |
| … where both databases have a table `users`, its `id` a `text` in B and an `int4` in A | B's `users.id` is read as A's `number`, silently |
| D1: B's schema declared as `films/schema`, a copy of `src/db`'s declarations importing it as `films/db`, beside A's ambient schema | both compile, each refusing the other's tables and a misspelt column, none `any`, on 5.9 and 4.1.6. A fragment of `zapatos/db`'s `sql` is refused by `films/db`'s shortcuts (TS2345: `SQLFragment`'s `protected` members make each copy a type of its own), though the runtime is one |
| … with `declare module 'zapatos/db' { interface ConfigTypes { aggregatesTypedByColumn: true } }` | `db.max('users', …)` is `number \| null`; `films.max('films', …)` stays `number`: the augmentation names one module |
| D3: two copies of the built runtime, a fragment of one interpolated in the other's `sql` | `SELECT * FROM t WHERE ("compile" = $1 AND "compileExpression" = $2 …)`: the fragment is read as a `Whereable` of its own fields |
| … `{ a: one.Default }` in the other's `insert()` | `VALUES ($1)` with `null`: a `NULL` written where the column's default was asked for, silently |
| … `one.all` as the other's `where` | throws while compiling: `Alien object while interpolating SQL: Symbol(all)` |
| `pgcast/films/db` as an import, for a module per database under the package's name | `ERR_PACKAGE_PATH_NOT_EXPORTED`: `exports` holds `./db` and `./generate` only |

## Corpus

Two projects of real usage (skill `consumer-usage`; no project named, examples invented): each generator config, the connection each reads, the pools each program opens, and the code that runs on each.

| What | Count |
|---|---|
| databases with a generated schema | **2** in one project, 1 in the other |
| generated schemas | **4** in one project, each in a workspace package of its own, with its own `zapatosconfig.json` and its own connection variable: 2 packages per database, one generating a few of its database's tables that the other excludes, one a subset of the other's schemas. 1 in the other project |
| … compiled together | none: each package's `tsconfig.json` includes its own `schema.d.ts` |
| programs that open pools on more than one database | **1**, a package that copies tables from one database into the other, loaded by the app server as a library |
| … its typed queries | all on its own database, through its own schema |
| … its queries on the other database | 2, neither typed: a copy routine that reads the source with SQL text, its columns from a generated list, through a cursor, and casts each batch to the destination's `Insertable[]`; a script that runs an untyped `sql` on the source's `information_schema` |
| … what crosses to the app server | hand-written types: its entry point's declarations reach none of the files that import `zapatos/schema` (17 imports, in files of its own); the server's other pools all connect to its own database |
| programs that type queries on more than one database | **0** |

What each option would remove: nothing. The copy routine names its tables at run time from a config list, so no shortcut types it under any option, and its cast stays; `information_schema` is in no generated schema. What the corpus pays for D0 is what it already does: a package per database, and a boundary typed by hand, the one way D0's second failure (§ Context) does not reach it.

## 1. Whether to build it, and how a `db` function finds its schema

**Status**: accepted (2026-11-17), by delegation.

| | D0. One compilation per database, documented | D1. A generated module per database, `src/db`'s declarations copied, the runtime shared | D2. A schema type parameter on the `db` functions | D3. Zapatos 2's copied sources | D4. Several databases in one `zapatos/schema` |
|---|---|---|---|---|---|
| **Generated** | today's files, one run per database, each into its own project | the database's schema as a module of its own name, `src/db`'s declarations rewritten to import it (1,753 lines, 102 KB per database), and a runtime file that re-exports `pgcast/db` | today's, plus a map per schema, `interface Tables { films: { Selectable: films.Selectable; … } }` | the schema, and a copy of the runtime and its declarations per database | one file, the databases' tables together |
| **The caller writes, a query on B** | `import * as db from 'pgcast/db'` in B's project: today's code | `import * as films from './pgcast/films/db'`, then `films.select('films', …)` | a binder, `const films = db.forSchema<s.Tables>()` (the prototype casts: `db as unknown as For<s.Tables>`), then `films.select('films', …)` | as D1, the import of the copy | `db.select('films', …)`, `.run(filmsPool)` |
| **SQL** | today's | today's | today's | today's, but a value of the other copy (§ Context) | today's |
| **What the type checks** | each database in its project; not what crosses between them (§ Context) | each module against its database; a fragment of the other module's `sql` refused | as D1, through `S` | as D1 | the table against the union; **not against the pool**: B's table on A's pool compiles, and Postgres refuses it, 42P01 `relation "films" does not exist` (replayed) |
| **What it adds** | a docs section | in the generator, for good: a second output kind, a runtime file in your tree (`tsc` does not copy a `.js` it did not compile, and `pgcast/<name>` is refused by `exports`), the copy under `--check`, rewritten on each pgcast release; the copy misses augmentations of `zapatos/db` | a rewrite of every signature of `src/db` (53 runtime exports), `core.ts`'s `sql` and `SQLFragment` included (a stop point), each inference kept as 6.6.1's, and an export | D1's, and a second runtime: Zapatos 3.0's reason, and § Context's silent `NULL` | a `db` list in the config; two tables of one name cannot be told apart |
| **Compile cost** (measured below) | each project pays its own | about as D0: B's types once, in one compilation | per call, 16 Instantiations above today's (a subset), before lateral and extras | as D1 | +1,279 Instantiations on A's queries alone, with no query on B |
| **Corpus code it serves** | all, as written | none (§ Corpus) | none | none | none |

**Measured** (`tsc --extendedDiagnostics`, the bench's options, prototypes in a scratch folder over master's emitted declarations, never committed; Instantiations and Types net of a floor, as `bench:types` counts). A is the bench (`bench/reads.ts`, `bench/writes.ts`) on the fixture's schema, 15,827 Instantiations and 7,506 Types, as `npm run bench:types` gives on master; B, 5 functions on the docs' schema (a `selectExactlyOne()` with 4 laterals, a `select()` with conditions, an `upsert()` with `updateValues`, an `insert()` in `serializable()`, an `update()`, a `deletes()` and a self-referencing lateral), every result read.

| Prototype | Instantiations | Types |
|---|---|---|
| D0: A alone, its own project | 15,827 | 7,506 |
| D0: B alone, its own project | 5,077 | 3,941 |
| D1: A and B in one compilation, B through its copy | 20,877 (+5,050 on A) | 10,788 (+3,282) |
| D4: A and B in one generated schema, both queried | 18,200 (+2,373) | 8,496 (+990) |
| D4: … A's queries alone | 17,106 (+1,279) | 8,093 (+587) |
| D2's declarations alone, a subset (`select()`, `selectOne()`, `selectExactlyOne()`, `count()`, `insert()`, with `columns`, `order`, `limit`, `returning`), over A's and B's schemas | +99 for the signatures, +0 for B's `Tables` map | +226, +11 |
| D2: 6 calls on B through it | +596 | +356 |
| … the same 6 calls today, B's schema alone | +499 | +305 |

So compile time is no reason either way: a database's types cost about the same in a project of its own (D0) or beside another (D1); D4 makes every query of A pay for B's tables (#538's `upsert()` cost grows with them, as `bench-types.mjs` says); D2's subset costs a call 16 Instantiations more, with none of `lateral`'s or `extras`'s types yet. The types check out (probed): under D1 and D2, a table of the other database and a misspelt column are refused, and under D2 a misspelt `columns` entry, none `any`, on 5.9 and 4.1.6. D3's types are D1's.

**Market standard**:

- **Kysely** 0.29.9: `export declare class Kysely<DB>`, its `KyselyConfig` holding no `DB` (`dist/kysely.d.ts`): the database's type rides on the instance, so two instances type two databases; no registry. **kysely-codegen** 0.20.0 writes `export interface DB {…}` into a plain module, its path set by `--out-file` (`dist/cli/flags.js`): one run per database.
- **Drizzle** 0.45.4: `drizzle<TSchema>(client, { schema })` returns `NodePgDatabase<TSchema>` (`node-postgres/driver.d.ts`): the schema, declared in TypeScript, rides on the instance.
- **Prisma** 7: one schema file and one `output` per database, each a client generated into your tree that imports the shared `@prisma/client/runtime`; two `PrismaClient`s, one per import (its guide "Multiple databases"; `@prisma/client-generator-ts`'s `runtimeBase`). D1's shape, over a generated client.
- **sqlc**: `sqlc.yaml`'s `sql:` list, an entry per schema with its own `gen.go.package` and `out`: a package per database, as D0. **PgTyped** 2.4: one `db` per config file; a second database, a second config and run.
- **Slonik**: no schema type; a query's rows typed by `sql.type(schema)`; several databases are several pools.

So the tools whose query object is an instance carry the database's type on it (Kysely, Drizzle, Prisma's client); the generators whose output is a file write one per database (kysely-codegen, sqlc, PgTyped). pgcast has no instance: a shortcut is a free function, and the client is the argument of `.run()`, "always explicit". A type on the client would need a client object of pgcast's around `pg`'s, where Zapatos takes `pg`'s own as it is; a type on the function needs D1's module or D2's parameter.

**Choice: D0.** Nothing is built in the core; #68's planned PRs are crossed out, and its guide becomes a docs task (§ What changes in the plan).

- **The written rule decides.** "A need is worth an API if it is general to Postgres … and if it recurs in the corpus" (skill `consumer-usage`). The corpus has no program that types queries on two databases: it compiles one per package, which is D0, and its one program on two databases copies tables named at run time, which no option types.
- **What D0 costs.** A program that types both needs two projects, and what crosses between them is written by hand: the boundary fails loudly when the two schemas meet in one compilation, and loosens when one's declarations are read in the other's (`unknown`, or the other database's table of the same name). The docs say both, and how the corpus avoids them.
- **What D1 would have cost.** No change to `src/db`, the default output nor the canary, but a second output kind for good: 1,753 lines of declarations copied per database, rewritten on each release, a runtime file the generator has never written (§ 2), and a copy that augmentations of `zapatos/db` do not reach.
- **What D2 would have cost.** Every signature of `src/db` rewritten over a type parameter, `sql` and `SQLFragment` in `core.ts` among them, each inference replayed against 6.6.1's (skill `backward-compat`), and a binder export: the largest change to the type surface since Zapatos, for a call that costs more.
- **D3 is what Zapatos 3.0 dropped**, and two runtimes write a silent `NULL` for each other's `Default` (§ Context).
- **D4 types the table, not the database**: nothing ties `'films'` to the pool that has it, every query pays for every database, and two tables of one name cannot coexist. It is jawj/zapatos#49's "single repo" workaround with schemas, which one database already allows today.
- **Like Zapatos**: the client stays explicit, and so does the database, in every option; none picks a pool. A query across databases (`dblink`, foreign tables) is out of scope: one query, one database.
- **For a revival**: a program that types queries on two databases in one function, from more than one project of real usage. Then D1, as § 2 writes it: it comes back as a revision of this note.

## 2. The module per database, for a revival

**Status**: accepted (2026-11-17), by delegation, as the design a revival would follow. Nothing below is built while choice 1 stands.

| Point | Design |
|---|---|
| **Why D1 over D2** | `src/db` and `core.ts` unchanged; one module per database, each typed as today's `zapatos/db`; D2's call costs more and its rewrite reaches every signature |
| **Config** | each database keeps its own config and run, as D0; one optional key names an extra database, `database: 'films'` (`OptionalConfig`); without it, master's files |
| **Files** | `<outDir>/<moduleNames>/films/`: `schema.d.ts` a plain module (no `declare module`), `custom/`, `db.d.ts` (the copy, importing `./schema`), and the runtime file re-exporting `pgcast/db` or `zapatos/db` as `moduleNames` says |
| **Module names** (note 002, option C) | relative, `./pgcast/films/db`: never `pgcast/films/*`, refused by `exports` (`ERR_PACKAGE_PATH_NOT_EXPORTED`), and never a `package.json` `imports` entry, which needs TypeScript 4.7 where the peer is `>=4.1`. The default database keeps `zapatos/*` or `pgcast/*`, and its `zapatos/schema` shim for `src/db` |
| **The runtime file** | the open point of a revival: `tsc` does not copy a `.js` it did not compile, so either the generator writes a `.ts` binding (53 exports, kept in step with `db.mjs`) for `outExt: '.ts'`, or the user's build copies it. Its content is one line, the same 53 functions under both module systems (probed: `export * from 'pgcast/db'` in an `.mjs`, `module.exports = require('pgcast/db')`); the types were probed through `paths` |
| **Canary** | one per module: each copy's `SchemaVersionCanary` re-exported from the installed `pgcast/db`, so each database's schema fails to compile against another runtime, as today's does |
| **The proof for one database** | without the key, master's files byte for byte, the snapshots unchanged; a `variants` snapshot for the key, compiled beside the fixture's default output, as this note's prototype was; `src/db` compiles against `zapatos/schema` unchanged |
| **The fixture's second database** | `website/schema.sql`, beside `test/fixtures/schema.sql`, as above: their table names do not meet, so a test adds one that does |
| **Class** ([decision 003](./003-fixes-and-deprecation.md)) | opt-in without switch-over |

## What changes in the plan

- **#68**, retitled as #56 was: "Document one database per project (decision 011: no module per database)".
- **Its planned PRs** ("Generate one schema module per database, as an opt-in", "Let the db functions take their types from one of several schema modules"): crossed out, pointing here.
- **"Document several databases"** becomes a docs task: `website/generator.md`, EN and FR, § Several databases: a project per database, each with its config, its `outDir` and a `tsconfig.json` that includes its own schema only; `--check` per project; the two failures of § Context, shown as TypeScript, the error and the type side by side, and the boundary typed by hand; the client chosen at `.run()`, as always; a query across databases out of scope; one line on why there is no module per database.
- **#19**, the chapter's epic: its line 7 names the docs task, pointing here.
- **#58**: its order line, "PRs 3 and 4 come after #68 (one schema module per database), whose module names they import", is dropped: no module name is added here, so the adapters import `pgcast/db` or `zapatos/db`, as note 002 names them.

## Risks

- **The corpus is two projects**, and both databases of the one that has two sit in one project. A program that types both in one function gets nothing new from pgcast until a revival; the docs section is its answer meanwhile.
- **D0's second failure is silent** when two databases share a table name and one's declarations are read in the other's project: the docs name it, and the boundary typed by hand is the corpus's way out. No check can find it at generation time: the generator sees one database.
- **jawj/zapatos#49's other need**, the types shared across packages of one database, is not this note's: it is the same ambient module, read from another package, and stays as Zapatos left it.

## Sources

- Zapatos: [docs](https://jawj.github.io/zapatos/) § What's next ("Alternative install mechanism") and its 3.0 changelog; [jawj/zapatos#49](https://github.com/jawj/zapatos/issues/49), [jawj/zapatos#54](https://github.com/jawj/zapatos/issues/54); `b21f4c30` ("experimental change to not require the core src to be copied into consumer codebase") and `4462e729`, `git log upstream/master`.
- Kysely 0.29.9: `dist/kysely.d.ts` (`Kysely<DB>`, `KyselyConfig`); kysely-codegen 0.20.0: `dist/cli/flags.js`, `dist/generator/transformer/transformer.js`.
- Drizzle 0.45.4: `node-postgres/driver.d.ts` (`drizzle`, `NodePgDatabase<TSchema>`).
- Prisma 7: the guide "Multiple databases" and the generators page (prisma/docs, `guides/v7/database/multiple-databases.mdx`, `orm/v7/prisma-schema/overview/generators.mdx`); `@prisma/client-generator-ts` 7.10.1, `dist/index.js` (`runtimeBase: "@prisma/client/runtime"`).
- sqlc: [configuration reference](https://docs.sqlc.dev/en/latest/reference/config.html) (`sql`, `gen.go.package`, `gen.go.out`). PgTyped 2.4.3: `@pgtyped/cli`'s `lib/config.d.ts`. Slonik 49.13.0: `@slonik/sql-tag`'s `createSqlTag.d.ts`.
- Notes [002](./002-module-names.md) (module names and the `zapatos/schema` shim), [009](./009-functions.md) (the register pattern, the shape of a cut, § 2).
