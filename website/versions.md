---
description: "Why pgcast's version numbers carry on from Zapatos's, when a fix may change what your code gets back, and what a PGCAST_DEP00n warning asks of you."
---

# Versions

Why pgcast's version numbers carry on from Zapatos's, how it decides whether a fix may change what your code gets back, and what a `PGCAST_DEP00n` warning is asking of you.
{.lede}

## Carrying on from 6.6.1

pgcast starts where Zapatos 6.6.1 stopped, so its first version is 6.6.2, not 1.0. A number that carries on says exactly that: this is the next version of the library you already have.

The module names are still `zapatos/db` and `zapatos/schema`, and the generated schema keeps 6.6.1's [canary](/runtime-config#SchemaVersionCanary), so a project switches by changing its dependency, not its code ([Switch from Zapatos](/switching)).

The numbers follow [SemVer](https://semver.org/), read from the side of a project on 6.6.1:

- A patch fixes: 6.6.2 closes the security holes that pgcast's characterisation of 6.6.1 found.
- A minor adds: 6.7.0 brings the opt-ins below, with fixes and new features.
- Only a major may change a result that working code can rely on, so a range such as `^6.6.2` never brings one of those.

Each release, its security fixes included: the [changelog](/changelog); the latest: [`@pgcast/pgcast` on npm](https://www.npmjs.com/package/@pgcast/pgcast).

Zapatos broke things in its majors too, each at once: 1.0 renamed the transaction types, 2.0 made the last argument of `upsert()` an options object, 6.0 put the schema in the names of tables and enums outside `public`. Each came with notes on what to rewrite.

pgcast spreads a break over two majors instead, and warns you ahead of the first.

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

Two opt-ins will stay off for good: `selectExactlyOneChecksForSecondRow`, below, and the generator's [`domainsTypedAsUnions`](#_7-0-and-8-0). [`selectExactlyOne()`](/select#selectExactlyOne) asks Postgres for one row only, so it means "at least one", and Zapatos's own docs nest it in a `lateral`, where looking for a second row would duplicate the parent row.

Its option, [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), looks for a second row only in a query run on its own, never in one nested in another, never warns, and never becomes the default.

## Why an opt-in, not a breaking change

Take an `update()` with an `undefined` value:

<<< ./examples/plain/versions_undefined.ts{ts twoslash}

Zapatos 6.6.1 sends `SET ("tagline") = ROW($1)`<!-- probe: (db.setConfig({ undefinedMeansMissing: false }), db.update('films', { tagline: undefined }, { id: 1002 })) --> with `null`, and the film loses its tagline. That may be a bug, a key copied from a form field that was never filled in; it may also be how a project clears a column.

With the 7.0 defaults, `tagline: undefined` alone throws `nothing to update`. The update runs only if it assigns another column, in which case the stored tagline survives.

In 6.x the new reading arrives as an option, off by default, and the old one warns when it runs. You switch when you're ready, one option at a time, with your tests to show what moved.

The pattern is borrowed: Node's own deprecation cycle (documented, then a warning at run time, then removed in a major), React Router's future flags, and TypeScript's `--strict` family, one option per safer behaviour.

The cost is a few more keys in [`Config`](/runtime-config#Config), and two paths in the code until 8.0. Each key is optional, so a `Config` written for Zapatos 6.6.1 still compiles.

## Reading a warning

With the 6.7 defaults, if a `transaction()` callback catches a query error and Postgres answers `COMMIT` with `ROLLBACK`, Node prints this warning once:

```txt
(node:4242) [PGCAST_DEP003] DeprecationWarning: transaction() resolved, but Postgres answered its COMMIT with ROLLBACK: a query failed and the callback caught the error, so nothing was saved. Set transactionRequiresCommit: true (db.setConfig) to reject instead; it will be the default in pgcast 7.0.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

In brackets is the code, one per deprecated behaviour of the runtime, there to search for: [Opt-ins and warnings](/runtime-config#opt-ins-and-warnings) lists current warnings and their triggers. Then the message says what still happens, which option changes it, and that 7.0 will make it the default.

The promise resolves as in 6.6.1, even with `--throw-deprecation`, after which Node ends the process on the warning ([Opt-ins and warnings](/runtime-config#opt-ins-and-warnings)).

Each code warns once per process. `node --trace-deprecation` prints the stack. To find the other calls, turn the option on and run your tests.

In 6.x, `PGCAST_DEP004` warned when `Number()` changed an aggregate result. From 7.0, aggregates are typed by column by default.

Where `undefined` meant "clear it", `null` says so under either setting, and never warns.

## 7.0 and 8.0

Throughout 7.x, `aggregatesTypedByColumn: false` in both `db.setConfig()` and `ConfigTypes` restores numeric 6.x results without a warning. 8.0 removes this behaviour. [Migrating aggregates](/switching#from-7-0).

7.0 turns on by default the opt-ins that decision 003 lists: `upsertRequiresSameKeys`, `undefinedMeansMissing`, `transactionRequiresCommit`, `aggregatesTypedByColumn`, `transactionRequiresIdleClient`, `transactionRequiresSatisfyingLevel` and the generator's (below), except `selectExactlyOneChecksForSecondRow`, which stays off.

A project that has turned every option on and sees no `PGCAST_DEP` warning or generator note has nothing to change, except where it relies on the [read-only client types widened in 7.0](/switching#from-7-0). Throughout 7.x, `undefinedMeansMissing: false` and `upsertRequiresSameKeys: false` independently restore the 6.x write behaviours without warnings. 8.0 removes both legacy write behaviours. Across the other options, three legacy values remain: `rejectOnQueryError: false`, `enumArraysTypedAsText: false` and `intervalsTypedAsObjects: false` (below).

The generator gets opt-ins of its own in 6.7: [`typeEnumsAcrossSchemas`](/generator#generate.typeEnumsAcrossSchemas), which types an enum of another schema by its labels, [`enumOrder`](/generator#generate.enumOrder), which keeps an enum's labels in their declared order, [`rejectOnQueryError`](/generator#generate.rejectOnQueryError), which rejects `generate()` on a failed query rather than end the process, [`uniqueIndexConstraintsOnly`](/generator#generate.uniqueIndexConstraintsOnly), which lists in `UniqueIndex` only the names `ON CONFLICT ON CONSTRAINT` takes, [`domainsTypedByContext`](/generator#generate.domainsTypedByContext), which types a domain over `bigint`, `numeric`, `bytea`, `money` or a date, or over an array of one, by context, as its base type is, and a domain over a domain or an array of a domain, `any` without it, by the base type of its innermost domain, [`enumArraysTypedAsText`](/generator#generate.enumArraysTypedAsText), which types an array of an enum as the text `pg` returns in `Selectable`, and [`intervalsTypedAsObjects`](/generator#generate.intervalsTypedAsObjects), which types an `interval` in `Selectable` as `pg` parses it.

Their warnings are notes through [`warningListener`](/generator#generate.warningListener), not a `DeprecationWarning`, and come only when your schema has something they would change, once per run: `typeEnumsAcrossSchemas`'s names each column, `enumOrder`'s each enum, `uniqueIndexConstraintsOnly`'s each unique index, `domainsTypedByContext`'s, `enumArraysTypedAsText`'s and `intervalsTypedAsObjects`'s each column. `enumArraysTypedAsText: false` keeps the array with no note, in 7.0 and 8.0 alike, for a project that parses it with `pg.types.setTypeParser`; only the key left out switches in 7.0. `rejectOnQueryError`'s, `PGCAST_DEP006`, comes when a query fails, just before the process ends; never from the CLI, which always exits, nor from [`check()`](/generator#check), which rejects. In 7.0, `generate()` without the option rejects; `false` keeps the exit with no note, in 7.0 and 8.0 alike, since the exit is the CLI's own path. `intervalsTypedAsObjects: false` stays too, with no note, for a type parser of your own that returns an interval's text.

[`domainsTypedAsUnions`](/generator#generate.domainsTypedAsUnions), from 6.10, types a domain over `text` by the values its `CHECK` lists. It has no note and stays off in 7.0: a placeholder holding the domain's base type is how Zapatos types a domain, wider than the values but not wrong, as Postgres refuses the rest.

## Further reading

- The entries this page talks about: [`Config.upsertRequiresSameKeys`](/runtime-config#Config.upsertRequiresSameKeys), [`Config.undefinedMeansMissing`](/runtime-config#Config.undefinedMeansMissing), [`Config.transactionRequiresCommit`](/runtime-config#Config.transactionRequiresCommit), [`Config.transactionRequiresIdleClient`](/runtime-config#Config.transactionRequiresIdleClient), [`Config.transactionRequiresSatisfyingLevel`](/runtime-config#Config.transactionRequiresSatisfyingLevel), [`Config.selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), [`Config.aggregatesTypedByColumn`](/runtime-config#Config.aggregatesTypedByColumn), [Opt-ins and warnings](/runtime-config#opt-ins-and-warnings), [`typeEnumsAcrossSchemas`](/generator#generate.typeEnumsAcrossSchemas), [`enumOrder`](/generator#generate.enumOrder), [`rejectOnQueryError`](/generator#generate.rejectOnQueryError), [`uniqueIndexConstraintsOnly`](/generator#generate.uniqueIndexConstraintsOnly), [`domainsTypedByContext`](/generator#generate.domainsTypedByContext), [`enumArraysTypedAsText`](/generator#generate.enumArraysTypedAsText), [`intervalsTypedAsObjects`](/generator#generate.intervalsTypedAsObjects), [`domainsTypedAsUnions`](/generator#generate.domainsTypedAsUnions), [An `undefined` value](/insert#undefined-values), [`conditions.not()`](/conditions#conditions.not), [`conditions.isNotIn()`](/conditions#conditions.isNotIn), [`selectExactlyOne()`](/select#selectExactlyOne), [`SchemaVersionCanary`](/runtime-config#SchemaVersionCanary).
- The decision behind it: [decision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md), and every change by version in the [changelog](/changelog).
