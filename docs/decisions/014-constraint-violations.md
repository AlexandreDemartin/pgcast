# 014 ""” Tell which constraint Postgres refused a write for

**Accepted 2026-11-19 under the owner's delegation.** For 7.1.0, `constraintNames: true` will add a type named `Constraint` to each generated table namespace. A handler checks the name it expects at compile time and compares the error fields at run time. [Issue #713](https://github.com/AlexandreDemartin/pgcast/issues/713)

## Context and options

After a migration renames a unique index, an application can still compile while its """already taken""" branch silently stops matching. The generator knows the index names. The issue records little use of error-code checks in the consumer corpus. The owner accepted an opt-in on the strength of the general Postgres use case.

| Option | What it buys and costs |
|---|---|
| Per-table type | A typed constant catches a stale name after regeneration. The handler can use the SQLSTATE, schema and table that Postgres actually reports. |
| A narrowing guard in `zapatos/db` | Comparing a known error's constraint with a checked literal takes one expression. The proposed three-argument guard also takes `unknown`, must recognise the error and SQLSTATE, and must match the qualified relation. An unprefixed generated table name omits its schema, and a quoted name can itself contain a dot. The declaration alone cannot recover that information at run time. |

Choose the per-table type. A guard with the full contract would need more than the one-line comparison. A separate package would be its home if demand warrants one.

## What Postgres reported

These writes ran on Postgres 17.3 with `pg` 8.23.1. Every row below had `schema === 'cinema'`. A dash means the driver field was `undefined`. The catalog rows and the errors came from the same database.

| SQLSTATE | Object or operation | Catalog evidence | `table` | `column` | `constraint` |
|---|---|---|---|---|---|
| 23505 | Primary key | `pg_constraint.contype = 'p'`, unique backing index | `films` | ""” | `films_pkey` |
| 23505 | Quoted unique constraint | `u`, unique backing index | `films` | ""” | `Title "cut"'s Key` |
| 23505 | Bare partial unique index on `lower(slug)` | `pg_index.indisunique`, no owning constraint row | `films` | ""” | `films_slug_idx` |
| 23505 | Deferrable unique constraint | `u`, unique backing index | `films` | ""” | `films_ticket_key` |
| 23503 | Missing studio on insert, referenced studio on delete | `f` owned by `films`, `conindid` points to `studios_pkey` | `films` | ""” | `films_studio_fkey` |
| 23514 | Table check | `c`, `conrelid` identifies `films` | `films` | ""” | `films_rating` |
| 23514 | Domain check on a value inserted into `films` | `c`, `conrelid = 0`, `contypid` identifies `minutes` | ""” | ""” | `positive_minutes` |
| 23P01 | Overlapping screening slots | `x`, backing index has `indisexclusion` | `screenings` | ""” | `screenings_slot_excl` |
| 23502 | Missing required title | `pg_attribute.attnotnull` on `films.title` | `films` | `title` | ""” |

The domain error also carried `dataType === 'minutes'`. Domain checks belong to the domain, and a column-level null violation is handled through `err.column`. Postgres 18 records named not-null constraints in the catalog too. Its executor still reports the failing column for this write. [Postgres 18 catalog](https://www.postgresql.org/docs/18/catalog-pg-constraint.html) Â· [Postgres 18 executor, `ReportNotNullViolationError`](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/executor/execMain.c)

**Partitions.** Inserts routed through `bookings` to `bookings_first` reported the leaf table for primary-key, check and foreign-key violations. The primary key was `bookings_first_pkey`, whose catalog parent was `bookings_pkey`. The check and foreign key kept their names, `seats_positive` and `bookings_studio_fkey`. A key outside every partition gave 23514 with `table === 'bookings'` and no constraint.

**Inheritance.** An update through `releases` hit its `INHERITS` child and reported table `premieres` and constraint `releases_rating`. The child had its own check row with `coninhcount = 1`. It accepted two identical values of the parent's unique column and had no corresponding unique index. Generate each relation's own catalog rows, including inherited rows. A handler for a routed write uses the reported relation.

**Spelling.** The quoted unique name above preserved its case, space, quotes and apostrophe. A check named with `a` followed by 33 copies of `Ã©` (67 UTF-8 bytes) appeared in both the catalog and the error as `a` followed by 31 (63 bytes). Emit the stored name with the generator's `stringLiteral()`. Postgres has already applied its identifier limit.

## Generated type and caller

The existing generator read four unique indexes on `films`. With `uniqueIndexConstraintsOnly: true`, its `UniqueIndex` contained the primary key and quoted unique constraint. With `false`, it also contained the bare index and deferrable constraint. [Existing index query and emitter](../../src/generate/tables.ts)

Build `Constraint` from `UniqueIndex` plus the missing names. Reuse the unfiltered index rows and read `pg_constraint.conname` for `p`, `u`, `f`, `c` and `x` by the table's OID. Deduplicate and sort the extra literals. Either setting of `uniqueIndexConstraintsOnly` gives the same `Constraint` membership. An empty union is `never`.

For `cinema` configured as the unprefixed schema, the handler can use the following type from `zapatos/schema`. With schema prefixes enabled the type lives under `s.cinema.films`. Both forms compare the actual schema field.

```ts
import pg from 'pg';
import type * as s from 'zapatos/schema';

const slugIndex: s.films.Constraint = 'films_slug_idx';

export function slugTaken(err: unknown) {
  return err instanceof pg.DatabaseError &&
    err.code === '23505' && err.schema === 'cinema' &&
    err.table === 'films' && err.constraint === slugIndex;
}
```

`isDatabaseError()` tests a five-character code against a class prefix or a specific condition and returns a boolean. All probed errors matched both class 23 and their named condition. A plain object containing only `code: '23505'` also matched. The function leaves the original fields intact. TypeScript still treats a caught `unknown` as `unknown` after that check (TS18046). [Existing matcher](../../src/db/pgErrors.ts)

## Consequences

- The option defaults to `false`. Omitted or false, it adds no catalog query or declaration. The default output and version canary stay byte-for-byte compatible. Both module-name modes follow their existing namespaces.
- The union describes names owned by the relation in the catalog snapshot. The same statement can fail on another relation, on a domain, or without a named constraint. The handler checks the SQLSTATE separately and lets other errors propagate.
- The example compiled on TypeScript 5.9.3 against a declaration built from the probe's catalog rows. After renaming the index to `films_slug_v2` and updating the declaration, the original handler gave TS2820 with the new spelling. The domain check gave TS2322, and assigning the raw `err.constraint` (`string | undefined`) to the union gave TS2322.
- Omit `ConstraintForTable<T>` until a caller needs a generic lookup. In a synthetic 100-table program with one constant per table, `tsc --extendedDiagnostics` counted 2,894 Types and 902 Instantiations with plain strings. The per-table unions added 500 Types and zero Instantiations. Using an indexed lookup at all 100 sites added a further 204 Types and 300 Instantiations. The emitter PR must measure the actual fixture and run `bench:types` with the project's +20% stop point.

## Remaining PRs for #713

| PR | Risk and lens | Scope |
|---|---|---|
| 2. Generate each table's constraint names | `normal`, `codegen` | Add the opt-in, prove the default output and canary, test the catalog cases on the CI matrix, compile positive and negative fixture examples, and measure cost. Cover the option in the generator reference, EN and FR, and the changelog. |
| ~~3. Add a guard that narrows a constraint violation~~ | ~~`normal`, `types`~~ | The checked literal and field comparisons cover the demonstrated caller. A guard also needs runtime relation identity. |
| 4. Document handling a named constraint | `low`, no review lens | Show the checked literal and fallback in `handle-errors.md`, EN and FR, with an example run against Postgres. |
