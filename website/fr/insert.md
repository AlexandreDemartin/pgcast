---
english: a9c206e63b30
---

# Écritures

Les raccourcis qui écrivent : `insert()`, `upsert()`, `update()`, `deletes()` et `truncate()`. Pour chacun, ses paramètres, chaque option avec le SQL qu’elle ajoute et son effet sur le type, et ce qu’il lève.
{.lede}

Ce que partagent toutes les écritures :

- Chacune renvoie un `SQLFragment` : [`.run(pool)`](/fr/sql-template#run) l’envoie, `.compile()` donne son `text` et ses `values` sans rien envoyer.
- Une valeur est envoyée comme paramètre (`$1`), jamais écrite dans le SQL ; un fragment `sql` est du SQL.
- Les lignes reviennent via `to_jsonb()`, comme le `JSONSelectable` d’une table : un `timestamptz` est une chaîne ([Le catalogue](/fr/catalog-types)).
- Une erreur de Postgres rejette `.run()` avec une `DatabaseError` ([`isDatabaseError()`](/fr/transaction#isDatabaseError)). pgcast lève les erreurs ci-dessous pendant qu’il construit la requête, avant tout envoi.

## `insert()` {#insert}

```ts
db.insert(table, values, options?)
```

Insère une ligne ou plusieurs, et les renvoie telles que Postgres les a stockées, valeurs par défaut et serials remplis.

- `table` : une table du schéma.
- `values` : un `Insertable`, ou un tableau de ceux-ci. Un fragment `sql` est écrit comme SQL (`` db.sql`now()` ``), `db.Default` comme `DEFAULT` ; une valeur `undefined` est `NULL` ([Une valeur `undefined`](#undefined-values)).
  - `raw()`, `cols()` et `vals()` ne sont pas des valeurs ici : ils lèvent une erreur à la compilation, avant toute requête ([`raw()`](/fr/sql-template#raw) donne le message), et le type de pgcast les refuse, là où celui de Zapatos 6.6.1 les acceptait. Pour du SQL, écrivez un fragment `sql` ; dans un tableau ou un objet `jsonb`, ils font partie de la valeur, envoyée en JSON.
  - `db.parent()` lève "The 'parent' table alias has no meaning here"<!-- message --> : un `INSERT` n’a pas de requête parente. Le type le refuse.
  - Une colonne typée `any`, comme l’est celle d’un placeholder de `zapatos/custom`, passe le type, pas l’exécution. Zapatos 6.6.1 envoyait chacun comme un seul paramètre, en JSON : `{ tagline: db.raw("'x'") }` stockait `{"value":"'x'"}`, `db.parent('id')` `{"value":"id"}` ([#259](https://github.com/AlexandreDemartin/pgcast/issues/259)).
- `options` : `returning` et `extras` ([Options](#insert-options)).

<CastPanel example="insert">

<<< ../examples/insert.ts{ts twoslash}

</CastPanel>

- Une ligne donne un résultat ; un tableau donne un tableau, dans l’ordre où Postgres les renvoie, en pratique l’ordre donné.
- Les colonnes sont les clés de toutes les lignes ; une clé absente d’une ligne vaut `DEFAULT` dans cette ligne, comme `tagline` ci-dessus.
- Une ligne sans clé, ou des lignes dont aucune n’a de clé, lèvent une erreur : "nothing to insert: an Insertable needs at least one column; for a row of defaults only, write INSERT ... DEFAULT VALUES in a sql template"<!-- message -->. Zapatos 6.6.1 envoyait `() VALUES ()`, que Postgres refusait (42601).
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
- Une ligne sans clé, ou des lignes dont aucune n’a de clé, lèvent une erreur, comme pour `insert()` ; avec `undefinedMeansMissing`, une valeur `undefined` n’est pas une clé.

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
- `updateValues` est un seul jeu de valeurs pour toutes les lignes mises à jour. Ses clés sont toujours mises à jour, même quand `updateColumns` les omet, ou vaut `doNothing` (le SQL est alors `DO UPDATE SET`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5 }, ['film_id', 'stars'], { updateColumns: db.doNothing, updateValues: { votes: 1 } }) -->, pas `DO NOTHING`) ; avec `undefinedMeansMissing`, une clé à `undefined` n’est pas mise à jour ([Une valeur `undefined`](#undefined-values)).
- Dans `updateValues`, une valeur simple est un paramètre. Une valeur qui contient un fragment, `param()`, `raw()`, `cols()`, `vals()`, `parent()`, `Default` ou `self`, à n’importe quelle profondeur de ses tableaux et objets simples, est compilée comme dans un template `sql`.
- Pour y lire une colonne, nommez la table pour la ligne existante, `${'ratings'}.${'votes'}`, ou `EXCLUDED` pour la nouvelle, `` db.sql`EXCLUDED.${'votes'}` ``.
- Là, `db.self`, ou un fragment ou une condition qui l’utilise (`` db.sql`${db.self} + 1` ``, [`conditions.add()`](/fr/conditions#conditions.add)), lève "The 'self' column alias has no meaning here"<!-- message -->, comme dans Zapatos 6.6.1 ; `db.parent()`, seul ou dans un fragment, lève "The 'parent' table alias has no meaning here"<!-- message -->.

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

### Lignes aux clés différentes {#upsert-different-keys}

Sur plusieurs lignes sans `updateColumns`, une clé absente d’une ligne est insérée comme `DEFAULT`, puis fixée depuis `EXCLUDED` en cas de conflit : la valeur existante de cette ligne est perdue.

- `[{ film_id: 1002, stars: 5, votes: 3 }, { film_id: 1002, stars: 4 }]` envoie `($4, $5, DEFAULT)`<!-- probe: db.upsert('ratings', [{ film_id: 1002, stars: 5, votes: 3 }, { film_id: 1002, stars: 4 }], ['film_id', 'stars']) -->, donc un compte existant de votes à 4 étoiles revient à 1.
- La requête s’exécute, comme dans Zapatos 6.6.1, et pgcast avertit une fois par processus : `PGCAST_DEP001`.
- Une clé de `updateValues`, ou une colonne d’un `conflictTarget` tableau ou chaîne, ne compte pas : de nouvelles lignes sans leur `id` serial, upsertées sur `'id'`, n’avertissent ni ne lèvent d’erreur. Avec `constraint()`, chaque clé compte.
- Aucun avertissement pour des lignes aux mêmes clés, pour une seule ligne, ni avec un `updateColumns`, quel qu’il soit.

::: tip Opt-in
Avec `upsertRequiresSameKeys: true` ([`Config`](/fr/runtime-config#Config.upsertRequiresSameKeys)), un tel upsert lève une erreur avant toute requête : "rows have different keys: pass updateColumns, or give every row the same keys"<!-- message -->. Sans elle, pgcast avertit avec `PGCAST_DEP001` ; elle devient le comportement par défaut en 7.0 ([Versions](/fr/versions)).
:::

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

- Le type accepte chaque index unique de la table, et Postgres seulement une contrainte. Un index créé avec `CREATE UNIQUE INDEX`, qui n’est pas une contrainte, passe la vérification de types, et Postgres le refuse : 42704, `constraint "…" for table "…" does not exist`.
- Pour un tel index, passez ses colonnes comme `conflictTarget` : `'code'` pour un index unique sur `code`.
- Une contrainte unique `DEFERRABLE` passe aussi la vérification de types, et Postgres la refuse comme arbitre, par son nom comme par ses colonnes : 55000, `ON CONFLICT does not support deferrable unique constraints/exclusion constraints as arbiters`.

Le type ne vérifie pas qu’une contrainte appartient à la table de l’upsert, et Postgres refuse celle d’une autre table : 42704. `constraint()` ne prend les noms de la table qu’à l’intérieur de l’appel, comme ci-dessus. Gardé dans une variable, `const k = db.constraint('tags_pkey')` accepte le nom de n’importe quelle table, donc `db.upsert('ratings', …, k)` compile. Donnez la table, `db.constraint<'ratings'>('ratings_pkey')`, et le type vérifie le nom par rapport à elle :

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

`{ $action: 'INSERT' | 'UPDATE' }`, ajouté à chaque résultat d’`upsert()` : `'INSERT'` pour une nouvelle ligne, `'UPDATE'` pour une ligne mise à jour, lu dans le `xmax` de la ligne. `reportAction: 'suppress'` l’ôte du SQL et du type.

## `UpsertReturnableForTable` {#UpsertReturnableForTable}

`UpsertReturnableForTable<T, C, E, RA>` : une ligne de ce que renvoie `upsert()`, le [`ReturningTypeForTable`](#ReturningTypeForTable) avec [`UpsertAction`](#UpsertAction), sauf si `RA`, le `reportAction`, vaut `'suppress'` : `db.UpsertReturnableForTable<'ratings', undefined, undefined, undefined>` est `ratings.JSONSelectable & UpsertAction`. Il n’ajoute pas l’`undefined` de `updateColumns: []` ([`doNothing`](#doNothing)). Il a besoin de `strictNullChecks` : sans lui, c’est le `JSONSelectable` entier avec `UpsertAction`, quels que soient `C`, `E` et `RA`.

## `update()` {#update}

```ts
db.update(table, values, where, options?)
```

Met à jour les lignes qui correspondent, et les renvoie. Les arguments viennent dans l’ordre du SQL : `SET`, puis `WHERE`.

- `table` : une table du schéma.
- `values` : un `Updatable`, avec au moins une clé. Un fragment `sql` est écrit comme SQL, où `db.self` est la colonne, de même qu’une condition comme [`conditions.add()`](/fr/conditions#conditions.add) ; écrit en ligne, ce fragment peut demander un argument de type ([`Constraint`](/fr/sql-template#type-arguments)). `raw()`, `cols()`, `vals()` et `parent()` lèvent une erreur, comme pour [`insert()`](#insert). Une valeur `undefined` est `NULL` ([Une valeur `undefined`](#undefined-values)).
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

Dans les valeurs d’`insert()`, `update()` et `upsert()`, Zapatos 6.6.1 envoie `undefined` comme `NULL` : une colonne `NOT NULL DEFAULT` échoue, et `update()` efface la colonne au lieu de la laisser telle quelle.

<div class="stack">

| Dans | Par défaut, comme en 6.6.1 | Avec `undefinedMeansMissing: true` |
|---|---|---|
| `insert()` | `NULL` | `DEFAULT` : `VALUES ($1, $2, $3, DEFAULT, $4)`<!-- probe: (db.setConfig({ undefinedMeansMissing: true }), db.insert('films', { studio_id: 1000, title: 'x', release_year: 2030, tagline: undefined, runtime_minutes: 90 })) --> |
| `update()` | met la colonne à `NULL`, et compte comme une clé | omise : `SET ("title") = ROW($1)`<!-- probe: (db.setConfig({ undefinedMeansMissing: true }), db.update('films', { title: 'x', tagline: undefined }, { id: 1000 })) --> ; sans clé restante, lève "nothing to update…"<!-- message --> |
| `upsert()` | insère `NULL`, puis la fixe depuis `EXCLUDED` | omise : ni insérée, ni mise à jour sauf si `updateColumns` la nomme (alors depuis `EXCLUDED`, donc une ligne existante prend le `DEFAULT` de la colonne) ; sur plusieurs lignes, sa cellule est `DEFAULT` et compte comme absente ([Lignes aux clés différentes](#upsert-different-keys)) ; sans colonne restante, lève "nothing to insert…"<!-- message --> |
| `upsert()` `updateValues` | la fixe depuis `EXCLUDED` : la valeur insérée, ou le `DEFAULT` de la colonne | omise, comme une clé que `updateValues` n’a pas : `SET ("film_id", "stars") = ROW(EXCLUDED."film_id", EXCLUDED."stars")`<!-- probe: (db.setConfig({ undefinedMeansMissing: true }), db.upsert('ratings', { film_id: 1002, stars: 4 }, ['film_id', 'stars'], { updateValues: { votes: undefined } })) -->, donc la valeur existante reste ; avec `doNothing` et aucune autre clé, `DO NOTHING`<!-- probe: (db.setConfig({ undefinedMeansMissing: true }), db.upsert('ratings', { film_id: 1002, stars: 4 }, ['film_id', 'stars'], { updateColumns: db.doNothing, updateValues: { votes: undefined } })) --> |

</div>

- Par défaut, chacun envoie le SQL de 6.6.1 et avertit une fois par processus : `PGCAST_DEP002`.
- Un `undefined` dans un `where` se comporte comme avant.
- Dans `updateValues`, par défaut, `upsert('ratings', { film_id: 1002, stars: 4 }, ['film_id', 'stars'], { updateValues: { votes: undefined } })` envoie `EXCLUDED."votes"`<!-- probe: db.upsert('ratings', { film_id: 1002, stars: 4 }, ['film_id', 'stars'], { updateValues: { votes: undefined } }) -->, et un compte existant revient à 1. pgcast n’avertit que lorsque la clé est seule à ajouter sa colonne : `updateColumns` l’omet ou, sans `updateColumns`, aucune ligne ne l’insère.
- Une colonne que la mise à jour fixe de toute façon, insérée sans `updateColumns` ou nommée par cette option, reste fixée depuis `EXCLUDED` dans les deux modes, comme sans clé dans `updateValues`.

::: tip Opt-in
`undefinedMeansMissing: true` ([`Config`](/fr/runtime-config#Config.undefinedMeansMissing)) lit une valeur `undefined` comme une clé absente, comme le fait `JSON.stringify()`. Sans elle, pgcast avertit avec `PGCAST_DEP002` ; elle devient le comportement par défaut en 7.0 ([Versions](/fr/versions)).
:::

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
