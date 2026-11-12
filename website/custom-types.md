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

A domain gets a placeholder too, which holds its base type's `Selectable` type instead of `any`: the type `pg` returns. That one type serves all five interfaces, `JSONSelectable` included. `seat_label` is a `TEXT` with a `CHECK`, so `src/zapatos/custom/PgSeat_label.d.ts` holds `string`, right in each:

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
- The placeholder does not follow the database. Recreate a domain over another type, and edit its placeholder; or delete the file, and the next run writes a fresh one.
- Nothing is deleted: rename or drop a domain, and its old placeholder stays until you delete it.
- An array column is a custom type of its own: `point[]` gets `Pg_point.d.ts`, `any`, and `seat_label[]` gets `Pg_seat_label.d.ts`, `any` too.
- Two domains of the same name in two schemas share one placeholder ([#42](https://github.com/AlexandreDemartin/pgcast/issues/42)).

## When a placeholder does not compile

A domain's placeholder holds its base type's TypeScript name, and imports `zapatos/db` only for `db.JSONValue`. Some placeholders then fail to compile until you add the import, as in Zapatos 6.6.1 ([#184](https://github.com/AlexandreDemartin/pgcast/issues/184)):

| Placeholder type | `tsc` says | Add, inside `declare module` |
|---|---|---|
| `db.Int8String`, for a domain over `bigint`; `numeric`, `time` and the ranges alike | TS2503, `Cannot find namespace 'db'.` | `import type * as db from 'zapatos/db';` |
| `crew_job`, for `CREATE DOMAIN lead_job AS crew_job`, over an enum | TS2304, `Cannot find name 'crew_job'.` | `import type { crew_job } from 'zapatos/schema';` |

For `CREATE DOMAIN ticket_no AS bigint`, the placeholder holds `db.Int8String`, the string `pg` returns for a `bigint`. But the shortcuts return a `bigint` as a JSON number: a `ticket_no` that [`select()`](/select#select) returns is a `number` typed `db.Int8String`, so `.padStart()` compiles, then throws; and a row for [`insert()`](/insert#insert), typed `Insertable`, refuses `1` (TS2322). With the import, type it as both:

::: code-group

```ts [src/zapatos/custom/PgTicket_no.d.ts]
declare module 'zapatos/custom' {
  import type * as db from 'zapatos/db';
  export type PgTicket_no = number | db.Int8String;  // pg returns a string, the shortcuts a number
}
```

:::

- A domain over `numeric`, `date`, `timestamp`, `timestamptz` or `bytea` is in the same case: its placeholder holds what `pg` returns, not what the shortcuts return ([#194](https://github.com/AlexandreDemartin/pgcast/issues/194)).
- Past `Number.MAX_SAFE_INTEGER`, the number loses its last digits, as for any `bigint`: `9007199254740993` comes back as `9007199254740992` ([`customJSONParsingForLargeNumbers`](/generator#generate.customJSONParsingForLargeNumbers)).

## See also

- [The files it writes](/generator#the-files-it-writes): each file the generator writes, and when.
- [`customTypesTransform`](/generator#generate.customTypesTransform): the names of the placeholders.
- [How types are cast from the catalog](/catalog-types): why a type differs between `Selectable` and `JSONSelectable`.
