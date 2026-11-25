# What's new

What pgcast adds to Zapatos 6.6.1, one line each: the version it came in, and a link to the entry or guide that explains it. What changed in Zapatos's own behaviour is [at the end](#what-changed).
{.lede}

## Queries and shortcuts

| Addition | From |
|---|---|
| [`withCTEs()`](/sql-template#withCTEs): CTEs before a shortcut, its result type kept | 6.11.0 |
| [`selectRows()`](/select#selectRows): the query of `select()` as a fragment, one row per result, for a [cursor](/cursors) | 6.12.0 |
| [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow): `selectExactlyOne()` throws on a second row, opt-in | 6.7.0 |
| [`topLevelSelectAsRows`](/runtime-config#Config.topLevelSelectAsRows): `select()` run on its own sends one row per result, the same array, opt-in | 7.3.0 |
| [`shortcutsUseJson`](/runtime-config#Config.shortcutsUseJson): `select()` and its kin, and the writes' `RETURNING`, build their JSON with `json` functions, the same values, opt-in | 7.3.0 |
| [`ReturningTypeForTable`](/insert#ReturningTypeForTable) and [`UpsertReturnableForTable`](/insert#UpsertReturnableForTable), exported: the row a write returns, to type a fake result | 6.7.0 |
| [`UpsertOptions`](/insert#UpsertOptions) and [`OrderSpecForTable`](/select#OrderSpecForTable), exported, so that a package's declarations can name them | 6.9.0 |

## Conditions

| Addition | From |
|---|---|
| [`eqAny()`](/conditions#conditions.eqAny): equal to an item of an array, the whole array one parameter | 6.9.0 |
| [`likeAny()`](/conditions#conditions.likeAny) and [`ilikeAny()`](/conditions#conditions.ilikeAny): matches one of several patterns, all of them one parameter | 6.12.0 |
| [`jsonbContains()`](/conditions#conditions.jsonbContains) and [`jsonbPathExists()`](/conditions#conditions.jsonbPathExists), on a `jsonb` column | 6.9.0 |
| [`exists()`](/conditions#conditions.exists) and [`isInSelect()`](/conditions#conditions.isInSelect): a subquery on a table, its filter typed by that table | 6.9.0 |
| [`websearchToTsquery()`](/conditions#conditions.websearchToTsquery): full-text search on a `tsvector` column | 6.9.0 |

## Transactions

| Addition | From |
|---|---|
| [`savepoint()`](/transaction#savepoint): a unit of work that can fail alone ([Savepoints](/savepoints)) | 6.12.0 |
| [`advisoryXactLock()`](/transaction#advisoryXactLock): work that runs one at a time across connections ([Retries](/retries)) | 6.12.0 |
| [`setLocal()`](/transaction#setLocal): settings for the rest of the transaction, which a policy reads ([Row security](/row-security)) | 6.12.0 |
| [`cursor()`](/transaction#cursor): a large result read in batches ([Cursors](/cursors)) | 6.12.0 |
| [`transactionEventListener`](/runtime-config#Config.transactionEventListener): each rollback, retry and give-up of `transaction()` as a [`TransactionEvent`](/runtime-config#TransactionEvent), its fields ready for a log or a metric | 6.12.0 |

## Generator

| Addition | From |
|---|---|
| [`--check`](/generator#check), and [`check()`](/generator#export-check) from code: exits with code 1 when the generated files no longer match the database, and writes nothing | 6.8.0 |
| [`--help`](/generator#cli): the usage, the config files and the flags | 6.12.0 |
| [`constraintNames`](/generator#generate.constraintNames): each relation's constraint names in a `Constraint` type, to check an error's constraint | 7.1.0 |
| [`domainsTypedAsUnions`](/generator#generate.domainsTypedAsUnions): a domain over `text` whose `CHECK` lists its values, typed as their union, opt-in | 6.10.0 |
| [`moduleNames`](/generator#generate.moduleNames) and `pgcastconfig.json`: imports from `pgcast/db`, and no file named after Zapatos | 6.7.0 |
| [`SchemaRules`](/generator#SchemaRules) and [`ColumnOptions`](/generator#ColumnOptions), exported from `zapatos/generate`, so that a package's declarations can name them | 6.9.0 |
| [`valuesTypedAsAliases`](/generator#generate.valuesTypedAsAliases): each column's value type in `Whereable`, `Insertable` and `Updatable` named by an alias of `zapatos/db`, the same types in a smaller file, opt-in | 7.2.0 |

## Drivers and adapters

| Addition | From |
|---|---|
| [`QueryableLike`](/sql-template#QueryableLike) and [`PoolLike`](/transaction#PoolLike): `run()` and `transaction()` on [a driver of your own](/drivers#a-driver-of-your-own), or on [a fake for tests](/drivers#a-fake-for-tests) | 6.12.0 |
| [`@pgcast/adapter-postgres-js`](/drivers#postgres-js): pgcast on postgres.js 3.4 or 4.x | 0.1.0 |
| [`@pgcast/adapter-pglite`](/drivers#pglite): pgcast on PGlite 0.5.x, in Node or in a page | 0.1.0 |

Each adapter is a package of its own, with its own versions, and takes pgcast 6.12.0 or later.

## Typed SQL

| Addition | From |
|---|---|
| [`pgcast-typegen`](/typed-sql): the row type of a named `sql` query, as Postgres describes it | 0.1.0 |
| [`pgcast-typegen --check`](/typed-sql#check-in-ci): the committed row types against your queries, offline or on a database | 0.1.0 |
| [`NotNull`](/typed-sql#narrow-a-column): removes `null` from the columns you name | 0.1.0 |
| [`pgcast-typegen --watch`](/typed-sql#what-stays-manual): the row types again each time a source file changes | 0.2.0 |

The tool is `@pgcast/typegen`, a package of its own, with its own versions, and takes pgcast 7.1.0 or a later 7.x.

## Tooling

| Addition | From |
|---|---|
| [Playground](/playground): a query on the docs schema, its SQL and its type as you type, run on Postgres in the page, shared by its URL | 6.7.0 |
| [AI assistants](/ai-assistant): the docs as `llms.txt`, each page to copy, and a rules file for your project | 6.7.0 |
| Releases published from CI, each with an npm provenance attestation that ties it to its commit | 6.8.0 |
| [A private report](/security#report-a-flaw) of a flaw, and a security policy | 6.7.0 |

## What changed {#what-changed}

- **Security**: holes that Zapatos 6.6.1 shares, closed from 6.6.2 on ([Security](/security#what-changed-from-zapatos-6-6-1), [fixes by release](/security#fixes-by-release)).
- **Fixes**: a call that Postgres refused throws a helpful error first, and a result that contradicted its function's name, type or docs now matches it (§ Fixed of each release in the [changelog](/changelog)).
- **Defaults**: thirteen opt-ins of 6.x are the defaults from 7.0 ([Switch from Zapatos](/switching#from-7-0), [Versions](/versions)).
