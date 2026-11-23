# 016 — `parent()` and `ParentColumn` on a generic column

- **Status**: accepted (2026-11-23), by delegation from the owner: the plan and its correction on [#918](https://github.com/AlexandreDemartin/pgcast/issues/918).
- **Scope**: `ParentColumn`, `parent()` and `LateralOption` in `zapatos/db`, types only: the JavaScript and the SQL are unchanged.
- **In short**: no type of `zapatos/db` relates a generic column, `ColumnForTable<T>`, to the global `Column` union any more. `ParentColumn<T>` takes any string as `T`, and checks the column in `value`; `parent()` gets a first overload for a generic column; `LateralOption`'s constraints are a string array and a map of fragments or strings. A literal call keeps its type.

## Context

On a schema of a thousand column names, each generic helper that met the `Column` union cost seconds of type-checking (#918). TypeScript compares a generic source with a union of literals member by member: the fast path of [microsoft/TypeScript#53192](https://github.com/microsoft/TypeScript/pull/53192) covers a literal source only. Four places made the comparison:

| Place | What it related |
|---|---|
| `LateralOption<C extends ColumnsOption<Table>, E extends ExtrasOption<Table>>` | each generic `L extends LateralOption<C, E>`, 11 in `shortcuts.d.ts` |
| `parent<T extends Column \| undefined>` | its constraint, at each generic call |
| `ParentColumn<T extends Column \| undefined = Column \| undefined>` | its default, which every generated Whereable column holds as `db.ParentColumn`, by variance |
| `WhereableArg` and its siblings (`& NotIterable`) | nothing more, once `ParentColumn` is fixed |

## Choices

| Choice | Decision | Why |
|---|---|---|
| `LateralOption` | `C extends readonly string[] \| undefined`, `E extends { [k: string]: SQLFragment<any> \| string } \| undefined` | They only gate its conditional, `undefined extends C`: every `ColumnsOption<T>` and `ExtrasOption<T>` still meets them. The issue's `SQLFragmentOrColumnMap<any>` broke the declarations of a schema with no table, where `any` is no `Table` (TS2344) |
| `ParentColumn` | `T extends string \| undefined = string \| undefined`, and `value?: T & (Column \| undefined)`, in the field and the constructor | A default of `string \| undefined` alone let `param('x')`, `{ value: 'x' }` and `new ParentColumn('nope')` pass on every Whereable column, an int one included, as a `ParentColumn<string>`; the intersection keeps them refused. For each `T` valid before, `value` keeps its type: `'id' & (Column \| undefined)` is `'id'` |
| `parent()` | a first overload, `parent<_T extends string = never, X extends Table = never>(x: ColumnForTable<X>): ParentColumn<ColumnForTable<X>>`, then the signature of Zapatos 6.6.1 | A generic column infers `X` from the alias's argument, so nothing meets the union. A literal infers nothing: `X` is `never`, and the call falls through to the second overload, which types it as before |
| A leading `_T`, unused | it takes an explicit type argument, so `X` keeps `never` and the call falls through | An instantiation expression, `const p = db.parent<s.films.Column>;` (TypeScript ≥ 4.7), applies its type argument to every overload of a matching arity and reports a constraint it breaks: `X extends Table` in first place gave TS2344 there, and `_T extends string` takes any column list. The issue's correction, `X extends string` with `ColumnForTable<X & Table>`, passed there too, but let `parent<s.films.Column>('id')` take the first overload when a column of `films` is named like a table, typing it by that table's columns: probed on a schema where `films` has a column `studios`, it accepted `'name'`. With `_T`, master and the branch agree on every line of that probe. `[X] extends [Table] ? ColumnForTable<X> : never` was as correct, but cost 9.6 s again |
| `WhereableArg`, `UpdatableArg`, `InsertableArg` | unchanged | Their `& NotIterable` costs nothing more once `ParentColumn` is fixed, so the generated interfaces stay as they are |

## What a consumer sees

- **A bare `ParentColumn`** is `ParentColumn<string | undefined>`: its `value` is still `Column | undefined`. It is no longer assignable to a `ParentColumn<Column | undefined>` written by hand, as TypeScript compares the two by variance; `new ParentColumn()` gives the bare type too. What `parent()` returns is assignable to both. A type test freezes each.
- **The error** of a name that is no column reads "No overload matches this call" (TS2769), where it read "Argument of type … is not assignable" (TS2345); `new ParentColumn('nope')` reads "…to parameter of type 'undefined'". Each is still refused.
- **`parent<'films'>('id')`**, a table as the type argument, is still refused, and so is `parent<'films'>`; the error is TS2345 on the argument, where Zapatos 6.6.1 gave TS2344 on the type argument. A type test records both.
- **An instantiation expression**, `const p = db.parent<s.films.Column>;`, types and checks its calls as before, but its type lists both signatures, the first taking `never`: a `.d.ts` that exports `p` shows them both.
- **Still slow**: an argument typed `s.Column`, an alias of the user's own, or `ColumnForTable<T> | undefined` takes the second overload. It is correct, just no faster.
- **A column named like a table** changes nothing: an explicit type argument always takes the second overload, as the probe of § Choices shows.

## Measured

`npm run bench:types:large`, TypeScript 5.9.3, 280 tables and 1,706 column names, check time as medians (master: 3 runs; the branch: 5 runs):

| Case | Zapatos 6.6.1 | master | this note |
|---|---|---|---|
| `parent()` of a `ColumnForTable<T>` | 9.4–9.6 s | 9.31 s | 0.03 s |
| a lateral on it | 9.4–9.8 s | 19.27 s | 0.50 s |
| a forwarder to `select()` | 9.6 s | 9.69 s | 0.12 s |
| the three, `skipLibCheck: false` | 133 s | 1.50 × Zapatos (baseline) | 1.89 s |

Memory moves by −11 % to +2 %. On a production project of about 7,700 files (TypeScript 6.0.3, `tsc --noEmit --incremental false`, two alternated runs, with the issue's `X & Table` overload rather than `_T`), the check fell from 89–115 s to 52–58 s, with the same errors as before; Zapatos 6.6.1 took 78–93 s. The large bench's gate now ignores a check time that moves by under 0.25 s: at ratios of 0.01, a tenth of a second of noise would double one.
