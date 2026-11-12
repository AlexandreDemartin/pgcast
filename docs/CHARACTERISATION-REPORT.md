# Characterisation report

What steps 1.1 to 1.5 found in Zapatos 6.6.1. Nothing is fixed: each finding is pinned as it is by its test, and the fixes become the sub-issues of the chapter 2 Epic, [#18](https://github.com/AlexandreDemartin/pgcast/issues/18).

Sources: the "Surprises" sections of PRs #4, #5, #7 and #8, the `characterization:` tests of `test/`, and a reading of `src/db/transaction.ts`.

## Summary

| Severity | Findings | Breaking | Non-breaking |
|---|---|---|---|
| Security | 7 | 1 | 6 |
| Data loss | 3 | 3 | 0 |
| Wrong result | 12 | 11 | 1 |
| Invalid SQL or error | 9 | 0 | 9 |
| Wrong type | 15 | 7 | 8 |
| Codegen | 11 | 4 | 7 |
| Docs | 4 | 3 | 1 |
| **Total** | **61** | **29** | **32** |

32 findings to fix, 17 to document and 12 to leave.

The three that matter most:

1. **R1**: a `"` in an identifier is not doubled. A `Whereable` key from outside can widen a filter to every row, or run a second statement without parameters.
2. **R8**: a multi-row `upsert` erases, on an existing row, the value of a column missing from another row.
3. **R9**: an `undefined` value in `update()` sets the column to `NULL` instead of leaving it.

## Reading the table

- **Test that pins it**: `file › test name`. The path starts from `test/`, without `.test.ts` or `.test-d.ts`. The `characterization:` prefix is left out.
- `integration/codegen › <variant>`: the `tsForConfig()` test of that variant, which pins its snapshot.
- **Compat**: the effect of the fix on Zapatos 6.6.1 (skill `backward-compat`).
  - *Non-breaking*: Postgres already refused this SQL, or the type already refused the call.
  - *Breaking*: a result valid today changes; it is a stop point for the user.
- **Corpus**: the pattern as the usage corpus meets it (skill `consumer-usage`).
- A PR title is given only for a finding to fix.

## Security

| # | Area | Finding | Test that pins it | Compat | Proposal | Title of the fix PR |
|---|---|---|---|---|---|---|
| R1 | `core.ts` | A `"` is not doubled in an identifier (`Table`, `Column`, `Whereable` key, `cols`, `parent()`, `columns`, `order.by`…): the string closes the name. With parameters, a filter returns every row; without parameters, a second statement runs. | `` integration/injection › a `"` in a Whereable key stays in one column name, which does not exist `` ; `` integration/injection › a `"` in a string identifier stays in one column name, which does not exist `` ; `integration/injection › no hostile string identifier runs SQL of its own, as a column, a table or a Whereable key` ; `integration/injection › a string that already reads as quoted names is written as is, and stays one name` ; `unit/core › doubles an embedded double quote` | non-breaking, except a name that closes its quotes for an alias, a cast or a second element | **fixed**, PR #74 | Double embedded quotes in identifiers, so a name cannot close its quotes |
| R2 | `core.ts` | A string that starts and ends with `"` is written raw, even a lone `"`: the second statement gets through. | `integration/injection › a pre-quoted string identifier is raw and runs a second statement` ; `unit/core › anything that starts and ends with a double quote passes through raw` | non-breaking if `"a"` and `"a"."b"` still pass | fix: accept only a well-formed quoted identifier | Pass a string through as already quoted only if it is a well-formed quoted identifier |
| R3 | `core.ts` | The type of a `param(x, cast)` cast is not escaped (`CAST($n AS "${cast}")`): it can read another row. | `` integration/injection › a `"` in a param cast stays in one type name, which does not exist `` ; `integration/injection › no hostile cast reads anything: each is a missing type, a syntax error or a harmless name` ; `` unit/injection › the cast type is one quoted identifier: `"` is doubled `` ; `unit/injection › a cast is written as is only if it is well-formed once quoted` | non-breaking | **fixed**, PR #70 | Escape quotes in the type name of a param() cast |
| R4 | `shortcuts.ts` | A string in the `updateValues` of `upsert` is compiled as an identifier (`ROW("x")`, with R1's break-out); a number throws "Alien object". The type accepts both. | `integration/shortcuts › updateValues with a plain string fails` ; `unit/injection › upsert updateValues keys, and string values compiled as identifiers` ; `types/core › updateValues with a plain value is accepted, the runtime refuses it` | breaking: a string that names a column copies it today | fix: a parameter, as the type promises | Send plain updateValues in upsert as parameters, not identifiers |
| R5 | `shortcuts.ts`, `transaction.ts` | Keywords typed as literals are written `raw` without a check: `lock.for`, `lock.wait`, the options of `truncate`, the isolation level of `transaction()`. Without parameters, `lock.for` runs a second statement. | `integration/injection › lock.for is checked before any query` ; `unit/injection › truncate options are checked at run time` ; `unit/injection › the isolation level is checked before any query` | non-breaking: the type already refuses | **fixed**, PR #14 | Check lock, truncate and isolation level keywords at run time |
| R6 | `shortcuts.ts` | The `aggregate` of `select()`, a public 5th argument typed `string`, is written `raw`: without `where`, a second statement runs. | `integration/injection › the aggregate of select() is raw and runs a second statement` | non-breaking: a function name still passes | **fixed**, PR #17 | Accept only a function name as the aggregate of select() |
| R7 | `shortcuts.ts` | The `lateral` keys, the `alias` and the table name of `select` are written raw into `"lateral_…"` and `"sq_…"`: the same break-out as R1. | `` unit/injection › a lateral key is one identifier in "lateral_<key>": `"` is doubled, `.` does not split `` ; `` unit/injection › the alias is one identifier in "sq_<alias>" too: `"` is doubled, `.` does not split `` ; `` unit/injection › the table name is one identifier in "sq_<table>" too: `"` is doubled, `.` does not split `` ; `integration/injection › no hostile table name, alias or lateral key of select() runs SQL of its own` ; `integration/injection › an alias that closes its quotes stays one alias, in "sq_<alias>" too` | non-breaking: no call that returned rows under 6.6.1 stops | **fixed**, PR #76 | Double embedded quotes in lateral keys and aliases too |

## Data loss

| # | Area | Finding | Test that pins it | Compat | Proposal | Title of the fix PR |
|---|---|---|---|---|---|---|
| R8 | `shortcuts.ts` | A multi-row `upsert` fills a missing key with `DEFAULT`, then `SET col = EXCLUDED.col` overwrites the existing value. Corpus: some fifteen `upsert`s of arrays. | `integration/shortcuts › in several rows, a key missing from one row overwrites with DEFAULT on UPDATE` | breaking | fix: an error if the rows do not have the same keys and no `updateColumns` is given; Postgres cannot tell an inserted `DEFAULT` apart | Make upsert throw on rows with different keys unless updateColumns is given |
| R9 | `shortcuts.ts` | An `undefined` value in an `Updatable` sets the column to `NULL` instead of leaving it. Corpus: objects stripped of their `undefined` keys before an `update`. | `integration/shortcuts › an undefined value sets the column to NULL` ; `unit/shortcuts › an undefined value` | breaking | fix: omit the key, as `JSON.stringify` does; after R24 (no column left) | Leave undefined values out of update(), rather than setting them to NULL |
| R10 | `transaction.ts` | On a client already in a raw `BEGIN`, `transaction()` commits the outer transaction (same level) or rolls it back and loses its write (another level, 25001). | `integration/transaction › on a client already in a raw BEGIN, at the same level, it commits the outer transaction` ; `integration/transaction › on a client already in a raw BEGIN, at another level, it rolls back the outer transaction` | breaking | document: node-postgres does not expose the transaction state; only a client from `transaction()` is recognised | — |

## Wrong result

| # | Area | Finding | Test that pins it | Compat | Proposal | Title of the fix PR |
|---|---|---|---|---|---|---|
| R11 | `shortcuts.ts` | An `undefined` value in an `Insertable` sends `NULL`, not `DEFAULT`: a nullable column loses its default, a `NOT NULL DEFAULT` one fails. | `integration/shortcuts › an undefined value inserts NULL, not the column DEFAULT` ; `unit/shortcuts › values: SQLFragment, Parameter with a cast, Default, undefined` | breaking | fix: `DEFAULT`, as for a key missing from a multi-row `insert` | Insert DEFAULT for an undefined value, as for a missing key |
| R12 | `conditions.ts` | `not()` does not parenthesise its fragment: `` not(sql`a OR b`) `` reads `(NOT a) OR b`. | `integration/conditions › not() does not parenthesise a fragment` | breaking | fix: the fix is one line | Fix not() so it parenthesises its condition |
| R13 | `core.ts` | A `Parameter`, a `raw` or `Default` as a `Whereable` value, or in `vals([…])` (so `isIn`), becomes a second parameter: `'{"value":1}'`, `'Symbol(DEFAULT)'`. The type accepts `Parameter`. On a text, the filter finds nothing, with no error. | `integration/core › a Parameter value fails` ; `integration/core › vals of an array fails on a Parameter or Default element` ; `types/core › a Parameter in a Whereable is accepted, the runtime wraps it twice` | breaking: on a text, the empty result changes | fix: compile the `Parameter` as it is; refuse `Default` in a filter | Compile a Parameter in a Whereable or in vals() as a parameter, not as JSON |
| R14 | `shortcuts.ts` | `selectExactlyOne` never sees a second row (`LIMIT 1`): "exactly one" means "at least one". Corpus: hundreds of calls. | `integration/shortcuts › selectExactlyOne does not check for a second row` | breaking | fix: `LIMIT 2` and `NotExactlyOneError`; the name promises it, the corpus usage makes it a stop point to weigh | Make selectExactlyOne throw when there is a second row |
| R15 | `shortcuts.ts` | `upsert` also rewrites the conflict column: a `citext` email takes the new case. | `integration/shortcuts › the conflict column itself is rewritten` | breaking | document: removing it would empty `updateColumns` when every column is the target, and `upsert` would no longer return the row | — |
| R16 | `shortcuts.ts` | `sum`, `avg`, `min`, `max` pass the result to `Number()`: `0` on an empty set, epoch ms for a date, `NaN` for a text. | `integration/shortcuts › on an empty set, sum / avg / min / max return 0, not null` ; `integration/shortcuts › min / max of a date is a timestamp in ms, of a text NaN` | breaking: the returned type changes | opt-in (note 003 revised): `null` on an empty set and `min` / `max` typed by column, #67 | Make numeric aggregates honest about NULL and column types |
| R17 | `shortcuts.ts` | An `int8` or `numeric` beyond 2^53 is rounded: default rows (through `to_jsonb`), aggregates always. `enableCustomJSONParsingForLargeNumbers` saves rows only. | `integration/shortcuts › a full row comes through to_jsonb, int8 beyond 2^53 included` ; `integration/shortcuts › with enableCustomJSONParsingForLargeNumbers, an int8 beyond 2^53 is a string` ; `integration/shortcuts › an int8 or numeric result beyond 2^53 loses precision` | breaking | document: the option exists for rows; aggregates are typed `number` | — |
| R18 | `core.ts` | `{ col: undefined }` (or `null`) in a `Whereable`, and `eq(null)`, compile to `"col" = $n`: no row. | `integration/core › a null or undefined value matches no row` ; `integration/conditions › eq(null) matches no row` | breaking for `undefined`; `null` and `eq(null)` are already refused by the type | document: `isNull` exists; ignoring the key would widen a `deletes` to the whole table | — |
| R19 | `conditions.ts` | `isNotIn([2, null])` finds no row. | `integration/conditions › isNotIn with a null in the list matches no row` | breaking | document: it is the SQL semantics of `NOT IN` | — |
| R20 | `conditions.ts` | A `Date` on a `date` column keeps the local day and loses the time; `subtract(date)` gives days. | `integration/conditions › date: the local day of the Date, its time dropped` | breaking | document: it is node-postgres and Postgres | — |
| R21 | `shortcuts.ts` | `withTies` without `limit` is silently ignored; without `order`, Postgres refuses it. | `unit/shortcuts › limit, offset, withTies` ; `integration/shortcuts › withTies without order is a Postgres error` | breaking | document | — |
| R22 | `transaction.ts` | A transaction client passed through keeps its level: `serializable(clientReadCommitted, …)` is not checked at run time. | `integration/transaction › passes a transaction client through: no nested transaction, whatever the level asked` | non-breaking: the type already refuses | leave: the type protects; a check would need the table of levels at run time | — |

## Invalid SQL or error

| # | Area | Finding | Test that pins it | Compat | Proposal | Title of the fix PR |
|---|---|---|---|---|---|---|
| R23 | `conditions.ts` | `and()` and `or()` with no argument compile to `()` (42601). Corpus: a helper that returns `TRUE` when there is no fragment, dozens of length guards before `and(...)`. | `unit/conditions › and() / or() without argument compile to ()` ; `integration/conditions › and() / or() without argument are a syntax error` | non-breaking | fix: `TRUE` and `FALSE` | Make and() and or() with no arguments compile to TRUE and FALSE |
| R24 | `shortcuts.ts` | `update(t, {}, …)` compiles to `SET () = ROW()` (42601). | `unit/shortcuts › no column at all` ; `integration/shortcuts › no column at all is a syntax error` | non-breaking | fix: an error that says what to do | Make update() with no columns throw a helpful error |
| R25 | `shortcuts.ts` | Three aggregate options compile invalid SQL: no `columns` (`sum(*)`, 42883), several `columns` (`count("id", "mood")`), a passthru `lateral` (`SELECT  AS result`). | `integration/shortcuts › sum, avg, min, max without columns fail` ; `integration/shortcuts › several columns fail` ; `integration/shortcuts › a passthru lateral is a syntax error` | non-breaking | fix: the type refuses them, the runtime too | Refuse aggregate options that cannot compile |
| R26 | `transaction.ts` | A `pg.native.Client` is classed `'pool'`: `transaction()` calls `connect()` on it, which fails if it is already connected ("Client has already been connected"), then `release()`, which does not exist. | none: seen on reading, not tested (pg-native absent) | non-breaking | fix: `'client'` | Treat a native pg client as a client, not a pool, in transaction() |
| R27 | `core.ts` | With `castArrayParamsToJson`, an array becomes `CAST($n AS "json")`, even with `param(arr, 'int4[]')`: `=` and `@>` fail on an array column. | `unit/core › a JSON cast wins over a text cast when the config asks for it` ; `integration/core › castArrayParamsToJson breaks comparing an array column with an array value` ; `integration/conditions › castArrayParamsToJson breaks the array operators` | non-breaking | fix: an explicit cast wins over the config | Let an explicit param() cast win over castArrayParamsToJson |
| R28 | `core.ts` | `param(x, 'public.mood')` and `param(x, 'int[]')` quote the whole name: the type does not exist (42704). | `unit/core › with a text cast: CAST($n AS "type"), the type quoted as one identifier` ; `integration/core › a schema-qualified or array type cast fails` | non-breaking | fix: quote each part, `[]` outside the quotes; after R3 | Allow schema-qualified and array types in param() casts |
| R29 | `shortcuts.ts` | `distinct: true` with an `order` on a column fails (42P10): `DISTINCT` applies to the JSON. | `integration/shortcuts › distinct: true with an order on a column fails` | non-breaking | document | — |
| R30 | `shortcuts.ts` | A `lock` without `of` with an aggregate `lateral` fails (0A000): `FOR UPDATE` reaches the subqueries. | `` integration/shortcuts › a lock without `of` fails with an aggregate lateral `` | non-breaking | document: `of` limits it to the table | — |
| R31 | `shortcuts.ts` | `insert(t, [])` forced by `run(c, true)` fails if the first column is `GENERATED ALWAYS` (428C9). | `integration/shortcuts › an empty array, forced, can still fail` | non-breaking | leave: forcing a no-op is a niche case | — |

## Wrong type

| # | Area | Finding | Test that pins it | Compat | Proposal | Title of the fix PR |
|---|---|---|---|---|---|---|
| R32 | types | `upsert` accepts the `Constraint` of another table; Postgres refuses it at run time. | `types/shortcuts › upsert accepts the constraint of another table` | non-breaking | fix | Refuse a constraint of another table in upsert |
| R33 | types | `add()` and `subtract()` refuse a `Parameter`, which the runtime accepts; yet `add(1)` on a date is ambiguous (42725) without a cast. | `types/core › add() and subtract() refuse a Parameter, which the runtime accepts` ; `integration/conditions › add a number of days to a date needs a cast` | non-breaking: the type widens | fix | Allow a Parameter in add() and subtract(), for date arithmetic |
| R34 | types | `arrayContains`, `arrayContainedIn`, `arrayOverlaps` are typed on the element: `{ scores: arrayContains([1]) }` is refused. Corpus: all three rewritten as home-made fragments. | `types/core › array conditions are typed on the element, not on the column` | non-breaking if the workaround `arrayContains<number[]>([[1]])` still compiles | fix | Type the array conditions on the array column, not on its element |
| R35 | types | `columns: [...] as const` gives `never[]`. | `types/core › columns as a readonly tuple gives never[]` | breaking: the returned type widens | fix | Accept a readonly array as the columns option |
| R36 | types | An inline `` sql`${self} = 1` `` in a `Whereable` of `select` is refused: `Constraint` is inferred before `T`. | `` types/core › an inline sql`${self} …` in a Whereable is refused `` | non-breaking | document: `sql<db.SQL>` or a fragment declared beforehand; fixing it touches the inference of every shortcut | — |
| R37 | types | An untyped `` sql`…` `` in `lateral` makes its key `any`, with no error. | ``` types/core › an untyped sql`` lateral is `any` ``` | breaking: refusing it would break these calls | document: type the fragment | — |
| R38 | types | `parent('col')` is not checked against the parent table. | `types/core › parent() is not checked against the parent table` | breaking | leave: the type does not know the parent table (③, [#54](https://github.com/AlexandreDemartin/pgcast/issues/54)) | — |
| R39 | types | A passthru `lateral` is refused as soon as `columns` or `extras` is set. | `types/core › a passthru lateral is refused after columns or extras` | non-breaking | leave: at run time, `columns` would be ignored; the type protects | — |
| R40 | codegen | An enum of another schema becomes an `any` custom type (`products.status`, `public.mood[]` in `extra`). | `` integration/codegen › types enums of another schema as custom types (`any` placeholder) `` ; `` types/schema › another schema (products.status, extra.status) is `any` `` | breaking: `any` becomes a union | fix | Type enums of other schemas as enums, not as custom types |
| R41 | codegen | Unique indexes are joined by name, across all schemas: `public.transfers.UniqueIndex` contains the unique index of `extra.articles`. | `integration/codegen › matches unique indexes by name across schemas` | non-breaking: Postgres refuses this `ON CONSTRAINT` | fix | Match unique indexes by table, not by name alone |
| R42 | codegen | Two custom types with the same transformed name in two schemas share a placeholder; the last one written wins. | none: seen on reading (PR #4), the fixture does not show it reliably | non-breaking: a warning | fix: warn; renaming the placeholders would break edited files | Warn when two custom types share a placeholder name |
| R43 | codegen | A two-dimensional array (`int[][]`) is typed as one-dimensional. | `types/schema › two dimensions (accounts.grid int[][]) are typed as one` | breaking | leave: Postgres does not enforce the number of dimensions | — |
| R44 | codegen | A view has an `Insertable` where every column is optional and nullable. | `types/schema › a view (active_users) has an Insertable, every column optional and nullable` | breaking | document: Postgres makes the columns of a view nullable | — |
| R45 | codegen | A composite (`users.home`) is an `any` placeholder. | `` types/schema › a composite (users.home) is an `any` placeholder `` | breaking | leave: that is what the `zapatos/custom` placeholders are for | — |
| R46 | types | `src/db` compiles only against the stub schema; against a generated schema, the body of `upsert` gives TS7053 and TS2345. | `integration/codegen › src/db type-checks against the stub schema of src/typings, not against a generated one` | non-breaking | leave: a consumer compiles the declarations, which pass | — |

## Codegen

| # | Area | Finding | Test that pins it | Compat | Proposal | Title of the fix PR |
|---|---|---|---|---|---|---|
| R47 | codegen | The output does not parse with awkward names: `export type traffic-light`, `namespace odd table`, `namespace class`, `'amber's'`, and `*/` in a name, a `DEFAULT` or a comment. | `integration/codegen › edge: the output does not parse` | non-breaking | fix | Quote awkward names and escape comments so the generated schema always parses |
| R48 | codegen | A multi-line `COMMENT ON COLUMN` breaks the JSDoc: the following lines lose ` * `. | `integration/codegen › keeps column comments of tables and materialized views only` | non-breaking | fix | Prefix every line of a multi-line column comment |
| R49 | codegen | Column comments are lost on partitioned tables, foreign tables and views (`relkind = 'r'` only). | `integration/codegen › keeps column comments of tables and materialized views only` | non-breaking: JSDoc only | fix | Keep column comments on views, foreign tables and partitioned tables |
| R50 | codegen | The values of an enum are sorted alphabetically, not by `enumsortorder`, down to the `every.<enum>` tuple. | `integration/codegen › sorts enum values alphabetically, not in declaration order (enumsortorder)` | breaking: the order of the tuple changes | fix: the declared order has a meaning in Postgres (`<` on an enum) | Keep enum values in their declared order |
| R51 | codegen | An `include` entry that names no table is silently ignored. | `integration/codegen › include-exclude-lists` (snapshot `include-exclude-lists.d.ts`) | non-breaking: a warning | fix: warn | Warn about an include entry that matches no table |
| R52 | codegen | In `columnOptions`, a table entry replaces the column's `'*'` entry wholesale; only prefixed schemas take a prefix, so `'public.accounts'` finds nothing. | `integration/codegen › columnOptions` (snapshot `columnOptions.d.ts`) | breaking | document | — |
| R53 | codegen | `COMMENT ON` tables, views, schemas, enums and domains is ignored. | `integration/codegen › drops COMMENT ON of tables, views, schemas and types` | non-breaking | leave: it is an addition, not a fix (④, [#55](https://github.com/AlexandreDemartin/pgcast/issues/55)) | — |
| R54 | codegen | Partitions (`events_2025`…) come out as tables beside their parent. | `integration/codegen › writes zapatos/schema.d.ts, one placeholder per custom type and custom/index.d.ts, as in test/generated` | breaking | leave: Postgres allows writing into a partition | — |
| R55 | codegen | Every column of a materialised view is nullable. | `integration/codegen › writes zapatos/schema.d.ts, one placeholder per custom type and custom/index.d.ts, as in test/generated` | breaking | leave: Postgres does not keep `NOT NULL` on a materialised view | — |
| R56 | codegen | With no relation at all, the comment "`never` rather than `any` would be more accurate" precedes types that are already `never`. | `integration/codegen › exclude-star` (snapshot `exclude-star.d.ts`) | non-breaking | leave: only seen with no relation at all | — |
| R57 | codegen | The `customTypes` object of `tsForConfig()` follows the order in which the queries return. | none: seen on reading (PR #4); the written files do not depend on it | non-breaking | leave | — |

## Docs

| # | Area | Finding | Test that pins it | Compat | Proposal | Title of the fix PR |
|---|---|---|---|---|---|---|
| R58 | `core.ts` | Interpolating `null` throws a `TypeError` instead of the "Alien object" error; `parent()` with no column outside a `Whereable` writes `"t".` before throwing on `undefined`. | `unit/core › null reaches the Whereable branch and throws a TypeError` ; `unit/core › parent() with no column and no current column` | non-breaking: the call already fails | fix: an error that says what to do | Give a helpful error on interpolating null or a column-less parent() |
| R59 | `shortcuts.ts` | `selectOne` overrides the `limit` option. | `unit/shortcuts › the limit option is overridden` | breaking | document | — |
| R60 | `core.ts` | `param(x, true)` acts only on an array or a plain object: a scalar gets neither a cast nor `JSON.stringify`. | `unit/core › with true, a scalar or a non-plain object is neither stringified nor cast` | breaking | document | — |
| R61 | `core.ts` | `queryListener` and `resultListener` are also called for a no-op. | `integration/core › queryListener and resultListener see every run, no-ops included` | breaking | document | — |
