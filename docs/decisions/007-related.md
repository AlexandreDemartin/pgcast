# 007 — Laterals on foreign keys: `related()`, `relatedMany()` and references to a lateral's result

- **Status**: accepted (2026-11-17), by delegation from the owner: each choice below is decided under the philosophy, and carries its own status.
- **Scope**: feature [#54](https://github.com/AlexandreDemartin/pgcast/issues/54), its planned PRs 3 to 7 ([#627](https://github.com/AlexandreDemartin/pgcast/issues/627) to [#631](https://github.com/AlexandreDemartin/pgcast/issues/631)), and the rule for typed references that [#57](https://github.com/AlexandreDemartin/pgcast/issues/57) reuses.
- **In short**: `related()` and `relatedMany()` are **not built in the core**. With the key's columns read from the catalog, the runtime needs a generated runtime module (A). With the columns written in the call and checked against declared keys (E), it needs none, but each call saves a type, never a line nor the SQL, for two public helpers and a `zapatos/schema` export that `src/db` would read, a canary increment. What #54 keeps: `groupBy` takes an array that mixes columns and fragments, and the docs complete what `website/lateral.md` shows of a lateral on a foreign key, written by hand.

## Context

#54 sketches `db.related('studios')` in the `lateral` of `select('films', …)`, compiling to the hand-written lateral:

```ts
db.select('films', db.all, { lateral: {
  studio: db.selectExactlyOne('studios', { id: db.parent('studio_id') }),  // by hand today
  // studio: db.related('studios'),                                       // #54's sketch
}})
```

What the code gives today:

- **The runtime has no schema.** `zapatos/schema` is declarations only (`declare module 'zapatos/schema'`), and `src/db` imports nothing else from the generator. Zapatos did this on purpose in 3.0: its commit "Generating ambient zapatos/schema and zapatos/custom declarations", and the warning `legacy.ts` still prints, "ZAPATOS NO LONGER COPIES ITS SOURCE TO YOUR SOURCE TREE". To write `"id" = "films"."studio_id"`, `related('studios')` needs `studio_id` and `id` at run time, and only the catalog knows them. #627, as written, puts the keys into `zapatos/schema`, where only the compiler can read them.
- **`parent('c')`** compiles to `<parentTable>."c"`. `lateral` sets the `parentTable` mark: `lateral[k].copy({ parentTable: alias })` (`select()`, `src/db/shortcuts.ts`).
- **A `Whereable` compiles its keys sorted** (`Object.keys(…).sort()`, `src/db/core.ts`). So `{ seat: …, screening_id: … }` writes `"screening_id"` first, whatever order the caller used.
- **In a `lateral`, `selectOne()` and `selectExactlyOne()` compile to the same SQL** (`LIMIT 1`). They differ only by type: `| undefined` or not. Nested, `selectExactlyOne()` checks nothing, and a missing row comes back as `null` (`website/lateral.md`).
- **A lateral's result** is `"lateral_<key>".result`, which `SQLForAlias` quotes (R7). The docs show it (`website/select.md`). `order` takes any fragment. `groupBy` takes a column, an array of columns, or one fragment.
- **[#625](https://github.com/AlexandreDemartin/pgcast/issues/625) measured** a check of `parent()` columns at +47.7 % Instantiations on `bench:types` (threshold +20 %), the mark alone at about +13 points. It also refused four shapes that run. The cause: a subquery's argument types never reach its return type. The outer query can only push its table down through contextual typing, and that check is paid on every property of the `Whereable`.

## Corpus

Two projects of real usage, about 14,500 TypeScript files, read with a TypeScript AST scan (skill `consumer-usage`; no project named, examples invented).

| What | Count |
|---|---|
| `parent()` calls | 1,255, of which 1,144 (91 %) carry a type argument, `parent<T.Column>('c')`; #625's 114 counted only the untyped form |
| shortcuts whose `where` holds a `parent()` | 1,080: #54's "about a thousand" holds. 975 sit in a `lateral` literal, 105 are built apart (a variable, a helper) |
| … the join alone, nothing else in the `where` | 888; 192 (18 %) add a condition beside the join |
| … two `parent()`s (a composite join) | 13 |
| … shaped `id: parent('x_id')` (many-to-one) | 340: 165 `selectExactlyOne()`, 175 `selectOne()` |
| … shaped `x_id: parent('id')` (one-to-many) | 308 |
| … on other columns (a code, a column two tables share) | 419: only the catalog can say which are foreign keys |
| options beside the join | `columns` 579, none 387, `lateral` 194, `order` 54, `extras` 41, `limit` 10, `alias` 2 |
| many-to-one, join alone, typed `parent()`, read against the project's generated schema | 288: 254 (88 %) pick the shortcut that matches the column's nullability; 23 `selectOne()` on a `NOT NULL` column (a needless `\| undefined`); 11 `selectExactlyOne()` on a nullable one (`null` under a type without it, unless the outer query filters it) |
| references to `lateral_<key>.result` | 128, all in one project: about 50 lines in `order`, 11 in `groupBy` (7 a `sql` fragment, 4 a string cast to a column type to fit an array of columns), about 44 in conditions, the rest in `extras` and `sql`. 79 read a field (`->>`, `->`); 98 are unquoted, which holds while the key is lower case. None sits under `@ts-ignore`: the casts are the workaround |

## 1. Where `related()` finds the key's columns at run time

**Status**: accepted (2026-11-17), by delegation.

All five options compile to the same SQL, the hand-written lateral's: they differ only in where the columns come from.

| | A. A generated value, passed to each call | E. The join's columns in the call, checked against declared keys | B. A registry set once | C. Read from the catalog at run time | D. Written in the call, as today |
|---|---|---|---|---|---|
| **The caller writes** | `related(fk.films.studios)`, `fk` imported from a generated `zapatos/foreignKeys.ts` | `related('films', 'studios', { id: 'studio_id' })`, `relatedMany('films', 'roles', { film_id: 'id' })`; the keys declared in `zapatos/schema`, opt-in | `related('studios')`, after `db.setConfig({ foreignKeys })` | `related('studios')` | `selectExactlyOne('studios', { id: db.parent<s.films.Column>('studio_id') })` |
| **How the parent table is known** | the value names the key's table, which nothing checks against the outer query; the SQL's parent is the outer query's `parentTable` mark | the call names it, as `parent<s.films.Column>` does, and nothing checks it against the outer query (probed); the SQL's parent is the mark | through context, as #625 | at run time, from the mark: an alias hides the table | the type argument, which the caller writes |
| **Compile cost** | measured below: +1.8 points over the same 6 laterals by hand | measured below: +2.0 points, with the keys read by indexing alone | the mark alone, about +13 points (#625), plus a lookup by pair of tables | the same as B | none |
| **What it adds** | the first generated runtime file since Zapatos 3.0: its module format (CJS, ESM, TypeScript) and `outExt`, `--check`, the docs schema, and an import in every file that joins | two public helpers; and the first `zapatos/schema` export that `src/db` reads since the fork. A schema without it breaks `zapatos/db`'s declarations, so the generator writes it even without the opt-in (a change to the default output), and the canary goes up, so every consumer regenerates (a stop point). Declaring the keys into `zapatos/db` from `schema.d.ts` instead hides that module (TS2305, probed) | a registry on top of A's runtime file, as `foreignKeys` is the same generated value; one registry for every database (#68); and contextual typing, for `related()` to learn its parent's table | a hidden query and a cache | nothing |
| **The philosophy** | allowed (principle 5 writes `.ts` files), and needs nothing from `core.ts` | allowed: the keys from the catalog, the SQL from the call's own columns, no runtime file | refused: no global registry (skill `zero-abstraction`), and the cost of contextual typing (#625) | refused: an implicit query, a cache | — |

**The SQL**, compiled by the built runtime from the hand-written calls. A related call that builds the same `Whereable` and calls `select()` gives the same SQL, byte for byte (the `select()` wrapper of the outer query left out):

| Join | Hand-written | SQL of the lateral |
|---|---|---|
| many-to-one, `films.studio_id NOT NULL` | `selectExactlyOne('studios', { id: parent('studio_id') }, { columns: ['name'] })` | `LEFT JOIN LATERAL (SELECT jsonb_build_object($3::text, "name") AS result FROM "studios" WHERE ("id" = "films"."studio_id") LIMIT $4) AS "lateral_studio" ON true` |
| one-to-many, `roles.film_id` | `select('roles', { film_id: parent('id') }, { columns: ['character'], order: { by: 'billing', direction: 'ASC' } })` | `LEFT JOIN LATERAL (SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($3::text, "character") AS result FROM "roles" WHERE ("film_id" = "films"."id") ORDER BY "billing" ASC) AS "sq_roles") AS "lateral_cast" ON true` |

**Measured** (`npm run bench:types`, prototypes never committed). Master is 15,824 Instantiations and 7,433 Types, +1.1 % and +3.3 % on the baseline. Each prototype adds the same 6 laterals on the fixture: nested, a composite key, a self-reference, two keys between the same tables.

| Prototype | Instantiations | Types |
|---|---|---|
| D: the 6 laterals by hand, with `parent<T.Column>` | 16,281 (+4.0 %) | 7,551 (+5.0 %) |
| A: `related()` and `relatedMany()` over a generated `as const` value | 16,557 (+5.8 %) | 7,790 (+8.3 %) |
| E: `related()` and `relatedMany()` over two declared maps, one per direction, read by indexing alone | 16,596 (+6.1 %) | 7,844 (+9.1 %) |
| E over one declared map, filtered by `Extract` | 18,100 (+15.7 %) | 8,123 (+12.9 %) |

So A costs 276 Instantiations over D, 46 per call, +1.8 points for the 6: the types are not the obstacle. (A first count, 16,623 against 16,308, held a seventh call, the refused one, and a baseline of untyped `parent()`.) Its result types check out, an ambiguous key is refused, and neither collapses to `any` (probed). It checks a key's columns, not that the key leaves the parent table: `related(fk.memberships.orgs)` under `select('accounts', …)` compiles, and joins on `"accounts"."org_country"` and `"accounts"."org_code"`: 42703, or the wrong rows when the outer table has columns of those names (probed).

E costs 315 Instantiations over D, 52 per call, +2.0 points; filtered by `Extract`, 1,819 (+11.6 points). It refuses each negative probed: a nullable key's `| undefined` read as a row, a column that is not the key's (`{ id: 'id' }`), a pair of tables with no key, half a composite key, an extra column beside the key, a one-to-many join given to `related()`. Of two keys between the same tables, the columns pick one, so there is no `fk` error. Like `parent<s.films.Column>`, it checks the parent it names, not the outer query: `related('accounts', 'users', { id: 'owner_id' })` under `select('users', …)` compiles.

**Market standard**:

- **PostgREST** reads the keys at run time into a schema cache, reloaded on `NOTIFY pgrst, 'reload schema'`: option C. `GET /films?select=title,studios(name)` embeds the studio. When two keys link the tables, it answers PGRST201 and asks for a hint, `studios!films_distributor_id_fkey(name)`.
- **Kysely** has no relations. You write the join, `jsonObjectFrom(eb.selectFrom('studios').select('name').whereRef('studios.id', '=', 'films.studio_id'))`, its columns checked against the tables in scope, its result `| null` whatever the key: option D.
- **Drizzle**'s relational queries need relations declared in TypeScript (principle 2); **Prisma** is an ORM.

**Choice: D.** Nothing is built in the core: no `related()`, no `relatedMany()`, no foreign-key metadata (#627, #628 and #629 crossed out). E replaces A as the design a revival would follow.

- **E, the better of the two options inside the philosophy, still costs more than it saves.** It needs no runtime file, and its compile cost is A's. Each call saves a type, never the SQL nor a line: `related('accounts', 'users', { id: 'owner_id' })` is about as long as `selectExactlyOne('users', { id: parent<s.accounts.Column>('owner_id') })`. That type picks the shortcut from the key, where 34 of the corpus's 288 typed many-to-one laterals pick the other one (11 type a `null` away, 23 add a needless `| undefined`), and refuses a join column that is not the key's (§ Risks). In exchange, the core keeps two public helpers forever, and `src/db` reads a `zapatos/schema` export for the first time since the fork: the default output changes and the canary goes up, so every consumer regenerates.
- **A saves the same type and the parent's name**, for a generated runtime file, which Zapatos 3.0 stopped writing, imported in every file that joins.
- **What the call saves is already mostly there.** 91 % of the corpus's `parent()` calls carry `parent<T.Column>`, which refuses a column of another table (#625). 88 % of its many-to-one laterals already pick the right shortcut. The other 34 are a type each, never the SQL: the docs say how to choose (`website/lateral.md`).
- **A or E covers half the corpus at best**: a single-column join to `id` or from it, 648 of 1,080, fewer once the 18 % with a condition beside the join are out. A join on other columns, a condition beside it, or a key from a variable still needs the hand-written form.
- **Small is beautiful**: a core helper must pay for itself in the core. E's helpers need nothing from `core.ts` nor from `src/db`'s internals, so they fit a separate package (principle 4), over keys the generator declares opt-in: nothing in `src/db` reads them, so the default output and the canary stay.
- **Reversible**: E is written down above, with its measures. It comes back as a revision of this note, opt-in, if real use outside the corpus asks for it.

## 2. The points #54 asks to decide first, for a revival

**Status**: accepted (2026-11-17), by delegation, as the design a revival would follow, written for A. Nothing below is built while choice 1 stands. Under E, three rows change: a composite key's pairs are written in the call, checked against the declared key; there is no `fk` error, as the columns pick the key; and the metadata is two maps declared in `zapatos/schema`, `ToOne` (with `exactlyOne` per pair of tables, true only if every key of the pair is) and `ToMany`, not `zapatos/foreignKeys.ts`.

| Point | Decision for A | SQL, equal to the hand-written lateral's | Evidence and standard |
|---|---|---|---|
| **Composite keys** | one `parent()` per pair of columns, from `conkey` and `confkey` | invented `tickets (screening_id, seat) REFERENCES seat_bookings`: `WHERE ("screening_id" = "tickets"."screening_id" AND "seat" = "tickets"."seat")`, whatever order the hand-written keys take (sorted) | 13 in the corpus; PostgREST embeds them as single keys |
| **Self-references** | refused when the subquery's name (its `alias`, else the last identifier of its table) is the parent's, as note 006 refuses `exists()`; the error asks for an `alias` | `crew.mentor_id`, `alias: 'mentor'`: `FROM "crew" AS "mentor" WHERE ("id" = "crew"."mentor_id")`. Without it, `FROM "crew" WHERE ("id" = "crew"."mentor_id")`: `"crew"` is the inner table, so no row and no error, as note 006 replayed | 2 `alias` among the corpus's correlated `where`s; pgcast's own `bench/reads.ts` holds such a lateral, `manager`, never run; PostgREST needs a hint, `crew!mentor_id(*)` |
| **The `fk` error** | from the value's shape, with no conditional type: one key between two tables is the key itself; several are an object of them by constraint name, which is no key, so `related(fk.transfers.accounts)` is TS2345, the type naming the constraints | each key compiles as the single one does | PostgREST: PGRST201 at run time; here, at compile time, measured above |
| **The opt-in's name** | `foreignKeys: true` in the generator's config, optional, read with `?? false` as the other opt-ins; it writes `zapatos/foreignKeys.ts` | — | `src/generate/config.ts` |
| **Exactly one or `selectOne()`** | exactly one only if every column of the key is `NOT NULL`, the constraint is `convalidated` and not `condeferrable`, and the target has no `relrowsecurity`; a temporal key (`conperiod`, Postgres 18) is no equality join and is left out | the same SQL either way: only the type loses `\| undefined` | 288 laterals above; Zapatos's docs Limitations ("might be inferred for us"); Kysely gives `\| null` always |
| **The metadata's shape** | per key: `constraint`, `table`, `columns`, `references`, `referencedColumns` (in the key's order), `exactlyOne`; grouped by table, then by referenced table; tables named as `Table` is (`'extra.articles'`) | — | the prototype measured above |

## 3. References to a lateral's result in `order` and `groupBy`

**Status**: accepted (2026-11-17), by delegation.

| | R1. A reference checked against the `lateral` keys | R2. A reference helper, unchecked | R3. No helper; `groupBy` mixes columns and fragments |
|---|---|---|---|
| **The caller writes** | `order: { by: db.lateralResult('studio'), … }`, a typo refused | the same, any key accepted | ``groupBy: ['studio_id', db.sql`"lateral_rating".result`]`` |
| **SQL** | `ORDER BY "lateral_studio".result ASC` | the same | `GROUP BY "studio_id", "lateral_rating".result`; today the fragment compiles to `"[object Object]"`, so Postgres refuses it (42703) and the type refuses it too |
| **Compile cost** (measured) | +1,037 Instantiations (+6.6 points), paid by every `select()`, with no reference written; it still lets a reference through when the query has no `lateral` | +0 | +0 Instantiations, +1 Type |
| **What it saves** | the hand-spelled alias, and a typo found before Postgres's 42P01 | the hand-spelled alias | the 4 casts |

**Choice: R3.** #630 becomes "Allow groupBy to mix columns and SQL fragments" (a widened type, and SQL for what Postgres refused); the docs name `"lateral_<key>".result` and its quoting.

- R1 pays 6.6 points on every query for a typo that Postgres reports before any row, and it puts the enclosing query's options into contextual typing, the mechanism #625 set aside.
- R2 would be a synonym for a fragment that already works and is already typed in `order`, `groupBy` and `extras` (skill `zero-abstraction`, § Naming).
- **The rule #57 reuses**: a reference to a name the query defines (a lateral's key, a table's alias) is checked, if at all, by what the call itself names: an explicit type argument, as `parent<s.films.Column>`, or a table argument. It is never checked through the enclosing query's options. Contextual typing cost about 13 points in #625 and 6.6 here, and it refused code that runs.

## What changes in the plan

- **#627, #628, #629** (keys, `related()`, `relatedMany()`): crossed out, pointing here.
- **#630**: re-scoped to R3, from master; it widens a public option type, so it keeps its lens `types`.
- **#631**: re-scoped to the docs that follow from this note. `website/lateral.md`, EN and FR, shows the hand-written lateral on a foreign key, `parent<T.Column>`, how to choose `selectExactlyOne()`, and the reference to a lateral's result. `website/catalog-types.md`, EN and FR, stops promising that #54 will read foreign keys (its § Reading more and its `selectExactlyOne()` paragraph).
- **R38** (`docs/CHARACTERISATION-REPORT.md`) stays "leave". Its pointer goes to this note and `parent<T.Column>`, not to `related()`.

## Risks

- **The corpus is two projects.** A third that joins on keys alone, with few options, would save more per call. That changes the gain of A, not its runtime file.
- **The 11 `selectExactlyOne()` on a nullable column** stay possible: a type with no `null` over a `null`. The docs rule, not a helper, is what guards them.
- **A wrong `parent()` column of the right table** (`parent<s.films.Column>('id')` for `studio_id`) still compiles and joins the wrong rows. A or E would rule it out for a key's columns, not for a key of another table under the outer query (§ 1); D leaves both to review and to tests that run the query.

## Sources

- Zapatos: [docs](https://jawj.github.io/zapatos/), § `lateral`, § Limitations ("we need to manually specify selectExactlyOne…", "there's no check that your joins make sense"), § What's next ("make use of foreign key relationships…"); its 3.0 commits (`38e4ff2`, before `3.0.0`), `git log upstream/master`, and its docs changelog § 3.0.
- Postgres: [`pg_constraint`](https://www.postgresql.org/docs/current/catalog-pg-constraint.html) (`conkey`, `confkey`, `convalidated`, `condeferrable`, `conperiod`); [row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
- PostgREST: [resource embedding](https://docs.postgrest.org/en/stable/references/api/resource_embedding.html), [schema cache](https://docs.postgrest.org/en/stable/references/schema_cache.html), [errors](https://docs.postgrest.org/en/stable/references/errors.html) (PGRST201).
- Kysely: [relations](https://kysely.dev/docs/recipes/relations) (`jsonObjectFrom`, `jsonArrayFrom`).
- #625: the prototype and its measures; note [006](./006-subquery-conditions.md): the alias rule and its replays.
