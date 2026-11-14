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

Zapatos broke things in its majors too, each at once: 1.0 renamed the transaction types, 2.0 made the last argument of `upsert()` an options object, 6.0 put the schema in the names of tables and enums outside `public`. Each came with notes on what to rewrite.

pgcast spreads a break over two majors instead, and warns you ahead of the first.

## Four answers to a surprise

Characterising Zapatos 6.6.1 turned up dozens of surprises ([the report](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md)): SQL that Postgres refuses, results that contradict a function's name, holes in the escaping.

About half of them can't be fixed without changing a result that is valid today ([its Summary](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md#summary) keeps the count), and [decision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md) sorts those by a single question: could working code depend on what it does now? The report leaves a few as they are, each with its reason.

<div class="stack">

| Class | When | What changes for you | Example |
|---|---|---|---|
| Fix | Postgres or the type already refused it, or it contradicts the function's name; every security hole | at once; the changelog lists each result that changes | [`not()`](/conditions#conditions.not) negates its whole condition: `` not(sql`a OR b`) `` gave `(NOT a OR b)`, which Postgres reads `(NOT a) OR b` |
| Opt-in | the result is valid, and code may rely on it | nothing until you opt in; the old behaviour warns | an `undefined` value sent as `NULL`, until [`undefinedMeansMissing`](/runtime-config#Config.undefinedMeansMissing) makes it a missing key |
| Document | Postgres does it, or it is meant | nothing; the docs say so | [`isNotIn()`](/conditions#conditions.isNotIn) with a `NULL` in its list matches no row: that is how Postgres reads `NOT IN` |
| Leave | [the report](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md) gives the reason: the type protects, the case is rare, or a fix would need a guess | nothing | an `int[][]` column is typed `number[]`: Postgres doesn't enforce the dimensions, and stores one, two or three in it alike |

</div>

A fix can still stop a call that only worked through the bug. 6.6.2's escaping fixes are an example: a column name such as `id" AS "x` used to close its quotes and add an alias, and now names a column that doesn't exist. The changelog lists every such call, with what to write instead.

One opt-in will stay off for good. [`selectExactlyOne()`](/select#selectExactlyOne) asks Postgres for one row only, so it means "at least one", and Zapatos's own docs nest it in a `lateral`, where looking for a second row would duplicate the parent row.

Its option, [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), looks for a second row only in a query run on its own, never in one nested in another, never warns, and never becomes the default.

## Why an opt-in, not a breaking change

Take an `update()` with an `undefined` value:

<<< ./examples/plain/versions_undefined.ts{ts twoslash}

Zapatos 6.6.1 sends `SET ("tagline") = ROW($1)`<!-- probe: db.update('films', { tagline: undefined }, { id: 1002 }) --> with `null`, and the film loses its tagline. That may be a bug, a key copied from a form field that was never filled in; it may also be how a project clears a column.

pgcast can't tell which, and neither can your compiler: had 6.7 simply left the column out, that code would still compile, still run, and quietly stop clearing taglines.

So the new reading arrives as an option, off by default, and the old one warns when it runs. You switch when you're ready, one option at a time, with your tests to show what moved.

The pattern is borrowed: Node's own deprecation cycle (documented, then a warning at run time, then removed in a major), React Router's future flags, and TypeScript's `--strict` family, one option per safer behaviour.

The cost is a few more keys in [`Config`](/runtime-config#Config), and two paths in the code until 8.0. Each key is optional, so a `Config` written for Zapatos 6.6.1 still compiles.

## Reading a warning

Call that `update()` on 6.7 and Node prints, once:

```txt
(node:4242) [PGCAST_DEP002] DeprecationWarning: An undefined value in insert(), update() or upsert() is sent as NULL, or, in upsert() updateValues, set from EXCLUDED. Set undefinedMeansMissing: true (db.setConfig) to treat it as a missing key instead (DEFAULT in insert(), left out of update() and upsert()); it will be the default in pgcast 7.0.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

In brackets is the code, one per deprecated behaviour of the runtime, there to search for: [Opt-ins and warnings](/runtime-config#opt-ins-and-warnings) lists them, with what sets each off. Then the message says what still happens, which option changes it, and that 7.0 will make it the default.

Nothing else changes: the query runs as it did in 6.6.1, unless Node runs with `--throw-deprecation`, which ends the process ([Opt-ins and warnings](/runtime-config#opt-ins-and-warnings)).

The warning comes when you call the shortcut, before `.run()`, and only if the old behaviour is actually used: an `update()` with no `undefined` in it never warns.

It comes once per process for each code, so it tells you that the old path ran, not where nor how often. `node --trace-deprecation` adds the stack, down to the line that called `update()`; for the rest, turn the option on and let your tests find what changes.

`PGCAST_DEP003` comes later: once `transaction()` has sent `COMMIT` and Postgres has answered `ROLLBACK`, just before the promise resolves.

Where `undefined` meant "clear it", `null` says so under either setting, and never warns.

## 7.0 and 8.0

7.0 turns on by default the opt-ins that decision 003 lists: `upsertRequiresSameKeys`, `undefinedMeansMissing`, `transactionRequiresCommit` and those 6.7 still brings, except `selectExactlyOneChecksForSecondRow`, which stays off.

Decision 003 makes that the whole of 7.0's break, and the warnings announce it, so a project that has turned every option on, and sees no `PGCAST_DEP` warning nor generator note, has nothing to change. The old behaviours go in 8.0.

The generator gets opt-ins of its own in 6.7: [`typeEnumsAcrossSchemas`](/generator#generate.typeEnumsAcrossSchemas), which types an enum of another schema by its labels, and [`enumOrder`](/generator#generate.enumOrder), which keeps an enum's labels in their declared order.

Their warnings are notes through [`warningListener`](/generator#generate.warningListener), not a `DeprecationWarning`, and come only when your schema has something they would change, once per run: `typeEnumsAcrossSchemas`'s names each column, `enumOrder`'s each enum.

::: info Coming
6.6.2 is on npm, as [`@pgcast/pgcast`](https://www.npmjs.com/package/@pgcast/pgcast); 6.7.0, which brings the opt-ins, is in progress: [its milestone](https://github.com/AlexandreDemartin/pgcast/milestone/1).
:::

## Further reading

- The entries this page talks about: [`Config.upsertRequiresSameKeys`](/runtime-config#Config.upsertRequiresSameKeys), [`Config.undefinedMeansMissing`](/runtime-config#Config.undefinedMeansMissing), [`Config.transactionRequiresCommit`](/runtime-config#Config.transactionRequiresCommit), [`Config.selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), [Opt-ins and warnings](/runtime-config#opt-ins-and-warnings), [`typeEnumsAcrossSchemas`](/generator#generate.typeEnumsAcrossSchemas), [`enumOrder`](/generator#generate.enumOrder), [An `undefined` value](/insert#undefined-values), [`conditions.not()`](/conditions#conditions.not), [`conditions.isNotIn()`](/conditions#conditions.isNotIn), [`selectExactlyOne()`](/select#selectExactlyOne), [`SchemaVersionCanary`](/runtime-config#SchemaVersionCanary).
- The decision behind it: [decision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md), and every change by version in the [changelog](/changelog).
