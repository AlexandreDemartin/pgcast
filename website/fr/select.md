---
english: d3b453ec4716
---

# Lectures {#select-and-the-aggregates}

`select()`, `selectOne()` et `selectExactlyOne()` renvoient des lignes.
{.lede}

## `select()` {#select}

```ts
db.select(table, where, options?, mode?, aggregate?)
```

Construit un seul `SELECT` des lignes de `table` qui correspondent à `where`. Renvoie un [`SQLFragment`](/fr/sql-template#SQLFragment) : `.run(pool)` donne un tableau des lignes `JSONSelectable` de la table, `[]` quand aucune ne correspond.

- `table` : une table du schéma généré.
- `where` : un `Whereable`, un objet de colonnes et de leurs valeurs ou [conditions](/fr/conditions), ses clés dans l’ordre alphabétique, jointes par `AND` dans une seule paire de parenthèses, une condition ou une valeur `sql` dans la sienne (`("id" = $1 AND ("studio_id" > $2) AND "title" = $3)`<!-- probe: db.select('films', { title: 'x', id: 1000, studio_id: db.conditions.gt(1000) }) -->) ; un fragment [`sql`](/fr/sql-template#sql), écrit tel quel ; ou [`db.all`](/fr/sql-template#all), pour aucun `WHERE`.
  - À partir de la 6.11.0, le type refuse une chaîne, un `String` ou un tableau comme `where` de tout raccourci (2345), comme `having` et dans `exists()` et `isInSelect()`, même sur une table dont une colonne porte le nom d’un membre de `String`, d’un type auquel ce membre correspond (`length` un nombre), quel que soit le schéma.
  - Dans une fonction générique sur la table, `<K extends 'films' | 'studios'>(table: K)`, chaque raccourci refuse un objet écrit en ligne comme `where` (TS2353, qui nomme `SQLFragment`), comme dans Zapatos 6.6.1 : tant que `K` est générique, TypeScript ne vérifie les clés de l’objet que par rapport à `SQLFragment`. Typez d’abord l’objet, `const where: s.WhereableForTable<K> = { id: 1 }`, puis passez `where` : le code compile, et une clé qu’aucune table n’a reste refusée. Une colonne qu’une seule des tables de `K` possède passe aussi : `{ title: 'x' }` compile, et sur `studios`, qui n’a pas de `title`, Postgres refuse la requête (42703).
- `options` : les [options](#options) ci-dessous, toutes facultatives.
- `mode` et `aggregate` : ce que passent `selectOne()`, `count()` et les autres ; voir [`SelectResultMode`](#SelectResultMode).

Pour ses lignes une à une, comme les lit [`cursor()`](/fr/transaction#cursor), la même requête sans `jsonb_agg` : [`selectRows()`](#selectRows).

<CastPanel example="select">

<<< ../examples/select.ts{ts twoslash}

</CastPanel>

### Le SQL qu’il écrit {#the-sql-it-writes}

- Chaque ligne est une seule valeur `jsonb`, `to_jsonb("films".*)`<!-- probe: examples/select.ts -->, donc les dates et les heures reviennent en chaînes et un `bigint` en nombre : les types `JSONSelectable` le disent ([Le catalogue](/fr/catalog-types)).
- Les lignes sont rassemblées en un seul tableau, `coalesce(jsonb_agg(result), '[]')`<!-- probe: examples/select.ts -->, autour d’une sous-requête d’alias `"sq_<alias or table>"`, pour que `ORDER BY` et `LIMIT` s’appliquent aux lignes. Une requête, une valeur en retour. Sur de grandes valeurs, de nombreuses lignes ou des laterals imbriqués, ce JSON coûte : [Performance](/fr/performance), et [Avec `shortcutsUseJson`](#shortcutsUseJson).
  - Avec [`topLevelSelectAsRows`](/fr/runtime-config#Config.topLevelSelectAsRows), un `select()` exécuté ou compilé seul envoie les lignes elles-mêmes, `SELECT to_jsonb("films".*) AS result FROM "films"`<!-- probe: (db.setConfig({ topLevelSelectAsRows: true }), db.select('films', db.all)) -->, la requête de [`selectRows()`](#selectRows), et `.run()` donne le même tableau ; imbriqué, il garde l’agrégat.
- À l’intérieur, les clauses viennent dans cet ordre : `SELECT [DISTINCT …]` · les colonnes `AS result` · `FROM` la table `[AS alias]` · chaque `LEFT JOIN LATERAL` · `WHERE` · `GROUP BY` · `HAVING` · `ORDER BY` · `LIMIT` ou `FETCH FIRST … WITH TIES` · `OFFSET` · chaque verrou `FOR …`.
- Chaque valeur est un paramètre (`$1`, `$2`) ; chaque nom est mis entre guillemets comme le fait Postgres, et tout `"` qu’il contient est doublé. Zapatos 6.6.1 laissait un nom contenant un `"` fermer ses guillemets ; pgcast l’a corrigé ([changelog](/fr/changelog#6.6.2-security)).

### Options {#options}

Le SQL de chaque ligne du tableau est ce que compile la bibliothèque construite, sur le schéma de la doc ; `…` tient lieu d’un fragment `sql`.

| Option | SQL ajouté | Effet sur le type |
|---|---|---|
| `columns: ['title']` | `jsonb_build_object($1::text, "title")`<!-- probe: db.select('films', db.all, { columns: ['title'] }) --> à la place de `to_jsonb("films".*)` | seulement ces clés (`JSONOnlyColsForTable`) |
| `order: { by: 'title', direction: 'ASC' }` | `ORDER BY "title" ASC`<!-- probe: db.select('films', db.all, { order: { by: 'title', direction: 'ASC' } }) --> | aucun |
| `limit: 2` | `LIMIT $1`<!-- probe: db.select('films', db.all, { limit: 2 }) --> | aucun |
| `offset: 2` | `OFFSET $1`<!-- probe: db.select('films', db.all, { offset: 2 }) --> | aucun |
| `withTies: true` | `FETCH FIRST $1 ROWS WITH TIES`<!-- probe: db.select('films', db.all, { order: { by: 'release_year', direction: 'ASC' }, limit: 2, withTies: true }) --> à la place de `LIMIT $1` | aucun |
| `extras: { cinema: 'name' }` | `\|\| jsonb_build_object($1::text, "name")`<!-- probe: db.select('cinemas', db.all, { extras: { cinema: 'name' } }) --> | une clé par extra (`ExtrasResult`) |
| `lateral: { cast: … }` | `LEFT JOIN LATERAL (…) AS "lateral_cast" ON true`<!-- probe: db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.parent('id') }) } }) -->, lu par `\|\| jsonb_build_object($1::text, "lateral_cast".result)`<!-- probe: db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.parent('id') }) } }) --> | une clé par sous-requête (`LateralResult`) |
| `lateral: …`, une seule sous-requête | `"lateral_passthru".result`<!-- probe: db.select('films', db.all, { lateral: db.select('roles', { film_id: db.parent('id') }) }) --> à la place des colonnes, et son `LEFT JOIN LATERAL` | le résultat de la sous-requête, à la place de la ligne |
| `alias: 'mentor'` | `FROM "crew" AS "mentor"`<!-- probe: db.select('crew', db.all, { alias: 'mentor' }) -->, puis `"mentor"` pour la table | aucun |
| `distinct: true` | `SELECT DISTINCT`<!-- probe: db.select('films', db.all, { distinct: true }) --> | aucun |
| `distinct: 'cinema_id'` | `SELECT DISTINCT ON ("cinema_id")`<!-- probe: db.select('screenings', db.all, { distinct: 'cinema_id' }) --> | aucun |
| `groupBy: 'film_id'` | `GROUP BY "film_id"`<!-- probe: db.select('ratings', db.all, { columns: ['film_id'], groupBy: 'film_id' }) --> | aucun |
| `having: …` | `HAVING sum("votes") >= $1`<!-- probe: db.select('ratings', db.all, { groupBy: 'film_id', having: db.sql`sum(${'votes'}) >= ${db.param(10)}` }) --> | aucun |
| `lock: { for: 'UPDATE' }` | `FOR UPDATE`<!-- probe: db.select('films', db.all, { lock: { for: 'UPDATE' } }) --> | aucun |

::: tip Strict
`columns`, `extras` et `lateral` ne changent le type qu’avec `strictNullChecks` (ou `strict`) activé. Sans lui, le résultat reste le `JSONSelectable` complet, et une clé d’extra ou de lateral n’est pas dans le type ; le type ne refuse rien, pas même `columns` à côté d’une seule sous-requête `lateral`, et une sous-requête seule est typée comme la ligne de la table, alors que c’est son propre résultat qui revient.
:::

### Avec `shortcutsUseJson` {#shortcutsUseJson}

Avec [`shortcutsUseJson`](/fr/runtime-config#Config.shortcutsUseJson), chaque ligne et le tableau sont construits avec les fonctions `json`, à la place de leurs équivalents `jsonb`. Les valeurs et les types sont les mêmes, à part l’ordre des clés d’une ligne et le type d’un résultat imbriqué, `json`.

| Option | SQL avec `shortcutsUseJson` |
|---|---|
| aucune | `to_json("films".*)`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all)) -->, et le tableau `coalesce(json_agg(result), '[]')`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all)) --> |
| `columns`, avec ou sans `extras` et `lateral` | un seul `json_build_object($1::text, "title", $2::text, upper("title"))`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { columns: ['title'], extras: { upper: db.sql`upper(${'title'})` } })) -->, dont les clés sont des paramètres |
| `extras` ou `lateral`, à côté de toutes les colonnes | `to_json("row_films".*)`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.parent('id') }) } })) --> de la ligne avec ses clés en alias, `"lateral_cast".result AS "cast"`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.parent('id') }) } })) -->, dans une sous-requête `AS "row_films"`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.parent('id') }) } })) --> |
| `distinct: true` | `SELECT DISTINCT to_jsonb("films".*)`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { distinct: true })) -->, car `json` n’a pas d’égalité, sous `json_agg` ; sur un `select()`, un `selectOne()` ou un `selectExactlyOne()` transmis, `SELECT DISTINCT to_jsonb("lateral_passthru".result)`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { distinct: true, lateral: db.selectOne('studios', { id: db.parent('studio_id') }) })) --> |

- À côté de toutes les colonnes, chaque clé est un identifiant, chaque `"` doublé. Une clé vide, avec un NUL ou de plus de 63 octets en UTF-8, que Postgres refuserait ou tronquerait, lève une erreur à la compilation : passez `columns`, dont les clés restent des paramètres.
- Dans ce cas, un `order.by` ou un `distinct` en chaîne est écrit après la table, `ORDER BY "films"."title" ASC`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { order: { by: 'title', direction: 'ASC' }, extras: { upper: db.sql`upper(${'title'})` } })) -->, sauf s’il contient un `.` : un nom seul correspondrait aussi à une clé du même nom (42702). Ainsi `by: 'result'` désigne la colonne de la table. Un fragment `sql` est écrit tel quel.
- Une clé égale à une colonne apparaît deux fois dans le JSON, et la dernière l’emporte, comme `||` la fait l’emporter.
- Avec `columns`, un seul `json_build_object()` prend 100 arguments : au-delà de 50 clés, colonnes et clés d’`extras` et de `lateral` comprises, une erreur est levée à la compilation.
- Un `lateral` transmis, sauf sous `distinct: true`, et les [agrégats](/fr/aggregates) gardent leur SQL ; la sous-requête construit le sien avec `json`.

<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', { studio_id: 1000 }, { order: { by: 'title', direction: 'ASC' }, lateral: { cast: db.select('roles', { film_id: db.parent('id') }, { columns: ['character'] }) } })) -->
```sql
SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("row_films".*) AS result FROM (SELECT "films".*, "lateral_cast".result AS "cast" FROM "films" LEFT JOIN LATERAL (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT json_build_object($1::text, "character") AS result FROM "roles" WHERE ("film_id" = "films"."id")) AS "sq_roles") AS "lateral_cast" ON true WHERE ("studio_id" = $2) ORDER BY "films"."title" ASC) AS "row_films") AS "sq_films"
-- ["character", 1000]
```

### `columns` {#columns}

`columns?: readonly ColumnForTable<T>[]`, un [`ColumnsOption`](#ColumnsOption) : seulement ces colonnes, chacune une clé de l’objet résultat, à la place de la ligne entière. Il ne renomme pas une colonne : c’est le rôle d’[`extras`](#extras).

Un tableau `readonly`, `['id', 'title'] as const` ou un `readonly ColumnForTable<T>[]`, donne le même SQL et le même type qu’un tableau modifiable. Avec `strictNullChecks`, Zapatos 6.6.1 typait ses lignes comme `never`, que tout type acceptait ; un type que la requête ne renvoie pas est maintenant refusé :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const columns = ['id', 'title'] as const;

async function filmCards(queryable: db.Queryable) {
  const cards: { id: number; title: string }[] = await db.select('films', db.all, { columns }).run(queryable);
  // @ts-expect-error tagline is not among the columns
  const withTaglines: { title: string; tagline: string | null }[] = await db.select('films', db.all, { columns }).run(queryable);
  return [cards, withTaglines];
}
```

### `order`, `limit`, `offset` et `withTies` {#order-limit-offset-and-withties}

- `order` : un [`OrderSpecForTable`](#OrderSpecForTable), `{ by, direction, nulls? }`, ou un tableau de ceux-ci, dans cet ordre. `by` est une colonne ou tout SQL de la table, son type `SQL` : un fragment `sql` (`` db.sql`array_length(${'genres'}, 1)` ``), [`db.parent()`](/fr/sql-template#parent) ; `direction` vaut `'ASC'` ou `'DESC'` ; `nulls`, `'FIRST'` ou `'LAST'`.
- `limit` et `offset` : des nombres, envoyés comme paramètres.
- `withTies: true`, avec `limit` et `order` : aussi les lignes ex æquo avec la dernière sur l’`order`. Sans `limit`, il n’ajoute rien ; sans `order`, Postgres refuse la requête (42601).

<CastPanel example="selectPage">

<<< ../examples/selectPage.ts{ts twoslash}

</CastPanel>

<CastPanel example="selectWithTies">

<<< ../examples/selectWithTies.ts{ts twoslash}

</CastPanel>

Parcourir une longue liste page par page : [Pagination](/fr/paginate).

### `extras` {#extras}

`extras?: { [key: string]: column | SQLFragment }`, un [`ExtrasOption`](#ExtrasOption) : d’autres clés sur chaque objet résultat. Une colonne donne sa valeur sous une autre clé ; un fragment `sql` donne le type de son second paramètre de type, `` db.sql<s.cinemas.SQL, number>`…` ``, donc `number` ici. Les clés sont ajoutées à la ligne avec `||`, après `columns`.

Un raccourci de lecture y est une sous-requête : `select()`, `selectOne()`, `selectExactlyOne()`, `count()`, `sum()`, `avg()`, `min()` ou `max()`, ou une copie de l’un d’eux par `.copy()`, s’écrit entre parenthèses, `(SELECT count(*) AS result FROM "films" WHERE "studio_id" = "studios"."id")`<!-- probe: db.select('studios', db.all, { extras: { films: db.count('films', db.sql`${'studio_id'} = ${'studios'}.${'id'}`) } }) -->, et revient en JSON, comme dans un `lateral`, ou vaut `null` quand sa requête ne renvoie aucune ligne. Il doit renvoyer au plus une ligne : un `groupBy` qui en renvoie plusieurs est refusé (21000). `db.parent()` n’a pas de sens dans `extras` : nommez donc la table extérieure dans un fragment `sql`, comme ici. Un fragment `sql` s’écrit tel quel : entourez de parenthèses la requête que vous y écrivez à la main, ou le raccourci que vous y placez.

<CastPanel example="selectExtras">

<<< ../examples/selectExtras.ts{ts twoslash}

</CastPanel>

### `lateral` {#lateral}

`lateral?: { [key: string]: SQLFragment } | SQLFragment`, un [`LateralOption`](#LateralOption) : d’autres raccourcis, imbriqués, chacun joint par `LEFT JOIN LATERAL … ON true`. Dans ceux-ci, [`db.parent()`](/fr/sql-template#parent) nomme une colonne de la table de cette requête.

- **Un objet** : chaque clé devient une clé du résultat, qui contient le résultat de sa sous-requête : un tableau pour `select()`, un objet ou `null` pour `selectOne()`, un nombre pour `count()`, ou `null` quand sa requête ne renvoie aucune ligne ([`count()`](/fr/aggregates#count)). Un `count()` dont le `groupBy` donne plusieurs groupes fait revenir la ligne parente une fois par groupe sous un `select()` extérieur ; sous `selectOne()` ou `selectExactlyOne()`, une seule fois, avec le compte de l’un des groupes, mais avec [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), `selectExactlyOne()` est rejetée avec une `NotExactlyOneError`. Les clés sont jointes dans l’ordre alphabétique ; chacune est un seul identifiant, `"lateral_<key>"`.
- **Une seule sous-requête** : son résultat est transmis à la place de chaque ligne. `columns` et `extras` n’ont alors rien à quoi s’ajouter, et le type les refuse, avec `strictNullChecks` activé.
  - Quand vous appelez `.run()` sur la requête extérieure `selectOne()`, `selectExactlyOne()` ou [`selectRows()`](#selectRows), `pg` lit la colonne `result` transmise avec le parseur configuré pour son type. Un `select()` extérieur renvoie les valeurs dans un tableau JSON. Un template `sql` garde son annotation de type de résultat dans les deux cas.
  - Par défaut, quand [`count()`](/fr/aggregates#count) compte deux lignes, `pg` renvoie la chaîne `"2"`. Il lit aussi les résultats de type `bigint` ou `numeric` de `sum()` et `avg()` comme des chaînes. Avec `Number` comme parseur d’`int8`, le même compte donne `2`. `count()` est typé `number`. Par défaut, `sum()` et `avg()` sont typés `number | null`.
  - N’appliquez `Number()` qu’à une chaîne. Un agrégat dont la requête ne renvoie aucune ligne donne `null`, tout comme `sum()` et `avg()` quand aucune ligne ne correspond. Sans ligne parente, `selectOne()` donne `undefined`.
  - Avec les signatures typées par colonne, supposons que l’unique `lateral` de `selectOne()` ou de `selectExactlyOne()` puisse être soit le minimum d’une date, soit un compte. Si vous imbriquez la requête sous une clé, la date est une chaîne JSON typée `Date`. Si vous passez la requête à `selectRows()`, TypeScript accepte aussi le cas du compte, que le parseur par défaut de `pg` renvoie sous forme de chaîne.
- **`null`** : `lateral: null`, ou une clé dont la sous-requête vaut `null` ou `undefined`, lève une erreur à la compilation, si bien que `.run()` est rejetée avant toute requête : "`` `lateral: null` has no meaning: for no lateral join, leave `lateral` out; to join, give it a `select()`, `selectOne()` or `count()` query, or an object of them. ``<!-- message -->", ou "`` The `lateral` key 'cast' is `null`, not a query: leave the key out, or give it a `select()`, `selectOne()` or `count()` query. ``<!-- message -->". Zapatos 6.6.1 levait une `TypeError` à l’appel.

Placez le compte sous une clé pour le lire en JSON. Dans cet exemple, le compte sans `groupBy` renvoie une ligne, ce qui donne `{ n: 2 }`. Si un compte avec `groupBy` ne renvoie aucune ligne, le résultat est `{ n: null }`.

<<< ../examples/plain/lateral_keyed_count.ts{ts twoslash}

<!-- probe: db.selectExactlyOne('studios', { id: 1000 }, { columns: [], lateral: { n: db.count('films', { studio_id: db.parent('id') }) } }) -->
```sql
SELECT jsonb_build_object() || jsonb_build_object($1::text, "lateral_n".result) AS result FROM "studios" LEFT JOIN LATERAL (SELECT count(*) AS result FROM "films" WHERE ("studio_id" = "studios"."id")) AS "lateral_n" ON true WHERE ("id" = $2) LIMIT $3
-- ["n", 1000, 1]
```

Pour obtenir une chaîne avec chacun des raccourcis, convertissez l’horodatage en JSON dans la sous-requête et indiquez `string` comme type de résultat.

<<< ../examples/plain/lateral_json_timestamp.ts{ts twoslash}

<!-- probe: db.select('studios', { id: 1000 }, { lateral: db.sql`SELECT to_jsonb(now()) AS result` }) -->
```sql
SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT "lateral_passthru".result AS result FROM "studios" LEFT JOIN LATERAL (SELECT to_jsonb(now()) AS result) AS "lateral_passthru" ON true WHERE ("id" = $1)) AS "sq_studios"
-- [1000]
```

Étapes, imbrication et auto-jointures : [Jointures](/fr/lateral). Depuis pgcast 6.6.2, une clé ou un `alias` contenant un `"` reste un seul identifiant ; dans Zapatos 6.6.1, il pouvait fermer ses guillemets ([changelog](/fr/changelog#6.6.2-security)).

### `alias` {#alias}

`alias?: string` : un nom pour la table dans cette requête, nécessaire pour joindre une table à elle-même (`crew` et son `mentor_id`). Il remplace le nom de la table dans les colonnes, dans `"sq_<alias>"` et pour le `parent()` de chaque sous-requête `lateral`, et `lock.of` l’accepte. Ses étapes : [Joindre une table à elle-même](/fr/lateral#join-a-table-to-itself).

### `distinct` {#distinct}

Avec `true` : `SELECT DISTINCT`<!-- probe: db.select('films', db.all, { distinct: true }) -->, sur l’objet résultat entier. La liste du select est ce seul `result`, donc Postgres refuse avec lui un `order` sur une colonne (42P10).

<CastPanel example="selectDistinctAll">

<<< ../examples/selectDistinctAll.ts{ts twoslash}

</CastPanel>

Avec une colonne, un tableau de colonnes ou un fragment `sql` : `SELECT DISTINCT ON (…)`<!-- probe: db.select('screenings', db.all, { distinct: 'cinema_id' }) -->, une ligne par valeur. Donnez un `order` qui commence par les mêmes colonnes, sinon c’est Postgres qui choisit la ligne obtenue.

<CastPanel example="selectDistinct">

<<< ../examples/selectDistinct.ts{ts twoslash}

</CastPanel>

### `groupBy` et `having` {#groupby-and-having}

- `groupBy` : une colonne, un tableau de colonnes (`GROUP BY "film_id", "stars"`<!-- probe: db.select('ratings', db.all, { groupBy: ['film_id', 'stars'] }) -->) ou un fragment `sql`.
- `having` : un `Whereable`, entre parenthèses comme dans `where`, ou un fragment `sql`.

Postgres ne renvoie que les colonnes groupées, celles qu’une clé primaire groupée détermine, et des agrégats, et refuse toute autre colonne (42803) : la ligne entière, sans `columns`, passe quand `groupBy` contient la clé primaire.

<CastPanel example="selectGroupBy">

<<< ../examples/selectGroupBy.ts{ts twoslash}

</CastPanel>

### `lock` {#lock}

`lock?: SelectLockingOptions | SelectLockingOptions[]` : une clause de verrouillage par élément, dans l’ordre, écrite après tout le reste.

| Clé | Valeurs | SQL |
|---|---|---|
| `for` | `'UPDATE'`, `'NO KEY UPDATE'`, `'SHARE'`, `'KEY SHARE'` | `FOR UPDATE`<!-- probe: db.select('screenings', db.all, { lock: { for: 'UPDATE' } }) --> |
| `of`, facultatif | un nom de table, ou l’`alias` ; ou un tableau de ceux-ci | `OF "screenings"`<!-- probe: db.select('screenings', db.all, { lock: { for: 'UPDATE', of: 'screenings' } }) --> |
| `wait`, facultatif | `'NOWAIT'`, `'SKIP LOCKED'` | `NOWAIT`<!-- probe: db.select('screenings', db.all, { lock: { for: 'UPDATE', wait: 'NOWAIT' } }) --> |

Postgres refuse un verrou avec `DISTINCT`, `GROUP BY` ou un agrégat (0A000).

<CastPanel example="selectLock">

<<< ../examples/selectLock.ts{ts twoslash}

</CastPanel>

### Erreurs {#errors}

`select()` lève ces erreurs en construisant la requête, avant d’en envoyer aucune :

| Message | Quand | Depuis |
|---|---|---|
| `Direction must be ASC/DESC, not '…'`<!-- message --> | un `order` avec une autre `direction` | Zapatos |
| `Nulls must be FIRST/LAST/undefined, not '…'`<!-- message --> | un `order` avec un autre `nulls` | Zapatos |
| `Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '…'`<!-- message --> | un `lock` avec un autre `for` | pgcast 6.6.2 |
| `Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '…'`<!-- message --> | un `lock` avec un autre `wait` | pgcast 6.6.2 |
| `Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '…'`<!-- message --> | un `aggregate` qui n’en est pas un, dans `SelectResultMode.Numeric` | pgcast 6.6.2 |

Le type refuse une mauvaise `direction`, un mauvais `nulls` ou un mauvais `lock`, pas un mauvais `aggregate`, qui est un `string`. Zapatos 6.6.1 écrivait un mauvais `lock` ou `aggregate` tel quel dans le SQL, où il pouvait exécuter une seconde instruction. Une valeur qui n’a pas de sens dans `where` ou `having` (`db.Default`, `db.self`, `db.raw()`) lève une erreur à la compilation de la requête : [Conditions](/fr/conditions).

Un `null` qui passe le type, en JavaScript ou dans du JSON : des options `null` reviennent à n’en passer aucune, comme dans les [écritures](/fr/insert#insert-options). `order: null` ou `lock: null` lève une erreur à la compilation de la requête, dans les agrégats et même imbriquée dans un `lateral`, si bien que `.run()` est rejetée avant toute requête : "`` `order: null` has no meaning: for no `ORDER BY`, leave `order` out; to sort, give it `{ by, direction }`, or an array of them. ``<!-- message -->", et de même pour chaque clé. Il en va de même pour `columns: null` et `extras: null` dans `select()`, `selectOne()` et `selectExactlyOne()`, sauf si une seule sous-requête `lateral` prend la place des colonnes. Zapatos 6.6.1 levait une `TypeError` à l’appel, sur des options `null` aussi, sauf dans `selectOne()` et `selectExactlyOne()`.

## `selectOne()` {#selectOne}

```ts
db.selectOne(table, where, options?)
```

Comme [`select()`](#select), avec `LIMIT $1`<!-- probe: db.selectOne('films', db.all) -->, de valeur `1`, et sans `jsonb_agg` : `.run(pool)` donne la première ligne, ou `undefined` quand aucune ne correspond. Tout `limit` passé est remplacé par `1` ; `offset` et les autres options sont gardés. Dans un `lateral`, sa clé contient la ligne ou `null`.

Avec `withTies`, il écrit `FETCH FIRST $1 ROWS WITH TIES`<!-- probe: db.selectOne('films', db.all, { order: { by: 'release_year', direction: 'ASC' }, withTies: true }) -->, ici et dans `selectExactlyOne()` ; Postgres le refuse sans `order` (42601). `.run()` donne alors l’une des lignes ex æquo ; dans un `lateral` sous un `select()` extérieur, la ligne parente revient une fois par ligne ex æquo.

<CastPanel example="selectOne">

<<< ../examples/selectOne.ts{ts twoslash}

</CastPanel>

## `selectExactlyOne()` {#selectExactlyOne}

```ts
db.selectExactlyOne(table, where, options?)
```

Comme [`selectOne()`](#selectOne), mais son type n’a pas d’`undefined` : quand aucune ligne ne correspond, `.run()` est rejetée avec une [`NotExactlyOneError`](#NotExactlyOneError). Il vérifie qu’il y a au moins une ligne, pas exactement une : avec `LIMIT $2`<!-- probe: examples/selectExactlyOne.ts -->, de valeur `1`, il prend la première. Dans un `lateral`, une ligne manquante donne `null` et aucune erreur, même si le type dit autre chose.

<CastPanel example="selectExactlyOne">

<<< ../examples/selectExactlyOne.ts{ts twoslash}

</CastPanel>

Avec [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), la requête exécutée seule demande deux lignes (par défaut `LIMIT $2`<!-- probe: (db.setConfig({ selectExactlyOneChecksForSecondRow: true }), db.selectExactlyOne('studios', { id: 1000 })) --> avec `2`) et la promesse de `.run()` est aussi rejetée s’il y a une deuxième ligne. Imbriquée dans un `lateral` ou un template `sql`, elle demande une ligne et, avec `withTies: true`, les éventuelles lignes ex æquo.

### `NotExactlyOneError` {#NotExactlyOneError}

```ts
class NotExactlyOneError extends Error {
  query: SQLFragment;
}
```

L’erreur avec laquelle `selectExactlyOne()`, le mode `ExactlyOne` de `select()`, est rejetée quand aucune ligne ne correspond. Son `name` est `'NotExactlyOneError'`, son `message` "One result expected but none returned (hint: check `.query.compile()` on this Error)"<!-- message --> ; avec [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), une seconde ligne donne "One result expected but more returned (hint: check `.query.compile()` on this Error)"<!-- message -->.

Sa `query` est le [`SQLFragment`](/fr/sql-template#SQLFragment) exécuté ou, pour une [`.copy()`](/fr/sql-template#copy), celui dont elle est la copie : `err.query.compile()` donne son SQL et ses valeurs. `err instanceof db.NotExactlyOneError` la reconnaît ; pour l’intercepter : [Distinguer une ligne manquante des autres erreurs](/fr/handle-errors#tell-a-missing-row-from-the-others).

## `selectRows()` {#selectRows}

```ts
db.selectRows(table, where, options?)
```

À partir de la 6.12.0. Ce raccourci fournit comme fragment autonome la requête que [`select()`](#select) enveloppe dans `jsonb_agg`, avec une ligne par résultat. Ce fragment s’utilise avec [`cursor()`](/fr/transaction#cursor), qui exécute le fragment reçu tel quel et lit donc le tableau entier d’un `select()` comme une seule ligne.

Le raccourci prend la `table`, le `where` et les [options](#options) de `select()`. `.run(pool)` renvoie un tableau avec un élément par ligne de résultat, ou `[]` quand aucune ligne ne correspond.

| Appel | SQL |
|---|---|
| `db.selectRows('films', { studio_id: 1000 }, { columns: ['id', 'title'], order: { by: 'title', direction: 'ASC' } })` | `SELECT jsonb_build_object($1::text, "id", $2::text, "title") AS result FROM "films" WHERE ("studio_id" = $3) ORDER BY "title" ASC`<!-- probe: db.selectRows('films', { studio_id: 1000 }, { columns: ['id', 'title'], order: { by: 'title', direction: 'ASC' } }) --> |
| `db.select(…)`, avec les mêmes arguments | `SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (…) AS "sq_films"`<!-- probe: db.select('films', { studio_id: 1000 }, { columns: ['id', 'title'], order: { by: 'title', direction: 'ASC' } }) -->, la même requête à l’intérieur, avec les mêmes valeurs |
| `db.select(…)` avec [`topLevelSelectAsRows`](/fr/runtime-config#Config.topLevelSelectAsRows) | la requête de `selectRows()`, exécutée ou compilée seule ; un `lateral` transmis tel quel, seul, est converti au-dessus d’elle, `SELECT to_jsonb(result) AS result FROM (…) AS "sq_studios"`<!-- probe: (db.setConfig({ topLevelSelectAsRows: true }), db.select('studios', db.all, { lateral: db.count('films', { studio_id: db.parent('id') }) })) --> |

Les films d’un studio, lus 100 à la fois :

<<< ../examples/plain/cursor_select_rows.ts{ts twoslash}

<!-- probe: db.readCommitted(pool, async txnClient => { for await (const _ of db.cursor(txnClient, db.selectRows('films', { studio_id: 1000 }, { columns: ['id', 'title'], order: { by: 'title', direction: 'ASC' } }), { batchSize: 100 })) { } }) -->
```sql
START TRANSACTION ISOLATION LEVEL READ COMMITTED
DECLARE pgcast_cursor_1 NO SCROLL CURSOR FOR SELECT jsonb_build_object($1::text, "id", $2::text, "title") AS result FROM "films" WHERE ("studio_id" = $3) ORDER BY "title" ASC
FETCH FORWARD 100 FROM pgcast_cursor_1
-- the same FETCH again, until one returns no row
CLOSE pgcast_cursor_1
COMMIT
```

- Par défaut, le résultat transmis d’un `min()` sur une colonne de type `date` est typé `Date | null` pour chaque ligne. Si le minimum est une date finie, le parseur par défaut renvoie un `Date`.
- Un `lateral` transmis et typé `number` ne compile pas : `count()`, `sum()`, `avg()`, et `min()` ou `max()` sauf typés par colonne, seuls ou dans une union, `cond ? count() : select()`. L’erreur est TS2322 sur `lateral`, `… is not assignable to type 'undefined'.` Un template `sql` typé `number` est refusé avec eux, car son type ne se distingue pas du leur. Placez un [compte sans `groupBy`](#lateral) sous une clé, comme dans `` db.selectRows('studios', db.all, { lateral: { films: db.count('films', { studio_id: db.parent('id') }) } }) ``<!-- tsc -->. Si la sous-requête de compte ne renvoie aucune ligne, la valeur de cette clé en JSON est `null`. Un `lateral` dont le type est un paramètre de type, objet de sous-requêtes compris, ou un fragment typé par un paramètre de type sans contrainte, `db.SQLFragment<R>`, ne compile pas non plus : `function f<L extends db.SQLFragmentMap>(l: L) { return db.selectRows('studios', db.all, { lateral: l }); }` donne TS2345. La fonction qui transmet cette valeur peut appeler `select()` ou caster l’objet de sous-requêtes avec `l as db.SQLFragmentMap`. Pour un fragment de type `db.SQLFragment<R>`, utilisez `l as db.SQLFragment<any>` (le cast en `db.SQLFragmentMap` donne l’erreur TS2352).
- Un `lock` verrouille chaque ligne quand son batch est lu, pas avant.
- Imbriquée, c’est un ensemble de lignes, pas une valeur. Un template `sql` la prend, `` db.sql`SELECT count(*) FROM (${db.selectRows('films', db.all)}) AS f` ``<!-- tsc -->, de même que [`withCTEs()`](/fr/sql-template#withCTEs) et `cursor()`. Comme `lateral`, valeur d’`extras`, `where` ou valeur Whereable d’une colonne typée, elle ne compile pas : son type, un [`RowsQuery`](#RowsQuery), le dit. Son type la prend comme `order.by`, et comme valeur Whereable d’une colonne typée `any`, où Postgres la refuse. Hors du type, en JavaScript, une clé `lateral` répète la ligne parente une fois par ligne, et une valeur d’`extras` reçoit l’erreur 21000 de Postgres.

## Types {#types}

Ce dont sont faites les signatures ci-dessus, tirées de `zapatos/db`. `T` est une table, `C` les `columns`, `E` les `extras`, `L` le `lateral` et `A` l’`alias`.

### `SelectResultMode` {#SelectResultMode}

```ts
enum SelectResultMode { Many, One, ExactlyOne, Numeric }
```

Le quatrième argument de `select()` détermine le résultat. `select()` renvoie un tableau de lignes ou, avec `SelectResultMode.Numeric`, un nombre. `selectOne()` renvoie une ligne ou `undefined`. `selectExactlyOne()` renvoie une ligne ou échoue avec une erreur.

Avec `Numeric`, le cinquième argument nomme l’agrégat, `'count'` par défaut ; depuis pgcast 6.6.2, ce doit être un nom de fonction, simple, entre guillemets ou entre guillemets `U&`, en trois parties au plus séparées par des points (`stddev_pop`, `my_schema."MyAgg"`). Tout agrégat qui renvoie un nombre convient :

<CastPanel example="selectAggregate">

<<< ../examples/selectAggregate.ts{ts twoslash}

</CastPanel>

### `SelectOptionsForTable` {#SelectOptionsForTable}

`SelectOptionsForTable<T, C, L, E, A>` : l’objet `options` de `select()`, `selectOne()`, `selectExactlyOne()` et des agrégats, chaque clé facultative, comme dans [Options](#options).

### `SelectLockingOptions` {#SelectLockingOptions}

```ts
interface SelectLockingOptions<A extends string> {
  for: 'UPDATE' | 'NO KEY UPDATE' | 'SHARE' | 'KEY SHARE';
  of?: Unprefixed<Table> | A | (Unprefixed<Table> | A)[];
  wait?: 'NOWAIT' | 'SKIP LOCKED';
}
```

Une clause de verrouillage de [`lock`](#lock). `of` prend un nom de table sans son schéma, ou l’`alias` de la requête (`A`).

### `OrderSpecForTable` {#OrderSpecForTable}

```ts
interface OrderSpecForTable<T extends Table> {
  by: SQLForTable<T>;
  direction: 'ASC' | 'DESC';
  nulls?: 'FIRST' | 'LAST';
}
```

À partir de la 6.9.0. Un élément d’[`order`](#order-limit-offset-and-withties) : `by`, puis `direction`, puis `NULLS` et `nulls` s’il est donné, `"title" DESC NULLS LAST`.

### `ColumnsOption` {#ColumnsOption}

`ColumnsOption<T> = readonly ColumnForTable<T>[] | undefined` : le type de `columns`, et de `returning` dans [`insert()`](/fr/insert#insert) et les autres écritures. Un tableau `readonly` donne le même type qu’un tableau modifiable ([`columns`](#columns)).

### `ExtrasOption` {#ExtrasOption}

`ExtrasOption<T> = SQLFragmentOrColumnMap<T> | undefined` : le type d’`extras`, ici et dans les écritures.

### `LateralOption` {#LateralOption}

`LateralOption<C, E>` : le type de `lateral`. Un objet de sous-requêtes ([`SQLFragmentMap`](#SQLFragmentMap)) ; ou une seule sous-requête, seulement quand ni `columns` ni `extras` n’est donné. À partir de la 7.2.0, ses paramètres sont contraints par `readonly string[] | undefined` et `{ [k: string]: SQLFragment<any> | string } | undefined`, que respectent tout `ColumnsOption<T>` et tout `ExtrasOption<T>`, plutôt que par `ColumnsOption<Table>` et `ExtrasOption<Table>` : un `L extends LateralOption<C, E>` générique ne compare plus `C` à chaque colonne du schéma ([décision 016](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/016-parent-column-default.md)).

Dans une fonction générique sur `columns` (`C extends ColumnsOption<T>`) ou sur `extras` (`E extends ExtrasOption<T>`), `select()`, `selectOne()` et `selectExactlyOne()` sans `lateral` typent chaque colonne de leurs lignes comme `any` dans cette fonction, comme dans Zapatos 6.6.1 : une colonne erronée compile donc. C’est le cas avec des `columns` génériques, sans `extras` ou avec un `extras` générique, et avec un `extras` générique sans `columns` ; sans `strictNullChecks`, aussi avec des `columns` génériques et un `extras` littéral, ou avec des `columns` littérales et un `extras` générique. Les appelants de la fonction obtiennent des lignes typées. Passez `lateral: undefined`, qui ne change pas le SQL, et, dans chacun de ces cas, les lignes sont typées dans la fonction : une clé d’un `extras` générique est alors refusée elle aussi. Une fonction qui transmet son propre `lateral` générique, ou un objet d’options entier typé avec `LateralOption<C, …>`, garde `any`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
async function filmCards<C extends db.ColumnsOption<'films'>>(queryable: db.Queryable, columns: C) {
  const loose = await db.select('films', db.all, { columns }).run(queryable);
  const looseYear: string = loose[0]!.release_year;  // compiles: each column is any here
  const cards = await db.select('films', db.all, { columns, lateral: undefined }).run(queryable);
  // @ts-expect-error release_year is a number
  const year: string = cards[0]!.release_year;
  // @ts-expect-error films has no rating column
  const rating = cards[0]!.rating;
  return [looseYear, year, rating];
}
```

### `SQLFragmentMap` {#SQLFragmentMap}

`interface SQLFragmentMap { [k: string]: SQLFragment<any> }` : la forme objet de `lateral`, une clé par sous-requête.

### `SQLFragmentOrColumnMap` {#SQLFragmentOrColumnMap}

`interface SQLFragmentOrColumnMap<T> { [k: string]: SQLFragment<any> | ColumnForTable<T> }` : la forme d’`extras`, une clé par colonne ou par fragment.

### `JSONOnlyColsForTable` {#JSONOnlyColsForTable}

`JSONOnlyColsForTable<T, C> = Pick<JSONSelectableForTable<T>, C[number]>` : une ligne avec seulement les `columns` (ou le `returning`) donnés. Il nomme cette ligne dans une signature :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
type FilmCard = db.JSONOnlyColsForTable<'films', ['id', 'title']>;

function filmCardsOf(queryable: db.Queryable, studio_id: number): Promise<FilmCard[]> {
  return db.select('films', { studio_id }, { columns: ['id', 'title'] }).run(queryable);
}
```

- `C` peut être un tuple `readonly`, comme `columns` ([`columns`](#columns)).

### `ExtrasResult` {#ExtrasResult}

`ExtrasResult<T, E>` : les clés qu’ajoute `extras`, chacune typée comme sa colonne dans `JSONSelectable`, ou comme le résultat de son fragment.

### `LateralResult` {#LateralResult}

`LateralResult<L> = { [K in keyof L]: RunResultForSQLFragment<L[K]> }` : les clés qu’ajoute un objet `lateral`, chacune typée comme le résultat de sa sous-requête, `undefined` devenant `null` ([`RunResultForSQLFragment`](/fr/sql-template#RunResultForSQLFragment)).

### `FullSelectReturnTypeForTable` {#FullSelectReturnTypeForTable}

`FullSelectReturnTypeForTable<T, C, L, E, M>` : ce que donne `.run()` pour un mode `M` : la ligne (le `JSONSelectable`, réduit par `columns`, avec `extras` et `lateral` ; ou le résultat de la sous-requête transmise), en tableau, telle quelle ou avec `undefined` ; ou un `number`. La ligne des écritures est [`ReturningTypeForTable`](/fr/insert#ReturningTypeForTable).

### `SelectSignatures` {#SelectSignatures}

La signature d’appel de `select()` : `table`, `where`, `options?`, `mode?` (`Many` par défaut) et `aggregate?`, qui renvoie `SQLFragment<FullSelectReturnTypeForTable<…>>`.

### `SelectOneSignatures` {#SelectOneSignatures}

La signature d’appel de `selectOne()` : `table`, `where`, `options?`, avec le mode `One`. Par défaut, elle renvoie un [`ColumnAggregateFragment`](/fr/aggregates#ColumnAggregateFragment) quand son unique `lateral` est un `min()` ou un `max()` typé par colonne, même transmis par un autre `selectOne()` ou `selectExactlyOne()`, et un `SQLFragment` dans les autres cas ([Typé par colonne](/fr/aggregates#typed-by-column)). Une fonction typée `SelectOneSignatures` reprend ainsi le type de retour de `selectOne()`.

### `SelectExactlyOneSignatures` {#SelectExactlyOneSignatures}

La signature d’appel de `selectExactlyOne()` : `table`, `where`, `options?`, avec le mode `ExactlyOne`. Par défaut, elle renvoie un `ColumnAggregateFragment` dans le même cas que [`SelectOneSignatures`](#SelectOneSignatures). Une fonction typée `SelectExactlyOneSignatures` reprend ainsi le type de retour de `selectExactlyOne()`.

### `SelectRowsSignatures` {#SelectRowsSignatures}

À partir de la 6.12.0. La signature d’appel de `selectRows()` : `table`, `where`, `options?`, qui renvoie `SQLFragment<R[], RowsQuery>`, `R` étant la ligne telle que `selectOne()` la type.

### `RowsQuery` {#RowsQuery}

```ts
interface RowsQuery
```

À partir de la 6.12.0. Le second argument de type du fragment que renvoie `selectRows()`, qui marque une requête de plusieurs lignes : `lateral`, `extras` et un `where` prennent `SQLFragment<any>`, dont le second argument est `never`, et la refusent donc ; un template `sql`, `withCTEs()` et `cursor()` prennent `SQLFragment<any, any>`. Écrivez-le pour typer une variable : `db.SQLFragment<s.films.JSONSelectable[], db.RowsQuery>`. Un helper typé `db.SQLFragment<R>` ou `db.SQLFragment<any>` refuse aussi ce fragment (TS2345) ; typé `db.SQLFragment<R, any>`, il prend les deux : `` const run = <R>(q: db.SQLFragment<R, any>) => q.run(pool); ``<!-- tsc: export … -->.
