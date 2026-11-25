---
english: 80fb6f8594d8
---

# Écritures

Les raccourcis qui écrivent : `insert()`, `upsert()`, `update()`, `deletes()` et `truncate()`. Pour chacun, ses paramètres, chaque option avec le SQL qu’elle ajoute et son effet sur le type, et ce qu’il lève.
{.lede}

Ce que partagent toutes les écritures :

- Chacune renvoie un `SQLFragment` : [`.run(pool)`](/fr/sql-template#run) l’envoie, `.compile()` donne son `text` et ses `values` sans rien envoyer.
- Une valeur est envoyée comme paramètre (`$1`), jamais écrite dans le SQL ; un fragment `sql` est du SQL.
- Les lignes reviennent via `to_jsonb()`, ou `to_json()` [avec `shortcutsUseJson`](#shortcutsUseJson), à partir de la 7.3.0, comme le `JSONSelectable` d’une table : un `timestamptz` est une chaîne ([Le catalogue](/fr/catalog-types)).
- Une erreur de Postgres rejette `.run()` avec une `DatabaseError` ([`isDatabaseError()`](/fr/transaction#isDatabaseError)). pgcast lève les erreurs ci-dessous pendant qu’il construit la requête, avant tout envoi.

## `insert()` {#insert}

```ts
db.insert(table, values, options?)
```

Insère une ligne ou plusieurs, et les renvoie telles que Postgres les a stockées, valeurs par défaut et serials remplis.

- `table` : une table du schéma.
- `values` : un `Insertable`, ou un tableau de ceux-ci, `readonly` ou non (`readonly` à partir de la 6.11.0). Un fragment `sql` est compilé en SQL (`` db.sql`now()` ``) et `db.Default` devient `DEFAULT`. Une cellule à `undefined` prend aussi la valeur `DEFAULT` ([Une valeur `undefined`](#undefined-values)).
  - Avec un tableau `readonly`, l’erreur d’une ligne erronée, ou d’un autre argument erroné, est, sous TypeScript 7, « <span lang="en">The type '…' is 'readonly' and cannot be assigned to the mutable type '…'</span> » : l’erreur de la dernière surcharge, celle du tableau modifiable, que TypeScript 7 affiche seule. TypeScript 4.1 et 5.9 listent l’erreur de chaque surcharge, dont celle de la ligne.
  - À partir de la 6.11.0, le type refuse une chaîne ou un `String` comme ligne, ici et dans `upsert()` (2769), et une chaîne, un `String` ou un tableau comme valeurs d’`update()` (2345), même sur une table dont une colonne porte le nom d’un membre de `String`, d’un type auquel ce membre correspond (`length` un nombre), quel que soit le schéma.
  - `raw()`, `cols()` et `vals()` ne sont pas des valeurs ici : ils lèvent une erreur à la compilation, avant toute requête ([`raw()`](/fr/sql-template#raw) donne le message), et le type de pgcast les refuse, là où celui de Zapatos 6.6.1 les acceptait. Pour du SQL, écrivez un fragment `sql` ; dans un tableau ou un objet `jsonb`, ils font partie de la valeur, envoyée en JSON.
  - `db.parent()` lève "The 'parent' table alias has no meaning here"<!-- message --> : un `INSERT` n’a pas de requête parente. Le type le refuse.
  - À partir de la 6.10.0, un raccourci de lecture, `select()`, `selectOne()`, `selectExactlyOne()`, `count()`, `sum()`, `avg()`, `min()` ou `max()`, ou une `.copy()` de l’un d’eux, est une sous-requête : il est écrit entre parenthèses, `VALUES ($1, $2, (SELECT count(*) AS result FROM "ratings"))`<!-- probe: db.insert('ratings', { film_id: 1, stars: 5, votes: db.count('ratings', db.all) }) -->, dans `upsert()` et `update()` aussi. Il stocke ce qu’il donne comme valeur d’[`extras`](/fr/select#extras) : un agrégat sa valeur, les autres leur JSON, si bien que `selectOne()` avec `columns: ['title']` stocke `{"title": "The Salt Orchard"}` dans une colonne `text`. Sans aucune ligne, `select()` stocke `[]` et `count()` `0` ; `selectOne()`, `selectExactlyOne()`, `sum()`, `avg()`, `min()` et `max()` stockent `NULL`, et `selectExactlyOne()` ne lève pas d’erreur. Zapatos 6.6.1 l’écrivait sans parenthèses, ce que Postgres refusait (42601). Un raccourci d’écriture y est refusé avec ou sans parenthèses (42601) : Postgres ne l’exécute que dans un `WITH`.
  - Une colonne typée `any`, comme l’est celle d’un placeholder de `zapatos/custom`, passe le type, pas l’exécution. Zapatos 6.6.1 envoyait chacun comme un seul paramètre, en JSON : `{ tagline: db.raw("'x'") }` stockait `{"value":"'x'"}`, `db.parent('id')` `{"value":"id"}` ([#259](https://github.com/AlexandreDemartin/pgcast/issues/259)).
- `options` : `returning` et `extras` ([Options](#insert-options)).

<CastPanel example="insert">

<<< ../examples/insert.ts{ts twoslash}

</CastPanel>

- Une ligne donne un résultat ; un tableau donne un tableau, dans l’ordre où Postgres les renvoie, en pratique l’ordre donné.
- Les colonnes sont les clés de toutes les lignes ; une clé absente d’une ligne vaut `DEFAULT` dans cette ligne, comme `tagline` ci-dessus.
- Une ligne sans clé, ou des lignes dont aucune n’a de clé, lèvent une erreur : "nothing to insert: an Insertable needs at least one column; for a row of defaults only, write INSERT ... DEFAULT VALUES in a sql template"<!-- message -->. Zapatos 6.6.1 envoyait `() VALUES ()`, que Postgres refusait (42601).
- Une ligne qui vaut `null`, donnée seule, ou une chaîne, un nombre ou une autre valeur primitive, seule ou parmi d’autres lignes, même à côté d’une ligne sans clé, lève une erreur à la compilation, si bien que `.run()` est rejetée avant toute requête, dans `upsert()` et `update()` aussi, avec un message qui nomme le type de la ligne, celui de [`cols()`](/fr/sql-template#cols) pour une ligne donnée seule ou la première d’un tableau, et celui de [`vals()`](/fr/sql-template#vals) pour une ligne suivante : une ligne `null` donne "`` `db.cols()` takes an object or an array, not `null`: for one column, write `db.cols([name])`; for a row of `insert()`, `upsert()` or `update()`, give an object. ``<!-- message -->", et `[row, 42]`, "`` `db.vals()` takes an object or an array, not `number`: for one value, write `db.vals([value])`; for a row of `insert()`, `upsert()` or `update()`, give an object. ``<!-- message -->". Une ligne `null` parmi d’autres donne `DEFAULT` dans chaque colonne, comme dans Zapatos 6.6.1. Sur une ligne `null` seule, Zapatos 6.6.1 échouait avec une `TypeError`, à l’appel dans `upsert()` ; il écrivait une ligne qui est une chaîne comme des colonnes `"0"`, `"1"`…, que Postgres refusait sauf si la table les avait (42703), et une valeur primitive sans caractère (`''`, un nombre, un booléen…) à côté d’une ligne de colonnes en une ligne de valeurs par défaut, et l’insertion s’exécutait.
- Une ligne qui est un `Buffer`, ou un objet natif sans clé propre énumérable (un `Date`, une `Map`…), parmi d’autres lignes lève elle aussi une erreur à la compilation, dans `upsert()` aussi, avec le message de `cols()` pour la première ligne et celui de `vals()` pour une ligne suivante, qui nomment l’objet natif : `[row, new Date()]` donne "`` `db.vals()` takes an object or an array, not a built-in `Date` with no own enumerable key, which would compile to nothing: for one value, write `db.vals([value])`; for a row of `insert()`, `upsert()` or `update()`, give a plain object. ``<!-- message -->". Un `Buffer` lève aussi une erreur quand il est seul dans un tableau. Zapatos 6.6.1 écrivait le `Date` en une ligne de valeurs par défaut, et l’insertion s’exécutait ; il écrivait les octets d’un `Buffer` comme des colonnes `"0"`, `"1"`…, que Postgres refusait sauf si la table les avait (42703). Une ligne qui est un objet natif doté de ses propres clés énumérables, autre qu’un `Buffer`, reste une ligne de ces clés, comme une ligne qui est un `Proxy`, sauf s’il enveloppe un objet natif sans clé propre énumérable, auquel cas elle lève la même erreur que cet objet natif ; une ligne sans clé, seule ou à côté de lignes qui n’en ont pas non plus, lève toujours "nothing to insert".
- Un tableau vide ne fait rien : `.run(pool)` se résout avec `[]` et n’envoie rien, sauf si on le force avec `.run(pool, true)`. Son SQL, `INSERT INTO "films" SELECT null WHERE false`<!-- probe: db.insert('films', []) -->, est marqué comme sans effet.
- Postgres accepte au plus 65 535 paramètres par requête : découpez une insertion plus grosse ([Batches](/fr/batches)).

### Options {#insert-options}

`returning` et `extras` sont les mêmes pour `upsert()`, `update()` et `deletes()` ([`ReturningOptionsForTable`](#ReturningOptionsForTable)).

<CastPanel example="insert_returning">

<<< ../examples/insert_returning.ts{ts twoslash}

</CastPanel>

| Option | SQL ajouté | Effet sur le type |
|---|---|---|
| aucune | `RETURNING to_jsonb("films".*) AS result`<!-- probe: examples/insert.ts --> | `films.JSONSelectable` |
| `returning: ['id']` | `jsonb_build_object($5::text, "id")`<!-- probe: examples/insert_returning.ts --> à la place de `to_jsonb("films".*)` | `Pick<films.JSONSelectable, 'id'>` |
| `extras: { name: 'title', shouted: … }`, comme ci-dessus | `\|\| jsonb_build_object($6::text, "title", $7::text, upper("title"))`<!-- probe: examples/insert_returning.ts --> | ajoute `name`, du type de la colonne, et `shouted`, du `RunResult` du fragment : `string`, d’après `db.sql<s.films.SQL, string>` |

- Un tableau `readonly` dans `returning` (`['id'] as const`) donne le même SQL et le même type qu’un tableau modifiable ([`columns`](/fr/select#columns)).
- Les deux ont besoin de `strictNullChecks` pour leurs types.
- Des options `null` reviennent à n’en passer aucune. `returning: null` ou `extras: null`, en passant outre le type, lève une erreur à la compilation de la requête, si bien que `.run()` est rejetée avant toute requête, dans `upsert()`, `update()` et `deletes()` aussi : "`` `returning: null` has no meaning: for every column, leave `returning` out; for some, give an array of their names. ``<!-- message -->". Un `insert()` ou un `upsert()` de `[]` reste sans effet, et une ligne sans clé lève toujours son erreur d’abord, à l’appel. Zapatos 6.6.1 levait une `TypeError` à l’appel.

### Avec `shortcutsUseJson` {#shortcutsUseJson}

À partir de la 7.3.0. Avec [`shortcutsUseJson`](/fr/runtime-config#Config.shortcutsUseJson), le `RETURNING` d’`insert()`, d’`upsert()`, d’`update()` et de `deletes()` est construit avec les fonctions `json`, à la place de leurs équivalents `jsonb`. Les valeurs et les types sont les mêmes, à part l’ordre des clés d’une ligne : les colonnes de la table, puis `extras`, puis `$action`.

| Option | SQL avec `shortcutsUseJson` |
|---|---|
| aucune | `RETURNING to_json("films".*) AS result`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.insert('films', { studio_id: 1000, title: 'Winter at Fennick Lock', release_year: 2032, runtime_minutes: 108 })) --> |
| `returning`, avec ou sans `extras` et `$action` | un seul `json_build_object($5::text, "id", $6::text, "title", $7::text, upper("title"))`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.insert('films', { studio_id: 1000, title: 'Winter at Fennick Lock', release_year: 2032, runtime_minutes: 108 }, { returning: ['id'], extras: { name: 'title', shouted: db.sql`upper(${'title'})` } })) -->, dont les clés sont des paramètres ; dans `upsert()`, `'$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END)`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars'], { returning: ['votes'] })) --> en dernier |
| `extras`, ou le `$action` d’`upsert()`, à côté de toutes les colonnes | `to_json("row_films".*)`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.insert('films', { studio_id: 1000, title: 'Winter at Fennick Lock', release_year: 2032, runtime_minutes: 108 }, { extras: { shouted: db.sql`upper(${'title'})` } })) --> de la ligne avec ses clés en alias, `upper("title") AS "shouted"`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.insert('films', { studio_id: 1000, title: 'Winter at Fennick Lock', release_year: 2032, runtime_minutes: 108 }, { extras: { shouted: db.sql`upper(${'title'})` } })) -->, dans une sous-requête `AS "row_films"`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.insert('films', { studio_id: 1000, title: 'Winter at Fennick Lock', release_year: 2032, runtime_minutes: 108 }, { extras: { shouted: db.sql`upper(${'title'})` } })) --> |
| `reportAction: 'suppress'`, sans `extras` | `RETURNING to_json("ratings".*) AS result`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars'], { reportAction: 'suppress' })) --> |

- À côté de toutes les colonnes, chaque clé d’`extras` est un identifiant, chaque `"` doublé. Une clé vide, avec un NUL ou de plus de 63 octets en UTF-8, que Postgres refuserait ou tronquerait, lève une erreur à la compilation : passez `returning`, dont les clés restent des paramètres.
- Une clé égale à une colonne, ou `$action` dans les `extras` d’`upsert()`, apparaît deux fois dans le JSON, et la dernière l’emporte, comme `||` la fait l’emporter.
- Avec `returning`, un seul `json_build_object()` prend 100 arguments : au-delà de 50 clés, colonnes, `extras` et `$action` compris, une erreur est levée à la compilation.
- À côté de toutes les colonnes, les `extras` s’exécutent dans une sous-requête sur la seule ligne, où Postgres accepte ce que `RETURNING` refuse. Option désactivée, un agrégat, une fonction de fenêtrage ou une fonction renvoyant un ensemble échoue (42803, 42P20, 0A000) ; activée, `count(*)` et `row_number() OVER ()` donnent 1, un agrégat d’une colonne échoue toujours, et une fonction renvoyant un ensemble échoue sur deux lignes (21000) et donne une ligne `null` sur aucune. Un paramètre non typé, `extras: { u: db.param(5) }`, échoue option désactivée (42P18) et donne `"5"` une fois activée, car la sous-requête le type en `text`. Une écriture qui fonctionne option désactivée donne les mêmes valeurs une fois activée.
- Le `result` d’une écriture lu depuis une CTE ou un template `sql` est en `json` : `DISTINCT`, `UNION` ou une fonction `jsonb` appliqués dessus demandent `::jsonb` ([Configuration](/fr/runtime-config#Config.shortcutsUseJson)).

<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars'])) -->
```sql
INSERT INTO "ratings" ("film_id", "stars", "votes") VALUES ($1, $2, $3) ON CONFLICT ("film_id", "stars") DO UPDATE SET ("film_id", "stars", "votes") = ROW(EXCLUDED."film_id", EXCLUDED."stars", EXCLUDED."votes") RETURNING (SELECT to_json("row_ratings".*) FROM (SELECT "ratings".*, CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END AS "$action") AS "row_ratings") AS result
-- [1000, 5, 1]
```

## `upsert()` {#upsert}

```ts
db.upsert(table, values, conflictTarget, options?)
```

`INSERT … ON CONFLICT … DO UPDATE` : insère chaque ligne, ou met à jour la ligne existante avec laquelle elle entre en conflit.

- `table`, `values` : comme pour [`insert()`](#insert) ; `raw()`, `cols()`, `vals()` et `parent()` y lèvent aussi une erreur, sur une ligne en conflit comme sur une nouvelle.
- `conflictTarget` : l’arbitre du conflit : une colonne, un tableau de colonnes, ou le nom d’une contrainte unique ou de clé primaire, enveloppé dans [`constraint()`](#constraint).
- `options` : `updateColumns`, `noNullUpdateColumns`, `updateValues` et `reportAction` ([Options](#upsert-options)) ; `returning` et `extras`, comme pour [`insert()`](#insert-options).

<CastPanel example="upsert">

<<< ../examples/upsert.ts{ts twoslash}

</CastPanel>

- La mise à jour fixe chaque colonne insérée, depuis `EXCLUDED`, et chaque clé de `updateValues`. Les colonnes du `conflictTarget` sont fixées aussi : une clé `citext`, que Postgres compare sans tenir compte de la casse, prend la casse de la nouvelle valeur. Un `updateColumns` qui ne les nomme pas les laisse telles quelles.
- Chaque résultat a `$action`, `'INSERT'` ou `'UPDATE'` ([`UpsertAction`](#UpsertAction)).
- Une ligne donne un résultat ; un tableau donne un tableau, sans les lignes qui ne font rien ([`doNothing`](#doNothing)).
- Un tableau vide ne fait rien, comme pour `insert()`.
- Comme pour `insert()`, l’appel lève une erreur si aucune des lignes fournies n’a de clé. Par défaut, une clé à `undefined` compte comme absente.

### Options {#upsert-options}

Chaque SQL remplace le `DO UPDATE SET …` de l’upsert simple, sur `ratings` (sur `films` pour `noNullUpdateColumns`), ou s’y ajoute :

| Option | SQL ajouté | Effet sur le type |
|---|---|---|
| aucune | `DO UPDATE SET ("film_id", "stars", "votes") = ROW(EXCLUDED."film_id", EXCLUDED."stars", EXCLUDED."votes")`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars']) --> | `ratings.JSONSelectable & UpsertAction` |
| `updateColumns: 'votes'` | `DO UPDATE SET ("votes") = ROW(EXCLUDED."votes")`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars'], { updateColumns: 'votes' }) --> | aucun |
| `updateColumns: db.doNothing` | `DO NOTHING`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars'], { updateColumns: db.doNothing }) --> | `\| undefined`, pour une ligne |
| `noNullUpdateColumns: 'tagline'` | `CASE WHEN EXCLUDED."tagline" IS NULL THEN "films"."tagline" ELSE EXCLUDED."tagline" END`<!-- probe: db.upsert('films', { id: 1002, tagline: null }, 'id', { noNullUpdateColumns: 'tagline' }) --> à la place de `EXCLUDED."tagline"` | aucun |
| `updateValues: { votes: 10 }` | `ROW(EXCLUDED."film_id", EXCLUDED."stars", $3)`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5 }, ['film_id', 'stars'], { updateValues: { votes: 10 } }) --> : `$3` à la place de `EXCLUDED."votes"` | aucun |
| ``updateValues: { votes: db.sql`${'ratings'}.${'votes'} + 1` }`` | `"ratings"."votes" + 1`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5 }, ['film_id', 'stars'], { updateValues: { votes: db.sql`${'ratings'}.${'votes'} + 1` } }) --> à la place de `EXCLUDED."votes"` | aucun |
| `reportAction: 'suppress'` | pas de `\|\| jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END)`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars']) --> | pas d’`UpsertAction` |

- `updateColumns` prend une colonne ou un tableau ; `noNullUpdateColumns` une colonne, un tableau, ou `db.all` pour toutes les colonnes. [Batches](/fr/batches#rows-with-different-keys) a un cast panel avec `updateColumns` : une réservation garde son horaire.
- Un `updateColumns` calculé à l’exécution peut être vide. Sans clé dans `updateValues`, le SQL est alors `DO NOTHING`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars'], { updateColumns: ['votes'].filter(() => false) }) --> ; par défaut, une clé à `undefined` ne compte pas ([Une valeur `undefined`](#undefined-values)). Une ligne en conflit donne alors `undefined`, alors que le type d’un `ratings.Column[]` annonce la ligne. Testez si le résultat vaut `undefined` ou passez [`doNothing`](#doNothing) pour que le type prenne ce cas en compte.
- `updateValues` fournit les mêmes valeurs à toutes les lignes mises à jour. Une clé dont la valeur est définie entraîne la mise à jour de sa colonne, même si `updateColumns` l’omet ou vaut `doNothing` (le SQL est alors `DO UPDATE SET`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5 }, ['film_id', 'stars'], { updateColumns: db.doNothing, updateValues: { votes: 1 } }) -->, pas `DO NOTHING`) ; par défaut, une clé à `undefined` n’ajoute aucune colonne ([Une valeur `undefined`](#undefined-values)).
- Dans `updateValues`, une valeur simple est un paramètre. Une valeur qui contient un fragment, `param()`, `raw()`, `cols()`, `vals()`, `parent()`, `Default` ou `self`, à n’importe quelle profondeur de ses tableaux et objets simples, est compilée comme dans un template `sql` ; un raccourci de lecture est écrit entre parenthèses, comme dans [`insert()`](/fr/insert#insert).
- Pour y lire une colonne, nommez la table pour la ligne existante, `${'ratings'}.${'votes'}`, ou `EXCLUDED` pour la nouvelle, `` db.sql`EXCLUDED.${'votes'}` ``.
- Là, un fragment ou une condition qui utilise `db.self` (`` db.sql`${db.self} + 1` ``, [`conditions.add()`](/fr/conditions#conditions.add)) lève "The 'self' column alias has no meaning here"<!-- message -->, comme dans Zapatos 6.6.1 ; `db.self` ou `db.all` seul, ou dans un `vals([…])`, lève une erreur à la compilation ([`self`](/fr/sql-template#self), [`all`](/fr/sql-template#all)) ; `db.parent()`, seul ou dans un fragment, lève "The 'parent' table alias has no meaning here"<!-- message -->.

::: warning Sécurité
Zapatos 6.6.1 écrivait une chaîne simple de `updateValues` comme un identifiant : `{ tagline: 'happy' }` mettait `"happy"` dans le `ROW(…)`, et une chaîne venue d’un utilisateur pouvait lire d’autres colonnes ou d’autres tables.

pgcast l’envoie comme paramètre, `$3` à sa place, comme son type et `update()` l’ont toujours dit. Pour y lire une colonne, écrivez un fragment, comme dans le tableau ([Sécurité](/fr/security)).
:::

Avec `noNullUpdateColumns`, un `NULL` laisse la valeur existante. Le film 1002 revient d’un flux sans accroche, et garde la sienne :

<CastPanel example="upsert_no_null">

<<< ../examples/upsert_no_null.ts{ts twoslash}

</CastPanel>

- La mise à jour fixe toujours chaque colonne insérée, `"id"` compris ; seule `"tagline"` garde la valeur existante quand la nouvelle est `NULL`.
- `film` est la ligne mise à jour : `$action` vaut `'UPDATE'`, et `tagline` est toujours `'Every map leaves something out.'`.

Avec `reportAction: 'suppress'`, le résultat n’a pas de `$action` :

<CastPanel example="upsert_suppress">

<<< ../examples/upsert_suppress.ts{ts twoslash}

</CastPanel>

Avec `strictNullChecks` désactivé, le type garde `$action`, qui vaut alors `undefined`.

Une table partitionnée a besoin de `'suppress'` quand une ligne arrive dans une partition dont les colonnes sont aux mêmes positions que celles de la table : les mêmes colonnes dans le même ordre, ce que donne `PARTITION OF`, sauf si la table avait déjà une colonne supprimée, ou ce que peut avoir une table créée par `CREATE TABLE` puis attachée. Postgres n’y lit pas de `xmax`, et refuse la requête (0A000) : « <span lang="en">cannot retrieve a system column in this context</span> », comme avec Zapatos 6.6.1. Une ligne qui arrive dans une partition aux colonnes dans un autre ordre renvoie `$action`, comme un upsert dans la partition elle-même.

### Lignes aux clés différentes {#upsert-different-keys}

Un upsert de plusieurs lignes lève une erreur à l’appel si sa mise à jour implicite inclut une colonne absente d’une ligne, sauf si la cible du conflit la nomme ou si `updateValues` lui donne une valeur définie. Un `updateColumns` explicite désactive la vérification. Avec `noNullUpdateColumns` seul, elle s’applique toujours. Erreur : "rows have different keys: pass updateColumns, or give every row the same keys"<!-- message -->.

- Donnez la clé à chaque ligne pour garder la mise à jour implicite.
- Une nouvelle ligne peut omettre son `id` serial lors d’un upsert sur `'id'`. Le nom d’une contrainte ne suffit pas à pgcast pour en connaître les colonnes.
- Une ligne `null` parmi d’autres compte comme une ligne à laquelle il manque toutes les clés.

Pendant toute la 7.x, avec [`upsertRequiresSameKeys: false`](/fr/runtime-config#Config.upsertRequiresSameKeys), la cellule manquante prenait la valeur `DEFAULT`, qui pouvait écraser la valeur stockée. Par exemple, `[{ film_id: 1002, stars: 5, votes: 3 }, { film_id: 1002, stars: 4 }]` envoyait `($4, $5, DEFAULT)`, et ramenait à 1 le nombre de votes à 4 étoiles déjà enregistré. La 8.0 supprime l’option ([migration vers la 8.0](/fr/switching#from-8-0-upsertRequiresSameKeys)).

## `constraint()` {#constraint}

```ts
db.constraint(name)
```

Enveloppe le nom d’une contrainte unique ou de clé primaire de la table, pour le `conflictTarget` d’`upsert()` : `ON CONFLICT ON CONSTRAINT "ratings_pkey"`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, db.constraint('ratings_pkey')) -->, à la place de `ON CONFLICT ("film_id", "stars")`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars']) -->. Les noms viennent du schéma, donc un nom que la table n’a pas ne compile pas :

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
// ---cut---
db.upsert('ratings', { film_id: 1002, stars: 4 }, db.constraint('ratings_pkey'));
db.upsert('ratings', { film_id: 1002, stars: 4 }, db.constraint('ratings_stars_key'));
```

`constraint()` accepte les contraintes `UNIQUE` et `PRIMARY KEY` utilisables avec `DO UPDATE`. Pour un index unique ordinaire sur `code`, passez le nom de la colonne, `'code'`, comme `conflictTarget`. Postgres refuse une contrainte différable (55000), une contrainte dont l’index est encore invalide (42P10) et, depuis Postgres 18, une clé `WITHOUT OVERLAPS` avec `DO UPDATE` (42809). En 7.x, [`uniqueIndexConstraintsOnly: false`](/fr/generator#generate.uniqueIndexConstraintsOnly) rétablissait la vérification de types de la 6.x, sous les mêmes règles de Postgres ; la 8.0 retire cette option.

Postgres cherche la contrainte sur la table cible, même si une autre table a une contrainte du même nom. Si la contrainte est absente, Postgres renvoie 42704. Si aucun index de la contrainte ne peut servir d’arbitre, Postgres renvoie 42809, par exemple pour une contrainte `CHECK` qui porte le même nom qu’un index sans contrainte.

TypeScript déduit la table cible lorsque vous appelez `constraint()` directement dans `upsert()`, comme ci-dessus. Si vous stockez le résultat dans une variable avec `const k = db.constraint('tags_pkey')`, `constraint()` accepte un nom de contrainte de n’importe quelle table et `db.upsert('ratings', …, k)` compile. Indiquez la table avec `db.constraint<'ratings'>('ratings_pkey')` pour que TypeScript vérifie que la contrainte appartient à `ratings`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const k = db.constraint('tags_pkey');
db.upsert('ratings', { film_id: 1002, stars: 4 }, k);  // compiles, then 42704
// @ts-expect-error tags_pkey is not a constraint of ratings
db.constraint<'ratings'>('tags_pkey');
```

## `Constraint` {#Constraint}

La classe que renvoie `constraint()`, le nom de sa contrainte dans `value` : `new db.Constraint<'ratings'>('ratings_pkey')` revient au même.

## `doNothing` {#doNothing}

Un tableau vide, pour le `updateColumns` d’`upsert()` : une ligne en conflit est laissée telle quelle, et ne renvoie rien.

<CastPanel example="upsert_do_nothing">

<<< ../examples/upsert_do_nothing.ts{ts twoslash}

</CastPanel>

- Une ligne : `undefined` quand elle est en conflit, et le type le dit.
- Un tableau : seulement les lignes insérées ; `[]` quand toutes sont en conflit.

## `UpsertAction` {#UpsertAction}

`{ $action: 'INSERT' | 'UPDATE' }`, ajouté à chaque résultat d’`upsert()` : `'INSERT'` pour une nouvelle ligne, `'UPDATE'` pour une ligne mise à jour, lu dans le `xmax` de la ligne. `reportAction: 'suppress'` l’ôte du SQL et du type ; une table partitionnée peut en avoir besoin, car Postgres ne lit pas de `xmax` dans une partition dont les colonnes sont aux mêmes positions que celles de la table ([Options](#upsert-options)).

## `UpsertOptions` {#UpsertOptions}

À partir de la 6.9.0. `UpsertOptions<T, C, E, UC, RA>` : les `options` d’`upsert()`, le [`ReturningOptionsForTable`](#ReturningOptionsForTable) avec `updateValues`, `updateColumns`, `noNullUpdateColumns` et `reportAction` ([Options](#upsert-options)). `UC` est le type d’`updateColumns` et `RA` celui de `reportAction` (`undefined` pour une option non donnée).

Son `updateValues` accepte n’importe quelle chaîne sur une table dont une colonne porte le nom d’un membre de `String`, d’un type auquel ce membre correspond (`length`, un nombre), à dessein : la vérification qu’ont les valeurs d’`upsert()`, d’`insert()` et d’`update()` ajouterait une clé à `UpsertOptions['updateValues']` ([#674](https://github.com/AlexandreDemartin/pgcast/issues/674)).

## `UpsertReturnableForTable` {#UpsertReturnableForTable}

`UpsertReturnableForTable<T, C, E, RA>` : une ligne de ce que renvoie `upsert()`, le [`ReturningTypeForTable`](#ReturningTypeForTable) avec [`UpsertAction`](#UpsertAction), sauf si `RA`, le `reportAction`, vaut `'suppress'` : `db.UpsertReturnableForTable<'ratings', undefined, undefined, undefined>` est `ratings.JSONSelectable & UpsertAction`. Il n’ajoute pas l’`undefined` de `updateColumns: []` ([`doNothing`](#doNothing)). Il a besoin de `strictNullChecks` : sans lui, c’est le `JSONSelectable` entier avec `UpsertAction`, quels que soient `C`, `E` et `RA`.

## `update()` {#update}

```ts
db.update(table, values, where, options?)
```

Met à jour les lignes qui correspondent, et les renvoie. Les arguments viennent dans l’ordre du SQL : `SET`, puis `WHERE`.

- `table` : une table du schéma.
- `values` : un `Updatable`, avec au moins une clé. Un fragment `sql` est écrit comme SQL, où `db.self` est la colonne, de même qu’une condition comme [`conditions.add()`](/fr/conditions#conditions.add) ; écrit en ligne, ce fragment peut demander un argument de type ([`Constraint`](/fr/sql-template#type-arguments)). `raw()`, `cols()`, `vals()` et `parent()` lèvent une erreur, comme pour [`insert()`](#insert). Une affectation à `undefined` est omise ([Une valeur `undefined`](#undefined-values)).
- `where` : un `Whereable`, ou un fragment `sql` ([Conditions](/fr/conditions)).
- `options` : `returning` et `extras`, comme pour [`insert()`](#insert-options).

<CastPanel example="update">

<<< ../examples/update.ts{ts twoslash}

</CastPanel>

- Toujours un tableau : chaque ligne mise à jour, `[]` quand aucune ne correspond.
- `SET (…) = ROW(…)` : avec `ROW()`, une seule colonne reste valide depuis Postgres 10.
- `values` sans clé lève une erreur : "nothing to update: an Updatable needs at least one column"<!-- message -->. Zapatos 6.6.1 envoyait `SET () = ROW()`, que Postgres refusait (42601).

::: warning Toutes les lignes
Un `Whereable` vide, `{}`, se compile en `WHERE TRUE`<!-- probe: db.update('films', { title: 'x' }, {}) --> : `update()` met à jour toutes les lignes de la table, et `deletes()` les supprime toutes. Une liste vide dans [`and(...filters)` ou `not(or(...ids))`](/fr/conditions#conditions.and) atteint aussi toutes les lignes.
:::

## `deletes()` {#deletes}

```ts
db.deletes(table, where, options?)
```

Supprime les lignes qui correspondent, et les renvoie. `delete` est un mot réservé en JavaScript, d’où le nom.

- `table` : une table du schéma.
- `where` : un `Whereable`, ou un fragment `sql` ([Conditions](/fr/conditions)) ; `{}` désigne toutes les lignes, comme pour [`update()`](#update).
- `options` : `returning` et `extras`, comme pour [`insert()`](#insert-options).

<CastPanel example="deletes">

<<< ../examples/deletes.ts{ts twoslash}

</CastPanel>

- Toujours un tableau : chaque ligne supprimée, `[]` quand aucune ne correspond.

## `DeleteSignatures` {#DeleteSignatures}

L’interface de la signature d’appel de `deletes()`, `(table, where, options?) => SQLFragment<…[]>`, pour une fonction qui l’enveloppe et garde ses types. Une fonction typée avec elle en tire les types de ses paramètres, sans cast, et ses appels sont vérifiés et typés comme ceux de `deletes()` :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const loggedDeletes: db.DeleteSignatures = (table, where, options) => {
  const query = db.deletes(table, where, options);
  console.log(query.compile().text);
  return query;
};

const removed = loggedDeletes('tags', { film_id: 1003 }, { returning: ['tag'] });
```

## `truncate()` {#truncate}

```ts
db.truncate(table, ...options)
```

Vide une table, ou plusieurs en une seule instruction.

- `table` : une table du schéma, ou un tableau de tables.
- `options` : `'CONTINUE IDENTITY'` ou `'RESTART IDENTITY'`, puis `'RESTRICT'` ou `'CASCADE'`, chacune facultative.

<CastPanel example="truncate">

<<< ../examples/truncate.ts{ts twoslash}

</CastPanel>

| Option | SQL ajouté | Effet sur le type |
|---|---|---|
| aucune | `TRUNCATE "tags"`<!-- probe: db.truncate('tags') --> | `undefined` |
| `'CONTINUE IDENTITY'` | `CONTINUE IDENTITY`<!-- probe: db.truncate('tags', 'CONTINUE IDENTITY') --> : les séquences gardent leurs valeurs, comme par défaut | aucun |
| `'RESTART IDENTITY'` | `RESTART IDENTITY`<!-- probe: db.truncate('tags', 'RESTART IDENTITY') --> : les séquences des tables redémarrent | aucun |
| `'RESTRICT'` | `RESTRICT`<!-- probe: db.truncate('tags', 'RESTRICT') --> : Postgres refuse si une table hors de la liste référence l’une d’elles, comme par défaut | aucun |
| `'CASCADE'` | `CASCADE`<!-- probe: db.truncate('tags', 'CASCADE') --> : vide aussi les tables qui les référencent | aucun |

Avec `'CASCADE'`, Postgres vide chaque table qui référence l’une d’elles, à toute profondeur : `films` emporte avec elle `roles`, `screenings`, `ratings` et `tags`, et `seat_bookings` via `screenings`, chacune nommée dans un avis, `truncate cascades to table "roles"` :

<CastPanel example="truncate_cascade">

<<< ../examples/truncate_cascade.ts{ts twoslash}

</CastPanel>

- `.run()` se résout avec `undefined`, comme le dit son type. Sous Zapatos 6.6.1, elle se résolvait avec `[]`.
- Les options viennent dans cet ordre, au plus une de chaque sorte, comme Postgres les attend, et le type refuse tout autre ordre. En passant outre le type, en JavaScript ou avec `as any`, un autre ordre lève une erreur à la compilation, donc `.run()` est rejetée avec une simple `Error` avant toute requête : `truncate('tags', 'CASCADE', 'RESTART IDENTITY')` donne "Truncate options must be CONTINUE IDENTITY/RESTART IDENTITY, then RESTRICT/CASCADE, one of each at most, not '…'"<!-- message -->. Zapatos 6.6.1 envoyait `TRUNCATE "tags" CASCADE RESTART IDENTITY`, et Postgres le refusait (42601).
- Toute autre option lève une erreur : "Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '…'"<!-- message -->. Zapatos 6.6.1 l’écrivait telle quelle dans le SQL.

## Une valeur `undefined` {#undefined-values}

À partir de la 7.0, une valeur `undefined` à l’écriture compte comme une clé absente, et, à partir de la 8.0, sans exception. Utilisez `null` pour écrire `NULL` dans une colonne qui l’accepte. Ces règles s’appliquent aux valeurs lues à l’appel, à condition qu’elles restent inchangées jusqu’à l’exécution de la requête et que les accesseurs renvoient la même valeur aux lectures suivantes.

<div class="stack">

| Dans | À partir de la 7.0 | Pendant toute la 7.x, avec `undefinedMeansMissing: false` |
|---|---|---|
| `insert()` | `DEFAULT` : `VALUES ($1, $2, $3, DEFAULT, $4)`<!-- probe: db.insert('films', { studio_id: 1000, title: 'x', release_year: 2030, tagline: undefined, runtime_minutes: 90 }) --> | `NULL` |
| `update()` | omise : `SET ("title") = ROW($1)`<!-- probe: db.update('films', { title: 'x', tagline: undefined }, { id: 1000 }) --> ; sans clé restante, lève "nothing to update…"<!-- message --> | met la colonne à `NULL` et la clé compte comme présente |
| `upsert()` | colonne omise si aucune ligne ne la fournit, sinon `DEFAULT` dans la cellule absente ([Lignes aux clés différentes](#upsert-different-keys)). Si la colonne est omise, seuls `updateColumns` ou une valeur définie dans `updateValues` peuvent la mettre à jour (voir le `CASE` de `noNullUpdateColumns` ci-dessous). Sans colonne à insérer, l’appel lève "nothing to insert…"<!-- message --> | insère `NULL` |
| `upsert()` `updateValues` | omise, comme une clé que `updateValues` n’a pas : `SET ("film_id", "stars") = ROW(EXCLUDED."film_id", EXCLUDED."stars")`<!-- probe: db.upsert('ratings', { film_id: 1002, stars: 4 }, ['film_id', 'stars'], { updateValues: { votes: undefined } }) -->, donc la valeur existante reste ; avec `doNothing`, ou un `updateColumns` vide à l’exécution, et aucune autre clé, `DO NOTHING`<!-- probe: db.upsert('ratings', { film_id: 1002, stars: 4 }, ['film_id', 'stars'], { updateColumns: db.doNothing, updateValues: { votes: undefined } }) --> | la colonne prend sa valeur dans `EXCLUDED`, soit la valeur insérée ou le `DEFAULT` de la colonne |

</div>

Dans un filtre, `undefined` est toujours passé en paramètre. En cas de conflit, une valeur définie dans `updateValues` est prioritaire. Sinon, la colonne retenue pour la mise à jour prend sa valeur dans `EXCLUDED`. Pour les colonnes protégées par `noNullUpdateColumns`, un `CASE` garde la valeur stockée si la valeur entrante est `NULL`.

Pendant toute la 7.x, [`undefinedMeansMissing: false`](/fr/runtime-config#Config.undefinedMeansMissing) gardait le comportement d’écriture de la 6.x, indépendamment de la vérification des clés d’un upsert. La 8.0 supprime l’option ([migration vers la 8.0](/fr/switching#from-8-0-undefinedMeansMissing)).

## `ReturningOptionsForTable` {#ReturningOptionsForTable}

`{ returning?, extras? }` : les options d’`insert()`, `upsert()`, `update()` et `deletes()` qui façonnent chaque résultat ([Options](#insert-options)).

## `ReturningTypeForTable` {#ReturningTypeForTable}

`ReturningTypeForTable<T, C, E>` : une ligne de ce que renvoient `insert()`, `update()` et `deletes()`, pour la table `T`, les colonnes `returning` `C` et les `extras` `E` (`undefined` pour une option non donnée) : le `JSONSelectable`, réduit à `C`, avec les clés de `E`.

`insert()` d’une ligne la renvoie ; `insert()` d’un tableau, `update()` et `deletes()` en renvoient un tableau. Il type un faux résultat, dans un test, à partir du schéma :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
type NewFilm = db.ReturningTypeForTable<'films', ['id', 'title'], undefined>;

const inserted: NewFilm = { id: 1000, title: 'The Long Take' };
```

- Stable : des tests de types le lient à ce que donne `.run()`, ici pour `db.insert('films', film, { returning: ['id', 'title'] })`.
- `C` peut être un tuple `readonly`, comme `returning` ([Options](#insert-options)).
- Il a besoin de `strictNullChecks` : sans lui, c’est le `JSONSelectable` entier, quels que soient `C` et `E`.
