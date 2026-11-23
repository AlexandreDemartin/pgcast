# 016 — `parent()` and `ParentColumn` on a generic column

- **Status**: accepted (2026-11-23), by delegation from the owner: the plan and its correction on [#918](https://github.com/AlexandreDemartin/pgcast/issues/918), and the decision on [the review of PR #924](https://github.com/AlexandreDemartin/pgcast/pull/924#issuecomment-7104688142).
- **Scope**: `ParentColumn` and `LateralOption` in `zapatos/db`, types only: the JavaScript and the SQL are unchanged.
- **In short**: `ParentColumn<T>` takes any string as `T`, and checks the column in `value`; `LateralOption`'s constraints are a string array and a map of fragments or strings. So no Whereable column and no generic `L extends LateralOption<C, E>` relates a generic column, `ColumnForTable<T>`, to the global `Column` union any more. `parent()` keeps the single signature of Zapatos 6.6.1, so a helper that calls it on a generic column costs what it costs there.

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
| `parent()` | unchanged: `parent<T extends Column \| undefined = Column \| undefined>(x?: T): ParentColumn<T>`, no overload | A first overload for a generic column, `parent<_T extends string = never, X extends Table = never>(x: ColumnForTable<X>)`, made it fast, but broke Zapatos 6.6.1: passed as a value, an overloaded function is inferred from its last signature, so `cols.map(db.parent)` gave `ParentColumn<Column \| undefined>[]` (TS2322 against `ParentColumn<s.users.Column>[]`), as an overload of `sql` would (#520). It also doubled the per-call cost of a literal `parent('col')`. Backward compatibility comes first |
| `WhereableArg`, `UpdatableArg`, `InsertableArg` | unchanged | Their `& NotIterable` costs nothing more once `ParentColumn` is fixed, so the generated interfaces stay as they are |

Without the overload, most of the gain stays. On a production project of about 7,700 files (TypeScript 6.0.3, two alternated runs, busy machine), with the same 47 type errors on the same lines in each:

| | Check time |
|---|---|
| Zapatos 6.6.1 (earlier runs) | 78–93 s |
| master | 88–99 s |
| with the overload | 49–53 s |
| without it, this note | 61–62 s |

## What a consumer sees

- **A generic helper that calls `parent(col)`**, `col` typed `ColumnForTable<T>`, costs what it costs on Zapatos 6.6.1: about 9 s on the large bench (§ Measured). No regression, no gain. A lateral on it costs about Zapatos 6.6.1's too, half of 7.1.2's; a forwarder to `select()`, which calls no `parent()`, gains, through `LateralOption`.
- **`parent()`**, as a call, a value (`cols.map(db.parent)`), an instantiation expression (`db.parent<s.films.Column>`) or with a type argument, types and refuses as on Zapatos 6.6.1, with the same errors. A type test freezes each.
- **A bare `ParentColumn`** is `ParentColumn<string | undefined>`: its `value` is still `Column | undefined`. It is no longer assignable to a `ParentColumn<Column | undefined>` written by hand, as TypeScript compares the two by variance; `new ParentColumn()` gives the bare type too. What `parent()` returns is assignable to both. A type test freezes each.
- **`new ParentColumn('nope')`** is still refused, and reads "…to parameter of type 'undefined'".
- **A type argument that is no column**, refused by Zapatos 6.6.1 with TS2344, now compiles: `new db.ParentColumn<'nope'>()`, `new db.ParentColumn<string>()`, a type `db.ParentColumn<'nope'>`, and the first as a Whereable value, `{ id: new db.ParentColumn<'nope'>() }`. It does no harm: without a cast, `value` holds no name that is no column (`undefined` for `'nope'`), so the SQL is that of `parent()` with no column. A type test freezes them.

## Measured

`npm run bench:types:large`, TypeScript 5.9.3, 280 tables and 1,706 column names, check time as medians (master: 3 runs; this note: 5 runs, `-- --update`, Zapatos 6.6.1 in the same run):

| Case | Zapatos 6.6.1 | master | this note |
|---|---|---|---|
| `parent()` of a `ColumnForTable<T>` | 9.25 s | 9.31 s | 9.09 s |
| a lateral on it | 9.65 s | 19.27 s | 10.62 s |
| a forwarder to `select()` | 9.63 s | 9.69 s | 0.11 s |
| 300 literal `parent()` calls, each in a lateral | 0.41 s | – | 0.56 s |
| the three generic ones, `skipLibCheck: false` | 129.05 s | 1.50 × Zapatos (baseline) | 28.19 s |

Memory is 0.91 to 1.15 times Zapatos 6.6.1's.

A literal call pays a fixed cost, once per program: `value`'s intersection with the `Column` union, which the review isolated. With the review's probes (3 alternated runs, medians), one `select()` with a lateral `count()` on `parent('<column>')` checks in 0.31 s, against 0.13 s on master and 0.18 s on Zapatos 6.6.1, and 300 of them on distinct columns in 0.71 s, against 0.45 s and 0.46 s, memory +21 MB on master. The per-call part stays about master's, 1.3 ms against 1.1 ms. Verdict: accepted, as about 0.2 s per program buys tens of seconds on a project with generic helpers, 61–62 s against 88–99 s above. The large bench's `literals` case keeps it in the gate. The gate ignores a check time that moves by under 0.25 s: at ratios of 0.01, a tenth of a second of noise would double one.
