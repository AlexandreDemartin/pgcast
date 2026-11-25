---
description: "Why pgcast's version numbers carry on from Zapatos's, when a fix may change what your code gets back, and what a PGCAST_DEP00n warning asks of you."
---

# Versions

Why pgcast's version numbers carry on from Zapatos's, how it decides whether a fix may change what your code gets back, and what a `PGCAST_DEP00n` warning is asking of you.
{.lede}

## Carrying on from 6.6.1

pgcast starts where Zapatos 6.6.1 stopped, so its first version is 6.6.2, not 1.0. A number that carries on says exactly that: this is the next version of the library you already have.

The module names are still `zapatos/db` and `zapatos/schema`, and the generated schema keeps 6.6.1's [canary](/generated-files#SchemaVersionCanary), so you can [switch from Zapatos to 6.x](/switching) with the same imports. Check [behaviour and type changes in 7.0](/switching#from-7-0) before upgrading.

The numbers follow [SemVer](https://semver.org/), read from the side of a project on 6.6.1:

- A patch fixes: 6.6.2 closes the security holes that pgcast's characterisation of 6.6.1 found.
- A minor adds: 6.7.0 brings the opt-ins below, with fixes and new features.
- Only a major may change a result that working code can rely on, so a range such as `^6.6.2` never brings one of those.

Each release, its security fixes included: the [changelog](/changelog); the latest: [`@pgcast/pgcast` on npm](https://www.npmjs.com/package/@pgcast/pgcast).

Zapatos broke things in its majors too, each at once: 1.0 renamed the transaction types, 2.0 made the last argument of `upsert()` an options object, 6.0 put the schema in the names of tables and enums outside `public`. Each came with notes on what to rewrite.

For the temporary opt-ins, 6.x warns, 7.0 changes the default and 8.0 removes the old behaviour. The [7.0 guide](/switching#from-7-0) also covers changes without a 6.x warning.

## Four answers to a surprise

Characterising Zapatos 6.6.1 turned up dozens of surprises ([the report](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md)): SQL that Postgres refuses, results that contradict a function's name, holes in the escaping.

About half of them can't be fixed without changing a result that is valid today ([its Summary](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md#summary) keeps the count), and [decision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md) sorts those by a single question: could working code depend on what it does now? The report leaves a few as they are, each with its reason.

<div class="stack">

| Class | When | What changes for you | Example |
|---|---|---|---|
| Fix | Postgres or the type already refused it, or it contradicts the function's name; every security hole | at once; the changelog lists each result that changes | [`not()`](/conditions#conditions.not) negates its whole condition: `` not(sql`a OR b`) `` gave `(NOT a OR b)`, which Postgres reads `(NOT a) OR b` |
| Opt-in | the result is valid, and code may rely on it | nothing until you opt in; the old behaviour warns | an `undefined` value sent as `NULL` in 6.x, until [`undefinedMeansMissing`](/runtime-config#Config.undefinedMeansMissing) makes it a missing key |
| Document | Postgres does it, it is meant, or the type can't see a value known only at run time | nothing; the docs say so | [`isNotIn()`](/conditions#conditions.isNotIn) with a `NULL` in its list matches no row: that is how Postgres reads `NOT IN` |
| Leave | [the report](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md) gives the reason: the type protects, the case is rare, or a fix would need a guess | nothing | an `int[][]` column is typed `number[]`: Postgres doesn't enforce the dimensions, and stores one, two or three in it alike |

</div>

A fix can still stop a call that only worked through the bug. 6.6.2's escaping fixes are an example: a column name such as `id" AS "x` used to close its quotes and add an alias, and now names a column that doesn't exist. The changelog lists every such call, with what to write instead.

Two opt-ins stay off through 7.x: `selectExactlyOneChecksForSecondRow`, below, and the generator's [`domainsTypedAsUnions`](#_7-0-and-8-0), which becomes the only behaviour in 8.0. [`selectExactlyOne()`](/select#selectExactlyOne) checks for at least one row when run alone; nested, a missing row gives `null`. Zapatos nests it in a `lateral`, where ties can duplicate the parent row with `withTies: true`.

Its option, [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), rejects on a second row when the query is run on its own. It never warns, and stays off through 7.x. 8.0 removes it, and `selectExactlyOne()` asks for `LIMIT 1` alone: the key set to `true` throws ([decision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).

## Why an opt-in, not a breaking change

Take an `update()` with an `undefined` value:

<<< ./examples/plain/versions_undefined.ts{ts twoslash}

Zapatos 6.6.1 sends `SET ("tagline") = ROW($1)` with `null`, and the film loses its tagline. That may be a bug, a key copied from a form field that was never filled in; it may also be how a project clears a column.

With the 7.0 defaults, `tagline: undefined` alone throws `nothing to update`. The update runs only if it assigns another column, in which case the stored tagline survives.

In 6.x the new reading arrives as an option, off by default, and the old one warns when it runs. You switch when you're ready, one option at a time, with your tests to show what moved.

The pattern is borrowed: Node's own deprecation cycle (documented, then a warning at run time, then removed in a major), React Router's future flags, and TypeScript's `--strict` family, one option per safer behaviour.

The cost is a few more keys in [`Config`](/runtime-config#Config), and two paths in the code until 8.0. Each key is optional, so a `Config` written for Zapatos 6.6.1 still compiles.

## Reading a warning

With the pgcast 6.7.0 defaults, if a `transaction()` callback catches a query error and Postgres answers `COMMIT` with `ROLLBACK`, Node prints this warning once:

```txt
(node:4242) [PGCAST_DEP003] DeprecationWarning: transaction() resolved, but Postgres answered its COMMIT with ROLLBACK: a query failed and the callback caught the error, so nothing was saved. Set transactionRequiresCommit: true (db.setConfig) to reject instead; it will be the default in pgcast 7.0.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

In brackets is the code, one per deprecated behaviour of the runtime, there to search for: [Read the warnings](/switching#read-the-warnings) lists the 6.x warnings and their triggers. Then the message says what still happens, which option changes it, and that 7.0 will make it the default.

In 6.x the promise resolves as in 6.6.1, even with `--throw-deprecation`, after which Node ends the process on the warning.

In 6.x each code warns once per process. `node --trace-deprecation` prints the stack. To find the other calls, turn the option on and run your tests.

In 6.x, `PGCAST_DEP004` warned on the legacy path for a null or missing result from `sum()`, `avg()`, `min()` or `max()`, or a non-number minimum or maximum. From 7.0, aggregates are typed by column by default.

Where `undefined` meant "clear it", `null` says so under either setting, and never warns.

## 7.0 and 8.0

Throughout 7.x, `aggregatesTypedByColumn: false` in both `db.setConfig()` and `ConfigTypes` restores numeric 6.x results without a warning. 8.0 removes this behaviour. [Migrating aggregates](/switching#from-7-0).

7.0 turns on by default the opt-ins that decision 003 lists: `upsertRequiresSameKeys`, `undefinedMeansMissing`, `transactionRequiresCommit`, `aggregatesTypedByColumn`, `transactionRequiresIdleClient`, `transactionRequiresSatisfyingLevel` and the generator's (below), except `selectExactlyOneChecksForSecondRow`, which stays off.

Enabling every fix on 6.x, including aggregate types in `ConfigTypes`, prepares you for the new defaults. Even with a clean warning trace, compile the [read-only callbacks and array conditions](/switching#from-7-0) and check the [optional type peers](/install#requirements) on a fresh install. The [migration guide](/switching#regenerate-for-7-0) lists the eleven old settings that go in 8.0 and the two that stay.

Throughout 7.x, `undefinedMeansMissing: false` and `upsertRequiresSameKeys: false` independently restore the 6.x write behaviours without warnings. 8.0 removes both legacy write behaviours ([8.0 migration](/switching#from-8-0)). It removes `rejectOnQueryError: false` too. Two legacy values remain, as they say how your `pg` parses: `enumArraysTypedAsText: false` and `intervalsTypedAsObjects: false` (below).

In 7.x, `transactionRequiresCommit`, `transactionRequiresIdleClient` and `transactionRequiresSatisfyingLevel` also default to `true`. Set any one to `false` to restore its [6.x transaction behaviour](/switching#runtime-migration) without a warning. 8.0 removes these three overrides.

The generator gets opt-ins of its own in 6.7: [`typeEnumsAcrossSchemas`](/generator#generate.typeEnumsAcrossSchemas), which uses a foreign enum's labels subject to name collisions, [`enumOrder`](/generator#generate.enumOrder), which keeps an enum's labels in their declared order, [`rejectOnQueryError`](/generator#generate.rejectOnQueryError), which rejects `generate()` on a failed query rather than end the process, [`uniqueIndexConstraintsOnly`](/generator#generate.uniqueIndexConstraintsOnly), which filters named conflict targets by the relation's index, [`domainsTypedByContext`](/generator#generate.domainsTypedByContext), which types a domain over `bigint`, `numeric`, `bytea`, `money` or a date, or over an array of one, by context, as its base type is, and a domain over a domain or an array of a domain, `any` without it, by the base type of its innermost domain, [`enumArraysTypedAsText`](/generator#generate.enumArraysTypedAsText), which types an array of an enum as the text `pg` returns in `Selectable`, and [`intervalsTypedAsObjects`](/generator#generate.intervalsTypedAsObjects), which types an `interval` in `Selectable` as `pg` parses it.

In 7.x, `typeEnumsAcrossSchemas: false` restores lookup in the relation's schema and `enumOrder: "alphabetical"` restores sorted tuples. Each setting works independently. Both migration notes retire in 7.0, and 8.0 removes both options ([8.0 migration](/switching#from-8-0-typeEnumsAcrossSchemas)). See the [migration for foreign enum placeholder imports](/switching#enum-types).

On partitioned tables the 7.x `UniqueIndex` follows the parent index. [`uniqueIndexConstraintsOnly: false`](/generator#generate.uniqueIndexConstraintsOnly) quietly restores the list of all the relation's unique indexes. The override goes in 8.0. See the [named conflict target migration](/switching#named-conflict-targets).

In 6.x the warnings for the six schema options are notes through [`warningListener`](/generator#generate.warningListener), not a `DeprecationWarning`, and come only when your schema has something they would change, once per run: `typeEnumsAcrossSchemas`'s names each column, `enumOrder`'s each enum, `uniqueIndexConstraintsOnly`'s each unique index, `domainsTypedByContext`'s, `enumArraysTypedAsText`'s and `intervalsTypedAsObjects`'s each column.

From 7.0, domain columns are typed by context. In raw rows, enum arrays are text and intervals are objects. The 6.x migration notes go away. `domainsTypedByContext: false` restores typing by placeholder through 7.x and goes in 8.0. For a raw direct domain over an enum array, `enumArraysTypedAsText: false` alone restores its placeholder. For fresh interval-domain text placeholders, set `intervalsTypedAsObjects: false`. The two parser choices, `enumArraysTypedAsText: false` and `intervalsTypedAsObjects: false`, remain available beyond 8.0. See [Domains, enum arrays and intervals in 7.0](/switching#domain-and-parser-types).

From 6.7 until 7.0, with `rejectOnQueryError` omitted or set to `null` in JSON, `generate()` and `tsForConfig()` sent `PGCAST_DEP006` to an enabled `warningListener` before exiting on a connection or query failure. From 7.0, both functions then reject with the original error, as [`check()`](/generator#export-check) does. The note is retired. In 7.x, set `rejectOnQueryError: false` to keep the CLI's immediate exit with code 1 on a connection or query failure. 8.0 removes the option: `generate()` always rejects, and the CLI prints the error and exits with code 1 itself ([decision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).

[`domainsTypedAsUnions`](/generator#generate.domainsTypedAsUnions), from 6.10, types a domain over `text` by the values its `CHECK` lists. It has no note and stays off in 7.0: a placeholder holding the domain's base type is how Zapatos types a domain, wider than the values but not wrong, as Postgres refuses the rest. 8.0 keeps it alone: each such domain's union is declared, and a fresh placeholder names it, while one already on disk keeps its `string`.

[`valuesTypedAsAliases`](/generator#generate.valuesTypedAsAliases) writes each column's value type in `Whereable`, `Insertable` and `Updatable` as an alias of `zapatos/db`, with the same types. It has no note, as there is nothing to migrate, and 8.0 keeps it alone.

[`topLevelSelectAsRows`](/runtime-config#Config.topLevelSelectAsRows), from 7.3.0, sends a `select()` run on its own as one row per result, with the same values. It never warns, and 8.0 keeps it alone: code that runs `.compile()`'s text itself reads `rows.map(r => r.result)`.

[`shortcutsUseJson`](/runtime-config#Config.shortcutsUseJson), from 7.3.0, builds the JSON of `select()` and its kin, and of the writes' `RETURNING`, with `json` functions, with the same values but for a row's key order and a nested result's type. It never warns, and 8.0 keeps it alone.

In 8.0 each option keeps one behaviour, the better one ([decision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).

## Further reading

- The entries this page talks about: [`Config.upsertRequiresSameKeys`](/runtime-config#Config.upsertRequiresSameKeys), [`Config.undefinedMeansMissing`](/runtime-config#Config.undefinedMeansMissing), [`Config.transactionRequiresCommit`](/runtime-config#Config.transactionRequiresCommit), [`Config.transactionRequiresIdleClient`](/runtime-config#Config.transactionRequiresIdleClient), [`Config.transactionRequiresSatisfyingLevel`](/runtime-config#Config.transactionRequiresSatisfyingLevel), [`Config.selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), [`Config.aggregatesTypedByColumn`](/runtime-config#Config.aggregatesTypedByColumn), [Opt-ins and warnings](/runtime-config#opt-ins-and-warnings), [`typeEnumsAcrossSchemas`](/generator#generate.typeEnumsAcrossSchemas), [`enumOrder`](/generator#generate.enumOrder), [`rejectOnQueryError`](/generator#generate.rejectOnQueryError), [`uniqueIndexConstraintsOnly`](/generator#generate.uniqueIndexConstraintsOnly), [`domainsTypedByContext`](/generator#generate.domainsTypedByContext), [`enumArraysTypedAsText`](/generator#generate.enumArraysTypedAsText), [`intervalsTypedAsObjects`](/generator#generate.intervalsTypedAsObjects), [`domainsTypedAsUnions`](/generator#generate.domainsTypedAsUnions), [`valuesTypedAsAliases`](/generator#generate.valuesTypedAsAliases), [`Config.topLevelSelectAsRows`](/runtime-config#Config.topLevelSelectAsRows), [An `undefined` value](/insert#undefined-values), [`conditions.not()`](/conditions#conditions.not), [`conditions.isNotIn()`](/conditions#conditions.isNotIn), [`selectExactlyOne()`](/select#selectExactlyOne), [`SchemaVersionCanary`](/generated-files#SchemaVersionCanary).
- The decision behind it: [decision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md), and every change by version in the [changelog](/changelog).
