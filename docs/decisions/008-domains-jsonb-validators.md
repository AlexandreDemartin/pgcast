# 008 — Domains typed by their values, typed `jsonb`, and validators

- **Status**: accepted (2026-11-17), by delegation from the owner: each choice below is decided under the philosophy, and carries its own status.
- **Scope**: feature [#55](https://github.com/AlexandreDemartin/pgcast/issues/55), its planned PRs 2 to 5 ([#641](https://github.com/AlexandreDemartin/pgcast/issues/641) to [#644](https://github.com/AlexandreDemartin/pgcast/issues/644)), and R53 of `docs/CHARACTERISATION-REPORT.md`.
- **In short**: one PR is built. With `domainsTypedAsUnions: true`, a domain over `text` whose `CHECK` lists its values is typed as their union, declared in `zapatos/schema` as an enum is, and a new placeholder names that union, as a placeholder over an enum imports it; one already on disk stays the user's, and a note names it. Its `COMMENT ON DOMAIN` becomes the union's JSDoc; the other ignored comments stay ignored. Typed `jsonb` needs nothing new: Zapatos's domain and its placeholder already do it, and the corpus types 256 columns that way. The validators package is not built: nothing in the corpus validates against a table's row type.

## Context

What the generator does with a domain today:

- **A placeholder per domain**, `zapatos/custom/PgSeat_label.d.ts`, written once and never again: "The file will not be overwritten on future schema generations" (Zapatos's docs § Custom types and domains). It holds the base type's `Selectable` type, `string` for a `text`; every column of the domain takes `c.PgSeat_label` in all five interfaces. Domains came in Zapatos 0.1.55 (`b2c6bf7`, "Added user-defined types and domains support").
- **Zapatos never read `pg_constraint`** (`git grep pg_constraint v6.6.1 -- src`: nothing), and of `pg_description` only the columns' comments (`objsubid = attnum`). pgcast reads `pg_constraint` only in the unique-index query, on every run, for each unique index's `isArbiter` (`tables.ts`): `uniqueIndexConstraintsOnly` keeps those, and without it a note names the others. No query reads a domain's constraint.
- **The enum precedent**: "`CREATE TYPE "size" AS ENUM ('big', 'small');` comes to TypeScript as `'big' | 'small'`" (Zapatos's docs § How does that look?, Typescript schema), declared once per schema with its `every` tuple (`enumTypesForEnumData()`, `src/generate/enums.ts`).
- **A placeholder's text decides a type elsewhere already**: with `domainsTypedByContext`, `db.DomainInContext<Custom, Generated, InContext>` (`src/db/utils.ts`) gives a column its base type's type in each context while its placeholder is still exactly what the generator wrote.
- **#52's intermediate model is crossed out** ([its comment](https://github.com/AlexandreDemartin/pgcast/issues/52)): `--check` did not need it, and "③, ④ or ⑤ builds the part it needs". A validators package has no model to read.

How Postgres stores a values `CHECK`, replayed on Postgres 17.3 through `pg_get_constraintdef()`:

| Written | Stored | What it lets through |
|---|---|---|
| over `text`: `VALUE = ANY (ARRAY['hardback', 'paperback'])` or `VALUE IN ('hardback', 'paperback')` | `CHECK ((VALUE = ANY (ARRAY['hardback'::text, 'paperback'::text])))`, both | the values |
| over `text`: `VALUE IN ('hardback')` | `CHECK ((VALUE = 'hardback'::text))` | the value |
| a quote, a backslash, a line break, `''` | `'it''s'::text`, `'back\slash'::text`, the break as is, `''::text` | the values |
| over `text`: `ARRAY['hardback', NULL]` | `ARRAY['hardback'::text, NULL::text]` | **anything**: `'zzz'` passes, as `'zzz' = ANY (…)` is `NULL` |
| over `varchar(20)` | `((VALUE)::text = ANY ((ARRAY['hardback'::character varying, …])::text[]))` | the values |
| over `char(10)` | `ARRAY['hardback'::bpchar, …]` | the values, which `pg` returns padded: `'hardback  '` |
| over `citext` | `ARRAY['hardback'::citext, …]` | `'HARDBACK'` too |
| over a domain of this form | `((VALUE)::text = ANY (…))` | the narrower list |
| added `NOT VALID` | `… NOT VALID`, `convalidated` false | the rows already there: `'old'` stays |
| `VALUE = 'a' OR VALUE = 'b'` | `(((VALUE = 'a'::text) OR (VALUE = 'b'::text)))` | the values |

And for a column of the domain, `pg` returns the string; for an array of the domain, whose type OID `pg` does not know, the text `'{ebook,hardback}'`, while the shortcuts' JSON gives an array. `information_schema.columns` gives the array `udt_name` `_book_format` and no `domain_name`.

## Corpus

Two projects of real usage (skill `consumer-usage`; no project named, examples invented). One is read in a dump of its database, through `pg_get_constraintdef()`; the other in its migrations and its generated schema.

| What | Count |
|---|---|
| domains over `text`, one `CHECK` stored as `VALUE = ANY (ARRAY['…'::text, …])` | **188** in the dump, every one of them in that exact form: one `CHECK` each, all valid, none with `NULL`, a quote or another cast; 1 to 42 values, median 4, 926 in all. Plus **15** in the other project's generated schema, written `VALUE IN (…)`, which Postgres stores in the same form (above). So about 200, not "about 230": 203 + 19 names given values in the migrations, some since dropped |
| … used by table columns | 309 columns of the domain, 44 of an array of it (16 domains); 7 domains no table uses |
| other domains over `text` | 13 with no `CHECK`; 1 domain over `text[]` with `VALUE <@ ARRAY[…]` |
| domains over `jsonb` (or `json`), no `CHECK` | **103** in the dump (102 over `jsonb`, 1 over `json`), on 256 columns; 2 in the other project. Only 9 columns are plain `jsonb` or `json` |
| placeholders of those domains, as on disk | **none over `text` left as generated.** Over `text`: 186 of 193 import a type generated from the project's API specification, 5 write the union by hand, 2 another type. Over `jsonb`: 95 of 101 import such a type, 4 write a structure, 2 are as generated |
| what keeps a placeholder honest | in one project, a test reads each domain's `pg_get_constraintdef()`, takes its values with a regexp and compares them with the specification's enum; in the other, nothing: each migration writes the values, and the API specification writes them again |
| app code naming a placeholder's type, in one project | 21 names (13 `jsonb`, 6 value domains, 2 gone); the rest reach the type through the row types |
| `COMMENT ON` | in the dump, 15 tables of 266, no type nor domain; the other project comments every table (a test refuses one without) and every domain it creates |
| validation libraries | Zod in about 600 files, `ajv` in 38, Valibot, Yup, io-ts, TypeBox and Joi in none. No Zod schema is typed against a generated row type (`ZodType<s.….Insertable>`, `satisfies`: 0); 17 `z.enum()`, each over values written inline |

## 1. A domain whose `CHECK` lists its values

**Status**: accepted (2026-11-17), by delegation.

Say `films` had a `certificate` column, of `CREATE DOMAIN certificate AS text CHECK (VALUE IN ('U', 'PG', '12', '15', '18'))`, commented `'Who may see the film'`.

| | U0. Nothing changes | U1. The union in `zapatos/schema`, over the placeholder | U2. The union only while the placeholder is as generated | U3. The values written into a new placeholder | U4. The union in `zapatos/schema`, named by a new placeholder |
|---|---|---|---|---|---|
| **Generated** | `custom/PgCertificate.d.ts`: `export type PgCertificate = string;`; `films.Selectable`: `certificate: c.PgCertificate` | in the schema's namespace, beside its enums, with a JSDoc: `export type certificate = 'U' \| 'PG' \| '12' \| '15' \| '18';` and `every.certificate`, the tuple; `films.*`: `certificate: certificate` in all five; no placeholder | `certificate: db.DomainInContext<c.PgCertificate, string, certificate>` in each, and U1's declaration | `custom/PgCertificate.d.ts`: `export type PgCertificate = 'U' \| 'PG' \| …;` | U1's declaration; `custom/PgCertificate.d.ts`: `import type { certificate } from 'zapatos/schema';` and `export type PgCertificate = certificate;`; `films.*`: `certificate: c.PgCertificate`, as today |
| **Which wins over a placeholder edited by hand** | the placeholder | the database. A note, once per run, names each such domain whose placeholder file is still on disk, as no longer read | the placeholder, silently | the placeholder | the placeholder. A note, once per run, names each one on disk that the run would write otherwise |
| **Follows the database** | no | on every run | only while its placeholder is as generated: none of the corpus's 193 is | no: the next migration leaves the values stale | on every run, through a placeholder it writes; one already on disk once deleted, as all the corpus's 193 are |
| **App code naming `c.PgCertificate`** (6 names of such domains in one project) | compiles | compiles while the file is on disk, with the file's type, not the column's; deleted, as the note asks, it fails | compiles | compiles | compiles, and is the column's type |
| **A branded or narrower type written by hand** | in the placeholder | nowhere | in the placeholder | in the placeholder | in the placeholder: `certificate & { readonly __brand: 'Certificate' }` |
| **Compile cost** (measured below) | +0 | +75 Instantiations, +49 Types | +131, +67 | +75, +48 | +75, +49 |
| **Default output, canary** | — | unchanged without the key; `src/db` reads nothing new, so no canary increment | the same | the same | the same |

**What it saves**: `db.insert('films', { certificate: '12A', … })` fails to compile, where today Postgres refuses it at run time with 23514, `value for domain certificate violates check constraint "certificate_check"`. The SQL does not change: no shortcut reads the type.

**U0 with an enum**: `CREATE TYPE certificate AS ENUM (…)` is typed as its union today, by Zapatos. Projects take a `CHECK` domain because an enum's value cannot be dropped: "Existing values cannot be removed from an enum type, nor can the sort ordering of such values be changed, short of dropping and re-creating the enum type" (Postgres docs § Enumerated Types), and `ALTER TYPE … DROP VALUE` fails with 0A000 (replayed on 17.3), where a domain's `CHECK` is dropped and added again in one transaction, which checks the rows. The dump has 4 enums on 12 columns, beside 188 such domains on 309; the other project, none. Moving to enums is a migration of every such column, and loses that.

**Measured** (`npm run bench:types`, prototypes over `test/generated` never committed). Master is 15,824 Instantiations and 7,433 Types, +1.1 % and +3.3 % on the baseline. Each prototype types `events.kind`, which the bench writes, filters with `isIn()` and `isNotIn()` and reads, in `events` and its 3 partitions: 20 column slots.

| Prototype | Instantiations | Types |
|---|---|---|
| the column of a domain with its placeholder, `c.PgEvent_kind = string` (today, like for like) | 15,824 (+0) | 7,433 (+0) |
| U1 | 15,899 (+75) | 7,482 (+49) |
| U2 | 15,955 (+131) | 7,500 (+67) |
| U3, the values in the placeholder, nothing in `zapatos/schema` | 15,899 (+75) | 7,481 (+48) |
| U4, U1's declaration and a placeholder that names it | 15,899 (+75) | 7,482 (+49) |
| U1, plus 188 unions of 926 values that nothing uses, the corpus's count | 15,899 (+75) | 9,710 (+2,277); 9,521 without the `every` tuples |

So a query pays about 4 Instantiations per slot for the union, wherever it is declared: U1, U3 and U4 cost the same, to one Type. The declarations cost about 2.4 Types per value, once, as enums of the same labels would; U4's placeholder adds nothing measurable. The corpus's API types already declare those unions, which its placeholders import.

**Market standard**: none of these four reads a `CHECK`.

- **Kanel** declares a domain as its base type (`domainsGenerator.ts`: `typeMap[domainDetails.innerType]`), with its comment; **kanel-zod** as its base schema, `z.string()` (`processDomain.ts`).
- **kysely-codegen** generates types for domains by default (`--no-domains` skips them); its README says nothing of a `CHECK`.
- **PostgREST**'s OpenAPI `enum` comes from `pg_enum` of the column's base type (`SchemaCache.hs`), never from a `CHECK`.

**Choice: U4**, under `domainsTypedAsUnions: true` (`OptionalConfig`, read `?? false`; the name follows `enumArraysTypedAsText` and `intervalsTypedAsObjects`).

- **The database decides what pgcast writes** (principle 1): the union is read again on every run, and the placeholder only names it, so it never goes stale, unlike U3's values. Without the key, nothing changes, the queries included.
- **A placeholder stays the user's**, as Zapatos writes in its header ("Please edit this file as needed", "won't be overwritten") and as pgcast's keys already treat it: `domainsTypedByContext` and `enumArraysTypedAsText` keep an edited placeholder's type, and `intervalsTypedAsObjects` changes only what a new placeholder holds. U1 would be the first key to bypass a file whose header asks for edits.
- **The column keeps `c.PgCertificate`**, the reading Zapatos documents for a domain: app code naming it keeps compiling, and means the column's type, where under U1 it means the file's until the file is deleted, then fails; a branded or narrower type stays possible, which U1 loses.
- **What U1 does better**: it types the corpus's columns as soon as the key is on. Under U4 the corpus's 193 placeholders, all edited, keep typing them until deleted, one `rm` and a run; the note names each, and U1's note asked for the same deletion.
- **The drift a test or nothing guards today becomes a compile error** once a placeholder names the union: an API type that has a value the database lacks fails where it is written into a row, and one the database added fails where a row is read into the API type.
- **U2** follows only a placeholder left as generated, none in the corpus, for +131 Instantiations and a `db.DomainInContext` per column; U4's note names such a placeholder instead. **U3** is stale by the next migration, for the same cost as U4.
- **The mechanism exists**: a placeholder over an enum imports it today (`customTypeImports`, `tables.ts`); U4 declares the union and points that path to it.
- **Class** ([decision 003](./003-fixes-and-deprecation.md)): **Opt-in without switch-over**. A placeholder holding the base type stays the reading Zapatos documents for every domain ("replace with your custom type or interface as desired"), and its `string` is wider, not wrong: Postgres refuses the rest (23514). So, off, no note and no warning, and nothing switches in 7.0: `config.ts`'s comment and `CHANGELOG.md` (§ Added, the key; § Changed, the docs) do not say "the default in 7.0", unlike `domainsTypedByContext`'s.
- **Read, and only that** (each case replayed above): the domain's base type is `pg_catalog.text`; among its `CHECK`s, `contype = 'c'` (from Postgres 17 a domain's `NOT NULL` is a `pg_constraint` row too, `contype = 'n'`, `pg_get_constraintdef()` `NOT NULL`, replayed on 17.3), one is stored as `CHECK ((VALUE = ANY (ARRAY['…'::text, …])))` or `CHECK ((VALUE = '…'::text))`, matched whole, every element a quoted string; it is `convalidated`. Another `CHECK` beside it only narrows the values, so the union stays true; two of this form keep the placeholder. `NULL`, `varchar`, `char`, `citext`, a domain over a domain, `NOT VALID` and an `OR` keep their placeholder. Values are unquoted (`''` to `'`) and kept in the `CHECK`'s order, a duplicate once. The same query reads `current_setting('standard_conforming_strings')`. On Postgres 18 and earlier, when it is `off` for the database or the role, `pg_get_constraintdef()` doubles a backslash with no `E` prefix, `'back\\slash'::text` for `back\slash` (replayed on 17.3), so with `off` a value that holds a backslash keeps the placeholder.
- **One query per run**, sorted by schema, name and constraint, and only with the key: off, the queries are master's.
- **Where the union goes**: the domain's schema declares it, as `tsIdentifier(name, 'type')`, with its `every` tuple, in a `/* --- domains --- */` section after the enums, `/* (none) */` when empty; under `schemaJSDoc`, a JSDoc gives its name, "Domain in database" and its `COMMENT ON DOMAIN` (§ 2). Postgres keeps a domain's and an enum's names apart in one schema (`pg_type`), but not TypeScript: through `tsIdentifier`, an enum `odd format` and a domain `odd_format` are both `odd_format`, so the unions join the `type` group of `warnAboutSharedIdentifiers`, whose note names them. Columns keep `c.PgCertificate` in all five interfaces, and their JSDoc "`certificate` (base type: `text`) in database". A domain whose schema the run does not generate has no union declared, and keeps master's placeholder.
- **The placeholder**: a missing one is written naming the union, `import type { certificate } from 'zapatos/schema';` and `export type PgCertificate = certificate;`, through the domain schema's namespace under `schemaPrefix`, as a placeholder over an enum imports it. One on disk is never rewritten, as in Zapatos; a note, once per run, names each one whose text is not what this run would write, compared exactly, the placeholders' header being fixed: "Note: certificate is typed by the values of its CHECK as certificate in zapatos/schema (domainsTypedAsUnions), but its placeholder zapatos/custom/PgCertificate.d.ts, written before, still types its columns. To type them by the database, delete it: the next run writes it naming the union." `--check` ignores it: a placeholder is the user's.
- **By placeholder name, not by domain**: two types of one name share a placeholder (#42), so `a.status AS text CHECK (VALUE IN ('draft', 'live'))` and `b.status AS integer` both take `c.PgStatus` (replayed on master). A placeholder names the union only while every type of the run that takes its name (`customTypeOrigins`) is that domain; otherwise it is master's text, last wins, with `warnAboutSharedCustomTypeNames`'s note, and the note above does not name it.
- **Arrays of such a domain keep their placeholder** in PR 2. Typed, their `Selectable` would be `string`, the text `pg` returns, and the other four the union's array, as `enumArraysTypedAsText` types an enum's array, with its note. That is a follow-up if real use asks (44 columns in the corpus); `domainsTypedByContext` already types them by `text`.

## 2. The `COMMENT ON` the generator ignores (R53)

**Status**: accepted (2026-11-17), by delegation.

| | C0. Leave | C1. Into JSDoc that the key already writes | C2. Into every declaration, behind a key of its own |
|---|---|---|---|
| **Read** | columns only, as 6.6.1 | plus a domain's comment, for a union of § 1 | plus tables, views, materialised views, schemas, enums, domains |
| **Generated** | — | the union's JSDoc: `**certificate**`, `- Domain in database`, then `Who may see the film`, through `jsdocText()` | the same on each namespace and enum |
| **Default output** | — | unchanged: the union is new output | unchanged without the key |

**Choice: C1.** The union's JSDoc is new text, so its comment costs no key and no change elsewhere; one project of the corpus comments every domain it creates. R53 stays "leave" for the rest. A table's comment would show on the hover of a namespace (`s.films`), which no query reaches. An enum's would show where a column of it hovers to its alias, but the corpus comments no enum: the dump's 4 have no comment, the other project declares none. A key for either is surface for little (`AGENTS.md`: "Small is beautiful"). Kanel writes a domain's comment (`domainsGenerator.ts`); PostgREST gives a column's comment as its OpenAPI `description`. Reversible as an opt-in, if asked.

## 3. Typing a `jsonb` column

**Status**: accepted (2026-11-17), by delegation.

| | J0. Zapatos's domain and its placeholder | J1. A type named in a `COMMENT ON` | J2. A JSON Schema in a `CHECK` |
|---|---|---|---|
| **The user writes** | `CREATE DOMAIN film_details AS jsonb;` then the placeholder: `export interface PgFilm_details { print: '35mm' \| '70mm' \| 'digital'; prizes: string[] }` | `COMMENT ON COLUMN films.details IS '@type(FilmDetails, ./types)'`, Kanel's tag | `CHECK (jsonb_matches_schema('{…}', VALUE))`, the `pg_jsonschema` extension |
| **Postgres checks** | nothing | nothing | the shape |
| **The type comes from** | the placeholder, written by hand once | the comment, TypeScript kept in the database | the database |
| **What pgcast adds** | nothing: `website/custom-types.md` § A `jsonb` domain shows it | a tag parser over comments that already become JSDoc (`createColumnDoc()`), and an import per tag | an extension and a JSON-Schema-to-TypeScript converter in the core |
| **Corpus** | 105 domains, 256 columns in one project alone; 95 of 101 placeholders import a type of the API specification | 0 | 0 |

**Choice: J0. Nothing is built, and #642 is crossed out.**

- Zapatos documents it ("Say, for example, that you have a Postgres jsonb column on which you want to impose a particular structure"), pgcast's docs show it, and the corpus has adopted it, 256 columns to 9 plain ones.
- J1 is a type declared by hand, only moved into the database, where Postgres checks nothing of it (principle 1). Kanel's `@type` and kysely-codegen's `overrides` (`{"columns": {"users.settings": "{ theme: 'dark' }"}}`) do this, outside the database for the latter.
- J2 is the only one where the database knows the shape; it needs an extension the corpus does not use, and a converter that belongs in a separate package if ever.

## 4. Validators in a separate package

**Status**: accepted (2026-11-17), by delegation.

| | V0. Not built | V1. `@pgcast/zod`, a package of its own | V2. In the core generator |
|---|---|---|---|
| **What it writes** | — | per table, a Zod schema per context, as `kanel-zod`'s selector, initializer and mutator: `films.Insertable` → `z.object({ title: z.string(), certificate: z.enum([…]).optional(), … })` | the same file, from `zapatos/generate` |
| **How it reads the catalog** | — | its own queries, a copy of `tables.ts`'s 514 lines; or a model exported from `zapatos/generate`, a public API #52 crossed out | the generator's own |
| **The philosophy** | — | allowed (principle 4): Zod the user's dependency, as `kanel-zod` declares none | refused by #55 ("Validators in the core") |
| **Cost** | — | a published package (`exports`, `files`, a release: stop points), the model, a Zod major to follow | the same, in the core |

**Choice: V0. #643 is crossed out.**

- **No need in the corpus.** It validates with Zod, at its API's edge, against types of its API specification; none of its Zod schemas is typed against a table's row type. A row that breaks a `CHECK`, a `NOT NULL` or a domain is refused by Postgres, in the same round trip.
- **The market has one**: `kanel-zod` writes Zod schemas from the catalog, and gives a domain `z.string()` and a `jsonb` `z.unknown()`. A project that wants them has them today, by running Kanel and kanel-zod's hook beside pgcast.
- **The cost is all fixed**: the model #52 left out, a second package to publish and keep in step with Zod, for no call the corpus would make ("Small is beautiful").
- **For a revival**: V1, Zod first (the corpus uses Zod and no Valibot), named `@pgcast/zod`, a CLI beside `pgcast` that writes one `.ts` file; it reads the catalog through a model `zapatos/generate` would export, built in the PR that needs it, as #52's comment says. Its layout and its publication are then the owner's (`AGENTS.md` § Stop points). It comes back as a revision of this note, if real use asks.

## What changes in the plan

- **#641** (PR 2): its body follows § 1 and § 2; it carries its own docs (skill `pr-shape`: docs follow the code), and R53's line in `docs/CHARACTERISATION-REPORT.md`.
- **#642** (typed `jsonb`): crossed out, pointing to § 3.
- **#643** (validators): crossed out, pointing to § 4.
- **#644** (docs): crossed out. What it promised moves to #641: the guide's TypeScript, SQL and type side by side, `website/catalog-types.md` and `website/generator.md` in both languages; the `jsonb` domain is documented already.
- **#55**: its planned PRs 3, 4 and 5 crossed out.

## Risks

- **`pg_get_constraintdef()`'s text is read with a regexp**, replayed here on Postgres 17.3 only. A form it does not match keeps the placeholder, never a wrong union, and on Postgres 18 and earlier so does a backslash under `standard_conforming_strings = off`, read in the same query; the fixture freezes each form of the table above, on the 14, 16 and 18 that CI runs.
- **A placeholder on disk keeps typing its columns** until the user deletes it: for the corpus, whose 193 are all edited, the key alone changes no column. The note names each file. One kept on purpose, a branded type, is named on every run; a way to quiet it waits for real use: none of the corpus's 193 brands.
- **The corpus is two projects**, one of them read in a dump. A project with `varchar` domains, or arrays of them, gets less from PR 2 until a follow-up.

## Sources

- Zapatos: [docs](https://jawj.github.io/zapatos/) § How does that look?, Typescript schema (the enum), § Custom types and domains (the `jsonb` domain, "will not be overwritten"), § What's next; `b2c6bf7` and tag `v0.1.55`, `git log upstream/master`; `git grep` on `v6.6.1`.
- Postgres: [`CREATE DOMAIN`](https://www.postgresql.org/docs/current/sql-createdomain.html), [`pg_constraint`](https://www.postgresql.org/docs/current/catalog-pg-constraint.html) (`contypid`, `convalidated`), [`pg_get_constraintdef`](https://www.postgresql.org/docs/current/functions-info.html), [Enumerated Types](https://www.postgresql.org/docs/current/datatype-enum.html) (a value cannot be removed).
- Kanel: [`domainsGenerator.ts`](https://github.com/kristiandupont/kanel/blob/main/packages/kanel/src/generators/domainsGenerator.ts), [`applyTaggedComments.ts`](https://github.com/kristiandupont/kanel/blob/main/packages/kanel/src/hooks/applyTaggedComments.ts) (`@type`); kanel-zod 4.0.3: [`processDomain.ts`](https://github.com/kristiandupont/kanel/blob/main/packages/kanel-zod/src/processDomain.ts), [`defaultZodTypeMap.ts`](https://github.com/kristiandupont/kanel/blob/main/packages/kanel-zod/src/defaultZodTypeMap.ts), [`processComposite.ts`](https://github.com/kristiandupont/kanel/blob/main/packages/kanel-zod/src/processComposite.ts).
- kysely-codegen: [README](https://github.com/RobinBlomberg/kysely-codegen) (`--no-domains`, `--overrides`, `--custom-imports`).
- PostgREST: [`SchemaCache.hs`](https://github.com/PostgREST/postgrest/blob/main/src/library/PostgREST/SchemaCache.hs) (`pg_enum`), [`OpenAPI.hs`](https://hackage.haskell.org/package/postgrest-9.0.0/docs/src/PostgREST.OpenAPI.html) (`colEnum`, `colDescription`).
- #52's comments (the model crossed out); note [007](./007-related.md) for the shape of a cut.
