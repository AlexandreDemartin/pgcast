# Value types

The types the generated schema gives values that JSON or `pg` hand back as strings, and the helpers that convert them.
{.lede}

`pg` and JSON give some Postgres values as strings. The generated schema types them with the template string types below, by where the value is ([The catalog](/catalog-types)):

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

- In a `Selectable`, `int8[]` gives `Int8String[]`. A raw [enum array](/generator#generate.enumArraysTypedAsText) is text by default.
- With the generator's [`customJSONParsingForLargeNumbers`](/generator#generate.customJSONParsingForLargeNumbers), `int8` and `numeric` are `number | Int8String` and `number | NumericString` in a `JSONSelectable` ([`enableCustomJSONParsingForLargeNumbers()`](#enableCustomJSONParsingForLargeNumbers)).
- The shortcuts return `JSONSelectable`s. A `Selectable` is what `pg` returns for a plain `SELECT` of the row.
- A domain follows its base type in each context while its placeholder holds the generated type ([`DomainInContext`](#DomainInContext)). [`domainsTypedByContext: false`](/generator#generate.domainsTypedByContext) uses the placeholder, except in raw rows for a [direct domain over an enum array](/switching#domain-and-parser-types). There, `enumArraysTypedAsText: false` alone restores the placeholder. For interval domains, `intervalsTypedAsObjects` determines the type of a fresh placeholder.
- An `interval` gives a [`PostgresInterval`](#PostgresInterval) in `Selectable`, a `string` in JSON and `string | PostgresInterval` in a write. With [`intervalsTypedAsObjects: false`](/generator#generate.intervalsTypedAsObjects), all five interfaces use `string`.

Each type checks the shape of a string, not its value: `'2030-13-45'` is a `DateString`.

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
const opening: db.DateString = '2030-03-01';
const premiere: db.TimestampTzString = '2030-03-01T19:30:00';
```

## `DomainInContext` {#DomainInContext}

```ts
type DomainInContext<Custom, Generated, InContext> =
  (<T>() => T extends Custom ? 1 : 2) extends (<T>() => T extends Generated ? 1 : 2) ? InContext : Custom
```

The type that the generator's [`domainsTypedByContext`](/generator#generate.domainsTypedByContext) writes for a column of a domain, in `JSONSelectable`, `Whereable`, `Insertable` and `Updatable`, and in `Selectable` too for a domain over a domain or an array of a domain: `InContext`, its base type's type there, while the placeholder `Custom` is still exactly `Generated`, the type the generator wrote in it; otherwise `Custom`, as with `domainsTypedByContext: false`.

- `DomainInContext<db.Int8String, db.Int8String, number>` is `number`: a placeholder left as generated.
- `DomainInContext<number | db.Int8String, db.Int8String, number>` is `number | db.Int8String`: an edited placeholder keeps its type, in every context.
- An `any` stays `any`, and an `any[]` stays `any[]`, such as a placeholder Zapatos 6.6.1 wrote over `int8[]` with no import. A placeholder edited to the same type, `` `${number}` `` for `db.Int8String`, counts as left as generated.
- `DomainInContext<any, any, number>` is `number`: a domain over a domain, whose placeholder the generator wrote as `any`. Edited to `unknown`, it stays `unknown`.

## `WhereableValue` {#WhereableValue}

```ts
type WhereableValue<T> =
  T | Parameter<T> | SQLFragment | ParentColumn | SQLFragment<any, T | Parameter<T> | SQLFragment | ParentColumn>
```

The value a `Whereable` takes for a column of type `T`, which the generator's [`valuesTypedAsAliases`](/generator#generate.valuesTypedAsAliases) writes in place of this union: `db.WhereableValue<number>` for `films.release_year`.

## `InsertableValue` {#InsertableValue}

```ts
type InsertableValue<T, Extra = never> = T | Parameter<T> | Extra | SQLFragment<any>
```

The value an `Insertable` takes for a column of type `T`, written by `valuesTypedAsAliases` too. `Extra` is `null | DefaultType` for a nullable column, `DefaultType` for one with a default: `db.InsertableValue<string, null | db.DefaultType>` for `films.tagline`.

## `UpdatableValue` {#UpdatableValue}

```ts
type UpdatableValue<T, Extra = never> =
  T | Parameter<T> | Extra | SQLFragment | SQLFragment<any, T | Parameter<T> | Extra | SQLFragment>
```

The value an `Updatable` takes for a column of type `T`, with `Extra` as in `InsertableValue`: `db.UpdatableValue<string>` for `films.title`.

## `PostgresInterval` {#PostgresInterval}

```ts
interface PostgresInterval {
  years?: number; months?: number; days?: number; hours?: number;
  minutes?: number; seconds?: number; milliseconds?: number;
  toPostgres(): string;
  toISO(): string;
}
```

An `interval` as `pg`'s default type parser returns it, which the generator's [`intervalsTypedAsObjects`](/generator#generate.intervalsTypedAsObjects) writes in `Selectable`: each part that isn't zero, `{ minutes: 15 }` for `'00:15:00'`, and `{}` for a zero interval. `toPostgres()` gives the text `pg` writes back, `'15 minutes'`; `toISO()`, ISO 8601, `'P0Y0M0DT0H15M0S'`.

- It is the shape of `postgres-interval`'s `PostgresInterval`, which `pg` 7 and 8 bring through `pg-types`, written out: pgcast doesn't depend on that package.
- A plain object isn't one: without `toPostgres()`, `pg` sends it as JSON. Postgres 17 and later refuse it (22007), and Postgres 16 and earlier store something else: `00:00:15` for `{ minutes: 15 }`.

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

A JSON object, each value a `JSONValue`: the `vars` of [`jsonbPathExists()`](/conditions#conditions.jsonbPathExists).

### `JSONArray` {#JSONArray}

```ts
type JSONArray = JSONValue[]
```

A JSON array, each item a `JSONValue`.

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

- Direct [`count()`](/aggregates#count), `sum()` and `avg()` convert non-null values with `Number()`. Direct `min()` and `max()` use the pg value by default and `Number()` with runtime `aggregatesTypedByColumn: false`. Under a lateral key the outer JSON parser applies, so enabling it preserves large numbers there.
- It sets the type parsers of the `pg` module you give, so every pool and client of that module, from then on, pgcast's queries or not.
- It does not change the types: the generator's [`customJSONParsingForLargeNumbers`](/generator#generate.customJSONParsingForLargeNumbers) does.
- An `int8` or `numeric` column outside JSON is a string already, by `pg`'s own parser.

## Ranges {#ranges}

### `RangeString` {#RangeString}

```ts
type RangeString<Bound extends string | number> = `${'[' | '('}${RangeBound<Bound>},${RangeBound<Bound>}${']' | ')'}` | 'empty'
type RangeBound<Bound extends string | number> = Bound | (number extends Bound ? 'Infinity' | '-Infinity' | 'NaN' : never)
```

A range as Postgres writes it: a bracket, two bounds, a bracket, or `'empty'` for an empty range. A range whose bounds enclose no value is empty too: `'[5,5)'::int4range` comes back as `'empty'`. Postgres also reads `'EMPTY'` and spaces around it, but writes only `'empty'`, so the type takes only that. A `number` bound may also be `Infinity`, `-Infinity` or `NaN`, as Postgres writes them in a `numrange`, from `infinity`, `inf` or `nan` too; the type takes only these spellings. Zapatos 6.6.1 left out `'empty'` and these three.

### `NumberRangeString` {#NumberRangeString}

```ts
type NumberRangeString = RangeString<number | ''>
```

An `int4range`, `int8range` or `numrange`: `'[1,5)'`, `'[1.5,)'` with no upper bound, or `'[0,Infinity)'` for a `numrange`, whose bounds may be infinite or `NaN`. The type takes such a bound for the integer ranges too, though Postgres refuses it there.

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
db.toBuffer<T extends ByteArrayString | null>(d: T): T extends ByteArrayString ? Buffer<ArrayBuffer> | Exclude<T, ByteArrayString> : T
```

Decodes the hex of a `ByteArrayString` into a `Buffer`, typed `Buffer<ArrayBuffer>`. `null` gives `null`, and the type keeps it; `undefined` throws, and the type refuses it with `strictNullChecks` on ([`strict()`](#strict)). It decodes the whole value in memory.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const bytes = db.toBuffer('\\x4c61726b73707572');
const word = bytes.toString();  // 'Larkspur'
```

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
db.toDate<D extends null | TimestampTzString>(d: D, tzInterpretation?: undefined): D extends null ? null : Date
db.toDate<D extends null | TimestampString | DateString>(d: D, tzInterpretation: 'UTC' | 'local'): D extends null ? null : Date
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

A `TimestampString` or a `DateString` without `tzInterpretation` does not compile (TS2345). Nor does a `TimestampTzString` with one, since the first overload takes `tzInterpretation` only as `undefined` (TS2769):

```ts twoslash
// @errors: 2345 2769
import * as db from 'zapatos/db';
// ---cut---
db.toDate('2030-03-01T15:00:00');
db.toDate('2030-03-01T19:30:00+00:00', 'UTC');
```

### `toString()` {#toString}

```ts
db.toString<D extends Date | null, T extends 'timestamptz' | 'timestamp:UTC' | 'timestamp:local' | 'date:UTC' | 'date:local'>(
  d: D,
  stringTypeTz: T,
): D extends null ? null : { timestamptz: TimestampTzString; 'timestamp:UTC': TimestampString; … }[T]
```

Makes a string Postgres reads of a `Date`, typed by `stringTypeTz`; `null` gives `null`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const curtain = new Date('2030-03-01T19:30:00Z');
const day: db.DateString = db.toString(curtain, 'date:UTC');              // '2030-03-01'
const stamp: db.TimestampTzString = db.toString(curtain, 'timestamptz');  // '2030-03-01T19:30:00.000Z'
```

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

- Only `null` passes through, as only `NULL` does for a `STRICT` function in Postgres: `undefined` reaches `fn`. A function that takes it handles it: `db.strict((title: string | undefined) => title ?? 'untitled')(undefined)` gives `'untitled'`.
- With `strictNullChecks` on, the type refuses `undefined` unless `fn` takes it: `shout(undefined)` and `db.toBuffer(undefined)` do not compile (TS2345).
- With `strictNullChecks` off, a type has no `null` nor `undefined` in it, and none of these types say anything of them: `toDate(null)` is typed `Date`, `shout(null)` `any`. `db.toBuffer(undefined)` then compiles, and throws "TypeError: Cannot read properties of undefined (reading 'slice')".
