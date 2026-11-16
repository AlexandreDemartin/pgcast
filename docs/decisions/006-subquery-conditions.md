# 006 — How `exists()` and `isInSelect()` refer to the outer query

- **Status**: accepted (2026-11-16), under the owner's delegation.
- **Scope**: the subquery conditions of feature [#53](https://github.com/AlexandreDemartin/pgcast/issues/53), built in [#562](https://github.com/AlexandreDemartin/pgcast/issues/562).

## Context

`IN (SELECT …)` and `EXISTS` are among the most frequent conditions written by hand in a corpus of real usage: about a hundred in `sql` fragments, plus two home-made helpers. One wraps `IN (SELECT …)` as (table, column, where). The other is an `EXISTS` helper called about fifty times, which takes the outer table and its column as arguments. It serves the anti-join too, as `NOT EXISTS`, which avoids the `NULL` trap of `NOT IN`.

An `IN (SELECT …)` needs no correlation: `self` is the column on the left, outside the subquery. An `EXISTS` almost always needs one: its subquery's `WHERE` refers to a column of the outer row. That reference must name the outer table, because an unqualified name resolves to the innermost table that has the column.

What the code gives today:

- `parent('id')` compiles to `<parentTable>."id"` and throws "The 'parent' table alias has no meaning here" without a `parentTable` (`compileExpression`, `src/db/core.ts`).
- `parentTable` is a mark on a fragment. `copy()` carries it, and `compile()` hands it down to everything nested. Only `lateral` sets it: `lateral[k].copy({ parentTable: alias })` (`select()`, `src/db/shortcuts.ts`).
- A condition compiled as a `Whereable` value gets the key as its current column (`self`), and the `parentTable` of the query around it. Nothing tells it which table the enclosing query reads.

## Options

| | A. The outer column written by the caller | B. A `parent()` rule wired by the enclosing shortcut | C. `parent()`, with the outer table named on the condition |
|---|---|---|---|
| **The caller writes** | ``exists('extra.articles', { author_id: dc.eq(sql`${'users'}.${'id'}`) })`` | `exists('extra.articles', { author_id: parent('id') })` | `exists('extra.articles', { author_id: parent('id') }, { parent: 'users' })` |
| **How** | nothing new: the qualified name in a `sql` fragment | `select()`, `update()` and `deletes()` mark their `WHERE` with their alias; `compile()` and `compileExpression()` take a fourth argument to hand it down | the subquery gets the existing `parentTable` mark, as `lateral` sets it |
| **`core.ts`** | none | +17/−12 lines (11 recursive calls, `copy()`, one property), prototyped on `select()`; the unit tests of `core`, `shortcuts`, `conditions` and `injection` stay green (481) | none |
| **Types check** | the inner `Whereable`; the outer reference is an untyped fragment | the inner `Whereable`; `parent('id')` is any column, as in `lateral` | the same as B; `parent` is a string, as `select()`'s `alias` is |
| **Where it works** | anywhere | only under a shortcut's `WHERE`: in a hand-written `sql` query, it throws | anywhere a fragment goes (`sql`, `Whereable`, `and()`, `lateral`, `extras`) |
| **Reads** | verbose; the outer table spelled in SQL | shortest; in a `lateral` subquery, two `parent()`s in one `Whereable` name two tables | the outer table named twice, once in `select()` and once on the condition |

Set aside:

| Idea | Why not |
|---|---|
| A `select()` as the subquery | it compiles to a `jsonb_agg` of JSON rows (feature #53, Notes) |
| The correlation as two arguments (outer table, outer column), as the corpus's helper does | it covers one column; `parent()` is already Zapatos's word for a column of the outer row |
| An alias always given to the subquery's table | the SQL moves away from what you would write, and a `where` fragment that names the inner table breaks |

## Replays

On the fixture database (Postgres 17), with the built runtime and scratch prototypes of A, B (on a patched `core.ts`) and C. `users`: Ada (1), Bob (2, managed by 1), Cyd (3, managed by 1). `extra.articles`: (author 1, reviewer 2, 'Notes on the engine'), (author 2, no reviewer, 'Draft'). The `select()` wrapper (`jsonb_agg`, `columns: ['display_name']`) is left out below.

| Query | SQL of the `WHERE` | Rows |
|---|---|---|
| Users with an article whose body starts with 'Notes', A | `EXISTS (SELECT 1 FROM "extra"."articles" WHERE (("author_id" = "users"."id") AND ("body" LIKE $2)))` | Ada |
| Same, B and C | `EXISTS (SELECT 1 FROM "extra"."articles" WHERE ("author_id" = "users"."id" AND ("body" LIKE $2)))` | Ada |
| Same, `isInSelect()` | `(("id" IN (SELECT "author_id" FROM "extra"."articles" WHERE (("body" LIKE $2)))))` | Ada |
| Users with at least one article, B and C | `EXISTS (SELECT 1 FROM "extra"."articles" WHERE ("author_id" = "users"."id"))` | Ada, Bob |
| Same, `isInSelect('extra.articles', all, 'author_id')` | `(("id" IN (SELECT "author_id" FROM "extra"."articles")))` | Ada, Bob |
| Users who manage someone, no alias | `EXISTS (SELECT 1 FROM "users" WHERE "manager_id" = "users"."id")` | **none**: `"users"` is the inner table |
| Same, inner table `public.users` | `EXISTS (SELECT 1 FROM "public"."users" WHERE …)` | **none** |
| Same, `alias: 'reports'` | `EXISTS (SELECT 1 FROM "users" AS "reports" WHERE ("manager_id" = "users"."id"))` | Ada |
| Users who review no article, `not(exists(…))` | `(NOT (EXISTS (SELECT 1 FROM "extra"."articles" WHERE ("reviewer_id" = "users"."id"))))` | Ada, Cyd |
| Same, `not(isInSelect(…, 'reviewer_id'))` | `NOT ("id" IN (SELECT "reviewer_id" FROM "extra"."articles"))` | **none**: one `reviewer_id` is `NULL` |
| B, in a hand-written `sql` query | — | throws: "The 'parent' table alias has no meaning here" |
| C, hostile `parent` and `alias` | `FROM "users" AS "r"" --" WHERE ("manager_id" = "x""; DROP TABLE users; --"."id")` | 42P01, one statement |

## Market standard

- **Kysely** names the outer column: `exists(selectFrom('pet').select('pet.id').whereRef('pet.owner_id', '=', 'person.id'))`, checked against the tables in scope.
- **Slonik** and **sqlc** write the correlation in SQL, by hand.
- **Zapatos** has `parent()` only inside a `lateral`, where the outer query sets the mark. It does not guess the outer table anywhere.

None of them infers the outer table from where the condition sits.

## Choice: C

- **Security**: values stay parameters; `table` and `column` are typed identifiers, and `parent` and `alias` go through the string branch of `compileExpression`, as `select()`'s `alias` does (replay above).
- **6.6.1 compatibility**: additions only; `parent()` keeps its meaning everywhere it compiles today.
- **The principles**: explicit, as Zapatos is about its client and its transactions: the condition names the table it refers to, and its SQL does not depend on where it sits; it works in a `sql` query; no `core.ts` change, so #562 stays `normal`.
- **Reversible**: if the repeated table proves a burden in use, B can come later as the default of a missing `parent`, in its own note, since it touches `core.ts`. Calls written for C compile the same.

### What #562 builds

In `src/db/conditions.ts`, with nothing changed in `core.ts`:

```ts
exists<T extends Table>(
  table: T,
  where: WhereableForTable<T> | SQLFragment<any> | AllType,
  options?: { parent?: string; alias?: string },
): SQLFragment<boolean, never>

isInSelect<T extends Table, C extends ColumnForTable<T>>(
  table: T,
  where: WhereableForTable<T> | SQLFragment<any> | AllType,
  column: C,
  options?: { parent?: string; alias?: string },
): SQLFragment<boolean | null, Exclude<SelectableForTable<T>[C], null>>
```

- **Order**: table, then the `Whereable` (`all` for every row, as `select()` takes it), then the column, as `upsert()` puts its conflict target after its values, then options. This replaces the (table, column, where) sketch of #53 and #562. A caller of the corpus's `IN (SELECT …)` helper swaps two arguments.
- **SQL**: `EXISTS (SELECT 1 FROM <table>[ AS <alias>][ WHERE <where>])` and `<self> IN (SELECT <column> FROM <table>[ AS <alias>][ WHERE <where>])`. With `all` there is no `WHERE`; `{}` gives `WHERE TRUE`, as in `select()`.
- **`parent`**: sets the subquery's `parentTable` mark, so `parent('id')` in its `where` compiles to `"users"."id"`. It names the outer `FROM` item as the outer query names it: its alias if it has one, otherwise its table (`'extra.articles'` gives `"extra"."articles"."id"`), as `lateral` does. Without `parent`, the mark is inherited as for any fragment: in a `lateral` subquery `parent()` is the lateral's parent, and at the top level it throws, as today.
- **`alias`**: `AS <alias>` after the table, as `select()`'s `alias` writes it. When `parent` and `table` end with the same name (`users`, `public.users`) and no `alias` is given, the condition is refused. The refusal is a fragment that throws as it compiles, so `run()` rejects before any query, as the conditions' `refused()` does. The error names both and asks for an alias. Without it, the replay shows the wrong rows, silently.
- **`self`** has no meaning in the subquery's `where`. The subquery fragment compiles it with no current column, so `self` throws as it does in `select()`'s `where`. This is done on the inner fragment, by a `compile` that drops the column, as `select()` overrides `compile` for `selectExactlyOneChecksForSecondRow`, so a `copy()` of the condition keeps it. Otherwise the outer key, unqualified inside the subquery, would resolve to an inner column.
- **Types**: `exists()` has the constraint `never`, so it fits under any key, in `and()`, `or()` and `not()`, or as the `where` itself. The docs show `and()`. `EXISTS` is never `NULL`: `boolean`. `isInSelect()` is typed on the subquery column's `Selectable` type, `null` excluded as `isDistinctFrom()` excludes it, and gives `boolean | null`.
- **No `isNotInSelect()` and no `notExists()`** (no synonym): the anti-join is `not(exists(…))`. The JSDoc of `isInSelect()` says that `not()` of it matches no row once the subquery returns a `NULL` (replay above).
- **Tests** (issue #562, **Done when**): the SQL of each line of § Replays, frozen; real execution; the injection matrix on `table`, `column`, `parent`, `alias` and the `where` values; the alias refusal; `self` refused; `copy()` keeping `parent`; types positive and negative; `bench:types`.

## Risks

- **`parent('id')` is not checked against the outer table**, as in `lateral`: a wrong column is Postgres's 42703, a wrong `parent` its 42P01, both before any row.
- **The alias rule compares last names**: `parent: 'public.users'` over `extra.users` is refused, though Postgres resolves `"public"."users"."id"` to the outer table (replayed); an alias settles it. The bare `"users"."id"` there is the inner table (replayed: no row).
- **An inherited `parent` in a `lateral`** over the same table as the subquery is not refused: the rule needs `parent` named. The same holds for `lateral` today, whose docs ask for an alias.

## Sources

- Postgres: [subquery expressions](https://www.postgresql.org/docs/current/functions-subquery.html) (`EXISTS`, `IN`, the `NULL` of `NOT IN`); the wiki's [Don't Do This](https://wiki.postgresql.org/wiki/Don%27t_Do_This#Don.27t_use_NOT_IN).
- Kysely: [complex where clause](https://kysely.dev/docs/examples/where/complex-where-clause) (`exists`, `selectFrom`, `whereRef`).
- Zapatos: [docs](https://jawj.github.io/zapatos/), § `lateral` and `parent`.
