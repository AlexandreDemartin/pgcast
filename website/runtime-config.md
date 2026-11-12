# Run-time configuration and utility types

What `zapatos/db` lets you set while your code runs: `setConfig()` and each option of `Config`, the listeners, the opt-ins and their warning codes. Then the types the generated schema gives values that JSON or `pg` hand back as strings, and the helpers that convert them.
{.lede}

## `setConfig()` {#setConfig}

```ts
db.setConfig(newConfig: NewConfig): Config
```

Sets the keys of `newConfig` on the configuration, and leaves the others as they are. There is one configuration per process, shared by `import` and `require`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({
  transactionAttemptsMax: 3,
  transactionRetryDelay: { minMs: 50, maxMs: 500 },
  undefinedMeansMissing: true,
});
```

- The merge is one level deep: `transactionRetryDelay` is replaced whole, so the type needs both `minMs` and `maxMs`.
- A key you give as `undefined` is set to `undefined`: it does not go back to its default, and it compiles.
  - After `setConfig({ transactionAttemptsMax: undefined })`, `transaction()` gives up after its first attempt ("… on attempt 1 of undefined, giving up", [#179](https://github.com/AlexandreDemartin/pgcast/issues/179)).
  - After `setConfig({ transactionRetryDelay: undefined })`, every `transaction()` rejects with "TypeError: Cannot destructure property 'minMs' of 'config.transactionRetryDelay' as it is undefined.", and never releases the client it took from a pool ([#182](https://github.com/AlexandreDemartin/pgcast/issues/182)).
- It returns the new configuration itself, not a copy, so changing that object changes the configuration.
- An unknown key does not compile (TS2353), and neither does a value of the wrong type (TS2322):

```ts twoslash
// @errors: 2353
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({ retries: 3 });
```

## `getConfig()` {#getConfig}

```ts
db.getConfig(): Config
```

A copy of the configuration. The copy is one level deep: `getConfig().transactionAttemptsMax = 1` changes nothing, but `getConfig().transactionRetryDelay.minMs = 1` changes the configuration, since that object is shared.

## `Config` {#Config}

```ts
interface Config {
  transactionAttemptsMax: number;
  transactionRetryDelay: { minMs: number; maxMs: number };
  castArrayParamsToJson: boolean;
  castObjectParamsToJson: boolean;
  upsertRequiresSameKeys?: boolean;
  undefinedMeansMissing?: boolean;
  queryListener?(query: SQLQuery, txnId?: number): void;
  resultListener?(result: any, txnId?: number, elapsedMs?: number, query?: SQLQuery): void;
  transactionListener?(message: string, txnId?: number): void;
}
```

The keys pgcast adds are optional, so a `Config` written for Zapatos 6.6.1 still compiles; `getConfig()` types them `boolean | undefined`, though it always gives a value unless set to `undefined`. No option changes a type.

| Option | Default | What it changes | Read |
|---|---|---|---|
| [`transactionAttemptsMax`](#Config.transactionAttemptsMax) | `5` | how many times `transaction()` runs its callback | at each `transaction()` |
| [`transactionRetryDelay`](#Config.transactionRetryDelay) | `{ minMs: 25, maxMs: 250 }` | the wait before each retry | at each `transaction()` |
| [`castArrayParamsToJson`](#Config.castArrayParamsToJson) | `false` | an array parameter: `CAST($1 AS "json")` in place of `$1` | at each `compile()` |
| [`castObjectParamsToJson`](#Config.castObjectParamsToJson) | `false` | a plain object parameter: `CAST($1 AS "json")` in place of `$1` | at each `compile()` |
| [`upsertRequiresSameKeys`](#Config.upsertRequiresSameKeys) | `false` | a multi-row `upsert()` with a key missing from some row, still set from `EXCLUDED`: throw, not warn | at each `upsert()` |
| [`undefinedMeansMissing`](#Config.undefinedMeansMissing) | `false` | an `undefined` value in `insert()`, `update()` and `upsert()`: a missing key, not `NULL` | at each call of those |
| [`queryListener`](#Config.queryListener) | none | called with each query `run()` sends | at each `run()` |
| [`resultListener`](#Config.resultListener) | none | called with each result `run()` gives | at each `run()` |
| [`transactionListener`](#Config.transactionListener) | none | called when an attempt of `transaction()` fails with `40001` or `40P01`, and at each retry | at each `transaction()` |

### `transactionAttemptsMax` {#Config.transactionAttemptsMax}

```ts
transactionAttemptsMax: number  // default: 5
```

How many times [`transaction()`](/transaction#transaction) runs its callback. After a serialisation failure (`40001`) or a deadlock (`40P01`), it rolls back and runs the callback again, until this many attempts have failed; then it throws the last error. Any other error is rolled back and thrown at once.

- `1`, `0` or less: one attempt, no retry.
- Read when `transaction()` starts, so a change affects the next transaction, not the one running.
- How to write a callback that can run twice: [Retry a transaction](/retries).

### `transactionRetryDelay` {#Config.transactionRetryDelay}

```ts
transactionRetryDelay: { minMs: number; maxMs: number }  // default: { minMs: 25, maxMs: 250 }
```

Before each retry, `transaction()` waits a whole number of milliseconds from `minMs` to `maxMs`, rounded from a uniform draw between them: `Math.round(minMs + (maxMs - minMs) * Math.random())`. So `minMs` and `maxMs` come up half as often as each value between them. [`transactionListener`](#Config.transactionListener) is told the wait.

### `castArrayParamsToJson` {#Config.castArrayParamsToJson}

```ts
castArrayParamsToJson: boolean  // default: false
```

With `true`, every array sent as a parameter is sent as JSON: `CAST($1 AS "json")`, its value `JSON.stringify()`'d. That is `param(x)` and `param(x, 'type')`, and the values of the shortcuts and Whereables, which are parameters too. Off, `pg` sends an array as a Postgres array.

<CastPanel example="castArrayParamsToJson">

<<< ./examples/castArrayParamsToJson.ts{ts twoslash}

</CastPanel>

- Off, the same query fails: `json_array_length($1)` gives 22P02 "invalid input syntax for type json". `param(x, true)` sends the array as JSON under either setting.
- On a Postgres array column, Postgres refuses an array sent this way: 42804 "column "genres" is of type text[] but expression is of type json" in an `insert()` or `update()`, 42883 "operator does not exist: text[] = json" in a Whereable, and "… text[] && json" with [`arrayOverlaps()`](/conditions#conditions.arrayOverlaps).
- `param(x, false)` sends the array as it is, under either setting: `{ genres: db.param(['mystery', 'drama'], false) }` gives `SET ("genres") = ROW($1)`.
- The items of `isIn()` are parameters one by one, so an array of numbers there is unchanged: `("id" IN ($1, $2))`.
- How `param()` compiles each `cast`: [`param()`](/sql-template#param).

### `castObjectParamsToJson` {#Config.castObjectParamsToJson}

```ts
castObjectParamsToJson: boolean  // default: false
```

With `true`, every plain object sent as a parameter is sent as `CAST($1 AS "json")`, its value `JSON.stringify()`'d. Off, it is `$1`, and `pg` sends the same JSON text, with no type: Postgres then infers one from where `$1` stands.

<CastPanel example="castObjectParamsToJson">

<<< ./examples/castObjectParamsToJson.ts{ts twoslash}

</CastPanel>

- Off, the same query fails: `$1 ->> 'title'` gives 42725 "operator is not unique: unknown ->> unknown". A cast in the SQL, `$1::jsonb`, works either way.
- A plain object is an object literal, `{…}`: a `Date`, a `Buffer` or a class instance is sent as `$1`, unchanged.
- `param(x, false)` gives `$1` under either setting; `param(x, true)` gives `CAST($1 AS "json")`.

### `upsertRequiresSameKeys` {#Config.upsertRequiresSameKeys}

```ts
upsertRequiresSameKeys?: boolean  // default: false; the default in 7.0
```

With `true`, a multi-row [`upsert()`](/insert#upsert) without `updateColumns`, where a key missing from some row is still set from `EXCLUDED`, throws when called, before any query: "rows have different keys: pass updateColumns, or give every row the same keys". Off, it runs as in Zapatos 6.6.1 and warns once per process: `PGCAST_DEP001`. Which keys count, and the SQL: [Rows with different keys](/insert#upsert-different-keys).

### `undefinedMeansMissing` {#Config.undefinedMeansMissing}

```ts
undefinedMeansMissing?: boolean  // default: false; the default in 7.0
```

With `true`, an `undefined` value in [`insert()`](/insert#insert), [`update()`](/insert#update) and [`upsert()`](/insert#upsert) is a missing key: `DEFAULT` in `insert()`, left out of `update()` and `upsert()`. Off, it is sent as `NULL`, as in Zapatos 6.6.1, and warns once per process: `PGCAST_DEP002`. The SQL of each: [An `undefined` value](/insert#undefined-values).

### `queryListener` {#Config.queryListener}

```ts
queryListener?(query: SQLQuery, txnId?: number): void
```

Called by [`run()`](/sql-template#run) once the query is compiled, before it is sent.

- `query`: the [`SQLQuery`](#SQLQuery) `run()` sends, `{ text, values }`, and `name` once [prepared](/sql-template#prepared).
- `txnId`: in a [transaction](#transaction-ids), its id; otherwise `undefined`.
- It is called for a no-op fragment too, which sends nothing: `insert('tags', [])` gives `/* marked no-op: won't hit DB unless forced -> */ INSERT INTO "tags" SELECT null WHERE false`.
- It is not called when compiling throws. If it throws, `run()` rejects, and the query is not sent.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({
  queryListener: (query, txnId) =>
    console.log(`(${txnId ?? '-'})`, query.text, query.values),
  resultListener: (result, txnId, elapsedMs) =>
    console.log(`(${txnId ?? '-'}, ${elapsedMs?.toFixed(1)}ms)`, result),
  transactionListener: (message, txnId) =>
    console.log(`(${txnId})`, message),
});
```

### `resultListener` {#Config.resultListener}

```ts
resultListener?(result: any, txnId?: number, elapsedMs?: number, query?: SQLQuery): void
```

Called by `run()` with what it resolves to, once [`runResultTransform`](/sql-template#runResultTransform) has run.

- `result`: `{ title: 'The Salt Orchard' }` for `selectOne('films', { id: 1000 }, { columns: ['title'] })`, a number for `count()`, `[]` for a no-op.
- `txnId`: as for [`queryListener`](#Config.queryListener).
- `elapsedMs`: from just before the query is sent to just after the transform, from `performance.now()`, in fractions of a millisecond.
- `query`: the query, as `queryListener` got it.
- It is not called when the query rejects, nor when the transform throws (a `selectExactlyOne()` that finds no row).

### `transactionListener` {#Config.transactionListener}

```ts
transactionListener?(message: string, txnId?: number): void
```

Called by `transaction()` when an attempt fails with `40001` or `40P01`, and again when the next attempt starts, with one of these messages and the transaction's id:

| When | Message |
|---|---|
| an attempt failed, another is left | `` `Transaction rollback (code ${err.code}) on attempt ${attempt} of ${maxAttempts}, retrying in ${delayBeforeRetry}ms` `` |
| the next attempt starts | `` `Retrying transaction, attempt ${attempt} of ${maxAttempts}` `` |
| the last attempt failed | `` `Transaction rollback (code ${err.code}) on attempt ${attempt} of ${maxAttempts}, giving up` `` |

With `transactionAttemptsMax: 3` and `transactionRetryDelay: { minMs: 1, maxMs: 2 }`, a callback that fails with `40001` each time gives `Transaction rollback (code 40001) on attempt 1 of 3, retrying in 1ms`, `Retrying transaction, attempt 2 of 3`, then the same for attempt 2, and `Transaction rollback (code 40001) on attempt 3 of 3, giving up`.

It is not called for a transaction that commits on its first attempt, nor for any other error.

### Transaction ids {#transaction-ids}

The `txnId` the listeners get.

- Each `transaction()` call that opens a transaction takes the next id: `0` for the first in the process, then `1`…
- Every query `run()` sends on its client gets that id, through every retry: yours, and `transaction()`'s own `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`, `COMMIT` and `ROLLBACK`, which go through both query listeners like any other.
- A `transaction()` given that client opens no transaction, and its queries keep the outer id.
- Outside a transaction, and on the client once it has ended, the id is `undefined`.

## `NewConfig` {#NewConfig}

```ts
type NewConfig = Partial<Config>
```

What [`setConfig()`](#setConfig) takes: any keys of `Config`, each one whole.

## `SQLQuery` {#SQLQuery}

```ts
interface SQLQuery { text: string; values: any[]; name?: string }
```

A compiled query, as `pg`'s `query()` takes it: what [`compile()`](/sql-template#compile) returns and the listeners get. `name` is set by [`prepared()`](/sql-template#prepared).

## Opt-ins and warnings

A behaviour of Zapatos 6.6.1 that code may rely on, but that pgcast would change, stays the default until 7.0: an option turns the new one on, and the old one warns. Why this way: [Versions, opt-ins and warnings](/versions).

| Option | Warning | It warns when | Default from |
|---|---|---|---|
| [`upsertRequiresSameKeys: true`](#Config.upsertRequiresSameKeys) | `PGCAST_DEP001` | a multi-row `upsert()` without `updateColumns` has a key missing from some row that is still set from `EXCLUDED` ([Rows with different keys](/insert#upsert-different-keys)) | 7.0 |
| [`undefinedMeansMissing: true`](#Config.undefinedMeansMissing) | `PGCAST_DEP002` | a value of `insert()`, `update()` or `upsert()` is `undefined` ([An `undefined` value](/insert#undefined-values)) | 7.0 |

Each warning is a Node.js `DeprecationWarning`, emitted once per process for each code, when the shortcut is called, and only when the old behaviour is used. Its message names the option. Node prints it to `stderr`:

```txt
(node:4242) [PGCAST_DEP002] DeprecationWarning: An undefined value in insert(), update() or upsert() is sent as NULL. Set undefinedMeansMissing: true (db.setConfig) to treat it as a missing key instead (DEFAULT in insert(), left out of update() and upsert()); it will be the default in pgcast 7.0.
```

- `process.on('warning', w => …)` gets it, with `w.name` `'DeprecationWarning'` and `w.code` `'PGCAST_DEP002'`.
- `node --no-deprecation` hides it; `node --throw-deprecation` throws it, uncaught, so the process ends.
- With the option on, the shortcut never warns.

## Value types

`pg` and JSON give some Postgres values as strings. The generated schema types them with the template string types below, by where the value is ([How types are cast from the catalog](/catalog-types)):

| Postgres type | `Selectable` | `JSONSelectable` | `Insertable`, `Updatable`, `Whereable` |
|---|---|---|---|
| `int8` | [`Int8String`](#Int8String) | `number` | `number \| Int8String \| bigint` |
| `numeric` | [`NumericString`](#NumericString) | `number` | `number \| NumericString` |
| `bytea` | `Buffer` | [`ByteArrayString`](#ByteArrayString) | `ByteArrayString \| Buffer` |
| `date` | `Date` | [`DateString`](#DateString) | `DateString \| Date` |
| `timestamp` | `Date` | [`TimestampString`](#TimestampString) | `TimestampString \| Date` |
| `timestamptz` | `Date` | [`TimestampTzString`](#TimestampTzString) | `TimestampTzString \| Date` |
| `time` | [`TimeString`](#TimeString) | `TimeString` | `TimeString` |
| `timetz` | [`TimeTzString`](#TimeTzString) | `TimeTzString` | `TimeTzString` |
| `int4range`, `int8range`, `numrange` | [`NumberRangeString`](#NumberRangeString) | `NumberRangeString` | `NumberRangeString` |
| `tsrange`, `tstzrange`, `daterange` | [`DateRangeString`](#DateRangeString) | `DateRangeString` | `DateRangeString` |
| `json`, `jsonb` | [`JSONValue`](#JSONValue) | `JSONValue` | `JSONValue` |

- An array column takes the array of its item's type: `int8[]` gives `Int8String[]` in a `Selectable`.
- With the generator's [`customJSONParsingForLargeNumbers`](/generator#generate.customJSONParsingForLargeNumbers), `int8` and `numeric` are `number | Int8String` and `number | NumericString` in a `JSONSelectable` ([`enableCustomJSONParsingForLargeNumbers()`](#enableCustomJSONParsingForLargeNumbers)).
- The shortcuts return `JSONSelectable`s. A `Selectable` is what `pg` returns for a plain `SELECT` of the row.

Each type checks the shape of a string, not its value: `'2030-13-45'` is a `DateString`.

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
const opening: db.DateString = '2030-03-01';
const premiere: db.TimestampTzString = '2030-03-01T19:30:00';
```

## JSON {#json}

### `JSONValue` {#JSONValue}

```ts
type JSONValue = null | boolean | number | string | JSONObject | JSONArray
```

A value JSON can hold: the type of a `json` or `jsonb` column. `undefined`, a `Date` and a function are not one.

### `JSONObject` {#JSONObject}

```ts
type JSONObject = { [k: string]: JSONValue }
```

### `JSONArray` {#JSONArray}

```ts
type JSONArray = JSONValue[]
```

## Large numbers {#large-numbers}

### `Int8String` {#Int8String}

```ts
type Int8String = `${number}`
```

An `int8` as `pg` returns it, a string: `'9007199254740993'`, which no `number` holds.

### `NumericString` {#NumericString}

```ts
type NumericString = `${number}`
```

A `numeric` as `pg` returns it, a string that keeps its digits: `'1.10'`.

### `enableCustomJSONParsingForLargeNumbers()` {#enableCustomJSONParsingForLargeNumbers}

```ts
db.enableCustomJSONParsingForLargeNumbers(pg: typeof import('pg')): void
```

Makes `pg` parse `json` and `jsonb` values with [json-custom-numbers](https://www.npmjs.com/package/json-custom-numbers), which gives a number as a string when a `number` would change it. Each shortcut except the aggregates returns `jsonb`, so it applies to their results.

```ts twoslash
import * as db from 'zapatos/db';
import pg from 'pg';
// ---cut---
db.enableCustomJSONParsingForLargeNumbers(pg);
```

| A number in JSON | `JSON.parse()`, the default | Once enabled |
|---|---|---|
| `12`, `0.1` | `12`, `0.1` | `12`, `0.1` |
| `9007199254740993` | `9007199254740992` | `'9007199254740993'` |
| `9007199254740992`, an integer past `Number.MAX_SAFE_INTEGER` | `9007199254740992` | `'9007199254740992'` |
| `1.00000000000000000001` | `1` | `'1.00000000000000000001'` |
| a `numeric` past `Number.MAX_VALUE` | `Infinity` | its digits, as a string |

- It does nothing for `count()`, `sum()`, `avg()`, `min()` and `max()`: their result is not JSON, and goes through `Number()` ([`count()`](/select#count), [#163](https://github.com/AlexandreDemartin/pgcast/issues/163)). A `sum()` of `9007199254740993` still gives `9007199254740992`.
- It sets the type parsers of the `pg` module you give, so every pool and client of that module, from then on, pgcast's queries or not.
- It does not change the types: the generator's [`customJSONParsingForLargeNumbers`](/generator#generate.customJSONParsingForLargeNumbers) does.
- An `int8` or `numeric` column outside JSON is a string already, by `pg`'s own parser.

## Ranges {#ranges}

### `RangeString` {#RangeString}

```ts
type RangeString<Bound extends string | number> = `${'[' | '('}${Bound},${Bound}${']' | ')'}`
```

A range as Postgres writes it: a bracket, two bounds, a bracket. It does not cover an empty range, which Postgres writes `empty`: `to_jsonb('empty'::int4range)` is `"empty"`, and `const r: db.NumberRangeString = 'empty'` does not compile (TS2322, [#185](https://github.com/AlexandreDemartin/pgcast/issues/185)).

### `NumberRangeString` {#NumberRangeString}

```ts
type NumberRangeString = RangeString<number | ''>
```

An `int4range`, `int8range` or `numrange`: `'[1,5)'`, or `'[1.5,)'` with no upper bound.

### `DateRangeString` {#DateRangeString}

```ts
type DateRangeString = RangeString<string>
```

A `tsrange`, `tstzrange` or `daterange`. Its bounds follow the session's `DateStyle`, so they are typed `string`: `daterange('2030-03-01', '2030-03-08')` is `'[2030-03-01,2030-03-08)'` with the `ISO` style, and `'[01/03/2030,08/03/2030)'` with `SQL, DMY`. The bounds of a `tsrange` or `tstzrange` come quoted, since they hold a space: `'["2030-03-01 19:30:00","2030-03-02 00:00:00")'`.

## Bytes {#bytes}

### `ByteArrayString` {#ByteArrayString}

```ts
type ByteArrayString = `\\x${string}`
```

A `bytea` in JSON, as hex after `\x`: `'\\x4c61'` in TypeScript source.

### `toBuffer()` {#toBuffer}

```ts
db.toBuffer<T extends ByteArrayString | null>(d: T): T extends ByteArrayString ? Exclude<T, ByteArrayString> | Buffer : T
```

Decodes the hex of a `ByteArrayString` into a `Buffer`: `db.toBuffer('\\x4c61726b73707572').toString()` is `'Larkspur'`. `null` gives `null`, and the type keeps it ([`strict()`](#strict)). It decodes the whole value in memory.

## Dates and times {#dates-and-times}

A date or time in a `JSONSelectable` is the string `to_jsonb()` writes, ISO 8601. A `timestamptz` carries the session's `TimeZone` offset: `'2030-03-01T19:30:00+00:00'` in `UTC`, `'2030-03-02T01:00:00+05:30'` in `Asia/Kolkata`.

<CastPanel example="toDate">

<<< ./examples/toDate.ts{ts twoslash}

</CastPanel>

| Type | Is | For example |
|---|---|---|
| [`DateString`](#DateString) | `${number}-${number}-${number}` | `'2030-03-01'` |
| [`TimeString`](#TimeString) | `${number}:${number}`, then an optional `:${number}` | `'19:30'`, `'19:30:00'` |
| [`TzSuffix`](#TzSuffix) | `'Z'`, or `+` or `-` and a number, then an optional `:${number}` | `'Z'`, `'+01'`, `'+05:30'` |
| [`TimeTzString`](#TimeTzString) | `${TimeString}${TzSuffix}` | `'19:30:00+01'` |
| [`TimestampString`](#TimestampString) | `${DateString}T${TimeString}` | `'2030-03-01T19:30:00'` |
| [`TimestampTzString`](#TimestampTzString) | `${TimestampString}${TzSuffix}` | `'2030-03-01T19:30:00+00:00'` |

### `DateString` {#DateString}

```ts
type DateString = `${number}-${number}-${number}`
```

A `date`.

### `TimeString` {#TimeString}

```ts
type TimeString = `${number}:${number}${'' | `:${number}`}`
```

A `time`, with or without its seconds.

### `TzSuffix` {#TzSuffix}

```ts
type TzSuffix = 'Z' | `${'+' | '-'}${number}${'' | `:${number}`}`
```

The time zone at the end of a `TimeTzString` or a `TimestampTzString`.

### `TimeTzString` {#TimeTzString}

```ts
type TimeTzString = `${TimeString}${TzSuffix}`
```

A `timetz`.

### `TimestampString` {#TimestampString}

```ts
type TimestampString = `${DateString}T${TimeString}`
```

A `timestamp`: no time zone.

### `TimestampTzString` {#TimestampTzString}

```ts
type TimestampTzString = `${TimestampString}${TzSuffix}`
```

A `timestamptz`.

### `toDate()` {#toDate}

```ts
db.toDate<D extends TimestampTzString | null>(d: D): D extends null ? null : Date
db.toDate<D extends TimestampString | DateString | null>(d: D, tzInterpretation: 'UTC' | 'local'): D extends null ? null : Date
```

Makes a `Date` of a string from Postgres. A `TimestampTzString` has its time zone. A `TimestampString` or a `DateString` has none, so you say which to read it in: `'UTC'`, or `'local'`, the time zone of the JavaScript process.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const curtain = db.toDate('2030-03-01T19:30:00+00:00');
const rehearsal = db.toDate('2030-03-01T15:00:00', 'UTC');
const opening = db.toDate('2030-03-01', 'local');
```

- `toDate('2030-03-01', 'UTC')` is midnight UTC; `'local'` is local midnight.
- `null` gives `null`; the type keeps it, so `TimestampTzString | null` gives `Date | null`.
- A `Date` keeps milliseconds: the microseconds of a Postgres value are dropped.
- It does not check the string: one a `Date` cannot read gives an Invalid Date.

A `TimestampString` without `tzInterpretation` does not compile, nor a `TimestampTzString` with one:

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
// ---cut---
db.toDate('2030-03-01T15:00:00');
```

### `toString()` {#toString}

```ts
db.toString<D extends Date | null, T extends 'timestamptz' | 'timestamp:UTC' | 'timestamp:local' | 'date:UTC' | 'date:local'>(
  d: D,
  stringTypeTz: T,
): D extends null ? null : { timestamptz: TimestampTzString; 'timestamp:UTC': TimestampString; … }[T]
```

Makes a string Postgres reads of a `Date`, typed by `stringTypeTz`; `null` gives `null`.

| `stringTypeTz` | Gives | For 19:30 UTC on 1 March 2030, in a process with `TZ=Asia/Kolkata` |
|---|---|---|
| `'timestamptz'` | `TimestampTzString`, from `toISOString()` | `'2030-03-01T19:30:00.000Z'` |
| `'timestamp:UTC'` | `TimestampString` | `'2030-03-01T19:30:00.000'` |
| `'timestamp:local'` | `TimestampString`, in the process's time zone | `'2030-03-02T01:00:00.000'` |
| `'date:UTC'` | `DateString` | `'2030-03-01'` |
| `'date:local'` | `DateString`, in the process's time zone | `'2030-03-02'` |

## `strict()` {#strict}

```ts
db.strict<FnIn, FnOut>(fn: (x: FnIn) => FnOut):
  <T extends FnIn | null>(d: T) => T extends FnIn ? Exclude<T, FnIn> | FnOut : T
```

Wraps a one-argument function so that `null` gives `null` without calling it, as a Postgres function declared `STRICT` does. The type follows: `FnIn` gives `FnOut`, `FnIn | null` gives `FnOut | null`, `null` gives `null`. [`toBuffer()`](#toBuffer) is `strict()` of a `ByteArrayString` decoder.

```ts twoslash
import * as db from 'zapatos/db';
declare const tagline: string | null;
// ---cut---
const shout = db.strict((s: string) => s.toUpperCase());
const loud = shout(tagline);
```

- Only `null`: `undefined` is passed to `fn`.
- With `strictNullChecks` off, a type has no `null` in it, and none of these types say anything of it: `toDate(null)` is typed `Date`, `shout(null)` `any`.

## `SchemaVersionCanary` {#SchemaVersionCanary}

```ts
interface SchemaVersionCanary { version: 104 }
```

The version of the generated schema's format that this `zapatos/db` reads. The generated `zapatos/schema` declares `interface schemaVersionCanary extends db.SchemaVersionCanary { version: 104 }`, so a schema written for another format does not compile:

```txt
error TS2430: Interface 'schemaVersionCanary' incorrectly extends interface 'SchemaVersionCanary'.
  Types of property 'version' are incompatible.
```

- pgcast's version is Zapatos 6.6.1's, `104`, so the canary of a schema that Zapatos 6.6.1 generated passes.
- Regenerating the schema clears the error ([The generator: config and CLI](/generator)).
