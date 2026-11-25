# 017 — Value aliases: each column's value type named in the generated schema

- **Status**: accepted (2026-11-23), by delegation from the owner. Each choice below is decided under the philosophy.
- **Scope**: step [#921](https://github.com/AlexandreDemartin/pgcast/issues/921) of Epic [#919](https://github.com/AlexandreDemartin/pgcast/issues/919).
- **In short**:
  - `valuesTypedAsAliases: true` writes each column's value in `Whereable`, `Insertable` and `Updatable` as an alias exported by `zapatos/db`, in place of the union written out on each line.
  - Three aliases: `WhereableValue<T>`, `InsertableValue<T, Extra>` and `UpdatableValue<T, Extra>`. `Extra` is `null | db.DefaultType` for a nullable column and `db.DefaultType` for one with a default.
  - The types are the same; off, the output is unchanged. It becomes the default in 8.0, and `false` stays a choice.

## Context

- Each column of the generated schema spells out its whole value union in three interfaces:

  ```ts
  owner_id?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn>;
  ```

- On a production schema of 279 tables, those lines are 4 MB of a 6.3 MB `schema.d.ts`, and the schema adds about 150 MB to `tsc`'s memory. Factored by hand into aliases, the same types take 68 MB less (#918).
- Generated types elsewhere take the same lever: Prisma reports −76 % in file size from deduplicated shapes.

## 1. The option's name and form

- **Choice**: `valuesTypedAsAliases?: boolean` in `OptionalConfig`, read `?? false`; `"valuesTypedAsAliases": true` in `zapatosconfig.json`.
- **Why**: a boolean, like the generator's other output options; the name follows `enumArraysTypedAsText`, `intervalsTypedAsObjects` and `domainsTypedAsUnions` (what is typed, then how).
- **Refused**: a mode on `columnOptions` (a column-level option for a file-level choice); always on (a change of the default output, which decision 003 keeps for a major).

## 2. The aliases and their variants

| Interface | Alias | The union it names |
|---|---|---|
| `Whereable` | `WhereableValue<T>` | `T \| Parameter<T> \| SQLFragment \| ParentColumn \| SQLFragment<any, T \| Parameter<T> \| SQLFragment \| ParentColumn>` |
| `Insertable` | `InsertableValue<T, Extra = never>` | `T \| Parameter<T> \| Extra \| SQLFragment<any>` |
| `Updatable` | `UpdatableValue<T, Extra = never>` | `T \| Parameter<T> \| Extra \| SQLFragment \| SQLFragment<any, T \| Parameter<T> \| Extra \| SQLFragment>` |

- **Variants**: a nullable column takes `null` and `DEFAULT`, so `Extra` is `null | db.DefaultType`; a column with a default takes `DEFAULT`, so `db.DefaultType`; any other column has no second argument. `ParentColumn` is in `WhereableValue` only, as in the written-out union. The `?` of an optional key stays outside the alias.
- **One alias per interface, with `Extra`, rather than seven named variants** (`NullableUpdatableValue<T>`…): three exports instead of seven, and each line still says that it takes `null` or `DEFAULT`, as the SQL does. `Extra` cannot go outside the alias: in `UpdatableValue` it is inside the fragment's type too.
- **Where**: `src/db/utils.ts`, beside `DomainInContext`, the other type only the generated output names; re-exported by `zapatos/db`. Types only: nothing in `db.mjs`, and `core.ts` is untouched.
- **The same types**: a test compiles both outputs of the fixture in one program and finds each table's three interfaces identical. `test/types` also compiles against the aliased output, with the same results, and `check:floor` compiles it on TypeScript 4.1.

## 3. What the hover and errors show

Probed on the fixture's `users`, with `strict`:

| | Without the option | With it, TypeScript 5.9 |
|---|---|---|
| Hover on `Whereable['manager_id']` | `number \| Parameter<number> \| SQLFragment<any[], never> \| ParentColumn<string \| undefined> \| SQLFragment<any, …> \| undefined` | `WhereableValue<number> \| undefined` |
| Hover on `Insertable['manager_id']` | `number \| Parameter<number> \| SQLFragment<any, never> \| typeof Default \| null \| undefined` | `InsertableValue<number, typeof Default \| null> \| undefined` |
| Hover on `Updatable['display_name']` (NOT NULL) | the written-out union | `UpdatableValue<string> \| undefined` |
| `{ manager_id: 'x' }` as a `Whereable` | `Type 'string' is not assignable to type 'number \| Parameter<number> \| …'` | `Type 'string' is not assignable to type 'WhereableValue<number> \| undefined'` |

- An error names the alias; its members are one hover away, on the alias.
- TypeScript 4.1.6 shows the written-out union in both, as without the option.

## 4. Measures

A synthetic schema of 300 tables of 20 columns each (invented names), TypeScript 5.9.3, `strict`, three runs each:

| | Without | With |
|---|---|---|
| `schema.d.ts` | 6.97 MB | 5.08 MB (−27 %) |
| `tsc` memory, lib check | 387–388 MB | 293–296 MB |
| `tsc` memory, `skipLibCheck` | 280 MB | 196 MB |
| Types / instantiations | 62,549 / 57,243 | 62,551 / 57,577 |

The same program on a schema of 3 tables takes 188–194 MB: the schema's own share falls from about 199 MB to about 105 MB (−47 %), close to #918's −45 %.

## 5. The default at the next major

- **In 7.x**: off by default, with no note when off. The types are the same, so a project has nothing to migrate.
- **In 8.0**: on by default. `valuesTypedAsAliases: false` stays a permanent choice, for a tool that reads the written-out text. Superseded by decision [019](./019-one-behaviour.md) § 3: 8.0 removes the option and writes the aliases alone.
- **No canary change**: the default output does not change, and the generator and `zapatos/db` ship in one package. An aliased output compiled against an older `zapatos/db`, after a downgrade with no new run, gives TS2694 on each line; under `skipLibCheck`, which also skips the canary, those values are `any`. An older version needs a new run, as going back to Zapatos does (`switching.md` § Go back).
