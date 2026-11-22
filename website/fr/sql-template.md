---
english: 76a20f69b5d0
---

# Template SQL

`sql` est le tagged template sur lequel repose chaque requête de pgcast, raccourcis compris. Cette page liste ce qu’il accepte, ce que donne chaque interpolation une fois compilée, et le `SQLFragment` qu’il renvoie.
{.lede}

## `sql` {#sql}

```ts
db.sql<
  Interpolations = db.SQL,
  RunResult = pg.QueryResult['rows'],
  Constraint = never,
>`…`: SQLFragment<RunResult, Constraint>
```

Renvoie un [`SQLFragment`](#SQLFragment) : les parties littérales telles que vous les avez écrites, chaque interpolation compilée comme ci-dessous, chaque valeur en paramètre numéroté. Rien n’est envoyé avant [`run()`](#run).

<CastPanel example="sql_template">

<<< ../examples/sql_template.ts{ts twoslash}

</CastPanel>

### Arguments de type {#type-arguments}

| Argument | Par défaut | Ce qu’il fixe |
|---|---|---|
| `Interpolations` | [`db.SQL`](#SQL) : chaque table et chaque colonne du schéma | ce qui peut être interpolé ; `s.films.SQL` n’accepte que les noms de `films`, et `cols()` / `vals()` de n’importe quelle valeur |
| `RunResult` | `pg.QueryResult['rows']` (`any[]`) | ce en quoi `run()` se résout, et le type du fragment comme valeur de `lateral` ou d’`extras` : sans lui, cette clé est `any`, sans erreur |
| `Constraint` | `never` | le type de valeur auquel une condition se compare ; fixé par [`conditions`](/fr/conditions#conditions), vérifié par un Whereable. Vous le donnez rarement. |

`RunResult` n’est pas confronté au SQL : c’est vous qui affirmez ce qui revient. Les raccourcis le fixent pour vous.

Écrit en ligne comme valeur du `where` d’un raccourci, ou des valeurs d’`update()`, un fragment tire son `Constraint` de chaque table et vue qui a une colonne de ce nom : TypeScript l’infère avant de connaître la table. Là où leurs types diffèrent, un fragment pourtant valide ne compile pas (TS2322) : un `id` qui est un `int4` ici et un `uuid` là, ou un enum ici et un autre enum là ; dans `update()`, une vue de `films`, dont le `title` peut être `NULL`, fait échouer `` { title: db.sql`upper(${db.self})` } ``. Donnez-lui un argument de type, `` db.sql<db.SQL>`upper(${db.self})` ``, ou déclarez-le d’abord.

Un nom hors d’`Interpolations` ne compile pas :

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
db.sql<s.films.SQL>`SELECT ${'name'} FROM ${'films'}`;
```

### Interpolations {#interpolations}

Chaque valeur entre `${…}` se compile selon ce qu’elle est. Le SQL est celui du `.compile()` de la bibliothèque construite.

| Valeur | Compile en | Entrée |
|---|---|---|
| une chaîne | un nom entre guillemets : `'films'` → `"films"`<!-- probe: db.sql`${'films'}` -->, `'public.films'` → `"public"."films"`<!-- probe: db.sql`${'public.films'}` --> | [Identifiants](#identifiers) |
| `param(x, cast?)` | `$1`<!-- probe: db.sql`${db.param('x')}` -->, ou `CAST($1 AS "timestamptz")`<!-- probe: db.sql`${db.param('x', 'timestamptz')}` --> ; `x` dans les valeurs | [`param()`](#param) |
| `raw(s)` | `s`, tel quel | [`raw()`](#raw) |
| `cols(o)` / `cols(a)` | les clés de l’objet, triées, ou les éléments du tableau, entre guillemets : `"film_id", "tag"`<!-- probe: db.sql`${db.cols({ tag: 'x', film_id: 1 })}` --> | [`cols()`](#cols) |
| `vals(o)` / `vals(a)` | les valeurs, dans l’ordre de `cols(o)`, ou dans celui du tableau : `$1, $2`<!-- probe: db.sql`${db.vals({ tag: 'x', film_id: 1 })}` --> | [`vals()`](#vals) |
| tout autre objet | un Whereable, la façon d’écrire une condition, typé par colonne : `("studio_id" = $1)`<!-- probe: db.sql`${{ studio_id: 1000 }}` -->, d’après ses propres clés énumérables, objet simple ou non ; `{}` → `TRUE`<!-- probe: db.sql`${{}}` --> ; un objet natif, comme un `Date`, lève une erreur | [Objets Whereable](#whereable) |
| `self` | la colonne courante, dans un fragment donné en valeur d’un Whereable | [`self`](#self) |
| `parent(c?)` | la colonne de la requête parente : `"studios"."id"`<!-- probe: db.select('studios', db.all, { lateral: { films: db.select('films', { studio_id: db.parent('id') }) } }) --> | [`parent()`](#parent) |
| `Default` | `DEFAULT`<!-- probe: db.sql`${db.Default}` --> | [`Default`](#Default) |
| un fragment `sql` | son propre SQL, ses paramètres numérotés à la suite | [Fragments imbriqués](#nested-fragments) |
| un tableau | chaque élément tour à tour, rien entre eux ; `[]` → rien | [Tableaux](#arrays) |

Tout le reste lève une erreur à la compilation, si bien que `run()` est rejetée avant toute requête, et le type le refuse (`null` et `undefined` seulement avec `strictNullChecks`) : un nombre ou un booléen (`Alien object while interpolating SQL: 42`<!-- message -->), `undefined`, un symbole comme [`all`](#all), et `null` : "Interpolating `null` has no meaning in SQL: for a `NULL` value, interpolate `db.param(null)`…"<!-- message -->. Zapatos 6.6.1 levait une `TypeError` sur `null`.

L’objet global, que le type laisse passer, lève aussi une erreur : "Did you use `self` (the global object) where you meant `db.self` (the Zapatos value)?…"<!-- message -->.

## Identifiants {#identifiers}

Une chaîne interpolée est un nom de table ou de colonne. Elle est découpée sur `.` et mise entre guillemets doubles : sa casse est conservée, et un mot-clé reste un nom. Elle ne peut jamais fermer ses guillemets :

| Chaîne | Compile en | |
|---|---|---|
| `'films'` | `"films"`<!-- probe: db.sql`${'films'}` --> | |
| `'public.films'` | `"public"."films"`<!-- probe: db.sql`${'public.films'}` --> | découpée sur `.` |
| `'a"b'` | `"a""b"`<!-- probe: db.sql`${'a"b'}` --> | un `"` est doublé, comme le fait `quote_ident` |
| `'a""b'` | `"a""b"`<!-- probe: db.sql`${'a""b'}` --> | déjà échappée à la main : inchangée |
| `'"Films"."title"'` | `"Films"."title"`<!-- probe: db.sql`${'"Films"."title"'}` --> | déjà un nom entre guillemets bien formé : inchangée |
| `'"films".title."x"'` | `"films".title."x"`<!-- probe: db.sql`${'"films".title."x"'}` --> | bien formée, et qui finit par une partie entre guillemets : inchangée |
| `'"films".title'` | `"""films"""."title"`<!-- probe: db.sql`${'"films".title'}` --> | mal formée, car elle finit sans guillemets : chaque `"` doublé, découpée sur `.` |
| `'"a" \|\| "b"'` | `"""a"" \|\| ""b"""`<!-- probe: db.sql`${'"a" \x7c\x7c "b"'}` --> | mal formée : un seul nom |

- Bien formée : un identifiant entre guillemets, puis, après chaque `.`, avec ou sans espaces autour, des identifiants entre guillemets, `U&` entre guillemets ou sans guillemets, le dernier entre guillemets.
- Le prix : une vraie colonne nommée `a""b` compile en `"a""b"`<!-- probe: db.sql`${'a""b'}` -->, la colonne `a"b`.
- Zapatos 6.6.1 entourait la chaîne de `"` sans échappement, et écrivait telle quelle toute chaîne qui commençait et finissait par `"` : un nom pouvait injecter du SQL autour de lui. Les types `Table` et `Column` générés refusaient déjà de tels noms ; l’explication est dans [Sécurité](/fr/security).

Interpolez les noms plutôt que de les écrire dans le littéral : ils passent la vérification de types, et suivent le schéma quand vous le régénérez.

## `param()` {#param}

```ts
db.param<T>(value: T, cast?: boolean | string): Parameter<T>
```

Un paramètre numéroté : `$1`, `$2`…, numérotés sur toute la requête, et `value` à cette place dans les valeurs. La valeur n’entre jamais dans le texte SQL. Il accepte n’importe quelle valeur : pour une condition sur une colonne, un [Whereable](#whereable) est la forme typée, `{ release_year: db.conditions.lt(2000) }`<!-- tsc: db.sql`${…}` -->.

<CastPanel example="sql_param">

<<< ../examples/sql_param.ts{ts twoslash}

</CastPanel>

Les deux dernières lignes s’appliquent quand [`castArrayParamsToJson`](/fr/runtime-config#Config.castArrayParamsToJson) ou [`castObjectParamsToJson`](/fr/runtime-config#Config.castObjectParamsToJson) est activé ; les deux sont désactivés par défaut.

| `cast` | Compile en | Valeur envoyée |
|---|---|---|
| aucun | `$1`<!-- probe: db.sql`${db.param('x')}` --> | `value`, telle que `pg` la sérialise |
| `'timestamptz'` | `CAST($1 AS "timestamptz")`<!-- probe: db.sql`${db.param('x', 'timestamptz')}` --> | `value` |
| `'pg_catalog"."text'` | `CAST($1 AS "pg_catalog"."text")`<!-- probe: db.sql`${db.param('x', 'pg_catalog"."text')}` --> | `value` |
| `'public.crew_job'`, `'int4[]'` | `CAST($1 AS "public"."crew_job")`<!-- probe: db.sql`${db.param('x', 'public.crew_job')}` -->, `CAST($1 AS "int4"[])`<!-- probe: db.sql`${db.param([1], 'int4[]')}` --> | `value` |
| `true` | `CAST($1 AS "json")`<!-- probe: db.sql`${db.param([1], true)}` --> pour un tableau ou un objet simple ; `$1`<!-- probe: db.sql`${db.param('x', true)}` --> sinon | `JSON.stringify(value)` ; sinon `value` |
| `false` | `$1`<!-- probe: db.sql`${db.param([1], false)}` --> | `value`, jamais en JSON |
| aucun, pour un tableau avec `castArrayParamsToJson` activé, ou un objet simple avec `castObjectParamsToJson` activé | `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1, 2])}`) --> | `JSON.stringify(value)` |
| une chaîne, pour un tableau ou un objet simple sous son option | le cast, comme ci-dessus : `CAST($1 AS "jsonb")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1, 2], 'jsonb')}`) --> | `JSON.stringify(value)` ; sous `castArrayParamsToJson`, un tableau dont le cast finit par `[]` ou `[n]`, `CAST($1 AS "int4"[])`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1, 2], 'int4[]')}`) -->, envoie `value` |

- Un `cast` en chaîne sans `"` est découpé sur `.`, chaque partie entre guillemets ; des bornes de tableau à sa fin, `[]` ou `[n]`, suivent les guillemets : `'public.crew_job[]'` donne `CAST($1 AS "public"."crew_job"[])`<!-- probe: db.sql`${db.param(['writer'], 'public.crew_job[]')}` -->.
- Avec un `"`, il s’écrit `"cast"` si le résultat est bien formé (des parties entre guillemets jointes par `.`), ou tel quel s’il est déjà entre guillemets de cette façon : un type dont le nom même contient un `.` s’écrit `'"crew.job"'`, car `'crew.job'` est le type `job` du schéma `crew`.
- Toute autre chaîne avec un `"` est un seul nom entre guillemets, chaque `"` doublé, si bien qu’elle ne peut pas fermer ses guillemets : `'int4") || (SELECT 1) || ("int4'` donne `CAST($1 AS "int4"") || (SELECT 1) || (""int4")`<!-- probe: db.sql`${db.param(1, 'int4") || (SELECT 1) || ("int4')}` -->, un type qui n’existe pas.
- Zapatos 6.6.1 écrivait tout `cast` tel quel entre guillemets : `'public.crew_job'` et `'int4[]'` nommaient donc des types qui n’existent pas.
- Chaque partie reste entre guillemets, si bien qu’un nom que seule la grammaire SQL connaît n’est pas un type ici : `'int'`, `'double precision'`, `'varchar(10)'` échouent (42704). Donnez le nom que le type porte lui-même (`'int4'`, `'float8'`, `'timestamptz'`), ou écrivez le cast dans `sql` : `` db.sql`CAST(${db.param(x)} AS varchar(10))` ``.
- Sans `"`, une partie laissée vide lève une erreur à la compilation, si bien que `.run()` est rejetée avec une simple `Error` avant toute requête : `''`, `'[]'`, `'public.'` et `'.crew_job'` donneraient `""`, que Postgres refuse (42601). L’erreur nomme le cast et le nom qu’il donne : "param() cast '…' gives an empty name, …, which Postgres refuses: name each part of the type, as in 'int4' or 'public.mood', or leave the cast out"<!-- message -->. Zapatos 6.6.1 les envoyait, et Postgres les refusait aussi, sauf là où la 6.6.1 abandonnait le cast : au profit de `"json"` sous `castArrayParamsToJson` ou `castObjectParamsToJson`, et comme valeur d’un Whereable.
- Sous `castArrayParamsToJson` ou `castObjectParamsToJson`, un cast en chaîne est le type écrit, et la valeur reste le texte JSON que l’option envoie (la dernière ligne du tableau) : `param({ a: 1 }, 'jsonb')` fonctionne avec `=` et `@>` sur une colonne `jsonb`.
- Sous `castArrayParamsToJson`, un tableau dont le cast finit par `[]` ou `[n]` part comme un tableau : `'_int4'` et un domaine sur un tableau envoient toujours du JSON, que Postgres refuse comme tableau (22P02).
- Zapatos 6.6.1 abandonnait un cast en chaîne sous l’une ou l’autre option au profit de `CAST($1 AS "json")` ([#36](https://github.com/AlexandreDemartin/pgcast/issues/36)), si bien qu’un cast qui nomme un autre type que sa cible s’applique désormais : `param(arr, 'int4[]')` vers une colonne `json` est refusé (42804), vers une colonne `text` stocke `{1,2}` pour `[1,2]`.
- Sans cast, `castArrayParamsToJson` fait de `` db.sql`${db.param(ids)}::int4[]` `` `CAST($1 AS "json")::int4[]`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1])}::int4[]`) -->, que Postgres rejette (42846) : écrivez `db.param(ids, 'int4[]')`, ou passez `false`, qui garde la valeur hors du JSON sous l’une ou l’autre option : `$1::int4[]`<!-- probe: db.sql`${db.param([1], false)}::int4[]` -->.
- Comme valeur d’un Whereable ou dans `vals([…])` (donc dans [`isIn()`](/fr/conditions#conditions.isIn)), un `Parameter` se compile tel quel, avec son cast : `{ title: db.param('x', 'text') }` donne `("title" = CAST($1 AS "text"))`<!-- probe: db.sql`${{ title: db.param('x', 'text') }}` -->. Zapatos 6.6.1 l’enveloppait dans un second paramètre, envoyé en JSON (`'{"value":"x","cast":"text"}'`).
- Les types reconnaissent un `Parameter` à sa forme, comme dans Zapatos 6.6.1 : un objet qui a une clé `value` du type de la colonne passe donc pour un `Parameter`, et part comme un seul paramètre, en JSON. Avec [`castObjectParamsToJson`](/fr/runtime-config#Config.castObjectParamsToJson) désactivé, la valeur par défaut, `{ runtime_minutes: { value: 3 } }` donne `("runtime_minutes" = $1)`<!-- probe: db.sql`${{ runtime_minutes: { value: 3 } }}` --> avec `'{"value":3}'`, qu’une colonne `INTEGER` refuse (22P02) et qu’une colonne texte stocke tel quel. Enveloppez une valeur dans `param()`. Un objet doté d’une méthode `toPostgres()` est envoyé par cette méthode, comme le fait `pg`. Il en va de même pour un `ParentColumn` : dans un filtre, `{ value: 'title' }` passe là où passe un nom de colonne, et part en JSON, pas comme [`parent('title')`](#parent).
- Avec `castObjectParamsToJson` activé, le même filtre donne `("runtime_minutes" = CAST($1 AS "json"))`<!-- probe: (db.setConfig({ castObjectParamsToJson: true }), db.sql`${{ runtime_minutes: { value: 3 } }}`) -->, que Postgres refuse (42883), et `update()` affecte `ROW(CAST($1 AS "json"))`<!-- probe: (db.setConfig({ castObjectParamsToJson: true }), db.update('films', { runtime_minutes: { value: 3 } }, { id: 1 })) -->, qu’une colonne `INTEGER` refuse (42804). Un objet littéral doté de sa propre méthode `toPostgres()` part alors tel que `JSON.stringify()` l’écrit, sans passer par cette méthode ; une instance de classe, elle, y passe toujours.

### `Parameter` {#Parameter}

```ts
class Parameter<T = any> { value: T; cast?: boolean | string }
```

Ce que renvoie `param()`. Les types Whereable, Insertable et Updatable générés acceptent un `Parameter<T>` du type de la colonne partout où ils acceptent un `T`.

## `raw()` {#raw}

```ts
db.raw(sql: string): DangerousRawString
```

La chaîne, écrite telle quelle dans le SQL : pour une syntaxe qu’un paramètre ne peut pas remplacer, comme un mot-clé.

<CastPanel example="sql_raw">

<<< ../examples/sql_raw.ts{ts twoslash}

</CastPanel>

::: warning Sécurité
Tout ce qui atteint `raw()` s’exécute comme du SQL. Ne lui donnez jamais le texte d’un appelant ; une valeur est un [`param()`](#param). Pour écrire du SQL à la main sans risque : [SQL brut](/fr/raw-sql).
:::

Comme valeur de filtre, `raw()` lève une erreur à la compilation, tout comme `cols()` et `vals()`. Comme valeur d’un Whereable :

> `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in a Whereable (a filter), nor in `isIn()`: to compare with SQL, use a `sql` fragment value, where `db.self` stands for the column; to compare with a value, give the value itself, or `db.param()`. ``<!-- message -->

Dans `isIn()` / `isNotIn()`, et comme élément de `vals([…])` avec une colonne courante, celle d’un filtre ou d’une écriture ([`vals()`](#vals)) :

> `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as an item of `vals([…])` in a column's value, in a filter (as `isIn()` writes it) or in a `sql` fragment value of `vals({…})`, so of `insert()`, `upsert()` or `update()`: for SQL, write it in a `sql` fragment value, outside `vals([…])` (in a filter or in `update()`, `db.self` there stands for the column); for a value, give the value itself, or `db.param()`. ``<!-- message -->

Comme valeur de `eq()`, `add()` et des autres [conditions](/fr/conditions) :

> `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as the value of `eq()`, `add()` and the other conditions: for SQL, write a `sql` fragment with `db.self` in place of the condition; for a value, give the value itself, or `db.param()`. ``<!-- message -->

Dans [`vals({…})`](#vals), donc comme valeur d’`insert()`, d’`upsert()` ou d’`update()`, et dans votre propre template `sql`, dans un `lateral` ou non :

> `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in `vals({…})`, so as an `insert()`, `upsert()` or `update()` value, nor in a `sql` template of your own (`VALUES (…)` or a filter's `IN (…)`): to write SQL, use a `sql` fragment value (in `update()`, `db.self` there stands for the column); to write a value, give the value itself, or `db.param()`. ``<!-- message -->

Le type les refuse là, et comme valeur d’`insert()` ou d’`update()`, sur chaque colonne qu’il type (une colonne typée `any`, ce que donne un placeholder de `zapatos/custom`, accepte tout) ; il les accepte dans le `vals({…})` d’un template `sql` :

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
db.sql<s.films.SQL>`SELECT * FROM ${'films'} WHERE ${{ title: db.raw("'x'") }}`;
```

- Pour comparer avec du SQL : un fragment en valeur, `` { title: db.sql`${db.self} = ${db.raw("'x'")}` } ``.
- Zapatos 6.6.1 les y envoyait comme un seul paramètre, en JSON (`'{"value":…}'`) : aucune ligne sur une colonne texte ou `jsonb`, toutes les lignes avec `ne()` et `isNotIn()`, une erreur (22P02) sur les autres types ; comme valeur d’écriture, une colonne texte ou `jsonb` la stockait.
- Hors de la valeur d’une colonne, dans un template `sql` que vous écrivez ou dans les `updateValues` d’`upsert()`, `vals([db.raw('x')])` lève aussi une erreur, à partir de la 6.11.0, là où Zapatos 6.6.1 envoyait le wrapper en JSON, `'{"value":"x"}'`, qu’une colonne texte stockait : "`` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as an item of `vals([…])` outside a column's value, as in a `sql` template of your own or in `upsert()` `updateValues`: for SQL, write it outside `vals([…])` (in `updateValues`, as the value itself); for a value, give the value itself, or `db.param()`. ``<!-- message -->". Dans `updateValues`, `raw()` lui-même est du SQL ([`upsert()`](/fr/insert#upsert)).

### `DangerousRawString` {#DangerousRawString}

```ts
class DangerousRawString { value: string }
```

Ce que renvoie `raw()`. Un membre qui n’existe que dans le type l’empêche de passer pour un `Parameter`, et un objet de même forme ne compile pas à sa place (TS2741) :

```ts twoslash
// @errors: 2741
import * as db from 'zapatos/db';
// ---cut---
const notRaw: db.DangerousRawString = { value: 'x' };
```

## `cols()` {#cols}

```ts
db.cols<T>(namesOrObject: T): ColumnNames<T>
```

Une liste de noms entre guillemets, séparés par des virgules :

- un objet : ses clés, triées, `cols({ tag, film_id })` → `"film_id", "tag"` ;
- un tableau : ses éléments dans leur ordre, chacun un [identifiant](#identifiers), `cols(['id', 'title'])` → `"id", "title"`.

Avec `vals()` du même objet, un `INSERT` où clés et valeurs s’alignent :

<CastPanel example="sql_cols_vals">

<<< ../examples/sql_cols_vals.ts{ts twoslash}

</CastPanel>

Avec des tableaux, un `SELECT` de quelques colonnes et une liste `IN` ; `s.films.OnlyCols<…>` est le type de ligne de ces colonnes :

<CastPanel example="sql_cols_vals_arrays">

<<< ../examples/sql_cols_vals_arrays.ts{ts twoslash}

</CastPanel>

Un template typé par table (`db.sql<s.tags.SQL>`) accepte `cols()` et `vals()` de n’importe quelle valeur, comme dans Zapatos 6.6.1. Les noms de `cols()` et les clés de `vals()` ne sont pas vérifiés par rapport à la table, et Postgres refuse un nom erroné (42703). Le template refuse toujours un nom erroné interpolé seul (`${'tagz'}`) et un Whereable écrit en ligne (`{ tagz: 'x' }`). Pour faire vérifier les noms, typez la valeur, soit avec un argument de type (`db.cols<s.tags.Column[]>([…])`, `db.vals<s.tags.Updatable>({…})`), soit avec `satisfies` :

<CastPanel example="sql_cols_unchecked">

<<< ../examples/sql_cols_unchecked.ts{ts twoslash}

</CastPanel>

Cela vérifie un tableau, et un objet écrit en ligne. Dans un objet contenu dans une variable, l’argument de type laisse passer une clé en trop, car TypeScript ne la refuse que dans un objet écrit en ligne : typez la variable, comme `tag: s.tags.Insertable` plus haut. Un tableau de noms contenu dans une variable doit lui aussi être typé : `['film_id', 'tag']` contenu dans une variable est un `string[]`, que `cols<s.tags.Column[]>` refuse. Donnez à la variable le type `s.tags.Column[]`, et pour un tableau en lecture seule, écrivez `cols<readonly s.tags.Column[]>`. `Updatable` et `Insertable` laissent de côté une colonne `GENERATED ALWAYS` : donnez donc le nom d’une telle colonne avec `Column[]`.

Comme valeur de filtre, et comme valeur dans `vals({…})` (donc dans une écriture), `cols()` lève une erreur, comme [`raw()`](#raw).

`null`, une chaîne ou une autre valeur primitive (un nombre, un booléen, `undefined`…) lève une erreur à la compilation, si bien que `run()` est rejetée avant toute requête, y compris pour les lignes d’`insert()`, d’`upsert()` et d’`update()` ([`insert()`](/fr/insert#insert)) :

> `` `db.cols()` takes an object or an array, not `string`: for one column, write `db.cols([name])`; for a row of `insert()`, `upsert()` or `update()`, give an object. ``<!-- message -->

Le type accepte une telle valeur, comme celui de Zapatos 6.6.1, pour qu’un helper générique (`<T>(row: T) => db.cols(row)`) compile toujours. Dans `updateValues` d’[`upsert()`](/fr/insert#upsert-options), il refuse une valeur primitive (`null` et `undefined` seulement avec `strictNullChecks`), ainsi qu’un `Date`, un `Buffer` ou un [`PostgresInterval`](/fr/runtime-config#PostgresInterval), sauf si la colonne est typée `any`, comme l’est un placeholder de `zapatos/custom` laissé tel que généré. Zapatos 6.6.1 compilait les indices des caractères d’une chaîne, `cols('title')` en `"0", "1", "2", "3", "4"`, toute autre valeur primitive en rien, et levait une `TypeError` sur `null`.

Un objet natif sans clé propre énumérable (un `Date`, une `Map`, une `Promise`…) lève lui aussi une erreur à la compilation, de même qu’un `Buffer` :

> `` `db.cols()` takes an object or an array, not a built-in `…` with no own enumerable key, which would compile to nothing: for one column, write `db.cols([name])`; for a row of `insert()`, `upsert()` or `update()`, give a plain object. ``<!-- message -->

Zapatos 6.6.1 compilait un tel objet natif en rien : `` db.sql`SELECT ${db.cols(new Date())} FROM films` `` s’exécutait donc sous la forme `SELECT  FROM films` et renvoyait des lignes sans colonne. Il compilait un `Buffer` en indices de ses octets, `"0", "1"` pour deux octets. Un objet natif doté de ses propres clés énumérables se compile toujours en ces clés, comme un objet simple. Une `Error` dotée de `code` et de `path`, comme le sont les erreurs système de Node, donne `"code", "path"`<!-- probe: db.sql`${db.cols(Object.assign(new Error('x'), { code: 'ENOENT', path: 'films.csv' }))}` -->. Un tableau typé autre qu’un `Buffer` se compile en ses indices, sauf s’il est vide et n’a donc aucune clé propre ; une instance de classe, une sous-classe d’un objet natif et un objet natif d’un autre realm se compilent en leurs propres clés. Une ligne qui est un objet natif parmi les lignes d’`insert()` ou d’`upsert()` est refusée de la même façon ([`insert()`](/fr/insert#insert)). Pour une seule valeur, passez `db.param(value)`.

### `ColumnNames` {#ColumnNames}

```ts
class ColumnNames<T> { value: T }
```

Ce que renvoie `cols()`. Un membre qui n’existe que dans le type l’empêche de passer pour un `Parameter`.

## `vals()` {#vals}

```ts
db.vals<T>(valuesOrObject: T): ColumnValues<T>
```

Une liste de valeurs séparées par des virgules. Chaque valeur se compile comme suit.

| Valeur | Dans `vals({…})` | Dans `vals([…])` |
|---|---|---|
| une valeur simple | un paramètre, `$1` | un paramètre, `$1` |
| un `Parameter` | tel quel, avec son cast | tel quel, avec son cast |
| un fragment `sql` | son SQL, avec sa clé comme colonne courante (donc [`self`](#self) fonctionne) | son SQL |
| `Default` | `DEFAULT` | `DEFAULT` ; lève une erreur avec une colonne courante |
| `parent(c?)` | la [colonne parente](#parent), sans `c` la colonne de sa clé ; lève une erreur hors d’une requête imbriquée | la [colonne parente](#parent) |
| `raw()`, `cols()`, `vals()` | lèvent une erreur | lèvent une erreur ; à partir de la 6.11.0, sans colonne courante aussi |
| `self`, `all` | lèvent une erreur, à partir de la 6.11.0 | lèvent une erreur ; à partir de la 6.11.0, sans colonne courante aussi |

- Les valeurs d’un objet viennent dans l’ordre de ses clés triées, comme `cols()` les liste.
- Dans un template typé par table, ses clés ne sont pas vérifiées par rapport à la table, comme l’explique [`cols()`](#cols).
- `vals([…])` a une colonne courante là où une clé la lui donne : celle d’un filtre, dans `isIn()` et `isNotIn()` et dans un fragment donné en valeur d’un Whereable, ou celle d’une écriture, dans un fragment donné en valeur de `vals({…})`, comme dans les lignes d’`insert()` et d’`upsert()` et les valeurs d’`update()`. La compilation ne distingue pas les deux, donc chaque message nomme les deux :
  - `Default` lève "`` `db.Default` has no meaning as an item of `vals([…])` in a column's value… ``<!-- message -->" ;
  - `self` "`` `db.self` has no meaning as an item of `vals([…])` in a column's value… ``<!-- message -->" ;
  - `all` "`` `db.all` has no meaning as an item of `vals([…])` in a column's value… ``<!-- message -->" ;
  - `raw()`, `cols()` et `vals()`, comme le dit [`raw()`](#raw).
- Sans colonne courante, dans un template `sql` que vous écrivez ou dans les `updateValues` d’`upsert()`, `Default` donne `DEFAULT`, et à partir de la 6.11.0 `self`, `all`, `raw()`, `cols()` et `vals()` lèvent une erreur, avec les messages que donnent [`self`](#self), [`all`](#all) et [`raw()`](#raw). Zapatos 6.6.1 les envoyait comme `'Symbol(self)'`, `'Symbol(all)'` et en JSON.
- Employé lui-même comme valeur de filtre, ou comme valeur dans `vals({…})`, `vals()` lève une erreur, comme [`raw()`](#raw).
- Un objet natif sans clé propre énumérable, ou un `Buffer`, lève une erreur à la compilation, comme dans [`cols()`](#cols) : "`` `db.vals()` takes an object or an array, not a `Buffer`, whose bytes would compile as values, one parameter per byte: for one value, write `db.vals([value])`; for a row of `insert()`, `upsert()` or `update()`, give a plain object. ``<!-- message -->". Zapatos 6.6.1 compilait un `Date` en rien. Il compilait un `Buffer` en un paramètre par octet, si bien qu’un seul octet était stocké sous la forme de son nombre (`'97'` dans une colonne texte pour `Buffer.from('a')`), et que dans une liste `IN`, les octets étaient comparés comme des nombres. Un objet natif doté de ses propres clés énumérables se compile toujours en leurs valeurs. Un tableau typé autre qu’un `Buffer` se compile en ses éléments, `$1, $2`<!-- probe: db.sql`${db.vals(new Int32Array([1, 2]))}` --> pour `new Int32Array([1, 2])`, sauf s’il est vide et n’a donc aucune clé propre. Un `Uint8Array` qui représente des octets se compile lui aussi en ses éléments, `vals(new TextEncoder().encode('a'))` en `$1`<!-- probe: db.sql`${db.vals(new TextEncoder().encode('a'))}` --> avec `97` : dans une liste `IN`, ses éléments sont tout aussi souvent les nombres voulus, si bien que seul un `Buffer`, le type de Node pour des octets, est refusé. Pour une seule valeur, écrivez `db.vals([value])` ou `db.param(value)`.
- `null`, une chaîne ou une autre valeur primitive lève une erreur à la compilation, comme dans [`cols()`](#cols) : "`` `db.vals()` takes an object or an array, not `string`: for one value, write `db.vals([value])`; for a row of `insert()`, `upsert()` or `update()`, give an object. ``<!-- message -->". Zapatos 6.6.1 envoyait les caractères d’une chaîne, `vals('id')` en `$1, $2` avec `'i'`, `'d'` : dans une liste `IN`, `vals('5')` trouvait les lignes égales à `'5'`, un cas désormais rejeté, comme avec [`isIn('5')`](/fr/conditions#conditions.isIn).
- `insert()`, `upsert()` et `update()` compilent leurs valeurs avec `vals({…})`, hors d’une requête imbriquée : `parent()`, `raw()`, `cols()`, `vals()`, `self` et `all` y lèvent une erreur, avant toute requête.
- Zapatos 6.6.1 enveloppait un `Parameter`, `Default` et `parent()` dans un second paramètre au sein d’un tableau : `'{"value":…}'`, `'Symbol(DEFAULT)'`, `'{"value":"id"}'` ; et `parent()`, `raw()`, `cols()` et `vals()` au sein d’un objet, que les écritures stockaient sur une colonne texte ou `jsonb`.

### `ColumnValues` {#ColumnValues}

```ts
class ColumnValues<T> { value: T }
```

Ce que renvoie `vals()`. Un membre qui n’existe que dans le type l’empêche de passer pour un `Parameter`.

## Objets Whereable {#whereable}

Un objet est un Whereable de la table : chacune de ses propres clés énumérables est une colonne, chaque valeur ce à quoi elle doit correspondre. Les clés sont triées, chaque paire compilée comme ci-dessous, les paires jointes par `AND`, le tout entre parenthèses ; le `WHERE` n’en fait pas partie, à vous de l’écrire. Un objet vide est `TRUE`.

C’est ainsi qu’on écrit une condition dans `sql` : chaque valeur doit être du type de sa colonne, et dans un objet littéral chaque clé une colonne de l’argument de type, là où un `param()` accepte n’importe quelle valeur ([SQL brut](/fr/raw-sql#pass-each-value-as-a-parameter)).

<CastPanel example="sql_whereable">

<<< ../examples/sql_whereable.ts{ts twoslash}

</CastPanel>

| Valeur | Compile en |
|---|---|
| une valeur simple, `null` et tableaux compris | `("title" = $1)`<!-- probe: db.sql`${{ title: 'x' }}` --> |
| un `Parameter` | `("title" = CAST($1 AS "text"))`<!-- probe: db.sql`${{ title: db.param('x', 'text') }}` -->, tel quel |
| un fragment `sql` | `(…)`, compilé avec la clé comme colonne courante : [`self`](#self) est la colonne |
| une [condition](/fr/conditions) | de même : une condition est un fragment, `like('The%')` |
| `parent(c?)` | `("studio_id" = "studios"."id")`<!-- probe: db.select('studios', db.all, { lateral: { films: db.select('films', { studio_id: db.parent('id') }) } }) -->, dans une sous-requête `lateral` |
| `Default`, `self`, `all` | lève une erreur |
| `raw()`, `cols()`, `vals()` | lève une erreur ([`raw()`](#raw)) |

- `null` est aussi un paramètre, et `= NULL` ne correspond à aucune ligne : utilisez [`conditions.isNull`](/fr/conditions#conditions.isNull). De même pour `undefined`, envoyé comme `NULL`, avec [`undefinedMeansMissing`](/fr/runtime-config#Config.undefinedMeansMissing) ou sans : `{ tagline: undefined }` donne `("tagline" = $1)`<!-- probe: db.sql`${{ tagline: undefined }}` -->, donc aucune ligne : omettre la clé élargirait le filtre.
- `Default` lève "`` `db.Default` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. `DEFAULT` is for INSERT and UPDATE values. ``<!-- message -->" ; Zapatos 6.6.1 l’envoyait comme `'Symbol(DEFAULT)'`.
- Les raccourcis prennent le même objet comme `where` ([`select()`](/fr/select#select)).

::: warning Sécurité
Un objet interpolé qui n’est pas l’une des autres [interpolations](#interpolations) se compile en Whereable, objet simple ou non : une instance de classe `{ title }` donne `("title" = $1)`<!-- probe: db.sql`${new (class { title = 'x' })()}` -->, et une instance sans clé propre énumérable donne `TRUE`, même d’une classe qui étend un objet natif (`class Premiere extends Date {}`). Vérifiez à l’exécution ce qui atteint un `where`.
:::

Un objet natif lève une erreur à la compilation, avant toute requête, même avec des clés propres ajoutées (`Object.assign(new Date(0), { id: 1 })`) : `Date`, `Map`, `Set`, `WeakMap`, `WeakSet`, `WeakRef`, `FinalizationRegistry`, `RegExp`, `Promise`, `Error` et ses sous-types natifs (`TypeError`, `AggregateError`, …), `ArrayBuffer`, `SharedArrayBuffer`, un tableau typé, `Buffer`, `DataView`, les objets wrapper `Number`, `String`, `Boolean`, `BigInt` et `Symbol`, les objets `Intl` (`Intl.Collator`, `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.Locale`, …) et l’objet `Segments` que renvoie `new Intl.Segmenter('en').segment(text)`, et, là où le runtime les fournit, `SuppressedError`, `DisposableStack` et `AsyncDisposableStack` (Node 24) et les objets `Temporal` (Node 26 : `Temporal.PlainDate`, `Temporal.Instant`, `Temporal.ZonedDateTime`, …), que l’erreur nomme par leur constructeur (`PlainDate` ; `Segments`, qui n’en a pas, par son nom ECMA-402), et les espaces de noms `Math`, `JSON`, `Reflect`, `Atomics`, `Intl` et, là où le runtime les fournit, `Temporal` et `Temporal.Now`, qu’elle nomme par leur chemin (`Temporal.Now`) :

> `` A built-in `…` has no meaning as a Whereable (a filter): it would compile to its own enumerable keys, and to `TRUE`, every row, when it has none. To compare with a value, give it as `db.param(…)`; to filter, give a plain object (`{ column: value }`); await a `Promise` first. ``<!-- message -->

Zapatos 6.6.1 le compilait en Whereable de ses propres clés : `TRUE` pour la plupart, si bien que `` db.sql`DELETE FROM ${'films'} WHERE ${new Date()}` `` donnait `DELETE FROM "films" WHERE TRUE` et supprimait toutes les lignes, tout comme `db.deletes('films', Temporal.Now as any)`, écrit à la place de `Temporal.Now.plainDateISO()` ; `("0" = $1 …)` pour un tableau typé. Un objet hôte (`URL`, `Blob`, `Headers`, `AbortController`) ou un espace de noms hôte (`console`, `WebAssembly`) n’est pas refusé : il se compile en Whereable de ses propres clés, comme une instance de classe, donc `TRUE` quand il n’en a aucune.

Un itérateur ou un générateur, synchrone ou asynchrone, sans clé propre énumérable lève aussi une erreur, qui le nomme par son étiquette (`Set Iterator`, `Generator`) : le `.values()` d’un `Set`, le `.entries()` d’une `Map`, `(function* () {})()`, `Iterator.from(…)`, un itérateur hôte comme `new URLSearchParams().entries()` ou `new Headers().entries()` (un objet `Headers` lui-même n’est pas refusé), un itérateur ECMA-402 comme celui d’`Intl.Segmenter`, et une instance d’une classe qui étend `Iterator` sans clé propre énumérable. Chacun a `%IteratorPrototype%` ou `%AsyncIteratorPrototype%` dans sa chaîne de prototypes. Zapatos 6.6.1 compilait `` db.deletes('films', ids.values() as any) ``, pour un `Set` d’identifiants, en `DELETE FROM "films" WHERE TRUE …` : pour filtrer sur les identifiants, donnez `{ id: db.conditions.isIn([...ids]) }`.

Le type refuse la plupart d’entre eux (TS2345), sauf là où une colonne partage l’un de leurs membres : `db.deletes('actors', new Error('x'))` passe la vérification de types, puisque `actors` a une colonne `name`.

Seuls les objets natifs listés ci-dessus lèvent une erreur, ceux du realm qui exécute pgcast, reconnus à leur prototype exact, ou, pour un itérateur, au prototype des itérateurs dans sa chaîne, et, pour un espace de noms, à son identité. Le reste se compile comme dans Zapatos 6.6.1 :

- un `Date`, un itérateur ou un espace de noms d’un autre realm, comme `vm.runInNewContext('new Date(0)')` ou `vm.runInNewContext('Math')`, donne `TRUE` ;
- une instance d’une classe qui étend un objet natif garde ses propres clés : `new Frames(1)`, avec `class Frames extends Uint8Array {}`, donne `("0" = $1)` ;
- un itérateur avec des clés propres les compile : un générateur auquel on a ajouté `{ id: 1 }`, ou une classe qui étend `Iterator` avec un champ `id = 1`, donne `("id" = $1)` ;
- un objet `Temporal` ou `Intl` d’un polyfill, autre qu’un `Segments`, donne `TRUE` quand le polyfill est installé sur `globalThis` après l’import de `zapatos/db`, ou importé sans être installé (`import { Temporal } from '@js-temporal/polyfill'`), puisque `zapatos/db` lit les prototypes et les espaces de noms à son chargement ; s’il est installé avant, l’objet lève une erreur, et un objet du `Temporal` ou de l’`Intl` natif que le polyfill remplace, là où le runtime en a un, donne `TRUE` ;
- le `Segments` d’un polyfill donne `TRUE`, sauf si son prototype n’a pas de `constructor` propre et hérite directement d’`Object.prototype`, comme celui d’ECMA-402, ce qui exclut un polyfill fondé sur une classe. `zapatos/db` lit ce prototype dans l’`Intl.Segmenter` présent la première fois qu’un filtre a un prototype sans `constructor` propre (jamais celui d’un objet simple, d’un tableau ou d’une instance de classe), et non à son chargement : si un tel polyfill est installé avant ce moment, son `Segments` lève une erreur, et le `Segments` natif donne `TRUE`, comme sous un polyfill fondé sur une classe ; s’il est installé après, son `Segments` donne `TRUE`, et le `Segments` natif lève une erreur ;
- un objet créé à partir d’un espace de noms, `Object.create(Math)`, ou placé derrière un `Proxy`, `new Proxy(Math, {})`, donne `TRUE`.

## `self` {#self}

```ts
db.self
```

La colonne courante, dans un fragment donné en valeur d’un Whereable : `` { runtime_minutes: db.sql`${db.self} > ${db.param(100)}` } `` donne `(("runtime_minutes" > $1))`<!-- probe: db.sql`${{ runtime_minutes: db.sql`${db.self} > ${db.param(100)}` }}` -->. Dans un fragment donné en valeur de `vals({…})`, la colonne courante est sa clé : `` vals({ tag: db.sql`upper(${db.self})` }) `` donne `upper("tag")`<!-- probe: db.sql`${db.vals({ tag: db.sql`upper(${db.self})` })}` -->.

- Là où il n’y a pas de colonne courante, il lève une erreur : "The 'self' column alias has no meaning here"<!-- message -->.
- Comme valeur de filtre, il lève une erreur : c’est la colonne, pas une valeur à lui comparer. Zapatos 6.6.1 l’envoyait comme la chaîne `'Symbol(self)'`.
  - Comme valeur d’un Whereable : "`` `db.self` has no meaning as a value in a Whereable (a filter), nor in `isIn()`: compare with a value, or use it in a `sql` fragment value, where it stands for the column. ``<!-- message -->"
  - Dans `isIn()` / `isNotIn()`, et dans `vals([…])` au sein d’un filtre ([`vals()`](#vals)) : "`` `db.self` has no meaning as an item of `vals([…])` in a column's value, in a filter (as `isIn()` writes it) or in a `sql` fragment value of `vals({…})`, so of `insert()`, `upsert()` or `update()`: give a value; in a filter or in `update()`, write `db.self` in a `sql` fragment value, outside `vals([…])`, where it stands for the column. ``<!-- message -->"
  - Comme valeur de `eq()`, `add()` et des autres conditions : "`` `db.self` has no meaning as the value of `eq()`, `add()` and the other conditions: it is already the column on the left. To compare the column with itself, write a `sql` fragment with `db.self` on both sides. ``<!-- message -->"
- Dans `vals([…])` au sein d’un fragment donné en valeur d’une écriture, soit en valeur de `vals({…})`, comme dans `insert()`, `upsert()` et `update()`, il lève à la compilation le message d’`isIn()` ci-dessus.
- Comme valeur écrite, il lève une erreur à la compilation, à partir de la 6.11.0, là où Zapatos 6.6.1 envoyait ou stockait `'Symbol(self)'`. Le type le refuse comme valeur d’`insert()`, d’`upsert()` ou d’`update()`, `updateValues` compris, sauf sur une colonne typée `any` ; un `vals()` dans un template `sql` que vous écrivez l’accepte :
  - Dans `vals({…})`, donc comme valeur d’`insert()`, d’`upsert()` ou d’`update()`, `updateValues` compris, et dans votre propre template `sql` : "`` `db.self` has no meaning as a value in `vals({…})`, so as an `insert()`, `upsert()` or `update()` value, nor in a `sql` template of your own (`VALUES (…)` or a filter's `IN (…)`): give a value; in `update()`, write `db.self` in a `sql` fragment value, where it stands for the column; in `upsert()` `updateValues`, to read a column, qualify it with its table, `table.column`, or with `EXCLUDED` for the row proposed, `EXCLUDED.column`. ``<!-- message -->"
  - Dans `vals([…])` hors de la valeur d’une colonne, dans un template `sql` que vous écrivez ou dans `updateValues` : "`` `db.self` has no meaning as an item of `vals([…])` outside a column's value, as in a `sql` template of your own or in `upsert()` `updateValues`: give a value; in `updateValues`, to read a column, qualify it with its table, `table.column`, or with `EXCLUDED` for the row proposed, `EXCLUDED.column`. ``<!-- message -->"

### `SelfType` {#SelfType}

```ts
type SelfType = typeof self
```

Le type de `db.self`, l’un des types de [`GenericSQLExpression`](#GenericSQLExpression).

## `parent()` {#parent}

```ts
db.parent<T extends Column | undefined = Column | undefined>(x?: T): ParentColumn<T>
```

Une colonne de la table de la requête parente, dans une sous-requête donnée à `lateral` ([Jointures](/fr/lateral)), ou, à partir de la 6.9.0, dans le `where` d’[`exists()`](/fr/conditions#conditions.exists) et d’[`isInSelect()`](/fr/conditions#conditions.isInSelect), dont l’option `parent` nomme cette table : `"<parent table or alias>"."<column>"`.

<CastPanel example="sql_parent">

<<< ../examples/sql_parent.ts{ts twoslash}

</CastPanel>

- Sans colonne, la colonne du filtre où il se trouve : `{ film_id: db.parent() }`, dans un `lateral` de `roles`, donne `("film_id" = "roles"."film_id")`<!-- probe: db.select('roles', db.all, { lateral: { film: db.selectOne('films', { film_id: db.parent() }) } }) -->. Sans filtre, il lève une erreur avant d’écrire quoi que ce soit : "`db.parent()` with no column has no meaning here: name the column, `db.parent('id')`…"<!-- message -->. Zapatos 6.6.1 écrivait la table et son `.`, puis levait « <span lang="en">Alien object while interpolating SQL: undefined</span> ».
- Il fonctionne comme valeur d’un Whereable, dans un fragment `sql`, dans `eq()` et dans `vals([…])`, donc dans `isIn()` : `{ film_id: isIn([db.parent()]) }` donne `(("film_id" IN ("roles"."film_id")))`<!-- probe: db.select('roles', db.all, { lateral: { film: db.selectOne('films', { film_id: db.conditions.isIn([db.parent()]) }) } }) -->. Dans `vals([…])`, Zapatos 6.6.1 l’envoyait en JSON : `isIn([parent('id')])` comparait avec `'{"value":"id"}'`.
- Dans `vals({…})` aussi, où, sans colonne, il prend la colonne de sa clé : `` db.sql`SELECT ${db.vals({ name: db.parent() })} AS result` ``, dans un `lateral` de `studios`, donne `SELECT "studios"."name" AS result`<!-- probe: db.select('studios', db.all, { lateral: { n: db.sql`SELECT ${db.vals({ name: db.parent() })} AS result` } }) -->. Zapatos 6.6.1 l’y envoyait en JSON aussi.
- Hors d’une requête imbriquée, il lève "The 'parent' table alias has no meaning here"<!-- message -->, si bien que `run()` est rejetée avant toute requête. De même pour toute valeur d’`insert()`, d’`upsert()` ou d’`update()`, là où Zapatos 6.6.1 stockait `{"value":"id"}` sur une colonne texte, et pour le `where` d’`exists()` ou d’`isInSelect()` sans `parent`, même à l’intérieur d’un `lateral`.

### `ParentColumn` {#ParentColumn}

```ts
class ParentColumn<T extends Column | undefined = Column | undefined> { value?: T }
```

Ce que renvoie `parent()`. Un membre qui n’existe que dans le type empêche `cols()` et `vals()` de passer pour un `ParentColumn`.

## `Default` {#Default}

```ts
db.Default
```

Le mot-clé `DEFAULT` : la valeur par défaut d’une colonne, dans une valeur d’`INSERT` ou d’`UPDATE`, seul ou dans `vals()`.

<CastPanel example="sql_default">

<<< ../examples/sql_default.ts{ts twoslash}

</CastPanel>

- Dans un filtre, il lève une erreur à la compilation.
  - Comme valeur d’un Whereable ([plus haut](#whereable)) : "`` `db.Default` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. `DEFAULT` is for INSERT and UPDATE values. ``<!-- message -->"
  - Dans `isIn()` / `isNotIn()`, et dans `vals([…])` au sein d’un filtre ([`vals()`](#vals)) : "`` `db.Default` has no meaning as an item of `vals([…])` in a column's value, in a filter (as `isIn()` writes it) or in a `sql` fragment value of `vals({…})`, so of `insert()`, `upsert()` or `update()`: in a filter, leave the key out, or compare with a value; in a write, give `db.Default` as the value itself, `{ column: db.Default }`. ``<!-- message -->"
  - Comme valeur de `eq()`, `add()` et des autres conditions : "`` `db.Default` has no meaning as the value of `eq()`, `add()` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give `db.Default` as the value itself: `{ n: db.Default }`. ``<!-- message -->"
- Dans `vals([…])` au sein d’un fragment donné en valeur d’une écriture, soit en valeur de `vals({…})`, comme dans `insert()`, `upsert()` et `update()`, il lève à la compilation le message d’`isIn()` ci-dessus.
- Pour `add()` et `subtract()`, affectez-le à la colonne elle-même : `{ booked_at: db.Default }`.
- Zapatos 6.6.1 l’envoyait comme la chaîne `'Symbol(DEFAULT)'` dans tous ces cas, et dans `vals([…])`, où il est maintenant `DEFAULT`.

### `DefaultType` {#DefaultType}

```ts
type DefaultType = typeof Default
```

Le type de `db.Default`, que les `Insertable` et `Updatable` générés acceptent pour une colonne nullable ou qui a une valeur par défaut.

## Fragments imbriqués {#nested-fragments}

Un fragment `sql` interpolé dans un autre se compile sur place. Ses paramètres sont numérotés à la suite de ceux du fragment extérieur, dont il hérite la table parente et la colonne courante. Un fragment qui se compile en rien, ou un tableau vide, permet d’enrichir une requête au gré des conditions :

<CastPanel example="sql_nested">

<<< ../examples/sql_nested.ts{ts twoslash}

</CastPanel>

Le `RunResult` et le `runResultTransform` d’un fragment imbriqué sont ignorés : seul compte le `run()` du fragment extérieur.

## Tableaux {#arrays}

Les éléments d’un tableau se compilent l’un après l’autre, chacun comme s’il était interpolé seul, sans rien entre eux : ``[db.sql`a`, ' ', 'b']`` donne `a" ""b"`<!-- probe: db.sql`${[db.sql`a`, ' ', 'b']}` -->, la chaîne `' '` étant un nom. Un tableau vide se compile en rien. Pour mettre quelque chose entre les éléments, [`mapWithSeparator()`](#mapWithSeparator).

## `mapWithSeparator()` {#mapWithSeparator}

```ts
db.mapWithSeparator<TIn, TSep, TOut>(
  arr: readonly TIn[],
  separator: TSep,
  cb: (x: TIn, i: number, a: readonly TIn[]) => TOut,
): (TOut | TSep)[]
```

Applique `cb` à `arr`, avec `separator` entre deux résultats ; `[]` s’il n’y a aucun élément. C’est un simple tableau, qui se compile donc comme [un tableau](#arrays) :

<CastPanel example="sql_map_with_separator">

<<< ../examples/sql_map_with_separator.ts{ts twoslash}

</CastPanel>

## `all` {#all}

```ts
db.all
```

Le `where` de `select()`, de `count()` et des autres lectures qui correspond à toutes les lignes : `db.select('films', db.all)` n’écrit pas de `WHERE` ([`select()`](/fr/select#select)). Ce n’est pas une interpolation : dans `sql`, le type le refuse, et il lève l’erreur `Alien object while interpolating SQL: Symbol(all)`<!-- message -->. Zapatos 6.6.1 levait une `TypeError`, « Cannot convert a Symbol value to a string », là et comme `where` de `deletes()` ou d’`update()`.

- Comme `where` de `deletes()` ou d’`update()`, il lève une erreur à la compilation, et le type le refuse : un filtre qui se rabat sur `db.all` pour une lecture ne supprime ni ne modifie jamais toutes les lignes. `{}` et `` db.sql`TRUE` `` le font : "`` `db.all` has no meaning as the filter of `deletes()` or `update()`: it is the filter of `select()` and its kin, refused in a write so that a filter that falls back to it for a read never deletes or updates every row. To delete or update every row on purpose, give db.sql`TRUE` as the filter. ``<!-- message -->"

- Comme valeur de filtre, il lève une erreur à la compilation, et le type le refuse : c’est un filtre entier, pas une valeur à comparer. Zapatos 6.6.1 l’envoyait comme la chaîne `'Symbol(all)'`, si bien que `deletes('films', { title: db.conditions.isNotIn([db.all]) })` supprimait tout film qui a un titre.
  - Comme valeur d’un Whereable ([plus haut](#whereable)) : "`` `db.all` has no meaning as a value in a Whereable (a filter), nor in `isIn()`: leave the key out, or compare with a value. To match every row, give `db.all` as the whole filter of `select()` and its kin: `select(table, db.all)`. ``<!-- message -->"
  - Dans `isIn()` / `isNotIn()`, et dans `vals([…])` au sein d’un filtre ([`vals()`](#vals)) : "`` `db.all` has no meaning as an item of `vals([…])` in a column's value, in a filter (as `isIn()` writes it) or in a `sql` fragment value of `vals({…})`, so of `insert()`, `upsert()` or `update()`: in a filter, leave the key out, or compare with a value; in a write, give a value. To match every row, give `db.all` as the whole filter of `select()` and its kin: `select(table, db.all)`. ``<!-- message -->"
  - Comme valeur de `eq()`, `add()` et des autres conditions, et dans le tableau d’une condition de tableau : "`` `db.all` has no meaning as the value of `eq()`, `add()` and the other conditions: compare with a value. To match every row, give `db.all` as the whole filter of `select()` and its kin: `select(table, db.all)`. ``<!-- message -->"
- Dans `vals([…])` au sein d’un fragment donné en valeur d’une écriture, soit en valeur de `vals({…})`, comme dans `insert()`, `upsert()` et `update()`, il lève à la compilation le message d’`isIn()` ci-dessus.
- Comme valeur écrite, il lève une erreur à la compilation, à partir de la 6.11.0, là où Zapatos 6.6.1 envoyait ou stockait `'Symbol(all)'`. Le type le refuse comme valeur d’`insert()`, d’`upsert()` ou d’`update()`, `updateValues` compris, sauf sur une colonne typée `any` ; un `vals()` dans un template `sql` que vous écrivez l’accepte :
  - Dans `vals({…})`, donc comme valeur d’`insert()`, d’`upsert()` ou d’`update()`, `updateValues` compris, et dans votre propre template `sql` : "`` `db.all` has no meaning as a value in `vals({…})`, so as an `insert()`, `upsert()` or `update()` value, nor in a `sql` template of your own (`VALUES (…)` or a filter's `IN (…)`): give a value. To match every row, give `db.all` as the whole filter of `select()` and its kin: `select(table, db.all)`. ``<!-- message -->"
  - Dans `vals([…])` hors de la valeur d’une colonne, dans un template `sql` que vous écrivez ou dans `updateValues` : "`` `db.all` has no meaning as an item of `vals([…])` outside a column's value, as in a `sql` template of your own or in `upsert()` `updateValues`: give a value. To match every row, give `db.all` as the whole filter of `select()` and its kin: `select(table, db.all)`. ``<!-- message -->"

### `AllType` {#AllType}

```ts
type AllType = typeof all
```

Le type de `db.all`, qu’acceptent le `where` de `select()`, de `count()` et des autres lectures, ainsi qu’`exists()` et `isInSelect()`.

## `SQLFragment` {#SQLFragment}

```ts
class SQLFragment<RunResult = pg.QueryResult['rows'], Constraint = never>
```

Ce que renvoient `sql` et chaque raccourci : une requête, ou une partie de requête, pas encore compilée. Vous n’en construisez jamais une avec `new`.

| Membre | Ce que c’est |
|---|---|
| [`run(queryable, force?)`](#run) | compile, exécute, et se résout en `RunResult` |
| [`compile()`](#compile) | `{ text, values }`, la requête qu’envoie `run()` |
| [`runResultTransform`](#runResultTransform) | transforme le résultat de `pg` en `RunResult` |
| [`prepared(name?)`](#prepared) | en fait une requête préparée |
| [`copy(override?)`](#copy) | une copie superficielle, certaines propriétés remplacées |
| `noop`, `noopResult` | fixés par `insert()` et `upsert()` quand ils reçoivent `[]` : `run()` n’envoie rien et se résout en `noopResult` |
| `parentTable` | fixé sur une sous-requête `lateral` par sa parente, et, à partir de la 6.9.0, sur la sous-requête d’`exists()` et d’`isInSelect()` par leur option `parent`, pour [`parent()`](#parent) |
| `preparedName` | fixé par `prepared()` |
| `compileExpression()` | utilisé par `compile()`, interne |

### `run()` {#run}

```ts
fragment.run(queryable: QueryableLike, force = false): Promise<RunResult>
```

1. Compile le fragment ([`compile()`](#compile)) ; sur une erreur, la promesse est rejetée, avant toute requête.
2. Appelle [`queryListener`](/fr/runtime-config#Config.queryListener) avec la requête et l’id de la transaction, s’il est défini.
3. Envoie la requête à `queryable` ([`QueryableLike`](#QueryableLike)) sous la forme de l’objet de requête de `pg`, `{ text, values, name? }`, et passe ce qui revient dans [`runResultTransform`](#runResultTransform). Un fragment `noop` n’envoie rien et donne `noopResult`, sauf si `force` vaut `true`.
4. Appelle [`resultListener`](/fr/runtime-config#Config.resultListener) avec le résultat, l’id de la transaction, le temps écoulé et la requête, s’il est défini.

Un fragment `noop` se compile quand même, son SQL derrière un commentaire. `force` l’envoie, et il n’insère rien : `.run()` donne `[]`.

<CastPanel example="sql_run_force">

<<< ../examples/sql_run_force.ts{ts twoslash}

</CastPanel>

Un texte de plusieurs instructions, `` db.sql`CREATE TABLE festivals (id int); INSERT INTO festivals VALUES (1)` ``, arrive en entier à Postgres quand il n’a ni valeur ni nom [`prepared()`](#prepared) : `pg` l’envoie comme une seule requête simple ([Sécurité](/fr/security#values-never-enter-the-sql)). Avec une valeur, ou en requête préparée, Postgres refuse le texte : « <span lang="en">cannot insert multiple commands into a prepared statement</span> » (42601).

Hors transaction, Postgres exécute les instructions en une seule transaction, sauf si le texte contient son propre `BEGIN` ou `COMMIT` : si une instruction échoue, la promesse est rejetée avec son erreur, et celles d’avant sont annulées. Un `COMMIT` dans le texte garde ce qui le précède. Un `BEGIN` sans `COMMIT` laisse la connexion dans cette transaction : sur un pool, la prochaine requête qui récupère cette connexion s’y exécute. Avec une instruction qui ne peut pas s’exécuter dans un bloc de transaction, comme `VACUUM` ou `CREATE INDEX CONCURRENTLY`, Postgres refuse le texte entier, où qu’elle se trouve : « <span lang="en">VACUUM cannot run inside a transaction block</span> » (25001).

Quand elles s’exécutent, `pg` renvoie un tableau de résultats, un par instruction, où le `runResultTransform` par défaut ne trouve pas de `rows` : `run()` se résout en `undefined` au lieu des lignes que promet son type, et `resultListener` reçoit `undefined`. Pour les lire, donnez au fragment un [`runResultTransform`](#runResultTransform) qui prend le tableau.

### `compile()` {#compile}

```ts
fragment.compile(): SQLQuery
```

La requête telle que `pg` la prend ([`SQLQuery`](/fr/runtime-config#SQLQuery)) : `text`, ses paramètres numérotés à partir de `$1`, et `values`, dans leur ordre ; `name` aussi, une fois [préparée](#prepared). `compile()` n’envoie rien, et lève une erreur là où une interpolation n’a pas de sens. Ses arguments servent à sa propre récursion : appelez-le sans argument.

Le texte n’est pas une API stable : une version mineure peut le changer, tant que le résultat ne change pas ([Tests](/fr/testing#the-sql-text-is-not-a-stable-api)).

<CastPanel example="sql_compile">

<<< ../examples/sql_compile.ts{ts twoslash}

</CastPanel>

### `runResultTransform` {#runResultTransform}

```ts
fragment.runResultTransform: (qr: pg.QueryResult) => any  // default: qr => qr.rows
```

Appliqué par `run()` à ce que renvoie `pg`. `qr` est typé `pg.QueryResult`, mais un [`QueryableLike`](#QueryableLike) ne promet que `rows` : `rowCount`, `command` et `fields` sont ceux de `pg`. Les raccourcis fixent le leur (`selectOne()` prend le `result` de la première ligne). Affectez-en un pour renvoyer autre chose ; `RunResult` doit alors être le type qu’il renvoie :

<CastPanel example="sql_run_result_transform">

<<< ../examples/sql_run_result_transform.ts{ts twoslash}

</CastPanel>

Il ne s’applique qu’au `run()` de ce fragment : pas quand il est imbriqué dans un autre, ni donné à `lateral` ou à `extras`.

### `prepared()` {#prepared}

```ts
fragment.prepared(name = `_zapatos_prepared_${n}`): this
```

Fixe le `name` que `compile()` ajoute à la requête, pour que Postgres prépare la requête une fois par connexion puis l’exécute par son nom ([node-postgres](https://node-postgres.com/features/queries#prepared-statements)). Sans nom, `_zapatos_prepared_0`, `_1`… dans l’ordre des appels.

Les valeurs sont des paramètres, pas une partie du texte : un seul nom sert donc à chaque appel d’une fonction de requête dont le texte ne change pas ; sans nom, chaque appel prépare une autre requête :

<<< ../examples/plain/sql_prepared.ts{ts twoslash}

Un nom désigne un seul texte : sur une connexion qui a préparé `'p'`, `pg` rejette un fragment d’un autre texte nommé `'p'` avec « <span lang="en">Prepared statements must be unique - 'p' was used for a different statement</span> ».

### `copy()` {#copy}

```ts
fragment.copy(override?: { literals?, expressions?, parentTable?, preparedName?, noop?, noopResult? }): SQLFragment<RunResult, Constraint>
```

Un nouveau fragment sur les mêmes littéraux et expressions. Il garde `runResultTransform`, `parentTable`, `preparedName`, `noop` et `noopResult`, sauf ceux que donne `override`. Un raccourci copié se résout donc en ce que donne le raccourci, comme le dit son type : `count('films', all).copy().run(pool)` donne `4` sur le schéma de la doc, là où Zapatos 6.6.1 donnait à la copie la transformation par défaut, donc les lignes : `[{ result: '4' }]`.

Une copie se compile comme un fragment imbriqué. Sans `withTies`, une copie de `selectExactlyOne()` garde `LIMIT $1`<!-- probe: (db.setConfig({ selectExactlyOneChecksForSecondRow: true }), db.selectExactlyOne('films', db.all).copy()) --> avec `1`, même avec [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow). La promesse d’une copie exécutée seule est rejetée en l’absence de lignes. Avec la vérification et `withTies` activés, une deuxième ligne ex æquo entraîne aussi le rejet de la promesse. `lateral` donne à la copie de chaque sous-requête le `parentTable` de son parent.

## `withCTEs()` {#withCTEs}

```ts
withCTEs<Q extends SQLFragment<any, any>>(ctes: { [name: string]: SQLFragment<any, any> }, query: Q): Q
```

À partir de la 6.11.0. Place des CTE avant une requête et garde son résultat : avec `recent` un fragment `sql` qui sélectionne les films d’après 1990, `db.withCTEs({ recent }, db.count('films', …))` donne `WITH "recent" AS (SELECT "id" FROM "films" WHERE (("release_year" > $1))) SELECT count(*) AS result FROM "films"`<!-- probe: db.withCTEs({ recent: db.sql`SELECT ${'id'} FROM ${'films'} WHERE ${{ release_year: db.conditions.gt(1990) }}` }, db.count('films', db.sql`${'id'} IN (SELECT id FROM recent)`)) --> et se résout en un nombre.

- **Ordre** : celui de l’objet, si bien qu’une CTE lit celles qui la précèdent ; une clé entière vient en premier, comme `Object.keys` la donne.
- **Noms** : chaque clé est un seul nom, jamais coupé sur `.`, écrit entre guillemets comme un [identifiant](#identifiers) : `'a.b'` donne `"a.b"`<!-- probe: db.withCTEs({ 'a.b': db.sql`SELECT 1` }, db.sql`SELECT 2`) -->, un `"` est doublé, et une clé déjà échappée à la main est gardée telle quelle, si bien que `'a""b'` et `'a"b'` nomment toutes deux la CTE `a"b` : dans un même appel, Postgres refuse la paire (42712).
- **Aucune CTE** : `withCTEs({}, query)` donne une copie de `query`, son propre SQL, si bien qu’une liste construite à l’exécution n’a besoin d’aucune branche.
- **Le résultat** : une [`copy()`](#copy) de `query`, de son type. Il se résout en ce que donne `query`, imbriqué dans un `lateral` ou dans `extras` aussi, et s’écrit entre parenthèses comme valeur d’`extras` ou d’`insert()` là où `query` l’est.
- **Sans effet** : un `insert()` ou un `upsert()` sans ligne, comme requête ou comme CTE, s’écrit `SELECT NULL::jsonb AS result WHERE false`<!-- probe: db.withCTEs({ a: db.sql`SELECT 1` }, db.insert('films', [])) -->, une requête sans ligne sur n’importe quelle table, et le résultat n’est pas sans effet : ses CTE s’exécutent donc ; comme requête, il se résout en `[]`.
- **`selectExactlyOne()`** : avec [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), le résultat demande toujours une deuxième ligne (par défaut `LIMIT $1`<!-- probe: (db.setConfig({ selectExactlyOneChecksForSecondRow: true }), db.withCTEs({ a: db.sql`SELECT 1` }, db.selectExactlyOne('films', db.all))) --> avec `2`). Si la requête en trouve une, sa promesse est rejetée, comme pour le raccourci exécuté seul. Imbriquée, elle demande une ligne et, avec `withTies: true`, les éventuelles lignes ex æquo.
- **Un seul `WITH`** : la requête ne peut pas commencer par son propre `WITH`, un résultat de `withCTEs()` ou un fragment `sql`, ni être un [`truncate()`](/fr/insert#truncate) : Postgres refuse le texte (42601). Mettez toutes les CTE dans un seul appel.
- **Requête préparée** : jamais, pas plus que les CTE et la requête qu’il imbrique, `{}` compris, car un [nom](#prepared) désigne un seul texte. Appelez `prepared()` sur le résultat. Sur une liste construite à l’exécution, un même nom couvrirait un texte par liste : donnez à chaque texte son propre nom, ou ne préparez pas la requête.

Pas à pas, avec un `insert()` comme CTE : [Placer une CTE avant un raccourci](/fr/raw-sql#put-a-cte-before-a-shortcut).

## `RunResultForSQLFragment` {#RunResultForSQLFragment}

```ts
type RunResultForSQLFragment<F extends SQLFragment<any, any>>
```

Le `RunResult` de `F`, avec `undefined` lu comme `null` : un fragment imbriqué comme valeur de `lateral` ou d’`extras` revient en JSON, où une ligne absente est `null`. Ainsi, le `crew.JSONSelectable | undefined` de `selectOne()` y devient `crew.JSONSelectable | null` :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const mentor = db.selectOne('crew', { id: db.parent('mentor_id') }, { alias: 'mentor' });

type Mentor = db.RunResultForSQLFragment<typeof mentor>;
const nameOf = (row: Mentor) => row?.name ?? 'no mentor';

const crew = await db.select('crew', db.all, { lateral: { mentor } }).run(pool);
const mentors = crew.map(member => nameOf(member.mentor));
```

## `Queryable` {#Queryable}

```ts
type Queryable = pg.ClientBase | pg.Pool
```

Ce que prend `run()` de `pg` : un pool, un client, ou le client qu’une [`transaction()`](/fr/transaction#transaction) donne à son callback. Typée ainsi, une fonction de requête s’exécute sur n’importe lequel d’entre eux :

<<< ../examples/plain/sql_queryable.ts{ts twoslash}

`Queryable` accepte le client d’une transaction quel que soit son niveau : une fonction qui a besoin de `SERIALIZABLE` prend plutôt `pg.Pool | TxnClientForSerializable` ([`TxnClientForSerializable`](/fr/transaction#TxnClientForSerializable), [Réserver dans une transaction plus large](/fr/retries#book-inside-a-larger-transaction)).

Une fonction qui exécute des requêtes aussi sur le client d’un autre driver prend un [`QueryableLike`](#QueryableLike).

## `QueryableLike` {#QueryableLike}

```ts
interface QueryableLike {
  query: (query: SQLQuery) => PromiseLike<{ rows: any[] }>
}
```

Ce que prend `run()`, depuis la 6.12.0 : un [`Queryable`](#Queryable), ou le client de n’importe quel autre driver dont `query()` prend l’objet de requête de `pg`, `{ text, values, name? }`, et se résout en un objet dont `rows` contient les lignes, comme le client d’un outil de migration ou le fake d’un test. Il n’a besoin d’aucun cast :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const migrationClient = {
  query: async (query: { text: string; values?: unknown[] }) => ({ rows: [] as any[] }),
};
const films = await db.select('films', db.all).run(migrationClient);
```

- Le SQL est le même que sur un pool `pg`, tout comme le type en quoi `run()` se résout, qui suppose des valeurs parsées comme `pg` les parse (`json` et `jsonb` en objets) : un driver qui renvoie le `jsonb` en texte résout `select()` en une chaîne, typée comme ses lignes. `runResultTransform` reçoit ce que donne `query()`, tel quel.
- Un driver qui ignore `name` exécute un fragment préparé sans le préparer.
- Un `query()` qui ne prend que le texte, comme le `query(text, params)` de PGlite, ne compile pas, pas plus qu’un driver sans `query()`, comme postgres.js : chacun a besoin d’un adaptateur, que pgcast a pour les deux ([Drivers](/fr/drivers)).
- [`transaction()`](/fr/transaction#transaction) prend un `Queryable`, un `TxnClient` ou un [`PoolLike`](/fr/transaction#PoolLike), dont le client est un `QueryableLike` dont le résultat a aussi un `command`, avec un `release()` ([Le pool d’un autre driver](/fr/transaction#another-drivers-pool)).
- `Queryable` ne change pas, pas plus que, là où le type de `run` est celui que déclare `SQLFragment`, une fonction typée pour lui affectée à `run`, qui le redéfinit, ou donnée comme valeur typée `typeof fragment.run` ou comme littéral d’un `Pick<db.SQLFragment<…>, 'run'>`. Là où TypeScript infère ou lit le paramètre de `run`, il est `QueryableLike`, et un corps qui lit un membre de `pg` sur lui ne compile plus : `query('SELECT 1')` avec une chaîne (TS2345), `rowCount` (TS2339), le résultat de `query()` renvoyé comme la `Promise` de `run` (TS2739). Les chemins :
  - une fonction fléchée sans type affectée à `run`, `fragment.run = async queryable => …`, ou donnée comme valeur typée `typeof fragment.run`, comme littéral d’un `Pick<db.SQLFragment<…>, 'run'>` ou au `vi.spyOn(fragment, 'run').mockImplementation()` de Vitest : typer le paramètre `db.Queryable` garde le type de Zapatos 6.6.1, sauf dans l’espion ;
  - un générique ou un `infer` qui lit le paramètre de `run`, `Parameters<typeof fragment.run>[0]` compris : `.connect()` dessus donne TS2339. Nommez `db.Queryable` au lieu de lire le type sur `run` ;
  - une copie du type de `run` en type de fonction, dans le `mockImplementation()` de Vitest ou dans le `.d.ts` d’une bibliothèque qui réexporte `run` : avec `strictFunctionTypes`, une fonction typée pour `Queryable` n’y compile plus (TS2345, TS2322). Faites un cast dans le corps, `(queryable as db.Queryable).query('SELECT 1')`, ou typez le paramètre `db.QueryableLike`.

## `SQL` {#SQL}

```ts
type SQL = SQLExpression | SQLExpression[]
```

Les `Interpolations` par défaut de `sql` : une expression, ou un tableau d’expressions. Chaque table du schéma généré a le sien, `s.films.SQL`, qui n’accepte que les noms et les Whereables de cette table ; `cols()` et `vals()` de n’importe quelle valeur, comme dans Zapatos 6.6.1. À partir de la 6.11.0, une fois le schéma régénéré, cela vaut pour une table dont une colonne porte le nom d’un membre de `String`, d’un type auquel ce membre correspond (`length` un nombre) : son `SQL` refuse toute autre chaîne (2345), là où un schéma généré avant en accepte n’importe laquelle.

Ainsi, `` db.sql<s.films.SQL>`INSERT INTO ${'films'} (${db.cols({ seat: 1 })}) VALUES (${db.vals({ seat: 1 })})` `` passe la vérification de types, et n’échoue que dans Postgres (42703 : `films` n’a pas de `seat`).

`db.SQL` prend le Whereable de toutes les tables : dans un schéma où une colonne porte le nom d’un membre de `String`, d’un type auquel ce membre correspond (`length`, un nombre), il accepte donc n’importe quelle chaîne, comme le fait le Whereable d’une telle table donné comme `Interpolations`. C’est voulu : une vérification dans `db.SQL` refusait un <code v-pre>${{ ...where, id }}</code> de `db.sql` dans une fonction générique sous TypeScript 4.1, et une vérification sur `Interpolations` refusait une fonction qui transmet son type, `<I>(…) => db.sql<I>(…)` ([#674](https://github.com/AlexandreDemartin/pgcast/issues/674)). Donnez le `SQL` de la table, qui la refuse.

### `SQLExpression` {#SQLExpression}

```ts
type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable | any[]>
  | Whereable | Column | ParentColumn | GenericSQLExpression
```

Une interpolation : un nom de table ou de colonne de n’importe quelle table, un Whereable, `parent()`, `cols()` / `vals()` d’un Updatable, ou une [`GenericSQLExpression`](#GenericSQLExpression), qui accepte `cols()` / `vals()` de n’importe quelle valeur.

### `GenericSQLExpression` {#GenericSQLExpression}

```ts
type GenericSQLExpression = SQLFragment<any, any> | Parameter | DefaultType | DangerousRawString
  | SelfType | ColumnNames<any> | ColumnValues<any>
```

Les interpolations dont le type est le même pour chaque table : elles entrent dans le `SQL` de n’importe quelle table. `ColumnNames<any>` et `ColumnValues<any>` en font partie, si bien que les clés de `cols()` et de `vals()` ne sont pas confrontées à la table.
