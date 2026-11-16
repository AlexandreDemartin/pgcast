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

On the fixture database (Postgres 17.3), by one scratch harness: the built runtime, prototypes of A and C, and B on a patched copy of the built `core.js`. Rows marked *hand-written* run their SQL as written, with no helper; every other row is a call's output. `users`: Ada (1), Bob (2, managed by 1), Cyd (3, managed by 1). `extra.articles`: (author 1, reviewer 2, 'Notes on the engine'), (author 2, no reviewer, 'Draft'). The `select()` wrapper (`jsonb_agg`, `columns: ['display_name']`) is left out below.

| Query | SQL of the `WHERE` | Rows |
|---|---|---|
| Users with an article whose body starts with 'Notes', A | `EXISTS (SELECT 1 FROM "extra"."articles" WHERE (("author_id" = "users"."id") AND ("body" LIKE $2)))` | Ada |
| Same, B and C | `EXISTS (SELECT 1 FROM "extra"."articles" WHERE ("author_id" = "users"."id" AND ("body" LIKE $2)))` | Ada |
| Same, `isInSelect()` | `(("id" IN (SELECT "author_id" FROM "extra"."articles" WHERE (("body" LIKE $2)))))` | Ada |
| Users with at least one article, A | `EXISTS (SELECT 1 FROM "extra"."articles" WHERE (("author_id" = "users"."id")))` | Ada, Bob |
| Same, B and C | `EXISTS (SELECT 1 FROM "extra"."articles" WHERE ("author_id" = "users"."id"))` | Ada, Bob |
| Same, `isInSelect('extra.articles', all, 'author_id')` | `(("id" IN (SELECT "author_id" FROM "extra"."articles")))` | Ada, Bob |
| Users who manage someone, *hand-written*, no alias | `EXISTS (SELECT 1 FROM "users" WHERE "manager_id" = "users"."id")` | **none**: `"users"` is the inner table |
| Same, *hand-written*, inner table `public.users` | `EXISTS (SELECT 1 FROM "public"."users" WHERE "manager_id" = "users"."id")` | **none** |
| Same, C, no alias, over `users` or `public.users`, or with `parent: '"users"'` | — | throws: another alias asked for |
| Same, C, `alias: 'reports'` | `EXISTS (SELECT 1 FROM "users" AS "reports" WHERE ("manager_id" = "users"."id"))` | Ada |
| Users with at least one article, C, `alias: 'users'` | — | throws: another alias asked for |
| Users who review no article, C, `not(exists(…))` | `(NOT (EXISTS (SELECT 1 FROM "extra"."articles" WHERE ("reviewer_id" = "users"."id"))))` | Ada, Cyd |
| Same, `{ id: not(isInSelect('extra.articles', all, 'reviewer_id')) }` | `(((NOT ("id" IN (SELECT "reviewer_id" FROM "extra"."articles")))))` | **none**: one `reviewer_id` is `NULL` |
| B, in a `sql` template query | — | throws: "The 'parent' table alias has no meaning here" |
| C without `parent`, in a `lateral` subquery over `extra.articles` | — | throws: the same |
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
- **Reversible**: if the repeated table proves a burden in use, B can come later as the default of a missing `parent`, in its own note, since it touches `core.ts`. Calls written for C compile the same: one with `parent` keeps its own mark (replayed on B's prototype); one without compiles only if it has no `parent()`.

### What #562 builds

In `src/db/conditions.ts`, with nothing changed in `core.ts` (signatures compiled against the fixture's generated schema):

```ts
exists<T extends Table>(
  table: T,
  where: WhereableForTable<T> | SQLFragment<any> | AllType,
  options?: { parent?: string; alias?: string },
): SQLFragment<boolean, never>

isInSelect<T extends Table, C extends keyof SelectableForTable<T>>(
  table: T,
  where: WhereableForTable<T> | SQLFragment<any> | AllType,
  column: C,
  options?: { parent?: string; alias?: string },
): SQLFragment<boolean | null, Exclude<SelectableForTable<T>[C], null>>
```

- **Order**: table, then the `Whereable` (`all` for every row, as `select()` takes it), then the column, as `upsert()` puts its conflict target after its values, then options. This replaces the (table, column, where) sketch of #53 and #562. A caller of the corpus's `IN (SELECT …)` helper swaps two arguments.
- **SQL**: `EXISTS (SELECT 1 FROM <table>[ AS <alias>][ WHERE <where>])` and `<self> IN (SELECT <column> FROM <table>[ AS <alias>][ WHERE <where>])`. With `all` there is no `WHERE`; `{}` gives `WHERE TRUE`, as in `select()`.
- **`parent`**: sets the subquery's `parentTable` mark, so `parent('id')` in its `where` compiles to `"users"."id"`. It names the outer `FROM` item as the outer query names it: its alias if it has one, otherwise its table (`'extra.articles'` gives `"extra"."articles"."id"`), as `lateral` does. Without `parent`, the subquery drops the mark it would inherit (the override, below): `parent()` in its `where` throws, as at the top level, even inside a `lateral` subquery; an uncorrelated `exists('users', all)` still compiles. So no call depends on where it sits, and B could later fill only that throwing case. Decided under the owner's delegation.
- **`alias`**: `AS <alias>` after the table, as `select()`'s `alias` writes it. The subquery's own name is its `alias`, else the last identifier of `table`. When the last identifier of `parent` is that name, both unquoted as `compileExpression` writes them (`'users'` and `'"users"'` are one name), the condition is refused: Postgres would resolve `parent` to the subquery's own table, and the replay shows the wrong rows, silently. The refusal is a fragment that throws as it compiles, so `run()` rejects before any query, as the conditions' `refused()` does. The error names both and asks for another alias.
- **`self`** has no meaning in the subquery's `where`: it throws there, as in `select()`'s `where`. Otherwise the outer key, unqualified inside the subquery, would resolve to an inner column.
- **The override**: the inner fragment's `compile` calls the original with neither column nor inherited mark, `nested(result, undefined, undefined)`; its own `parentTable`, set by `parent`, still wins. It overrides `compile` as `select()` does for `selectExactlyOneChecksForSecondRow`, so a `copy()` of the condition keeps it.
- **Types**: `exists()` has the constraint `never`, so it fits under any key, in `and()`, `or()` and `not()`, or as the `where` itself. The docs show `and()`. `EXISTS` is never `NULL`: `boolean`. `isInSelect()` goes under a key, its `self`: as the `where` itself, `not(isInSelect(…))` throws on `self`. `isInSelect()` is typed on the subquery column's `Selectable` type, `null` excluded as `isDistinctFrom()` excludes it, and gives `boolean | null`. Its `C` is a `keyof SelectableForTable<T>`: `ColumnForTable<T>` is a lookup, which cannot index it (TS2536).
- **No `isNotInSelect()` and no `notExists()`** (no synonym): the anti-join is `not(exists(…))`. The JSDoc of `isInSelect()` says that `not()` of it matches no row once the subquery returns a `NULL` (replay above).
- **Tests** (issue #562, **Done when**): the SQL or the refusal of each C and `isInSelect()` row of § Replays, frozen; real execution; the injection matrix on `table`, `column`, `parent`, `alias` and the `where` values; the alias refusal, `alias: 'users'` and `parent: '"users"'` included; `self` refused; `parent()` refused without `parent`, in a `lateral` too; `copy()` keeping `parent`; types positive and negative; `bench:types`.

## Risks

- **`parent('id')` is not checked against the outer table**, as in `lateral`: a wrong column is Postgres's 42703, a wrong `parent` its 42P01, both before any row.
- **The alias rule compares names, not relations**: `parent: 'public.users'` over `extra.users` is refused, though Postgres resolves `"public"."users"."id"` to the outer table (replayed); an alias settles it. The bare `"users"."id"` there is the inner table (replayed: no row).
- **A name the inner table lacks resolves to the outer row**, silently, as in a `lateral`'s `Whereable` today. Typed calls refuse it; an untyped one (JavaScript, `as any`) does not. `{ manager_id: isInSelect('extra.articles', all, 'manager_id') }` compiles to `"manager_id" IN (SELECT "manager_id" FROM "extra"."articles")` and returns Bob and Cyd, not Postgres's 42703; an inner key `display_name: 'Bob'` filters on the outer user (replayed). A JavaScript caller gets wrong rows, no error.

## Sources

- Postgres: [subquery expressions](https://www.postgresql.org/docs/current/functions-subquery.html) (`EXISTS`, `IN`, the `NULL` of `NOT IN`); the wiki's [Don't Do This](https://wiki.postgresql.org/wiki/Don%27t_Do_This#Don.27t_use_NOT_IN).
- Kysely: [complex where clause](https://kysely.dev/docs/examples/where/complex-where-clause) (`exists`, `selectFrom`, `whereRef`).
- Zapatos: [docs](https://jawj.github.io/zapatos/), § `lateral` and `parent`.
