# Use custom types and domains

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

The shortcuts return each row through `to_jsonb()`, which writes a point as Postgres prints it: `"(0.4,1.2)"`. Postgres takes that string back as a value too. So in `src/zapatos/custom/PgPoint.d.ts`, replace `any` with that form, a template literal type:

<<< ./zapatos/custom/PgPoint.d.ts{ts}

Keep the edit within `declare module 'zapatos/custom'`: the file is the module's declaration. Now a cinema's location is checked as you write it:

<CastPanel example="custom_types_insert">

<<< ./examples/custom_types_insert.ts{ts twoslash}

</CastPanel>

And the object that Postgres refused no longer compiles:

```ts twoslash
// @errors: 2769
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
await db.insert('cinemas', { name: 'The Harbour Lights', location: { x: 1.5, y: 2.5 } }).run(pool);
```

From two numbers, build the point in SQL, each number a [parameter](/sql-template#param): this sends `VALUES (point($1, $2), $3)`, as an `Insertable` value can be any [`sql`](/sql-template#sql) fragment.

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

- Postgres also takes `'1.5,2.5'` or `'(1.5, 2.5)'`; the type takes only the form it returns.
- One type serves all five interfaces. Your own query typed `s.cinemas.Selectable` gets rows from `pg`, which parses a point into `{ x: 1.5, y: 2.5 }`, whatever the type says: select `${'location'}::text` there, or type that query's result yourself ([`sql`](/sql-template#sql)).

## Find the nearest cinema

`<->` is Postgres's distance between two points, here in kilometres. Order by it, and [`selectOne()`](/select#selectOne) gives the nearest cinema:

<CastPanel example="custom_types_nearest">

<<< ./examples/custom_types_nearest.ts{ts twoslash}

</CastPanel>

- The Lantern comes back, its `location` the string `"(0.4,1.2)"`, typed `PgPoint`.
- For the distance too, add the same fragment to [`extras`](/select#extras): `` km: db.sql<s.cinemas.SQL, number>`…` ``.
- The GiST index on `location` serves this order: on 20,000 cinemas, `EXPLAIN` shows `Index Scan using cinemas_location_idx` and `Order By: (location <-> '(0.5,1)'::point)`, with no sort.
- To find cinemas at a point, compare with `~=`, Postgres's "same as" for points: `` db.sql`${'location'} ~= ${db.param('(0.4,1.2)')}` `` as the `where`. A Whereable `{ location: '(0.4,1.2)' }` compiles but fails in Postgres with 42883, `operator does not exist: point = unknown`: a point has no `=`.

To name the type in your own code, import `zapatos/custom` as you import `zapatos/schema`:

```ts twoslash
import type * as c from 'zapatos/custom';

const here: c.PgPoint = '(0.5,1)';
```

## Type a domain

A domain gets a placeholder too, with the type of its base type instead of `any`. `seat_label` is a `TEXT` with a `CHECK`, so `src/zapatos/custom/PgSeat_label.d.ts` holds `string`:

<<< ./zapatos/custom/PgSeat_label.d.ts{ts}

And `seat_bookings.seat` is `c.PgSeat_label`. The `CHECK` stays in Postgres: TypeScript lets `seat: 'f7'` through, and Postgres refuses it with 23514, `value for domain seat_label violates check constraint "seat_label_check"`. Catch it with [`isDatabaseError()`](/transaction#isDatabaseError).

A template literal type can hold part of the `CHECK`, a capital letter then a number:

::: code-group

```ts [src/zapatos/custom/PgSeat_label.d.ts]
declare module 'zapatos/custom' {
  type Row = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I'
    | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R'
    | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';
  export type PgSeat_label = `${Row}${number}`;  // a row, then a number: F7
}
```

:::

- `seat: 'f7'` then fails to compile (TS2769); `'Z100'` still compiles, and Postgres still refuses it.
- A `string` from a form no longer fits: check it first, with the `CHECK`'s pattern, `/^[A-Z][0-9]{1,2}$/`, in a type guard.
- These docs keep `PgSeat_label` as generated, `string`.

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

`screen: { format: 'VHS', seats: 120 }` then fails to compile (TS2769), and a cinema's `screen.format` is typed `'35mm' | '70mm' | 'digital'`. Postgres checks none of it, and stores `{"format": "VHS", "seats": 120}` all the same: the type is your promise about what the column holds.

## Keep it across runs

The generator writes a placeholder once, when it is missing, and never overwrites it. With [`progressListener`](/generator#generate.progressListener), the next runs say:

```txt
Custom type or domain declaration file already exists: src/zapatos/custom/PgPoint.d.ts
Custom type or domain declaration file already exists: src/zapatos/custom/PgSeat_label.d.ts
```

- Commit `zapatos/custom/` with your code: the placeholders you filled in are yours.
- The placeholder does not follow the database. Recreate a domain over another type, and edit its placeholder; or delete the file, and the next run writes a fresh one.
- Nothing is deleted: rename or drop a domain, and its old placeholder stays until you delete it.
- An array column is a custom type of its own: `point[]` gets `Pg_point.d.ts`, `any`, and `seat_label[]` gets `Pg_seat_label.d.ts`, `any` too.
- Two domains of the same name in two schemas share one placeholder ([#42](https://github.com/AlexandreDemartin/pgcast/issues/42)).

## When a placeholder does not compile

A domain's placeholder holds its base type's TypeScript name, and imports `zapatos/db` only for `db.JSONValue`. Some placeholders then fail to compile until you add the import, as in Zapatos 6.6.1 ([#184](https://github.com/AlexandreDemartin/pgcast/issues/184)):

| Placeholder type | `tsc` says | Add, inside `declare module` |
|---|---|---|
| `db.Int8String`, for a domain over `bigint`; `numeric`, `time` and the ranges alike | TS2503, `Cannot find namespace 'db'.` | `import type * as db from 'zapatos/db';` |
| `genre`, for a domain over the enum `genre` | TS2304, `Cannot find name 'genre'.` | `import type { genre } from 'zapatos/schema';` |

For `CREATE DOMAIN ticket_no AS bigint`, the fixed placeholder reads:

::: code-group

```ts [src/zapatos/custom/PgTicket_no.d.ts]
declare module 'zapatos/custom' {
  import type * as db from 'zapatos/db';
  export type PgTicket_no = db.Int8String;  // replace with your custom type or interface as desired
}
```

:::

## See also

- [The files it writes](/generator#the-files-it-writes): each file the generator writes, and when.
- [`customTypesTransform`](/generator#generate.customTypesTransform): the names of the placeholders.
- [How types are cast from the catalog](/catalog-types): why a type differs between `Selectable` and `JSONSelectable`.
