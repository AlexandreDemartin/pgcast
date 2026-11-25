# 019 — 8.0 keeps one behaviour per option, the best, with no permanent opt-in

- **Status**: accepted in principle by the owner (2026-11-25, quoted below); the inventory (§ 3) and the open points (§ 6) are proposed, for the owner's review of this PR. Supersedes "an explicit old value is kept" of note [003](./003-fixes-and-deprecation.md) § Rule, "`false` stays a permanent choice" of notes [017](./017-value-aliases.md) and [018](./018-json-output.md).
- **Scope**: step [#952](https://github.com/AlexandreDemartin/pgcast/issues/952) of Epic [#942](https://github.com/AlexandreDemartin/pgcast/issues/942); every option of `src/db/config.ts` and `src/generate/config.ts`.
- **In short**:
  - 8.0 removes each option that toggles between an old and a better behaviour, and keeps the better one alone. It keeps the options that are configuration by nature.
  - A removed key set to its old value throws, at `setConfig()` or before the generator's first query; it never switches silently.
  - From now on, a new opt-in names its exit, the sole behaviour at the next major, or it is refused; a breaking change ships with its migration entry, or it is not merged.

## Context

- The owner, 2026-11-25 (paraphrased from French): no sprawl of opt-ins; a decided version, without opt-in, with the version judged best; easy backward compatibility with Zapatos 6.6.1 can be less true, with the adaptations any package's major needs; `core.ts` may evolve for it.
- Later the same day: compatibility is best effort, not systematic; at some point pgcast moves to the next major to get the best performance and typing, always within the philosophy (no ORM, clean visible SQL, the database as the source of truth). And: "be more flexible, but document well how to migrate".
- Each opt-in kept with a permanent `false` doubles the SQL paths to test and review: #949 and #950 took 7 review rounds, many on option combinations.
- Principle 6 already names the best version: the cheapest SQL for the same result and the same types, measured.
- Today's rule (note 003): an opt-in becomes the default at the next major, and an explicit old value may stay for good. Notes 017 and 018 kept `false` for good on that rule; 003 lists three permanent old values and two opt-ins that never switch.

## 1. The rule

- **One behaviour per option.** At a major, an option that chooses between two behaviours of pgcast goes, and the better one stays alone. "Better": the cheapest SQL for the same result (principle 6), then the type closest to what the database states (principle 1), then the result that matches the function's name, type and docs.
- **Kept: configuration by nature.** A fact the database cannot state (the app's `pg` type parsers, its retries, where the files go), a listener, and Zapatos 6.6.1's own keys. These are not opt-ins.
- **An old value stays only with a stated need that no other way meets.** "Someone may rely on it" is not one; the migration entry answers it.
- **A new opt-in names its exit**: the sole behaviour at the next major, written in its decision note and its docs entry, or it is refused.
- **A breaking change ships with its migration entry**, in the same PR, in the major's migration guide (`website/switching.md` and `website/fr/switching.md`): before → after code, what the user sees change, how to find the affected calls (a grep, a type error). Without it, it is not merged.
- **A removed key fails loudly** (§ 4), never switches silently.

## 2. The compatibility kept

| | Before this note | From this note |
|---|---|---|
| 6.x | a drop-in for Zapatos 6.6.1 | unchanged |
| A minor or a patch | keeps what working code relies on, bar decision 003's fixes | unchanged |
| A major | switches defaults; the old values stay as `false` | may change behaviour, SQL text or types when that buys better performance or typing, within the philosophy, with a migration guide in English and French |
| Always | types derived from the database; `zapatos/*` module names (decision 002) | unchanged |

`AGENTS.md`'s goals and README § Versions say the same; § Philosophy and § What pgcast does not do are unchanged.

## 3. The inventory

**Group A** keeps 7.x's default: only a program that wrote the old value sees a change. **Group B** switches the default: every program sees it. "Error" is § 4's refusal of a removed key. Probes: § 5.

### Runtime (`src/db/config.ts:33`)

| Option | 7.x default | 8.0 | Why | What a 7.x program that wrote the old value sees | Migration |
|---|---|---|---|---|---|
| `transactionAttemptsMax` | `5` | keep | the app's retry budget; Zapatos's key | — | — |
| `transactionRetryDelay` | `{ minMs: 25, maxMs: 250 }` | keep | the app's wait; Zapatos's key | — | — |
| `castArrayParamsToJson` | `false` | keep | how the app sends arrays; each value is refused by Postgres somewhere (`website/runtime-config.md:151-152`); Zapatos's key | — | — |
| `castObjectParamsToJson` | `false` | keep | the same for objects (`website/runtime-config.md:174`); Zapatos's key | — | — |
| `upsertRequiresSameKeys` | `true` | **remove** (A), always `true` | `false` overwrites a stored value with `DEFAULT`: `($3, DEFAULT)` set from `EXCLUDED` (probe); `updateColumns` already says which columns to set | `false`: TS2353 on the key, or the error. Then a batch whose rows differ throws at construction, "rows have different keys: pass updateColumns, or give every row the same keys" (`src/db/shortcuts.ts:616`, probe) | Find: `grep -rn upsertRequiresSameKeys`; each call throws as it is built, so the tests find it. Before `upsert('films', rows, 'id')` → after `upsert('films', rows, 'id', { updateColumns: ['title'] })`, or every row with the key |
| `undefinedMeansMissing` | `true` | **remove** (A), always `true` | `undefined` sent as `NULL` clears a column nobody named; `null` says "clear it" under both (`website/versions.md:59`) | `false`: TS2353 or the error. Then an `undefined` cell is `DEFAULT` in `insert()` and left out of `update()` and `upsert()` (`src/db/shortcuts.ts:232`, `:254`; probe: `VALUES ($1, DEFAULT)` for `($1, $2)` with `null`, `SET ("n")` for `SET ("n", "title")`); an `update()` left with no column throws "nothing to update…" (`src/db/shortcuts.ts:676`) | Find: grep the key; a value `undefined` at run time is not greppable, so run the tests on 7.x with the key deleted first. Before `update('films', { tagline: form.tagline }, …)` meaning "clear it" → after `tagline: form.tagline ?? null` |
| `transactionRequiresCommit` | `true` | **remove** (A), always `true` | `false` resolves with nothing saved; `savepoint()` or letting the error out does what such code meant (`website/runtime-config.md:210-212`) | `false`: TS2353 or the error. Then a callback that caught a query's error rejects, "the transaction was rolled back, not committed: …" (`src/db/transaction.ts:310`, probe) | Find: grep the key; then each `catch` around a query inside a `transaction()` callback. Before `try { await db.insert('ratings', r).run(c); } catch {}` → after `await db.savepoint(c, sp => db.insert('ratings', r).run(sp)).catch(() => {})` |
| `transactionRequiresIdleClient` | `true` | **remove** (A), always `true` | `false` ends the caller's own `BEGIN` (probe: the client reads `I` after) | `false`: TS2353 or the error. Then `transaction()` given a client in a block rejects before `START TRANSACTION`, "transaction() was given a client inside a transaction block, …" (`src/db/transaction.ts:242`, probe) | Find: grep the key, and `'BEGIN'` sent by hand on a client then passed to `transaction()`. Before `await c.query('BEGIN'); await db.serializable(c, cb)` → after `await db.savepoint(c, cb)` inside your block, or `db.serializable(pool, cb)` |
| `transactionRequiresSatisfyingLevel` | `true` | **remove** (A), always `true` | `false` runs a callback at a weaker level than it asked for; the outer transaction can open at one that satisfies it (`website/runtime-config.md:248-250`) | `false`: TS2353 or the error. Then the nested call rejects before its callback, "transaction() at SERIALIZABLE was given the client of a transaction at READ COMMITTED, …" (`src/db/transaction.ts:221`, probe) | Find: grep the key; then the transaction helpers given a client, not a pool. Before `db.readCommitted(pool, c => db.serializable(c, cb))` → after `db.serializable(pool, c => db.serializable(c, cb))` |
| `selectExactlyOneChecksForSecondRow` | `false` | **remove** (A), always `LIMIT 1`; **open point** (§ 6) | Zapatos's reading, "at least one row" (`website/runtime-config.md:270`); `LIMIT 1` is the cheaper SQL, and with a `lock` `LIMIT 2` locks a second row (`:269`) | `true`: TS2353 or the error. Then a second row no longer rejects: `LIMIT $2` with `1` for `2` (`src/db/shortcuts.ts:1072`, probe), and `.run()` gives the first row | Find: grep the key. Before `selectExactlyOne('films', { title })` checked → after `const rows = await db.select('films', { title }, { limit: 2 }).run(pool); if (rows.length !== 1) throw …` |
| `aggregatesTypedByColumn`, and `ConfigTypes` | `true` | **remove** (A), always by column; `ConfigTypes` goes with its only key (`src/db/shortcuts.ts:1310`) | `Number()` turns an empty set into `0` and a date into its epoch milliseconds (`website/runtime-config.md:281`) | `false`: TS2353 or the error. Then `sum()` and `min()` on no row give `null`, not `0`, and `min()` of a `date` a `Date`, not a number (probe). A `ConfigTypes { aggregatesTypedByColumn: false }` still compiles and reads nothing (type probe) | Find: grep the key and `ConfigTypes`; `tsc` flags each use of a now nullable result, TS18047 (type probe). Before `const total = await db.sum('films', db.all, { columns: ['runtime_minutes'] }).run(pool)` → after `(await …) ?? 0` |
| `shortcutsUseJson` | `false` | **remove** (B), always `json`, reads and, once [#939](https://github.com/AlexandreDemartin/pgcast/issues/939)'s land, writes | principle 6: 84 → 31 ms on the lateral (note 018 § Context); the same values but `-0` and key order (note 018 § 4); 018's needs for `false` are met otherwise: a cast, `::jsonb`, and a type parser set for `json` (114) too | Every program: a row's keys in the table's order (probe: `id,title,n,released` for `n,id,title,released`); a nested result is `json`, so a `jsonb` function, `DISTINCT` or `UNION` over it fails, 42883 (`website/runtime-config.md:300`); a parser set for `jsonb` (3802) alone no longer applies (`:301`); a key Postgres cannot take as an alias, or over 50 keys, throws while compiling (`:302-303`); the SQL text | Find: grep `shortcutsUseJson`, `jsonb_` around a nested shortcut, `setTypeParser(3802`, and tests comparing SQL text or `JSON.stringify()` of rows. Before `` sql`SELECT jsonb_array_length((${q}))` `` → after `` sql`SELECT jsonb_array_length((${q})::jsonb)` `` |
| `topLevelSelectAsRows` | `false` | **remove** (B), always rows | principle 6: 635 → 261 ms with `json` too on 10 000 rows, and no 256 MB cap (note 018 § Context); no need for `false` that `.run()` or `rows.map()` does not meet | Every program: `compile()` gives the rows query; code that runs its text with its own client and reads `rows[0].result` gets the first row alone (probe: 2 rows, `rows[0].result` one object) | Find: grep `.compile()` whose text a client runs. Before `(await client.query(q.compile())).rows[0].result` → after `.rows.map(r => r.result)`, or `q.run(client)` |
| `queryListener`, `resultListener`, `transactionListener` | none | keep | listeners; Zapatos's keys | — | — |
| `transactionEventListener` | none | keep | a listener, the typed twin of `transactionListener` | — | — |

### Generator (`src/generate/config.ts:17`)

| Option | 7.x default | 8.0 | Why | What a 7.x program that wrote the old value sees | Migration |
|---|---|---|---|---|---|
| `db`, `outDir`, `outExt`, `schemas`, `unprefixedSchema`, `columnOptions`, `customTypesTransform`, `schemaJSDoc` | as today | keep | where and what to generate; Zapatos's keys | — | — |
| `debugListener`, `progressListener`, `warningListener` | as today | keep | listeners; Zapatos's keys | — | — |
| `customJSONParsingForLargeNumbers` | `false` | keep | states the app's JSON parser, which the database cannot (`website/generator.md:318`); Zapatos's key | — | — |
| `moduleNames` | `'zapatos'` | keep | must match the folder pgcast is installed in (`website/generator.md:369`); its default is decision 002's | — | — |
| `typeEnumsAcrossSchemas` | `true` | **remove** (A), always `true` | `false` types a foreign enum as `any`, or as another schema's labels (`website/generator.md:341-344`) | `false`: the error, before any query. Then a foreign enum takes its own labels: a write of `'director'` to `prints.keeper` fails to compile (`website/switching.md:357`); its old placeholders go unused (`:375`) | Find: grep the key; regenerate, then `tsc` |
| `enumOrder` | `'declared'` | **remove** (A), always `'declared'` | Postgres compares and sorts by the declared order | `'alphabetical'`: the error. Then `every.crew_job` keeps the declared order: `every.crew_job[0]` is `'director'`, not `'cinematographer'` (`website/generator.md:361`) | Find: grep the key, then `every\.` indexed by position |
| `rejectOnQueryError` | `true` | **remove** (A), always reject; the CLI catches, prints `*** error ***` and exits with code 1, as its own code, not an option (`src/generate/cliConfig.ts:63`) | the old value's need, the CLI's exit (note 003, #183), is met by the CLI | `false`: TS2353 or the error. Then a failed query rejects `generate()` (`src/generate/tsOutput.ts:226`). Uncaught, Node 22 prints the error on stderr and exits with code 1, where `false` printed `*** error 0 ***` on stdout and exited with 1 (probe); caught, the program goes on | Find: grep the key. Before `await generate({ …, rejectOnQueryError: false })` → after `await generate({ … }).catch(e => { console.error(e); process.exit(1); })` |
| `uniqueIndexConstraintsOnly` | `true` | **remove** (A), always `true` | `false` lists names Postgres refuses as arbiters, 42704 and 55000 (`website/generator.md:444-445`); `constraintNames` lists every unique index for code that wants them all (`:455`) | `false`: the error. Then `UniqueIndex` loses bare unique indexes and deferrable keys: `constraint('festival_entries_live_idx')` fails to compile (`website/switching.md:359`) | Find: grep the key; regenerate, then `tsc`; a name a `Record` keyed by `UniqueIndex` still holds is checked by hand (`website/switching.md:387`) |
| `constraintNames` | `false` | keep, an output choice; **open point** (§ 6) | adds a type, changes none; one catalog query more (`src/generate/tables.ts:327`); its cost on a large schema is not measured; a relation `every` beside an enum `Constraint` clashes (`website/generator.md:463`) | — | — |
| `domainsTypedByContext` | `true` | **remove** (A), always `true` | `false` types a `bigint` domain as a string in the shortcuts' JSON, where they return a number (`website/generator.md:481-482`) | `false`: the error. Then a domain is typed by context while its placeholder holds the generated type, and a domain over a domain takes its innermost base type, not `any` (`website/generator.md:506`) | Find: grep the key; regenerate, then `tsc` |
| `enumArraysTypedAsText` | `true` | keep | states the app's parser of an enum array, which the database cannot; `false` is the right type for a project that sets one, and no placeholder holds a plain column's type (`website/generator.md:526`) | — | — |
| `intervalsTypedAsObjects` | `true` | keep | the same for `interval` (`website/generator.md:545`) | — | — |
| `domainsTypedAsUnions` | `false` | **remove** (B), always on; **open point** (§ 6) | the type derived from the database's `CHECK` (principle 1), narrower, and the rest Postgres refuses (23514) | Every program: `zapatos/schema` declares each such domain's union and `every.<name>`; a fresh placeholder names it, so a write of another string fails to compile, TS2769 (`website/generator.md:563`); a placeholder on disk keeps its `string`, with a note on each run (`:567`); a name clash is noted (`:468`); one catalog query more (`src/generate/tsOutput.ts:257`) | Find: regenerate with fresh placeholders, then `tsc`; the notes name each placeholder left on disk |
| `valuesTypedAsAliases` | `false` | **remove** (B), always on | the same types, a file 27 % smaller and `tsc` 387 → 293 MB with lib check (note 017 § 4); no stated need for the written-out unions | Every program: the text of `schema.d.ts`, and the hover and errors name the alias (`website/generator.md:579`, `:585`); TypeScript 4.1 shows the union (note 017 § 3); a schema generated by 8.0 against an older `zapatos/db` gives TS2694 (note 017 § 5) | Find: a tool that parses `schema.d.ts`'s text; nothing else |

**Count**: 17 runtime options, 9 removed, and `ConfigTypes`; 23 generator options, 7 removed, `constraintNames` open.

## 4. How a removed key fails

| Option | Why not |
|---|---|
| Ignored | a JavaScript program, or a `zapatosconfig.json`, would switch behaviour without a word |
| A `DeprecationWarning` | the same switch, with a line on stderr that a log may drop |
| The key kept, typed as its kept value only (`undefinedMeansMissing?: true`) | dead keys in `Config` for a whole major |
| **Removed from the types, and the old value refused at run time** | chosen |

- **Types**: the key leaves `Config`; an object literal that sets it fails with TS2353 (type probe). A config built in a variable with other keys still compiles, hence the run-time refusal.
- **Run time**: `setConfig()` throws on a removed key set to its old value; the generator, before any query, as it refuses an unknown `enumOrder` (`src/generate/enumOrder.ts:20`). The message names the key, what 8.0 always does, and its migration entry. The kept value, `null` and `undefined` pass: they ask for what 8.0 does. Today `setConfig()` keeps any unknown key without a word (probe).
- **One list per side**, the removed keys and their old values, through 8.x.

## 5. Probes

Run on 2026-11-25 on master's build (`d9cfd72b`), Node 22, Postgres on `TEST_DATABASE_URL`'s server, in a throwaway database; scripts in the PR's scratch folder, nothing committed.

- Each runtime option of group A, and both of group B, compiled or run with `false` then `true`: the texts, values, results and errors quoted in § 3.
- `setConfig({ fooBarRemoved: false })`: kept in `getConfig()`, no error.
- `generate()` against a closed port, uncaught: with `rejectOnQueryError: true`, exit code 1 and the error on stderr; with `false`, exit code 1 and `*** error 0 *** Error: connect ECONNREFUSED` on stdout.
- Types, TypeScript of the branch, `strict`: a removed key in `setConfig({ … })` gives TS2353; a `declare module` adding a `ConfigTypes` the module no longer has compiles; `n + 1` on a `number | null` gives TS18047.

## 6. Open points, for the owner

| Point | Proposed | Why not obvious |
|---|---|---|
| `selectExactlyOneChecksForSecondRow` | remove; `LIMIT 1` alone | the name promises "exactly"; the check (`LIMIT 2`, a throw) is the stricter result, at one row's cost, but Zapatos documents "at least one", and a call that matched several rows would start to reject only at run time, which no grep finds |
| `domainsTypedAsUnions` | remove; on alone | note 008 kept it off for good: Zapatos types a domain by its placeholder. On is the better type, derived from the database, but it adds names to `zapatos/schema`, and an existing placeholder keeps its `string` until deleted |
| `constraintNames` | keep, off: an output choice, as `schemaJSDoc` | always on gives every project a type it may not use, at a compile cost not yet measured (`bench:types:large`) |

## 7. Options weighed

| Option | Why not |
|---|---|
| Today's rule: the default switches, `false` stays for good | every option doubles its SQL paths for good; 7 review rounds on #949 and #950 |
| **One behaviour per option, configuration kept** | chosen |
| Remove every option, configuration included | the app's retries, parsers and folders are facts pgcast cannot know |
| Keep the old values to 9.0, with a warning | a third major of doubled paths; 7.x already gave the time |
| The old behaviours in a package of their own | they live in the core's SQL; a package could not restore them without hooks in the core |

## 8. Under the rule

- **[#939](https://github.com/AlexandreDemartin/pgcast/issues/939)'s writes**: they land in 7.x under `shortcutsUseJson`, whose exit is 8.0; 8.0 builds every shortcut's JSON with `json`, reads and writes.
- **[#941](https://github.com/AlexandreDemartin/pgcast/issues/941)**, one JSON parameter for `insert()` of many rows: it cannot be `insert()`'s sole form, since JSON carries no `sql` fragment, `param()` nor `Default`, and a missing key gives `NULL`, not `DEFAULT` (#941 § What). A config key for it would be a permanent opt-in, which this note refuses. Its note weighs a function of its own, an explicit choice with its own documented SQL (principle 3), or rules it out.

## 9. The order of the 8.0 work

Each removal PR carries its migration entries, English and French (§ 1); runtime and generator apart (skill `pr-shape`).

1. Decide that 8.0 keeps one behaviour per option, the best, with no permanent opt-in (closes #952): this note.
2. Build the JSON of insert() and its kin with json functions under shortcutsUseJson (closes #939).
3. Decide on one JSON parameter for insert() of many rows (closes #941), judged under § 8.
4. Update skill backward-compat to the compatibility of decision 019.
5. Open the 8.0 migration guide in English and French: `switching.md` § from 8.0, empty but for its install line.
6. Refuse a removed runtime option in setConfig(), and remove undefinedMeansMissing and upsertRequiresSameKeys.
7. Remove transactionRequiresCommit, transactionRequiresIdleClient and transactionRequiresSatisfyingLevel.
8. Remove aggregatesTypedByColumn and ConfigTypes: the aggregates are always typed by column.
9. Make json functions and rows at the top level the only output of select() and its kin (shortcutsUseJson, topLevelSelectAsRows).
10. selectExactlyOneChecksForSecondRow, as § 6 settles it.
11. Refuse a removed generator option before any query, and remove typeEnumsAcrossSchemas, enumOrder, uniqueIndexConstraintsOnly and domainsTypedByContext.
12. Make generate() always reject on a failed query; the CLI prints it and exits.
13. Always name each column's value type with an alias (valuesTypedAsAliases); domainsTypedAsUnions and constraintNames, as § 6 settles them.
14. Rewrite Versions, Configuration and Generator for 8.0's one behaviour per option, in English and French.
15. 8.0.0: its range review, then the release (a stop point).
