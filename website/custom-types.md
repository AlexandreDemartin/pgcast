# Custom types

A type the generator can't map to TypeScript, such as `point`, and each domain come to you as a placeholder in `zapatos/custom`, for you to fill in. Here we fill in `cinemas.location`, a `POINT`, and find the nearest cinema with it, then type the domain `seat_label`, keep both across runs, and fix a placeholder that does not compile.
{.lede}

## Find the placeholder

The first time the generator meets such a type, it writes a placeholder for it and says so:

```txt
Writing new custom type or domain placeholder file: src/zapatos/custom/PgPoint.d.ts
```

The placeholder gives it `any`:

::: code-group

```ts [src/zapatos/custom/PgPoint.d.ts]
declare module 'zapatos/custom' {
  export type PgPoint = any;  // replace with your custom type or interface as desired
}
```

:::

In `schema.d.ts`, the column takes that type in all five interfaces: `location: c.PgPoint`, in `cinemas.Selectable` and `JSONSelectable` as in `Whereable`, `Insertable` and `Updatable`. While it is `any`, TypeScript checks nothing: `location: { x: 1.5, y: 2.5 }` compiles, and Postgres refuses it with 22P02, `invalid input syntax for type point: "{"x":1.5,"y":2.5}"`.

The file's name, `PgPoint`, comes from [`customTypesTransform`](/generator#generate.customTypesTransform).

## Fill it in

The shortcuts return each row as JSON, which writes a point as Postgres prints it: `"(0.4,1.2)"`. Postgres takes that string back as a value too. So in `src/zapatos/custom/PgPoint.d.ts`, replace `any` with that form, a template literal type:

::: code-group

<<< ./zapatos/custom/PgPoint.d.ts#module{ts} [src/zapatos/custom/PgPoint.d.ts]

:::

Keep the edit within `declare module 'zapatos/custom'`: the file is the module's declaration. Now a cinema's location is checked as you write it:

<CastPanel example="custom_types_insert">

<<< ./examples/custom_types_insert.ts{ts twoslash}

</CastPanel>

And the object that Postgres refused no longer compiles, here as a row typed `s.cinemas.Insertable`:

```ts twoslash
// @errors: 2353
import type * as s from 'zapatos/schema';
// ---cut---
const cinema: s.cinemas.Insertable = { name: 'The Harbour Lights', location: { x: 1.5, y: 2.5 } };
```

From two numbers, build the point in SQL, each number a [parameter](/sql-template#param): this sends `VALUES (point($1, $2), $3)`<!-- probe: db.insert('cinemas', { name: 'The Harbour Lights', location: db.sql`point(${db.param(1.5)}, ${db.param(2.5)})` }) -->, as an `Insertable` value can be any [`sql`](/sql-template#sql) fragment.

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
declare const x: number, y: number;
// ---cut---
await db.insert('cinemas', {
  name: 'The Harbour Lights',
  location: db.sql`point(${db.param(x)}, ${db.param(y)})`,
}).run(pool);
```

Postgres also takes `'1.5,2.5'`, which the type refuses. The type checks the parentheses and the comma, and lets spaces through: `'(1.5, 2.5)'` compiles, and Postgres takes it.

One type serves all five interfaces. But your own query typed `s.cinemas.Selectable` gets its rows from `pg`, which parses a point into `{ x: 0.4, y: 1.2 }`, whatever the type says. Select the point as text there, and the rows fit the type:

<CastPanel example="custom_types_text">

<<< ./examples/custom_types_text.ts{ts twoslash}

</CastPanel>

The Lantern's `location` is then `"(0.4,1.2)"`, as the shortcuts give it. Or type that query's result yourself ([`sql`](/sql-template#sql)).

## Find the nearest cinema

`<->` is Postgres's distance between two points, here in kilometres. Order by it, and [`selectOne()`](/select#selectOne) gives the nearest cinema:

<CastPanel example="custom_types_nearest">

<<< ./examples/custom_types_nearest.ts{ts twoslash}

</CastPanel>

- The Lantern comes back, its `location` the string `"(0.4,1.2)"`, typed `PgPoint`.
- For the distance too, add the same fragment to [`extras`](/select#extras): `` km: db.sql<s.cinemas.SQL, number>`…` ``.
- The GiST index on `location` serves this order: on 20,000 cinemas, `EXPLAIN` shows `Index Scan using cinemas_location_idx` and `Order By: (location <-> '(0.5,1)'::point)`, with no sort.

To find cinemas at a point, compare with `~=`, Postgres's "same as" for points, in a fragment as the `where`:

<CastPanel example="custom_types_same_as">

<<< ./examples/custom_types_same_as.ts{ts twoslash}

</CastPanel>

It gives The Lantern. A Whereable `{ location: '(0.4,1.2)' }` compiles but fails in Postgres with 42883, `operator does not exist: point = unknown`: a point has no `=`.

To name the type in your own code, import `zapatos/custom` as you import `zapatos/schema`:

```ts twoslash
import type * as c from 'zapatos/custom';

const here: c.PgPoint = '(0.5,1)';
```

## Type a domain

A domain gets a placeholder too, which holds its base type's `Selectable` type instead of `any`: the type `pg` returns, or the union of its values ([below](#a-domain-of-values)). That one type serves all five interfaces, `JSONSelectable` included, unless the domain is over a type typed by context and [`domainsTypedByContext`](/generator#generate.domainsTypedByContext) is on (the default from 7.0, [below](#when-a-placeholder-does-not-compile)). A domain over another domain, or an array of a domain, gets `any`, which that option types by the base type of its innermost domain. `seat_label` is a `TEXT` with a `CHECK`, so `src/zapatos/custom/PgSeat_label.d.ts` holds `string`, right in each:

::: code-group

<<< ./zapatos/custom/PgSeat_label.d.ts#module{ts} [src/zapatos/custom/PgSeat_label.d.ts]

:::

And `seat_bookings.seat` is `c.PgSeat_label`. The `CHECK` stays in Postgres: TypeScript lets `seat: 'f7'` through, and Postgres refuses it with 23514, `value for domain seat_label violates check constraint "seat_label_check"`. Catch it with [`isDatabaseError()`](/transaction#isDatabaseError).

A template literal type can hold part of the `CHECK`, a capital letter then a number:

::: code-group

```ts [src/zapatos/custom/PgSeat_label.d.ts]
declare module 'zapatos/custom' {
  type PgSeat_labelRow = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I'
    | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R'
    | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';
  export type PgSeat_label = `${PgSeat_labelRow}${number}`;  // a row, then a number: F7
}
```

```ts [src/seats.ts]
import * as db from 'zapatos/db';
import type * as c from 'zapatos/custom';
import type pg from 'pg';

function isSeatLabel(seat: string): seat is c.PgSeat_label {
  return /^[A-Z][0-9]{1,2}$/.test(seat);  // the domain's CHECK
}

export async function bookSeat(pool: pg.Pool, screening_id: number, seat: string, customer: string) {
  if (!isSeatLabel(seat)) throw new Error(`There is no seat ${seat}`);
  return db.insert('seat_bookings', { screening_id, seat, customer }).run(pool);
}
```

:::

- `seat: 'f7'` then fails to compile, TS2322 in a row typed `s.seat_bookings.Insertable`; `'Z100'` still compiles, and Postgres still refuses it.
- Each type in `declare module 'zapatos/custom'` is exported, `PgSeat_labelRow` too: a helper named `Row` would clash with another placeholder's (TS2300).
- A `string` from a form no longer fits (TS2322 in a typed row, TS2769 in the call): check it first, with the `CHECK`'s pattern, in a type guard, as `src/seats.ts` does.
- These docs keep `PgSeat_label` as generated, `string`.

### A domain of values

A domain over `text` whose `CHECK` lists its values can be typed by them. Say a film has a certificate:

```sql
CREATE DOMAIN certificate AS text CHECK (VALUE IN ('U', 'PG', '12', '15', '18'));
COMMENT ON DOMAIN certificate IS 'Who may see the film';
ALTER TABLE films ADD COLUMN certificate certificate;
```

Turn on [`domainsTypedAsUnions`](/generator#generate.domainsTypedAsUnions), and the generator reads the values on every run, declares their union in `zapatos/schema` as an enum's labels are, and writes the placeholder naming it:

::: code-group

```ts [src/zapatos/schema.d.ts]
/**
 * **certificate**
 * - Domain in database
 *
 * Who may see the film
 */
export type certificate = 'U' | 'PG' | '12' | '15' | '18';
export namespace every {
  export type certificate = ['U', 'PG', '12', '15', '18'];
}
```

```ts [src/zapatos/custom/PgCertificate.d.ts]
declare module 'zapatos/custom' {
  import type { certificate } from 'zapatos/schema';
  export type PgCertificate = certificate;  // replace with your custom type or interface as desired
}
```

:::

`films.certificate` stays `c.PgCertificate` in all five interfaces, now `'U' | 'PG' | '12' | '15' | '18'`. A certificate the `CHECK` refuses no longer compiles, where Postgres refused it at run time, with 23514, `value for domain certificate violates check constraint "certificate_check"`:

```ts
await db.insert('films', {
  studio_id: 1, title: 'The Lantern', release_year: 2024, runtime_minutes: 98,
  certificate: '12A',  // TS2769; TS2322 in a row typed s.films.Insertable
}).run(pool);
```

- The SQL doesn't change: `'12'` is still sent as a parameter, and Postgres still checks it.
- Add a value to the `CHECK`, run the generator, and the union has it: the placeholder only names it.
- A placeholder already on disk, written before the option or edited, keeps typing the column: the generator never rewrites it, and notes it on each run. Delete it, and the next run writes it naming the union. A narrower or branded type stays yours to write there: `certificate & { readonly __brand: 'Certificate' }`.
- What it reads, and what it leaves out, such as `varchar`, `NULL` among the values or a `CHECK` added `NOT VALID`: [`domainsTypedAsUnions`](/generator#generate.domainsTypedAsUnions).

### A `jsonb` domain

A domain is also how to give a `jsonb` column a shape. Say a cinema has a `screen` column, of a domain over `jsonb`:

```sql
CREATE DOMAIN projection AS jsonb;
ALTER TABLE cinemas ADD COLUMN screen projection;
```

The generator writes `PgProjection.d.ts` with `db.JSONValue` and the import it needs. Replace the type with an interface:

::: code-group

```ts [src/zapatos/custom/PgProjection.d.ts]
declare module 'zapatos/custom' {
  export interface PgProjection {
    format: '35mm' | '70mm' | 'digital';
    seats: number;
  }
}
```

:::

A row typed `s.cinemas.Insertable` with `screen: { format: 'VHS', seats: 120 }` then fails to compile (TS2322), and a cinema's `screen.format` is typed `'35mm' | '70mm' | 'digital'`. Postgres checks none of it, and stores that value all the same: the type is your promise about what the column holds.

## Keep it across runs

The generator writes a placeholder once, when it is missing, and never overwrites it. With [`progressListener`](/generator#generate.progressListener), the next runs say:

```txt
Custom type or domain declaration file already exists: src/zapatos/custom/PgPoint.d.ts
Custom type or domain declaration file already exists: src/zapatos/custom/PgSeat_label.d.ts
```

- Commit `zapatos/custom/` with your code: the placeholders you filled in are yours.
- The placeholder does not follow the database, unless it names a [union of values](#a-domain-of-values). Recreate a domain over another type, and edit its placeholder; or delete the file, and the next run writes a fresh one.
- Nothing is deleted: rename or drop a domain, and its old placeholder stays until you delete it.
- An array column is a custom type of its own: `point[]` gets `Pg_point.d.ts`, `any`, and `seat_label[]` gets `Pg_seat_label.d.ts`, `any` too.
- Two domains of the same name in two schemas share one placeholder ([#42](https://github.com/AlexandreDemartin/pgcast/issues/42)). The type of the column read last, by schema, then relation, then column, holds it, the same in every run, and writes what it would write alone. In one relation, that is the column Zapatos 6.6.1 read last; across relations, 6.6.1's could change from run to run, and it could write an enum's name with no import, which fails to compile ([#661](https://github.com/AlexandreDemartin/pgcast/issues/661)).

## When a placeholder does not compile

A domain's placeholder holds its base type's TypeScript name, and imports what that name needs: `zapatos/db` for a `db.*` type, `zapatos/schema` for an enum. Zapatos 6.6.1 and pgcast up to 6.6.2 imported `zapatos/db` for `db.JSONValue` alone, and the generator never rewrites a placeholder. If one of theirs fails to compile, add the import, or delete the file and generate again ([#184](https://github.com/AlexandreDemartin/pgcast/issues/184)):

| Placeholder type | `tsc` says | Add, inside `declare module` |
|---|---|---|
| `db.Int8String`, for a domain over `bigint`; `numeric`, `time` and the ranges alike | TS2503, `Cannot find namespace 'db'.` | `import type * as db from 'zapatos/db';` |
| `crew_job`, for `CREATE DOMAIN lead_job AS crew_job`, over an enum | TS2304, `Cannot find name 'crew_job'.` | `import type { crew_job } from 'zapatos/schema';` |

- An enum outside [`unprefixedSchema`](/generator#generate.unprefixedSchema) is in its schema's namespace: the placeholder imports that, `import type { archive } from 'zapatos/schema';`, and holds `archive.format`. One written before holds `format`: add that import and change `format` to `archive.format`, as `import type { format }` gives TS2305 there.
- An enum whose name has a capital letter or is one of TypeScript's own types (`"Date"`, `string`) still gets no import, as in Zapatos 6.6.1: that name may be a global type, which compiles.
- A placeholder that takes its enum's own name cannot import it by that name: under [`customTypesTransform`](/generator#generate.customTypesTransform) `'my_type'`, or a function that keeps the name, `genre`, the placeholder of a `films` column of domain `catalogue.genre` over the enum `genre`, names it with no import, `export type genre = import('zapatos/schema').genre;`. Zapatos 6.6.1 wrote `genre`, TS2456 (`Type alias 'genre' circularly references itself.`), and pgcast from 6.7.0 to 6.9.0 imported it too, TS2440 (`Import declaration conflicts with local declaration of 'genre'.`): write that type in one written before, or delete it and generate again ([#649](https://github.com/AlexandreDemartin/pgcast/issues/649)).
- Under [`customTypesTransform`](/generator#generate.customTypesTransform) `'my_type'`, or a function that keeps the name, a placeholder named as its domain's schema, `tone` for a domain `tone.tone` over the enum `tone.mood`, imports that schema's namespace, `import type { tone }`. When `zapatos/schema` declares a type named `tone` too, an enum or a union of [`unprefixedSchema`](/generator#generate.unprefixedSchema), or one of its own, such as `Table` or `Selectable`, that import brings it as well, TS2440 (`Import declaration conflicts with local declaration of 'tone'.`): the placeholder then names the type with no import, `export type tone = import('zapatos/schema').tone.mood;`. pgcast from 6.7.0 to 6.10.0 wrote the import: write that type in one written before, or delete it and generate again ([#661](https://github.com/AlexandreDemartin/pgcast/issues/661)).
- From 7.0 a fresh placeholder for a domain over an enum used by a table in another schema contains the enum's labels unless another type shares its placeholder name. Through 7.x, with [`typeEnumsAcrossSchemas: false`](/generator#generate.typeEnumsAcrossSchemas), each table looked up the enum in its own schema: if two tables found different enums, import the one the domain is based on; if a table found no enum of that name, the placeholder got `any` unless [another type shares it](https://github.com/AlexandreDemartin/pgcast/issues/42). Zapatos 6.6.1 wrote the enum name or `any` according to [which table it read last](https://github.com/AlexandreDemartin/pgcast/issues/455). To update an existing placeholder, follow the [migration guide](/switching).

For `CREATE DOMAIN ticket_no AS bigint`, the placeholder holds `db.Int8String`, the string `pg` returns. From 7.0, [`domainsTypedByContext`](/generator#generate.domainsTypedByContext) gives [`select()`](/select#select) a number with the default JSON parser. With `customJSONParsingForLargeNumbers: true` and the matching parser, narrow `number | db.Int8String` first. [`insert()`](/insert#insert) accepts `number | Int8String | bigint`.

For this domain, `domainsTypedByContext: false` makes the placeholder supply the type in all five interfaces. If you keep that setting in 7.x, you can declare both representations there:

::: code-group

```ts [src/zapatos/custom/PgTicket_no.d.ts]
declare module 'zapatos/custom' {
  import type * as db from 'zapatos/db';
  export type PgTicket_no = number | db.Int8String;  // pg returns a string, the shortcuts a number
}
```

:::

- A domain over `numeric`, `date`, `timestamp`, `timestamptz`, `bytea` or `money` is in the same case: its placeholder holds what `pg` returns, less than a write takes and, except for `money`, other than what the shortcuts return, and the option types it by context too.
- An edited placeholder, such as this one, keeps its type in all five interfaces, with the option too.
- Past `Number.MAX_SAFE_INTEGER`, the number loses its last digits, as for any `bigint`: `9007199254740993` comes back as `9007199254740992` ([`customJSONParsingForLargeNumbers`](/generator#generate.customJSONParsingForLargeNumbers)).

## See also

- [The files it writes](/generated-files#the-files-it-writes): each file the generator writes, and when.
- [`customTypesTransform`](/generator#generate.customTypesTransform): the names of the placeholders.
- [The catalog](/catalog-types): why a type differs between `Selectable` and `JSONSelectable`.
