---
english: 098c166c670d
---

# Template SQL

`sql` est le template étiqueté sur lequel repose chaque requête de pgcast, raccourcis compris. Cette page liste ce qu’il accepte, ce que donne chaque interpolation une fois compilée, et le `SQLFragment` qu’il renvoie.
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
| `RunResult` | `pg.QueryResult['rows']` (`any[]`) | ce en quoi `run()` se résout, et le type du fragment comme valeur de `lateral` ou d’`extras` |
| `Constraint` | `never` | le type de valeur auquel une condition se compare ; fixé par [`conditions`](/fr/conditions#conditions), vérifié par un Whereable. Vous le donnez rarement. |

`RunResult` n’est pas confronté au SQL : c’est vous qui affirmez ce qui revient. Les raccourcis le fixent pour vous.

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
| tout autre objet | un Whereable de ses propres clés énumérables, objet simple ou non : `("studio_id" = $1)`<!-- probe: db.sql`${{ studio_id: 1000 }}` --> ; `{}` → `TRUE`<!-- probe: db.sql`${{}}` --> ; un objet natif, comme une `Date`, lève une erreur | [Objets Whereable](#whereable) |
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

Un paramètre numéroté : `$1`, `$2`…, numérotés sur toute la requête, et `value` à cette place dans les valeurs. La valeur n’entre jamais dans le texte SQL.

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
- Sous `castArrayParamsToJson` ou `castObjectParamsToJson`, un cast en chaîne est le type écrit, et la valeur reste le texte JSON que l’option envoie (la dernière ligne du tableau) : `param({ a: 1 }, 'jsonb')` fonctionne avec `=` et `@>` sur une colonne `jsonb`.
- Sous `castArrayParamsToJson`, un tableau dont le cast finit par `[]` ou `[n]` part comme un tableau : `'_int4'` et un domaine sur un tableau envoient toujours du JSON, que Postgres refuse comme tableau (22P02).
- Zapatos 6.6.1 abandonnait un cast en chaîne sous l’une ou l’autre option au profit de `CAST($1 AS "json")` ([#36](https://github.com/AlexandreDemartin/pgcast/issues/36)), si bien qu’un cast qui nomme un autre type que sa cible s’applique désormais : `param(arr, 'int4[]')` vers une colonne `json` est refusé (42804), vers une colonne `text` stocke `{1,2}` pour `[1,2]`.
- Sans cast, `castArrayParamsToJson` fait de `` db.sql`${db.param(ids)}::int4[]` `` `CAST($1 AS "json")::int4[]`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1])}::int4[]`) -->, que Postgres rejette (42846) : écrivez `db.param(ids, 'int4[]')`, ou passez `false`, qui garde la valeur hors du JSON sous l’une ou l’autre option : `$1::int4[]`<!-- probe: db.sql`${db.param([1], false)}::int4[]` -->.
- Comme valeur d’un Whereable ou dans `vals([…])` (donc dans [`isIn()`](/fr/conditions#conditions.isIn)), un `Parameter` se compile tel quel, avec son cast : `{ title: db.param('x', 'text') }` donne `("title" = CAST($1 AS "text"))`<!-- probe: db.sql`${{ title: db.param('x', 'text') }}` -->. Zapatos 6.6.1 l’enveloppait dans un second paramètre, envoyé en JSON (`'{"value":"x","cast":"text"}'`).

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
Tout ce qui atteint `raw()` s’exécute comme du SQL. Ne lui donnez jamais le texte d’un appelant ; une valeur est un [`param()`](#param). Comment garder sûr du SQL écrit à la main : [SQL brut](/fr/raw-sql).
:::

Comme valeur de filtre, `raw()` lève une erreur à la compilation, tout comme `cols()` et `vals()`. Comme valeur d’un Whereable, dans `isIn()` / `isNotIn()`, et dans `vals([…])` au sein d’un filtre :

> `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in a Whereable (a filter), nor in `isIn()`: to compare with SQL, use a `sql` fragment value, where `db.self` stands for the column; to compare with a value, give the value itself, or `db.param()`. ``<!-- message -->

Comme valeur de `eq()`, `add()` et des autres [conditions](/fr/conditions) :

> `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as the value of `eq()`, `add()` and the other conditions: for SQL, write a `sql` fragment with `db.self` in place of the condition; for a value, give the value itself, or `db.param()`. ``<!-- message -->

Dans [`vals({…})`](#vals), donc comme valeur d’`insert()`, d’`upsert()` ou d’`update()`, et dans votre propre template `sql`, dans un `lateral` ou non :

> `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in `vals({…})`, so as an `insert()`, `upsert()` or `update()` value: to write SQL, use a `sql` fragment value (in `update()`, `db.self` there stands for the column); to write a value, give the value itself, or `db.param()`. ``<!-- message -->

Le type les refuse là, et comme valeur d’`insert()` ou d’`update()`, sur chaque colonne qu’il type (une colonne typée `any`, ce que donne un fichier à compléter de `zapatos/custom`, accepte tout) ; il les accepte dans le `vals({…})` d’un template `sql` :

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
db.sql<s.films.SQL>`SELECT * FROM ${'films'} WHERE ${{ title: db.raw("'x'") }}`;
```

- Pour comparer avec du SQL : un fragment en valeur, `` { title: db.sql`${db.self} = ${db.raw("'x'")}` } ``.
- Zapatos 6.6.1 les y envoyait comme un seul paramètre, en JSON (`'{"value":…}'`) : aucune ligne sur une colonne texte ou `jsonb`, toutes les lignes avec `ne()` et `isNotIn()`, une erreur (22P02) sur les autres types ; comme valeur d’écriture, une colonne texte ou `jsonb` la stockait.
- Hors d’un filtre, `vals([db.raw('x')])` reste un paramètre, l’enveloppe en JSON : `'{"value":"x"}'`, qu’une colonne texte stocke tel quel ; dans les `updateValues` d’`upsert()`, `raw()` est du SQL ([`upsert()`](/fr/insert#upsert)).

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

Comme valeur de filtre, et comme valeur dans `vals({…})` (donc dans une écriture), `cols()` lève une erreur, comme [`raw()`](#raw).

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
| `Default` | `DEFAULT` | `DEFAULT` ; lève une erreur dans un filtre |
| `parent(c?)` | la [colonne parente](#parent), sans `c` la colonne de sa clé ; lève une erreur hors d’une requête imbriquée | la [colonne parente](#parent) |
| `raw()`, `cols()`, `vals()` | lèvent une erreur | lèvent une erreur dans un filtre ; un paramètre hors d’un filtre |
| `self` | un paramètre | lève une erreur dans un filtre ; un paramètre hors d’un filtre |

- Les valeurs d’un objet viennent dans l’ordre de ses clés triées, comme `cols()` les liste.
- « Dans un filtre », c’est partout où `vals([…])` a une colonne courante : dans `isIn()` et `isNotIn()`, et dans un fragment donné en valeur d’un Whereable ou de `vals({…})`. Là :
  - `Default` lève "`` `db.Default` has no meaning in a Whereable (a filter)… ``<!-- message -->" ;
  - `self` "`` `db.self` has no meaning as a value in a Whereable (a filter), nor in `isIn()`… ``<!-- message -->" ;
  - `raw()`, `cols()` et `vals()`, comme le dit [`raw()`](#raw).
- Employé lui-même comme valeur de filtre, ou comme valeur dans `vals({…})`, `vals()` lève une erreur, comme [`raw()`](#raw).
- `insert()`, `upsert()` et `update()` compilent leurs valeurs avec `vals({…})`, hors d’une requête imbriquée : `parent()`, `raw()`, `cols()` et `vals()` y lèvent une erreur, avant toute requête.
- Zapatos 6.6.1 enveloppait un `Parameter`, `Default` et `parent()` dans un second paramètre au sein d’un tableau : `'{"value":…}'`, `'Symbol(DEFAULT)'`, `'{"value":"id"}'` ; et `parent()`, `raw()`, `cols()` et `vals()` au sein d’un objet, que les écritures stockaient sur une colonne texte ou `jsonb`.

### `ColumnValues` {#ColumnValues}

```ts
class ColumnValues<T> { value: T }
```

Ce que renvoie `vals()`. Un membre qui n’existe que dans le type l’empêche de passer pour un `Parameter`.

## Objets Whereable {#whereable}

Un objet est un Whereable de la table : chacune de ses propres clés énumérables est une colonne, chaque valeur ce à quoi elle doit correspondre. Les clés sont triées, chaque paire compilée comme ci-dessous, les paires jointes par `AND`, le tout entre parenthèses ; le `WHERE` n’en fait pas partie, à vous de l’écrire. Un objet vide est `TRUE`.

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
| `Default`, `self` | lève une erreur |
| `raw()`, `cols()`, `vals()` | lève une erreur ([`raw()`](#raw)) |

- `null` est aussi un paramètre, et `= NULL` ne correspond à aucune ligne : utilisez [`conditions.isNull`](/fr/conditions#conditions.isNull).
- `Default` lève "`` `db.Default` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. `DEFAULT` is for INSERT and UPDATE values. ``<!-- message -->" ; Zapatos 6.6.1 l’envoyait comme `'Symbol(DEFAULT)'`.
- Les raccourcis prennent le même objet comme `where` ([`select()`](/fr/select#select)).

::: warning Sécurité
Un objet interpolé qui n’est pas l’une des autres [interpolations](#interpolations) se compile en Whereable, objet simple ou non : une instance de classe `{ title }` donne `("title" = $1)`<!-- probe: db.sql`${new (class { title = 'x' })()}` -->, et une instance sans clé propre énumérable donne `TRUE`, même d’une classe qui étend un objet natif (`class Premiere extends Date {}`). Vérifiez à l’exécution ce qui atteint un `where`.
:::

Un objet natif lève une erreur à la compilation, avant toute requête, même avec des clés propres ajoutées (`Object.assign(new Date(0), { id: 1 })`) : `Date`, `Map`, `Set`, `WeakMap`, `WeakSet`, `RegExp`, `Promise`, `Error` et ses sous-types natifs (`TypeError`, …), `ArrayBuffer`, un tableau typé, `Buffer`, `DataView`, et les objets enveloppes `Number`, `String` et `Boolean` :

> `` A built-in `…` has no meaning as a Whereable (a filter): it would compile to its own enumerable keys, and to `TRUE`, every row, when it has none. To compare with a value, give it as `db.param(…)`; to filter, give a plain object (`{ column: value }`); await a `Promise` first. ``<!-- message -->

Zapatos 6.6.1 le compilait en Whereable de ses propres clés : `TRUE` pour la plupart, si bien que `` db.sql`DELETE FROM ${'films'} WHERE ${new Date()}` `` donnait `DELETE FROM "films" WHERE TRUE` et supprimait toutes les lignes ; `("0" = $1 …)` pour un tableau typé.

Le type refuse la plupart d’entre eux (TS2345), sauf là où une colonne partage l’un de leurs membres : `db.deletes('actors', new Error('x'))` passe la vérification de types, puisque `actors` a une colonne `name`.

Seuls les objets natifs du realm qui exécute pgcast lèvent une erreur, reconnus à leur prototype exact. Comme dans Zapatos 6.6.1 :

- une `Date` d’un autre realm, comme `vm.runInNewContext('new Date(0)')` (Jest exécute chaque fichier de test dans un contexte `vm`), donne `TRUE` ;
- une instance d’une classe qui étend un objet natif garde ses propres clés : `new Frames(1)`, avec `class Frames extends Uint8Array {}`, donne `("0" = $1)`.

## `self` {#self}

```ts
db.self
```

La colonne courante, dans un fragment donné en valeur d’un Whereable : `` { runtime_minutes: db.sql`${db.self} > ${db.param(100)}` } `` donne `(("runtime_minutes" > $1))`<!-- probe: db.sql`${{ runtime_minutes: db.sql`${db.self} > ${db.param(100)}` }}` -->. Dans un fragment donné en valeur de `vals({…})`, la colonne courante est sa clé : `` vals({ tag: db.sql`upper(${db.self})` }) `` donne `upper("tag")`<!-- probe: db.sql`${db.vals({ tag: db.sql`upper(${db.self})` })}` -->.

- Là où il n’y a pas de colonne courante, il lève une erreur : "The 'self' column alias has no meaning here"<!-- message -->.
- Comme valeur de filtre, il lève une erreur : c’est la colonne, pas une valeur à lui comparer. Zapatos 6.6.1 l’envoyait comme la chaîne `'Symbol(self)'`.
  - Comme valeur d’un Whereable, dans `isIn()` / `isNotIn()` et dans `vals([…])` au sein d’un filtre : "`` `db.self` has no meaning as a value in a Whereable (a filter), nor in `isIn()`: compare with a value, or use it in a `sql` fragment value, where it stands for the column. ``<!-- message -->"
  - Comme valeur de `eq()`, `add()` et des autres conditions : "`` `db.self` has no meaning as the value of `eq()`, `add()` and the other conditions: it is already the column on the left. To compare the column with itself, write a `sql` fragment with `db.self` on both sides. ``<!-- message -->"

### `SelfType` {#SelfType}

```ts
type SelfType = typeof self
```

## `parent()` {#parent}

```ts
db.parent<T extends Column | undefined = Column | undefined>(x?: T): ParentColumn<T>
```

Une colonne de la table de la requête parente, dans une sous-requête donnée à `lateral` ([Jointures](/fr/lateral)) : `"<parent table or alias>"."<column>"`.

<CastPanel example="sql_parent">

<<< ../examples/sql_parent.ts{ts twoslash}

</CastPanel>

- Sans colonne, la colonne du filtre où il se trouve : `{ film_id: db.parent() }`, dans un `lateral` de `roles`, donne `("film_id" = "roles"."film_id")`<!-- probe: db.select('roles', db.all, { lateral: { film: db.selectOne('films', { film_id: db.parent() }) } }) -->. Sans filtre, il lève une erreur avant d’écrire quoi que ce soit : "`db.parent()` with no column has no meaning here: name the column, `db.parent('id')`…"<!-- message -->. Zapatos 6.6.1 écrivait la table et son `.`, puis levait "Alien object while interpolating SQL : undefined".
- Il fonctionne comme valeur d’un Whereable, dans un fragment `sql`, dans `eq()` et dans `vals([…])`, donc dans `isIn()` : `{ film_id: isIn([db.parent()]) }` donne `(("film_id" IN ("roles"."film_id")))`<!-- probe: db.select('roles', db.all, { lateral: { film: db.selectOne('films', { film_id: db.conditions.isIn([db.parent()]) }) } }) -->. Dans `vals([…])`, Zapatos 6.6.1 l’envoyait en JSON : `isIn([parent('id')])` comparait avec `'{"value":"id"}'`.
- Dans `vals({…})` aussi, où, sans colonne, il prend la colonne de sa clé : `` db.sql`SELECT ${db.vals({ name: db.parent() })} AS result` ``, dans un `lateral` de `studios`, donne `SELECT "studios"."name" AS result`<!-- probe: db.select('studios', db.all, { lateral: { n: db.sql`SELECT ${db.vals({ name: db.parent() })} AS result` } }) -->. Zapatos 6.6.1 l’y envoyait en JSON aussi.
- Hors d’une requête imbriquée, il lève "The 'parent' table alias has no meaning here"<!-- message -->, si bien que `run()` est rejetée avant toute requête. De même pour toute valeur d’`insert()`, d’`upsert()` ou d’`update()`, là où Zapatos 6.6.1 stockait `{"value":"id"}` sur une colonne texte.

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
  - Comme valeur d’un Whereable ([plus haut](#whereable)), dans `isIn()` / `isNotIn()`, et dans `vals([…])` avec une colonne courante ([`vals()`](#vals)) : "`` `db.Default` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. `DEFAULT` is for INSERT and UPDATE values. ``<!-- message -->"
  - Comme valeur de `eq()`, `add()` et des autres conditions : "`` `db.Default` has no meaning as the value of `eq()`, `add()` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give `db.Default` as the value itself: `{ n: db.Default }`. ``<!-- message -->"
- Pour `add()` et `subtract()`, affectez-le à la colonne elle-même : `{ booked_at: db.Default }`.
- Zapatos 6.6.1 l’envoyait comme la chaîne `'Symbol(DEFAULT)'` dans tous ces cas, et dans `vals([…])`, où il est maintenant `DEFAULT`.

### `DefaultType` {#DefaultType}

```ts
type DefaultType = typeof Default
```

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

Le `where` de `select()`, de `count()` et des autres lectures qui correspond à toutes les lignes : `db.select('films', db.all)` n’écrit pas de `WHERE` ([`select()`](/fr/select#select)). Ce n’est pas une interpolation : dans `sql`, le type le refuse, et il lève une erreur.

### `AllType` {#AllType}

```ts
type AllType = typeof all
```

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
| [`prepared(name?)`](#prepared) | en fait une instruction préparée |
| `copy(override?)` | une copie superficielle, certaines propriétés remplacées |
| `noop`, `noopResult` | fixés par `insert()` et `upsert()` quand ils reçoivent `[]` : `run()` n’envoie rien et se résout en `noopResult` |
| `parentTable` | fixé sur une sous-requête `lateral` par sa parente, pour [`parent()`](#parent) |
| `preparedName` | fixé par `prepared()` |
| `compileExpression()` | utilisé par `compile()`, interne |

### `run()` {#run}

```ts
fragment.run(queryable: Queryable, force = false): Promise<RunResult>
```

1. Compile le fragment ([`compile()`](#compile)) ; sur une erreur, la promesse est rejetée, avant toute requête.
2. Appelle [`queryListener`](/fr/runtime-config#Config.queryListener) avec la requête et l’id de la transaction, s’il est défini.
3. Envoie la requête à `queryable`, et passe le résultat de `pg` dans [`runResultTransform`](#runResultTransform). Un fragment `noop` n’envoie rien et donne `noopResult`, sauf si `force` vaut `true`.
4. Appelle [`resultListener`](/fr/runtime-config#Config.resultListener) avec le résultat, l’id de la transaction, le temps écoulé et la requête, s’il est défini.

Un fragment `noop` se compile quand même, son SQL derrière un commentaire. `force` l’envoie, et il n’insère rien : `.run()` donne `[]`.

<CastPanel example="sql_run_force">

<<< ../examples/sql_run_force.ts{ts twoslash}

</CastPanel>

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

Appliqué par `run()` à ce que renvoie `pg`. Les raccourcis fixent le leur (`selectOne()` prend le `result` de la première ligne). Affectez-en un pour renvoyer autre chose ; `RunResult` doit alors être le type qu’il renvoie :

<CastPanel example="sql_run_result_transform">

<<< ../examples/sql_run_result_transform.ts{ts twoslash}

</CastPanel>

Il ne s’applique qu’au `run()` de ce fragment : pas quand il est imbriqué dans un autre, ni donné à `lateral` ou à `extras`.

### `prepared()` {#prepared}

```ts
fragment.prepared(name = `_zapatos_prepared_${n}`): this
```

Fixe le `name` que `compile()` ajoute à la requête, pour que Postgres prépare l’instruction une fois par connexion puis l’exécute par son nom ([node-postgres](https://node-postgres.com/features/queries#prepared-statements)). Sans nom, `_zapatos_prepared_0`, `_1`… dans l’ordre des appels.

Les valeurs sont des paramètres, pas une partie du texte : un seul nom sert donc à chaque appel d’une fonction de requête dont le texte ne change pas ; sans nom, chaque appel prépare une autre instruction :

<<< ../examples/plain/sql_prepared.ts{ts twoslash}

Un nom désigne un seul texte : sur une connexion qui a préparé `'p'`, `pg` rejette un fragment d’un autre texte nommé `'p'` avec "Prepared statements must be unique - 'p' was used for a different statement".

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

Ce que prend `run()` : un pool, un client, ou le client qu’une [`transaction()`](/fr/transaction#transaction) donne à son callback. Typée ainsi, une fonction de requête s’exécute sur n’importe lequel d’entre eux :

<<< ../examples/plain/sql_queryable.ts{ts twoslash}

`Queryable` accepte le client d’une transaction quel que soit son niveau : une fonction qui a besoin de `SERIALIZABLE` prend plutôt `pg.Pool | TxnClientForSerializable` ([`TxnClientForSerializable`](/fr/transaction#TxnClientForSerializable), [Réserver dans une transaction plus large](/fr/retries#book-inside-a-larger-transaction)).

## `SQL` {#SQL}

```ts
type SQL = SQLExpression | SQLExpression[]
```

Les `Interpolations` par défaut de `sql` : une expression, ou un tableau d’expressions. Chaque table du schéma généré a le sien, `s.films.SQL`, qui n’accepte que les noms et les Whereables de cette table ; `cols()` et `vals()` de n’importe quelle valeur, comme dans Zapatos 6.6.1.

Ainsi, `` db.sql<s.films.SQL>`INSERT INTO ${'films'} (${db.cols({ seat: 1 })}) VALUES (${db.vals({ seat: 1 })})` `` passe la vérification de types, et n’échoue que dans Postgres (42703 : `films` n’a pas de `seat`).

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
