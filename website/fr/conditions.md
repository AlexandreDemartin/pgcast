---
english: 9d58bc1b5678
description: "db.conditions regroupe les tests, comparaisons et opérateurs à donner comme valeur d’une clé d’un Whereable, chacun avec le SQL qu’il écrit et ses valeurs."
---

# Conditions {#db-conditions}

`db.conditions` regroupe les tests, comparaisons et opérateurs que vous donnez comme valeur d’une clé d’un Whereable, chacun un fragment `sql` avec cette colonne à sa gauche. Cette page les liste un à un, avec le SQL que chacun écrit et les valeurs qu’il prend.
{.lede}

## `conditions` {#conditions}

```ts
db.conditions.eq(value)  // or: import { conditions as dc } from 'zapatos/db'
```

Chaque membre est un fragment [`sql`](/fr/sql-template#sql) écrit autour de [`db.self`](/fr/sql-template#self), ou une fonction qui en renvoie un. Comme valeur d’une clé d’un [Whereable](/fr/sql-template#whereable), `self` est la colonne de cette clé, et la condition a ses propres parenthèses, à l’intérieur de celles du Whereable : `{ release_year: db.conditions.gte(2000) }` donne `(("release_year" >= $1))`<!-- probe: db.sql`${{ release_year: db.conditions.gte(2000) }}` -->.

<CastPanel example="conditions_where">

<<< ../examples/conditions_where.ts{ts twoslash}

</CastPanel>

- **Où** : comme valeur d’un Whereable, donc dans le `where` de [`select()`](/fr/select#select), [`count()`](/fr/select#count), [`update()`](/fr/insert#update) et [`deletes()`](/fr/insert#deletes), le `having` de `select()`, et un Whereable dans un template `sql`. Ailleurs, `self` n’a pas de colonne : `` db.sql`SELECT ${db.conditions.isNull}` `` lève "The 'self' column alias has no meaning here"<!-- message --> à la compilation.
  - [`and()`](#conditions.and), [`or()`](#conditions.or) et [`not()`](#conditions.not) prennent aussi des Whereables, et peuvent donc former tout un `where` ; [`now`](#conditions.now), [`fromNow()`](#conditions.fromNow) et [`exists()`](#conditions.exists) ne contiennent pas de `self`, et vont partout.
- **Valeurs** : chaque valeur est un paramètre, `$1`, sauf un [`Parameter`](/fr/sql-template#Parameter), gardé tel quel avec son cast ; un fragment `sql`, écrit comme son SQL ; et [`parent()`](/fr/sql-template#parent), la colonne de la requête parente dans une sous-requête `lateral`, ou dans le `where` d’[`exists()`](#conditions.exists) et d’[`isInSelect()`](#conditions.isInSelect), dont l’option `parent` nomme cette table. `Default`, `self`, `all`, `raw()`, `cols()` et `vals()` lèvent une erreur : [Les valeurs qu’une condition refuse](#refused-values). [`eqAny()`](#conditions.eqAny) et les [conditions de tableau](#arrays) envoient leur tableau en un seul paramètre de valeurs simples : un élément qui est l’un d’eux, un `Parameter`, un fragment ou `parent()` lève une erreur, à toute profondeur dans une condition de tableau, et à la place du tableau, `eqAny()` ne prend que `parent()`.
  - [`jsonbContains()`](#conditions.jsonbContains) ne prend qu’une valeur JSON, et [`jsonbPathExists()`](#conditions.jsonbPathExists) une chaîne comme chemin et un objet de valeurs JSON comme variables : un `Parameter`, un fragment ou `parent()` y lève aussi une erreur.
  - [`likeAny()`](#conditions.likeAny) et [`ilikeAny()`](#conditions.ilikeAny) envoient leur tableau en un seul paramètre de motifs : un élément qui n’est ni une chaîne ni `null` lève une erreur, l’un d’eux compris, et `parent()` à la place du tableau aussi.
  - [`websearchToTsquery()`](#conditions.websearchToTsquery) prend deux chaînes : `Default`, `self`, `all`, `raw()`, `cols()`, `vals()`, un `Parameter`, un fragment, `parent()` ou toute autre valeur qui n’est pas une chaîne y lève une erreur.
- **Type** : une condition est un `SQLFragment` dont le second argument de type, `T`, est le type de la valeur à laquelle elle compare (sa `Constraint`, [`sql`](/fr/sql-template#sql)) ; le Whereable vérifie `T` contre le type de la colonne. Les huit tests, `now` et `fromNow()` n’ont pas de `T`, et passent sur n’importe quelle colonne ; le `T` de [`websearchToTsquery()`](#conditions.websearchToTsquery) est un type que seule une colonne typée `any` accepte, comme l’est une colonne `tsvector`.
  - Un Whereable est aussi une expression : interpolé dans une liste `SELECT`, `{ runtime_minutes: add(10) }` est la durée de chaque film plus dix, `(("runtime_minutes" + $1))`<!-- probe: db.sql`${{ runtime_minutes: db.conditions.add(10) }}` -->. Le type laisse donc passer, comme valeur d’un Whereable, ce qui n’est pas un test : [`add()`](#conditions.add), [`subtract()`](#conditions.subtract), [`now`](#conditions.now) et [`fromNow()`](#conditions.fromNow), que Postgres refuse seuls dans un `where` (42804).

Une valeur d’un autre type ne compile pas :

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
db.select('films', { release_year: db.conditions.eq('1991') });
```

Avec `strictNullChecks` (ou `strict`) activé, le type refuse aussi `null` comme valeur, dans `eq()`, `isIn()` et les autres, sauf [`isDistinctFrom()`](#conditions.isDistinctFrom) et [`isNotDistinctFrom()`](#conditions.isNotDistinctFrom), qui acceptent une valeur nullable. Avec l’option désactivée, `eq(null)` compile en `"col" = $1`<!-- probe: db.sql`${{ col: db.conditions.eq(null) }}` -->, qui ne trouve aucune ligne. Le test de `NULL` est [`isNull`](#conditions.isNull).

## Les tests : null, true, false, unknown {#tests}

Des constantes, pas des fonctions : `{ subtitled: db.conditions.isNull }`, sans `()`. Chacun écrit la colonne, puis son test.

| Test | Trouve un `boolean` qui vaut |
|---|---|
| `isNull`, `isUnknown` | `NULL` |
| `isNotNull`, `isNotUnknown` | `true` ou `false` |
| `isTrue` | `true` |
| `isNotTrue` | `false` ou `NULL` |
| `isFalse` | `false` |
| `isNotFalse` | `true` ou `NULL` |

<CastPanel example="conditions_null">

<<< ../examples/conditions_null.ts{ts twoslash}

</CastPanel>

`isNull` et `isNotNull` fonctionnent sur n’importe quelle colonne. Les six autres sont pour un `boolean`, ou un domaine sur un `boolean` : sur un autre type, Postgres les refuse (42804), bien que le type les laisse passer.

### `isNull` {#conditions.isNull}

`"col" IS NULL`<!-- probe: db.sql`${{ col: db.conditions.isNull }}` -->.

### `isNotNull` {#conditions.isNotNull}

`"col" IS NOT NULL`<!-- probe: db.sql`${{ col: db.conditions.isNotNull }}` -->.

### `isTrue` {#conditions.isTrue}

`"col" IS TRUE`<!-- probe: db.sql`${{ col: db.conditions.isTrue }}` -->.

### `isNotTrue` {#conditions.isNotTrue}

`"col" IS NOT TRUE`<!-- probe: db.sql`${{ col: db.conditions.isNotTrue }}` -->.

### `isFalse` {#conditions.isFalse}

`"col" IS FALSE`<!-- probe: db.sql`${{ col: db.conditions.isFalse }}` -->.

### `isNotFalse` {#conditions.isNotFalse}

`"col" IS NOT FALSE`<!-- probe: db.sql`${{ col: db.conditions.isNotFalse }}` -->.

### `isUnknown` {#conditions.isUnknown}

`"col" IS UNKNOWN`<!-- probe: db.sql`${{ col: db.conditions.isUnknown }}` --> : comme `isNull`, pour un `boolean`.

### `isNotUnknown` {#conditions.isNotUnknown}

`"col" IS NOT UNKNOWN`<!-- probe: db.sql`${{ col: db.conditions.isNotUnknown }}` --> : comme `isNotNull`, pour un `boolean`.

## Les comparaisons {#comparisons}

Chacune prend une valeur du type de la colonne, `<T>(a: T)`, et écrit la colonne, son opérateur et la valeur.

<CastPanel example="conditions_compare">

<<< ../examples/conditions_compare.ts{ts twoslash}

</CastPanel>

`ne()` et les quatre comparaisons d’ordre ne trouvent aucune ligne dont la colonne est `NULL` ; `isDistinctFrom()`, lui, les trouve : sur `screenings`, `{ subtitled: ne(true) }` trouve la ligne `false`, `{ subtitled: isDistinctFrom(true) }` la ligne `false` et les deux `NULL`.

### `eq()` {#conditions.eq}

`"col" = $1`<!-- probe: db.sql`${{ col: db.conditions.eq(1) }}` -->.

### `ne()` {#conditions.ne}

`"col" <> $1`<!-- probe: db.sql`${{ col: db.conditions.ne(1) }}` -->.

### `gt()` {#conditions.gt}

`"col" > $1`<!-- probe: db.sql`${{ col: db.conditions.gt(1) }}` -->. [`after()`](#conditions.after) est la même fonction.

### `gte()` {#conditions.gte}

`"col" >= $1`<!-- probe: db.sql`${{ col: db.conditions.gte(1) }}` -->.

### `lt()` {#conditions.lt}

`"col" < $1`<!-- probe: db.sql`${{ col: db.conditions.lt(1) }}` -->. [`before()`](#conditions.before) est la même fonction.

### `lte()` {#conditions.lte}

`"col" <= $1`<!-- probe: db.sql`${{ col: db.conditions.lte(1) }}` -->.

### `isDistinctFrom()` {#conditions.isDistinctFrom}

`"col" IS DISTINCT FROM $1`<!-- probe: db.sql`${{ col: db.conditions.isDistinctFrom(1) }}` --> : comme `ne()`, où `NULL` est une valeur comme une autre, donc le résultat n’est jamais inconnu.

### `isNotDistinctFrom()` {#conditions.isNotDistinctFrom}

`"col" IS NOT DISTINCT FROM $1`<!-- probe: db.sql`${{ col: db.conditions.isNotDistinctFrom(1) }}` --> : comme `eq()`, où `NULL` est une valeur comme une autre. `isDistinctFrom()` et `isNotDistinctFrom()` acceptent tous deux une valeur nullable, `null` compris : si `tagline` est un `string | null`, `{ tagline: isNotDistinctFrom(tagline) }` trouve les films sans accroche quand `tagline` vaut `null`. [`isNull`](#conditions.isNull) reste le test simple de `NULL`.

## Les intervalles {#ranges}

Chacune prend deux valeurs du type de la colonne, `<T>(a: T, b: T)`, chacune un paramètre entre ses propres parenthèses. Les deux bornes sont comprises dans l’intervalle : `between()` les trouve, `notBetween()` non.

<CastPanel example="conditions_between">

<<< ../examples/conditions_between.ts{ts twoslash}

</CastPanel>

### `between()` {#conditions.between}

`"col" BETWEEN ($1) AND ($2)`<!-- probe: db.sql`${{ col: db.conditions.between(1, 2) }}` -->. `a` est la borne basse : `between(2010, 1990)` ne trouve aucune ligne.

### `betweenSymmetric()` {#conditions.betweenSymmetric}

`"col" BETWEEN SYMMETRIC ($1) AND ($2)`<!-- probe: db.sql`${{ col: db.conditions.betweenSymmetric(1, 2) }}` --> : les bornes dans n’importe quel ordre.

### `notBetween()` {#conditions.notBetween}

`"col" NOT BETWEEN ($1) AND ($2)`<!-- probe: db.sql`${{ col: db.conditions.notBetween(1, 2) }}` -->. Avec les bornes inversées, chaque ligne dont la colonne n’est pas `NULL`.

### `notBetweenSymmetric()` {#conditions.notBetweenSymmetric}

`"col" NOT BETWEEN SYMMETRIC ($1) AND ($2)`<!-- probe: db.sql`${{ col: db.conditions.notBetweenSymmetric(1, 2) }}` --> : les bornes dans n’importe quel ordre.

## Les motifs {#patterns}

Chacune prend un motif, `<T extends string>(a: T)`, donc seulement sur une colonne dont le type est une chaîne : sur `release_year`, le type les refuse (TS2322). [`likeAny()`](#conditions.likeAny) et [`ilikeAny()`](#conditions.ilikeAny) en prennent un tableau.

| Famille | Syntaxe | Trouve |
|---|---|---|
| `like()`, `ilike()`, `likeAny()`, `ilikeAny()` | `%` n’importe quel texte, `_` un caractère, `\` échappe le suivant | la valeur entière |
| `similarTo()` | les expressions régulières SQL de Postgres | la valeur entière |
| `reMatch()`, `reImatch()` | les expressions régulières POSIX | n’importe quelle partie de la valeur |

Ainsi `like('Lantern')` ne trouve aucun titre, et `reMatch('Lantern')` trouve `A Lantern for Edith`. Les formes en `i` ignorent la casse.

<CastPanel example="conditions_patterns">

<<< ../examples/conditions_patterns.ts{ts twoslash}

</CastPanel>

### `like()` {#conditions.like}

`"col" LIKE $1`<!-- probe: db.sql`${{ col: db.conditions.like('x') }}` -->.

### `notLike()` {#conditions.notLike}

`"col" NOT LIKE $1`<!-- probe: db.sql`${{ col: db.conditions.notLike('x') }}` -->.

### `ilike()` {#conditions.ilike}

`"col" ILIKE $1`<!-- probe: db.sql`${{ col: db.conditions.ilike('x') }}` -->.

### `notIlike()` {#conditions.notIlike}

`"col" NOT ILIKE $1`<!-- probe: db.sql`${{ col: db.conditions.notIlike('x') }}` -->.

### `likeAny()` {#conditions.likeAny}

```ts
db.conditions.likeAny<T extends string>(a: readonly T[]): SQLFragment<boolean | null, T>
```

À partir de la 6.12.0. `"col" LIKE ANY($1)`<!-- probe: db.sql`${{ col: db.conditions.likeAny(['x%', 'y%']) }}` --> : la colonne correspond à l’un des motifs, le tableau entier en un seul paramètre, comme dans [`eqAny()`](#conditions.eqAny). Là où `or(like('The %'), like('% Bay'))` écrit un paramètre par motif, et un texte par nombre de motifs, `likeAny()` écrit un seul texte quel que soit leur nombre.

- **Tableau vide** : `false`, sur une colonne `NULL` aussi : aucune ligne, et toutes les lignes sous [`not()`](#conditions.not).
- **Les éléments `null`** : Postgres en lit un comme un motif `NULL`, donc une ligne qu’aucun autre motif ne trouve donne `NULL`, et `not()` l’écarte aussi. Avec `strictNullChecks` activé, le type y refuse `null`.
- **Négation** : `not(likeAny(patterns))`, que Postgres lit comme `NOT LIKE ALL` : les lignes qui ne correspondent à aucun d’eux.
- **Caractères génériques** : `%`, `_` et `\` dans la saisie d’un utilisateur sont ceux du motif, comme dans [`like()`](#conditions.like) : échappez-les d’abord, `input.replace(/[\\%_]/g, '\\$&')`, sinon `'100%'` trouve tous les titres qui commencent par `100`.
- **Colonnes** : une colonne dont le type est une chaîne. Sur une colonne `citext`, `LIKE` n’ignore la casse que si le schéma de l’extension est dans le `search_path`, comme avec `like()`.
- **Types littéraux** : les motifs sont typés `string`, là où `like()` garde son littéral. Ainsi, sur une colonne au type plus étroit, une union produite par [`domainsTypedAsUnions`](/fr/generator#generate.domainsTypedAsUnions) ou un placeholder affiné en `` `${string}@${string}` ``, le type les refuse (TS2322) : écrivez le tableau `as const`, `likeAny(['%@example.com'] as const)`<!-- tsc: db.select('films', { title: db.conditions.… }) -->. Sur une colonne enum, un label passe alors le type, et Postgres le refuse (42883), comme avec `like()`.

Une liste qui n’est pas un tableau lève une erreur à la compilation de la requête, comme dans `isIn()`, de même qu’un élément qui n’est ni une chaîne ni `null` à l’appel de `likeAny()` : `pg` enverrait un nombre comme son texte, et un `Parameter`, un fragment ou un objet en JSON, des motifs que personne n’a écrits. Un élément ajouté ensuite au tableau n’est pas vérifié. Le message nomme l’élément :

> `` `likeAny()` sends its array as one parameter, so each item is a pattern, a string, not `db.param()`: give the pattern as a string. ``<!-- message -->

### `ilikeAny()` {#conditions.ilikeAny}

```ts
db.conditions.ilikeAny<T extends string>(a: readonly T[]): SQLFragment<boolean | null, T>
```

À partir de la 6.12.0. `"col" ILIKE ANY($1)`<!-- probe: db.sql`${{ col: db.conditions.ilikeAny(['x%', 'y%']) }}` --> : comme [`likeAny()`](#conditions.likeAny), sans tenir compte de la casse. Sa négation, `not(ilikeAny(patterns))`, est `NOT ILIKE ALL`.

<CastPanel example="conditions_ilikeAny">

<<< ../examples/conditions_ilikeAny.ts{ts twoslash}

</CastPanel>

### `similarTo()` {#conditions.similarTo}

`"col" SIMILAR TO $1`<!-- probe: db.sql`${{ col: db.conditions.similarTo('x') }}` -->.

### `notSimilarTo()` {#conditions.notSimilarTo}

`"col" NOT SIMILAR TO $1`<!-- probe: db.sql`${{ col: db.conditions.notSimilarTo('x') }}` -->.

### `reMatch()` {#conditions.reMatch}

`"col" ~ $1`<!-- probe: db.sql`${{ col: db.conditions.reMatch('x') }}` -->.

### `reImatch()` {#conditions.reImatch}

`"col" ~* $1`<!-- probe: db.sql`${{ col: db.conditions.reImatch('x') }}` -->.

### `notReMatch()` {#conditions.notReMatch}

`"col" !~ $1`<!-- probe: db.sql`${{ col: db.conditions.notReMatch('x') }}` -->.

### `notReImatch()` {#conditions.notReImatch}

`"col" !~* $1`<!-- probe: db.sql`${{ col: db.conditions.notReImatch('x') }}` -->.

## Les listes {#lists}

`isIn()` et `isNotIn()` prennent un tableau de valeurs du type de la colonne, `<T>(a: readonly T[])`, compilé comme le compilerait [`vals()`](/fr/sql-template#vals) : un paramètre par élément. [`eqAny()`](#conditions.eqAny) envoie le tableau entier comme un seul paramètre.

Laquelle choisir : `eqAny()` pour une liste construite à l’exécution, car un seul texte de requête sert pour toute longueur, donc une seule requête préparée avec [`prepared()`](/fr/sql-template#prepared), sans limite de 65 535 paramètres ; `isIn()` pour une liste courte et fixe, ou qui contient un `Parameter` ou un fragment, que `eqAny()` refuse.

<CastPanel example="conditions_isIn">

<<< ../examples/conditions_isIn.ts{ts twoslash}

</CastPanel>

Un élément compile comme dans `vals([…])` au sein d’un filtre :

| Élément | Compile en |
|---|---|
| une valeur simple | un paramètre, `$1` |
| un `Parameter` | tel quel, avec son cast : `isIn([db.param('x', 'text'), 'y'])` donne `IN (CAST($1 AS "text"), $2)`<!-- probe: db.sql`${{ col: db.conditions.isIn([db.param('x', 'text'), 'y']) }}` --> |
| un fragment `sql` | son SQL |
| `parent(c?)` | la colonne parente, dans une sous-requête `lateral` : `IN ("films"."id")`<!-- probe: db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.conditions.isIn([db.parent('id')]) }) } }) --> |
| `Default`, `self`, `all`, `raw()`, `cols()`, `vals()` | lève une erreur ([Les valeurs qu’une condition refuse](#refused-values)) |

Zapatos 6.6.1 y envoyait un `Parameter` et `parent()` comme un paramètre de plus, en JSON (`'{"value":"x","cast":"text"}'`, `'{"value":"id"}'`), si bien que `isIn()` ne trouvait rien et que `isNotIn()` trouvait chaque ligne sur une colonne de texte.

La liste elle-même est un tableau, `readonly` ou non. Le type refuse tout le reste, sauf typé `any` (ou, pour `null` et `undefined`, sans `strictNullChecks`) : un `Set`, un itérateur, un tableau typé, un objet semblable à un tableau, une chaîne. Une telle liste lève une erreur à la compilation de la requête, donc `run()` est rejetée avec une simple `Error` avant toute requête :

> `` `isNotIn()` takes an array, not `Set`: make one with `isNotIn([...values])`, or `Array.from(values)` for an array-like object. ``<!-- message -->

Une seule valeur à la place de la liste, une chaîne, un nombre, `null` ou `undefined`, reçoit l’autre conseil, car le spread de `'Ada'` donnerait `'A'`, `'d'`, `'a'` :

> `` `isIn()` takes an array, not `string`: for one value, write `isIn([value])`. ``<!-- message -->

Zapatos 6.6.1 lisait la `length` de la liste. Un `Set` ou un itérateur n’en a pas, donc `isIn()` donnait `false` et `isNotIn()` `true`, pour chaque ligne : avec `ids` un `Set`, `db.deletes('films', { id: db.conditions.isNotIn(ids) })` était `DELETE FROM "films" WHERE ((true))`. Une chaîne donnait ses caractères, soit, pour une chaîne d’un seul caractère comme le `req.query.id` d’Express (`'5'` pour `?id=5`), sa seule valeur et donc les bonnes lignes, un cas maintenant rejeté ; un objet semblable à un tableau donnait ses valeurs puis sa `length`, et `null` une `TypeError` à l’appel.

### `isIn()` {#conditions.isIn}

`"col" IN ($1, $2)`<!-- probe: db.sql`${{ col: db.conditions.isIn([1, 2]) }}` -->. Un tableau vide donne `false` : aucune ligne.

### `isNotIn()` {#conditions.isNotIn}

`"col" NOT IN ($1, $2)`<!-- probe: db.sql`${{ col: db.conditions.isNotIn([1, 2]) }}` -->. Un tableau vide donne `true` : chaque ligne. Avec un `NULL` dans la liste, elle ne trouve aucune ligne, vu la façon dont Postgres lit `NOT IN` ; avec `strictNullChecks` activé, le type y refuse `null`.

<CastPanel example="conditions_isNotIn">

<<< ../examples/conditions_isNotIn.ts{ts twoslash}

</CastPanel>

### `eqAny()` {#conditions.eqAny}

```ts
db.conditions.eqAny(a: ParentColumn): SQLFragment<boolean | null, never>
db.conditions.eqAny<T>(a: readonly T[]): SQLFragment<boolean | null, T>
```

À partir de la 6.9.0. `"col" = ANY($1)`<!-- probe: db.sql`${{ col: db.conditions.eqAny([1, 2]) }}` -->, le tableau entier en un seul paramètre. Là où `isIn()` écrit un texte par longueur, `IN ($1, $2, …)`, `eqAny()` écrit un seul texte pour toutes les longueurs : une seule requête préparée avec [`prepared()`](/fr/sql-template#prepared) les sert toutes, et `eqAny()` prend plus d’éléments que les 65 535 paramètres qu’une requête peut contenir ([Batches](/fr/batches)).

<CastPanel example="conditions_eqAny">

<<< ../examples/conditions_eqAny.ts{ts twoslash}

</CastPanel>

- **Tableau vide** : aucune ligne, vu la façon dont Postgres lit `= ANY('{}')`, avec le même SQL.
- **Les éléments `null`** ne correspondent à rien, et sous [`not()`](#conditions.not) un seul suffit pour que la condition ne trouve aucune ligne, comme `NOT IN` ; avec `strictNullChecks` activé, le type y refuse `null`.
- **Les éléments** : Postgres lit le paramètre comme un tableau du type de la colonne, donc chaque élément est ce que [`eq()`](#conditions.eq) y prend : le label d’un enum, un `Date` ([Dates et heures](#dates)), un `int8` en chaîne ou en `bigint`. Sur une colonne `jsonb`, un objet est envoyé en JSON, et une chaîne est du texte JSON : `'"x"'` pour la chaîne `x`, `JSON.stringify([1, 2])` pour un tableau.
- **[`parent()`](/fr/sql-template#parent)** : une colonne tableau de la ligne parente, dans une sous-requête `lateral`. Les tags d’un film qui sont parmi ses genres, `{ tag: eqAny(db.parent('genres')) }`, donnent `= ANY("films"."genres")`<!-- probe: db.select('films', db.all, { lateral: { tags: db.select('tags', { tag: db.conditions.eqAny(db.parent('genres')) }) } }) -->, là où `isIn([db.parent('genres')])` compare le tag au tableau entier, ce que Postgres refuse (42883, `operator does not exist: text = text[]`).
- **[`castArrayParamsToJson`](/fr/runtime-config#Config.castArrayParamsToJson)** activé, le tableau reste envoyé comme un tableau, `= ANY($1)`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${{ col: db.conditions.eqAny([1, 2]) }}`) --> : un fragment `sql` avec `db.param(ids)` devient `= ANY(CAST($1 AS "json"))`, que Postgres refuse (42809).

Une liste qui n’est pas un tableau lève une erreur à la compilation de la requête, comme dans `isIn()`. Il en va de même pour un élément qu’un seul paramètre tableau ne peut pas contenir : `pg` enverrait un `Parameter` ou un fragment en JSON, et lirait un élément qui est un tableau comme plusieurs éléments, sans erreur. Le message nomme l’élément, un fragment `sql` ou `db.parent()` à la place de `db.param()` :

> `` `eqAny()` sends its array as one parameter, so each item is a plain value, not `db.param()`: give the value itself, or use `isIn()`, which takes it. ``<!-- message -->

> `` `eqAny()` sends its array as one parameter, which reads an array item as more items: on an array column, use `isIn()`; on a `jsonb` column, give the item as JSON text, `JSON.stringify(item)`. ``<!-- message -->

`Default`, `self`, `all`, `raw()`, `cols()` et `vals()` lèvent aussi une erreur, comme élément ou comme liste : [Les valeurs qu’une condition refuse](#refused-values).

Le type en accepte davantage, et chacune de ces valeurs lève une erreur à la compilation de la requête, avant toute requête ([#570](https://github.com/AlexandreDemartin/pgcast/issues/570)) :

- **Éléments** : un `Parameter`, un fragment ou `parent()`, comme le Whereable le fait dans `isIn()`.
- **La liste** : `{}`, `{ value: 'title' }` et `db.param()` d’un nom de colonne, `db.param('title')`, passent pour un `ParentColumn`, dont tous les membres sont optionnels. `eqAny({})`<!-- tsc: db.select('films', { id: db.conditions.… }) --> lève l’erreur d’une liste qui n’est pas un tableau, `eqAny(db.param('title'))`<!-- tsc: db.select('films', { id: db.conditions.… }) --> celle de `db.param()`.

## Les tableaux {#arrays}

À partir de la 7.0, chaque condition accepte un tableau, y compris en lecture seule, dont les éléments ont le même type que ceux de la colonne. Elle accepte aussi une [colonne parente](/fr/sql-template#parent). Pour `films.genres`, de type `text[]`, passez un tableau de chaînes. Avec TypeScript 4.1 ou 5.9, passez les labels d’un enum sous la forme `['director'] as const` ou dans un tableau de type `s.crew_job[]`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.select('films', { genres: db.conditions.arrayOverlaps(['romance']) });
// @ts-expect-error genres holds strings
db.select('films', { genres: db.conditions.arrayOverlaps([1]) });
// @ts-expect-error a parent column can be the operand, but cannot be a genre
db.select('films', { genres: db.conditions.arrayContains([db.parent('id')]) });
```

Si vous stockez le résultat de `arrayContains(['drama'])` dans une variable, sa contrainte est `string[]`. Dans un callback, écrivez `.map(genres => db.conditions.arrayContains(genres))` pour conserver le type des éléments. Un mock qui suit la signature de la 6.6.1 doit prendre en charge les deux surcharges.

Sur une colonne scalaire, TypeScript accepte encore un littéral de tableau vide, une variable de type `never[]` ou `parent()`. Postgres refuse de comparer une colonne de type entier à un tableau.

La syntaxe de la 6.6.1 ci-dessous compile aussi. Elle envoie un tableau à deux dimensions dans un seul paramètre. Ces opérateurs comparent les éléments quelles que soient les dimensions. Ainsi, `{drama,romance}` chevauche `{{romance,thriller}}`.

<CastPanel example="conditions_arrays">

<<< ../examples/conditions_arrays.ts{ts twoslash}

</CastPanel>

Ou écrivez une valeur en fragment `sql`, où `db.self` est la colonne, et castez son paramètre : `` db.sql`${db.self} @> ${db.param(['drama'], 'text[]')}` `` donne `"col" @> CAST($1 AS "text"[])`<!-- probe: db.sql`${{ col: db.sql`${db.self} @> ${db.param(['drama'], 'text[]')}` }}` -->.

<CastPanel example="conditions_arrays_fragment">

<<< ../examples/conditions_arrays_fragment.ts{ts twoslash}

</CastPanel>

Avec [`castArrayParamsToJson`](/fr/runtime-config#Config.castArrayParamsToJson) activé, une condition envoie son tableau en `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${{ genres: db.conditions.arrayContains(['drama']) }}`) -->, y compris s’il s’agit d’un tableau de tableaux. Postgres refuse cette comparaison (`text[] @> json`, 42883). Le type de la condition refuse un `Parameter` qui contient un tableau (TS2769). Dans le fragment, le cast passé à `param()` l’emporte sur l’option ([#36](https://github.com/AlexandreDemartin/pgcast/issues/36)). La requête s’exécute avec ou sans l’option.

Comme dans Zapatos 6.6.1, le type accepte aussi `{}`, `{ value: … }` et `db.param()` d’un nom de colonne, qui passent pour un `ParentColumn`, dont tous les membres sont optionnels ([#570](https://github.com/AlexandreDemartin/pgcast/issues/570)). `{}` est envoyé en `'{}'`, le tableau vide : `arrayContains({})`<!-- tsc: db.select('films', { genres: db.conditions.… }) --> trouve chaque ligne dont le tableau n’est pas `NULL`, `arrayContainedIn({})` les tableaux vides, et `arrayOverlaps({})` aucune ligne. Postgres refuse `{ value: 'title' }` et `db.param('title')` (22P02, `malformed array literal`), et, avec [`castObjectParamsToJson`](/fr/runtime-config#Config.castObjectParamsToJson) activé, `{}` et `{ value: … }` aussi (42883).

Le tableau est un seul paramètre, donc chaque élément, à toute profondeur, est une valeur simple, comme dans [`eqAny()`](#conditions.eqAny) : `Default`, `self`, `all`, `raw()`, `cols()`, `vals()`, un `Parameter`, un fragment `sql` ou `parent()` lève une erreur à la compilation de la requête ([valeurs refusées](#refused-values)). Sur `genres`, TypeScript refuse chacun de ces éléments (TS2322). Zapatos 6.6.1 envoyait `Default` sous la forme `'{"Symbol(DEFAULT)"}'`, `self` sous la forme `'{"Symbol(self)"}'` et `db.all` sous la forme `'{"Symbol(all)"}'`. Il envoyait les autres éléments en JSON. Sur trois lignes dont `genres` vaut respectivement `NULL`, `{}` et `{drama}`, `arrayContainedIn([db.all])` ne retenait que la ligne avec `{}`. Avec `not(arrayContainedIn([db.all]))`, seule la ligne avec `{drama}` était retenue. Les deux autres opérateurs ne retenaient aucune ligne. Sur un `int4[]`, Postgres refusait ces éléments (22P02). Pour une comparaison SQL, utilisez le fragment `sql` montré plus haut.

### `arrayContains()` {#conditions.arrayContains}

`"col" @> $1`<!-- probe: db.sql`${{ col: db.conditions.arrayContains(['x']) }}` --> : la colonne contient chaque élément de la valeur.

### `arrayContainedIn()` {#conditions.arrayContainedIn}

`"col" <@ $1`<!-- probe: db.sql`${{ col: db.conditions.arrayContainedIn(['x']) }}` --> : chaque élément de la colonne est dans la valeur.

### `arrayOverlaps()` {#conditions.arrayOverlaps}

`"col" && $1`<!-- probe: db.sql`${{ col: db.conditions.arrayOverlaps(['x']) }}` --> : la colonne et la valeur ont au moins un élément en commun.

## jsonb {#jsonb}

À partir de la 6.9.0, deux conditions sur une colonne `jsonb` : son JSON contient une valeur, ou un chemin y trouve un élément.

Un test sur un champ du JSON est l’une d’elles, ou un fragment `sql` pour un motif :

| Pour tester qu’un champ | Écrire | SQL |
|---|---|---|
| est égal à une valeur | `jsonbContains({ format: '35mm' })` | `"details" @> CAST($1 AS "jsonb")`<!-- probe: db.sql`${{ details: db.conditions.jsonbContains({ format: '35mm' }) }}` --> |
| dépasse une valeur, ou commence par une valeur | `jsonbPathExists('$.reels ? (@ > $n)', { n: 10 })` | `jsonb_path_exists("details", CAST($1 AS "jsonpath"), CAST($2 AS "jsonb"))`<!-- probe: db.sql`${{ details: db.conditions.jsonbPathExists('$.reels ? (@ > $n)', { n: 10 }) }}` --> |
| correspond à un motif saisi par un utilisateur | `` db.sql`${db.self}->>${db.param('format')} ILIKE ${db.param(pattern)}` `` | `"details"->>$1 ILIKE $2`<!-- probe: db.sql`${{ details: db.sql`${db.self}->>${db.param('format')} ILIKE ${db.param('%mm')}` }}` --> |

- **L’égalité** compare des valeurs JSON : `{ reels: 10 }` ne correspond donc pas à la chaîne `"10"`, et un index GIN sur la colonne la sert, avec l’une ou l’autre classe d’opérateurs.
- **Une comparaison d’ordre** se place dans le chemin, qui compare des nombres JSON : 9 bobines, c’est moins que 10. `starts with $p` prend aussi une variable.
- **Un motif** issu de la saisie d’un utilisateur : la clé et le motif sont deux paramètres. Pas `like_regex` dans un chemin : son motif doit être un littéral du chemin, donc `$.format ? (@ like_regex $p)` échoue dans Postgres (42601), et la saisie devrait aller dans le texte du chemin.
- **`->>` renvoie du texte**, donc une comparaison sur son résultat compare du texte : `` db.sql`${db.self}->>'reels' > ${db.param(10)}` `` trouve une copie de 9 bobines, car `'9'` est classé après `'10'`. Comparez plutôt dans le chemin, comme ci-dessus.

### `jsonbContains()` {#conditions.jsonbContains}

```ts
db.conditions.jsonbContains(a: JSONValue): SQLFragment<boolean | null, JSONValue>
db.conditions.jsonbContains<T>(a: JSONValue): SQLFragment<boolean | null, T>
```

`"col" @> CAST($1 AS "jsonb")`<!-- probe: db.sql`${{ col: db.conditions.jsonbContains({ format: '35mm' }) }}` --> : le JSON de la colonne contient la valeur, au sens de l’[inclusion](https://www.postgresql.org/docs/current/datatype-json.html#JSON-CONTAINMENT) de Postgres. La valeur est envoyée sous forme de texte JSON, `JSON.stringify(a)` : vous n’avez pas à écrire `JSON.stringify` vous-même.

<CastPanel example="conditions_jsonbContains">

<<< ../examples/conditions_jsonbContains.ts{ts twoslash}

</CastPanel>

- **Les objets et les tableaux** sont comparés niveau par niveau, à partir du premier : `{ prizes: ['Golden Gull'] }` trouve les films dont `prizes` contient cette chaîne, parmi d’autres prix, et `{ format: '35mm' }` une clé `format` au premier niveau, jamais une clé imbriquée plus bas, comme dans `{ "cut": { "format": "35mm" } }`. `{}` est contenu dans tout objet, donc trouve tous les films.
- **Une chaîne, un nombre, `null`** : ce sont aussi des valeurs JSON, la chaîne envoyée comme `"35mm"`, `null` comme le `null` de JSON. Chacun correspond à cette valeur, ou à un tableau qui la contient à son premier niveau : `details` est un objet, donc `jsonbContains('35mm')` ne trouve aucun film. Un simple `` db.sql`${db.self} @> ${db.param(x, 'jsonb')}` `` envoie une chaîne comme du texte, et un tableau comme un tableau Postgres sauf si `castArrayParamsToJson` est activé : Postgres refuse les deux (22P02).
- **[`castObjectParamsToJson`](/fr/runtime-config#Config.castObjectParamsToJson)** et **[`castArrayParamsToJson`](/fr/runtime-config#Config.castArrayParamsToJson)** ne changent rien : `"details" @> CAST($1 AS "jsonb")`<!-- probe: (db.setConfig({ castObjectParamsToJson: true, castArrayParamsToJson: true }), db.sql`${{ details: db.conditions.jsonbContains({ format: '35mm' }) }}`) -->, la valeur étant déjà du texte JSON.
- **Ce que JSON n’a pas** lève une erreur à la compilation de la requête, à toute profondeur, et le message nomme sa clé : `undefined`, une fonction ou un symbole, que `JSON.stringify` omet dans un objet (`{ format: undefined }` vaudrait donc `{}`, tous les films) et remplace par `null` dans un tableau ; un `bigint`, sur lequel il lève une erreur ; une valeur circulaire. Le type les refuse, mais pas dans une valeur typée `{ format?: string }`, qui peut contenir `undefined` sauf si `exactOptionalPropertyTypes` est activé, ni dans une valeur typée `any`.
- **Type** : la valeur est une `JSONValue`, et le `T` de la condition aussi : une colonne `jsonb` l’accepte, une colonne `text` ou `integer` la refuse (TS2322). Une colonne `json` passe, les deux étant des `JSONValue`, et Postgres la refuse (42883, `operator does not exist: json @> jsonb`). Une valeur typée par une `interface` est refusée (TS2769), comme dans un `insert()` sur une colonne `jsonb` : donnez-lui un alias `type`. Le type refuse aussi une instance de classe sans signature d’index, un `readonly string[]` et le tuple en lecture seule inféré pour `const a = ['a'] as const` (TS2769). Passez une copie modifiable avec `jsonbContains([...a])`.
- **Un domaine `jsonb` dont vous avez affiné le placeholder** ([Un domaine `jsonb`](/fr/custom-types#a-jsonb-domain)) refuse la `JSONValue` de la condition (TS2322) : nommez le placeholder, `jsonbContains<PgProjection>({ format: '35mm' })`, et la condition prend son type. La valeur reste n’importe quelle valeur JSON, `{ format: 'VHS' }` aussi, sans être vérifiée contre le placeholder : une valeur contenue peut n’avoir qu’une partie des clés du placeholder. Une colonne `text` refuse aussi cette condition (TS2322).

Un `Parameter`, un fragment `sql` ou `parent()` lève une erreur à la compilation de la requête, à toute profondeur, comme `Default`, `self`, `raw()`, `cols()` et `vals()`, et le type refuse chacun d’eux : `JSON.stringify` enverrait ses champs, qui ne correspondent à aucune ligne, sans erreur.

> `` `jsonbContains()` sends its value as JSON text, so it takes a JSON value, not `db.param()`: give a value; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message -->

### `jsonbPathExists()` {#conditions.jsonbPathExists}

```ts
db.conditions.jsonbPathExists(path: string, vars?: JSONObject): SQLFragment<boolean | null, JSONValue>
db.conditions.jsonbPathExists<T>(path: string, vars?: JSONObject): SQLFragment<boolean | null, T>
```

`jsonb_path_exists("col", CAST($1 AS "jsonpath"), CAST($2 AS "jsonb"))`<!-- probe: db.sql`${{ col: db.conditions.jsonbPathExists('$.prizes[*] ? (@ == $prize)', { prize: 'Golden Gull' }) }}` --> : le [chemin SQL/JSON](https://www.postgresql.org/docs/current/functions-json.html#FUNCTIONS-SQLJSON-PATH) trouve au moins un élément dans le JSON de la colonne. Le chemin est un paramètre, ses variables un autre : chaque `$name` du chemin est une clé de `vars`, dont la valeur est envoyée sous forme de texte JSON, si bien qu’une valeur à laquelle vous comparez n’entre jamais dans le chemin.

<CastPanel example="conditions_jsonbPathExists">

<<< ../examples/conditions_jsonbPathExists.ts{ts twoslash}

</CastPanel>

- **Variables** : `{ prefix: 'Silver' }` donne à `$prefix` la chaîne JSON `"Silver"`, et un nombre reste un nombre, si bien que `'2000'` n’est égal à aucune année. Un nom qui n’est pas un simple identifiant se met entre guillemets dans le chemin : `$"print format"` lit `{ 'print format': 'digital' }`. Omis, `vars` vaut `{}`, avec le même SQL. Une variable nommée par le chemin mais absente de `vars` fait échouer la requête dans Postgres (42704, `could not find jsonpath variable "prize"`).
- **Pas dans le chemin** : une valeur écrite dans le texte du chemin est lue comme du chemin. `` `$.prizes[*] ? (@ == "${prize}")` ``, avec le prix `Golden" || @ != "`, trouve tous les films qui ont un prix.
- **`lax` et `strict`** : en mode `lax`, celui par défaut, un film sans `prizes` ne donne aucun élément pour `$.prizes[*]`. En mode `strict`, `strict $.prizes` fait échouer toute la requête sur un tel film (2203A, `JSON object does not contain key "prizes"`) ; dans un filtre, `strict $ ? (@.prizes.size() > 1)`, ce film est ignoré. pgcast ne passe pas d’argument `silent` : la valeur par défaut de Postgres s’applique, et ces erreurs sont levées.
- **Un chemin, pas un prédicat** : `$.format == "VHS"` est un prédicat, dont l’unique élément est son booléen, `false` compris : tous les films correspondent. Écrivez un filtre : `$.format ? (@ == $format)`.
- **Un chemin invalide** échoue dans Postgres (42601) : `$.prizes[*` donne `syntax error at end of jsonpath input`.
- Si une comparaison de valeurs de date ou d’heure nécessite le fuseau horaire de la session, `jsonbPathExists()` lève l’erreur 0A000. Pour un chemin sans variables, utilisez `` db.sql`jsonb_path_exists_tz(${db.self}, ${db.param(path, 'jsonpath')})` ``. Pour un chemin avec des variables, passez leurs valeurs en troisième argument avec `` db.sql`jsonb_path_exists_tz(${db.self}, ${db.param(path, 'jsonpath')}, ${db.param(JSON.stringify(vars), 'jsonb')})` ``.
- **Index** : aucun index GIN ne prend en charge `jsonb_path_exists()`. Les deux classes d’opérateurs de `jsonb` prennent en charge `@>`, [`jsonbContains()`](#conditions.jsonbContains), et `@?`, qui ne prend pas de variables : pour un chemin fixe sur une colonne dotée d’un index GIN, écrivez `` db.sql`${db.self} @? ${db.param(path, 'jsonpath')}` ``, `(("details" @? CAST($1 AS "jsonpath")))`<!-- probe: db.sql`${{ details: db.sql`${db.self} @? ${db.param('$.format', 'jsonpath')}` }}` -->. Un index sur l’expression de l’appel, son chemin et ses `vars` fixés, ne prend en charge que cet appel : après `CREATE INDEX ON films ((jsonb_path_exists(details, '$.format', '{}')))`, `{ details: jsonbPathExists('$.format') }` passe par un parcours d’index ; avec un autre chemin ou d’autres `vars`, Postgres parcourt toute la table.
- **[`castObjectParamsToJson`](/fr/runtime-config#Config.castObjectParamsToJson)** et **[`castArrayParamsToJson`](/fr/runtime-config#Config.castArrayParamsToJson)** ne changent rien : `jsonb_path_exists("details", CAST($1 AS "jsonpath"), CAST($2 AS "jsonb"))`<!-- probe: (db.setConfig({ castObjectParamsToJson: true, castArrayParamsToJson: true }), db.sql`${{ details: db.conditions.jsonbPathExists('$.format ? (@ == $format)', { format: '35mm' }) }}`) -->.
- **Ce que JSON n’a pas** dans `vars` lève une erreur à la compilation de la requête, à toute profondeur, et le message nomme sa clé, comme dans [`jsonbContains()`](#conditions.jsonbContains) : `{ prize: undefined }` omettrait `$prize`. Un chemin qui n’est pas une chaîne aussi. Le type refuse les deux, mais pas une valeur typée `{ prize?: string }`, qui peut contenir `undefined` sauf si `exactOptionalPropertyTypes` est activé, ni une valeur typée `any`.
- **Type** : `path` est une `string`, et `vars` un `JSONObject`, un objet de valeurs JSON : un tableau, une chaîne ou `null` y est refusé (TS2769), comme Postgres le refuserait (22023, `"vars" argument is not an object`), de même qu’une valeur typée par une `interface` : donnez-lui un alias `type`. Le `T` de la condition est `JSONValue`, comme pour `jsonbContains()` : une colonne `jsonb` l’accepte, une colonne `text` ou `integer` la refuse (TS2322). Une colonne `json` passe, et Postgres la refuse (42883, `function jsonb_path_exists(json, jsonpath, jsonb) does not exist`). Sur un domaine `jsonb` dont vous avez affiné le placeholder, nommez-le : `jsonbPathExists<PgProjection>('$.format')`.

> `` `jsonbPathExists()` takes its path as a string, not `db.param()`: write the path as a string, and each value it compares with as a variable, `jsonbPathExists(path, { name: value })`. ``<!-- message -->

## Combiner : `and()`, `or()`, `not()` {#combining}

Chacune prend des conditions ou des Whereables, un Whereable compilé avec ses propres clés. Comme valeur d’un Whereable, `self` atteint les conditions à l’intérieur : `{ release_year: or(lt(1980), gt(2010)) }` donne `((("release_year" < $1 OR "release_year" > $2)))`<!-- probe: db.sql`${{ release_year: db.conditions.or(db.conditions.lt(1980), db.conditions.gt(2010)) }}` -->. Comme `where` entier, elles prennent des Whereables :

<CastPanel example="conditions_or">

<<< ../examples/conditions_or.ts{ts twoslash}

</CastPanel>

Elles prennent le Whereable de toutes les tables : dans un schéma où une colonne porte le nom d’un membre de `String`, d’un type auquel ce membre correspond (`length`, un nombre), elles acceptent donc n’importe quelle chaîne comme Whereable, à dessein : elles ne nomment aucune table par laquelle la vérifier, et une vérification à cet endroit refusait un `and({ ...where, id })` dans une fonction générique sous TypeScript 4.1 ([#674](https://github.com/AlexandreDemartin/pgcast/issues/674)). Le `where` d’un raccourci la refuse.

### `and()` {#conditions.and}

```ts
db.conditions.and<T>(...conditions: (SQLFragment<any, T> | Whereable)[])
```

`((a) AND (b))`<!-- probe: db.conditions.and(db.sql`a`, db.sql`b`) --> : chaque opérande entre ses propres parenthèses, reliés par `AND`.

- Un fragment `sql` avec un `OR` nu à son niveau supérieur reste entier : `` and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) `` donne `(("id" = 1000 OR "id" = 1001) AND (("studio_id" = $1)))`<!-- probe: db.conditions.and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) --> : seul le film 1001.
- Sans argument, `TRUE`<!-- probe: db.conditions.and() --> : chaque ligne, comme un Whereable `{}`. Zapatos 6.6.1 écrivait `()`, que Postgres refuse comme condition (42601). Comme `groupBy`, `GROUP BY ()` s’exécutait, et `GROUP BY TRUE` est refusé (42601) : omettez `groupBy` ([Conditions](/fr/switching#conditions)).

::: warning Toutes les lignes
`update()` et `deletes()` à qui l’on donne `and(...filters)` ou `not(or(...ids))` avec une liste vide atteignent désormais toutes les lignes : `deletes('films', and())` envoie `WHERE TRUE`<!-- probe: db.deletes('films', db.conditions.and()) --> et les supprime toutes, `not(or())` donne `(NOT (FALSE))`<!-- probe: db.conditions.not(db.conditions.or()) -->. Zapatos 6.6.1 levait une erreur (42601) avant qu’une ligne ne change. Gardez la vérification de longueur là où une liste vide ne doit pas atteindre toutes les lignes.
:::

Zapatos 6.6.1 écrivait les opérandes nus, `(a OR b AND c)`, que Postgres lit `a OR (b AND c)` : l’exemple ci-dessus trouvait aussi le film 1000, quel que soit son studio, et `deletes()` ou `update()` à qui on le donnait supprimait ou modifiait cette ligne.

Seul un `and()` de deux opérandes ou plus, dont un avec un `OR` nu à son niveau supérieur, donne désormais d’autres lignes. Un `and()` dont le SQL d’un opérande déborde sur le suivant :

- échoue désormais (42601), `` and(db.sql`${'release_year'} BETWEEN 1970`, db.sql`2000`) `` ;
- ou, quand la coupure tombe dans un littéral entre guillemets, compare à une autre valeur, sans erreur : `` and(db.sql`${'title'} = 'x`, db.sql`y'`) `` compare `"title"` à `'x) AND (y'`, là où c’était `'x AND y'`.

Tout autre `and()` gagne des parenthèses et donne les mêmes lignes.

### `or()` {#conditions.or}

```ts
db.conditions.or<T>(...conditions: (SQLFragment<any, T> | Whereable)[])
```

`(a OR b)`<!-- probe: db.conditions.or(db.sql`a`, db.sql`b`) --> : ses opérandes reliés par `OR`, tels quels : `AND` lie plus fort que `OR`, donc aucun ne passe par-dessus. Sans argument, `FALSE`<!-- probe: db.conditions.or() --> : aucune ligne. Zapatos 6.6.1 écrivait `()` ici aussi, et comme `groupBy`, `GROUP BY FALSE` est refusé (42601).

### `not()` {#conditions.not}

```ts
db.conditions.not<T>(condition: SQLFragment<any, T> | Whereable)
```

`(NOT (…))`<!-- probe: db.conditions.not(db.sql`a`) --> : la condition entière, niée.

<CastPanel example="conditions_not">

<<< ../examples/conditions_not.ts{ts twoslash}

</CastPanel>

Sur `release_year`, `` not(db.sql`${db.self} = 1974 OR ${db.self} = 1991`) `` écrit `(NOT ("release_year" = 1974 OR "release_year" = 1991))`<!-- probe: db.conditions.not(db.sql`${db.self} = 1974 OR ${db.self} = 1991`).compile(undefined, undefined, 'release_year') -->.

Zapatos 6.6.1 écrivait `(NOT "release_year" = 1974 OR "release_year" = 1991)`, que Postgres lit `(NOT "release_year" = 1974) OR "release_year" = 1991` : le film de 1991 aussi. Seule une condition avec un `AND` ou un `OR` nu à son niveau supérieur trouve d’autres lignes ; toute autre gagne une paire de parenthèses.

## Sous-requêtes : `exists()`, `isInSelect()` {#subqueries}

À partir de la 6.9.0. Chacune écrit une sous-requête sur une table, filtrée par un Whereable ou un fragment `sql` de cette table, ou par [`all`](/fr/sql-template#all) pour n’avoir aucun `WHERE` ; `{}` donne `WHERE TRUE`, comme dans [`select()`](/fr/select#select). Le type vérifie les clés et les valeurs du Whereable par rapport à la table de la sous-requête.

<CastPanel example="conditions_exists">

<<< ../examples/conditions_exists.ts{ts twoslash}

</CastPanel>

- **La ligne extérieure** : dans le `where` de la sous-requête, [`parent('id')`](/fr/sql-template#parent) est une colonne de la ligne de la requête extérieure, `"films"."id"`<!-- probe: db.conditions.exists('roles', { film_id: db.parent('id') }, { parent: 'films' }) -->, dès que l’option `parent` nomme sa table comme la requête extérieure la nomme : son alias si elle en a un. Rien ne vérifie cette colonne : une mauvaise colonne donne l’erreur 42703 de Postgres, une mauvaise table son erreur 42P01, avant toute ligne.
- **Le même SQL où qu’elle soit** : dans une requête `sql`, dans `deletes()`, dans `extras` ou dans une sous-requête `lateral`. Sans `parent`, `parent()` dans la sous-requête lève "The 'parent' table alias has no meaning here", même à l’intérieur d’un `lateral`, et `self` n’y a pas de sens non plus.

| Option | SQL ajouté | Effet sur le type |
|---|---|---|
| `parent` | la table de `parent()` : `"films"."id"`<!-- probe: db.conditions.exists('roles', { film_id: db.parent('id') }, { parent: 'films' }) --> | aucun |
| `alias` | `AS "mentees"`<!-- probe: db.conditions.exists('crew', db.all, { alias: 'mentees' }) --> après la table | aucun |

Un `null` qui passe le type, en JavaScript ou dans du JSON : des options `null` reviennent à n’en passer aucune, comme dans les [raccourcis](/fr/select#errors), si bien que `exists('crew', db.all, null)` écrit `EXISTS (SELECT 1 FROM "crew")`<!-- probe: db.conditions.exists('crew', db.all, null) -->.

### `exists()` {#conditions.exists}

```ts
db.conditions.exists<T extends Table>(table: T, where: WhereableForTable<T> | SQLFragment<any> | AllType, options?: { parent?: string; alias?: string })
```

`EXISTS (SELECT 1 FROM "roles" WHERE ("film_id" = "films"."id"))`<!-- probe: db.conditions.exists('roles', { film_id: db.parent('id') }, { parent: 'films' }) --> : au moins une ligne de la table correspond. Elle n’est jamais `NULL` et ne contient pas de `self`, donc elle va partout : comme `where` entier, dans `and()`, `or()` et `not()`, ou sous n’importe quelle clé. L’anti-jointure s’écrit `not(exists(…))`.

Quand la sous-requête lit la table de la requête extérieure, donnez-lui un alias. Ici, les membres de l’équipe qui ne sont mentors de personne :

<CastPanel example="conditions_exists_alias">

<<< ../examples/conditions_exists_alias.ts{ts twoslash}

</CastPanel>

Sans l’alias, `"crew"."id"` serait la ligne même de la sous-requête : écrite à la main, `NOT EXISTS (SELECT 1 FROM crew WHERE mentor_id = crew.id)` renvoie toute l’équipe, puisque personne n’est son propre mentor, sans aucune erreur. C’est pourquoi, quand `parent` donne le nom même de la sous-requête, son alias ou à défaut sa table, à la façon dont Postgres lit un nom (ses 63 premiers octets), la condition lève une erreur à la compilation de la requête, et `run()` est rejetée avant toute requête :

> `` `exists()` was given `parent: 'crew'`, which names "crew", the subquery's own name, so Postgres would read `parent()` as a column of the subquery's row: give the subquery another name with the `alias` option. ``<!-- message -->

Les noms se comparent comme Postgres les lit : `'crew'`, `'"crew"'` et `'public.crew'` ne font qu’un seul nom. La vérification compare des noms, pas des tables : `parent: 'public.crew'` sur une table `crew` d’un autre schéma est donc refusé aussi, alors que Postgres distinguerait les deux. Un alias règle la question.

### `isInSelect()` {#conditions.isInSelect}

```ts
db.conditions.isInSelect<T extends Table, C extends keyof SelectableForTable<T>>(table: T, where: WhereableForTable<T> | SQLFragment<any> | AllType, column: C, options?: { parent?: string; alias?: string })
```

`"col" IN (SELECT "actor_id" FROM "roles")`<!-- probe: db.sql`${{ col: db.conditions.isInSelect('roles', db.all, 'actor_id') }}` -->, comme valeur d’un Whereable : la colonne de la clé est à gauche. Son `T` est le type de `column`, sans `null`, que le Whereable vérifie par rapport à la colonne de la clé. `parent` et `alias` fonctionnent comme dans [`exists()`](#conditions.exists). Les acteurs en tête d’affiche d’au moins un film :

<CastPanel example="conditions_isInSelect">

<<< ../examples/conditions_isInSelect.ts{ts twoslash}

</CastPanel>

Une colonne d’un autre type ne compile pas :

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
db.select('actors', { name: db.conditions.isInSelect('roles', db.all, 'actor_id') });
```

- Avec le réglage par défaut de la 7.0, une sous-requête qui sélectionne un tableau d’enums utilise le type `string` pour la comparaison. TypeScript refuse donc la comparaison avec la même colonne de type tableau d’enums et accepte celle avec une colonne de type texte, que Postgres refuse (42883).
- **Sous `not()`**, elle ne trouve aucune ligne dès que la sous-requête renvoie un `NULL`, vu la façon dont Postgres lit `NOT IN` : `{ id: not(isInSelect('crew', db.all, 'mentor_id')) }` ne trouve personne, car un `mentor_id` est `NULL`. Pour l’anti-jointure, écrivez `not(exists(…))` (voir plus haut).
- **Comme `where` entier**, hors d’une clé, elle n’a pas de colonne : le type l’y refuse, seule, sous `not()` ou dans `and()` (TS2345), et en code non typé, elle lève "The 'self' column alias has no meaning here".

## Recherche plein texte : `websearchToTsquery()` {#full-text}

À partir de la 6.9.0. Une recherche sur une colonne `tsvector` : les mots d’un texte, tels qu’une configuration de recherche plein texte les racinise. La colonne `films.title_search` du schéma de la doc est une colonne générée, `to_tsvector('english', title)`, que Postgres tient à jour, avec un index GIN ([la doc de Postgres](https://www.postgresql.org/docs/current/textsearch-tables.html)).

<CastPanel example="conditions_websearchToTsquery">

<<< ../examples/conditions_websearchToTsquery.ts{ts twoslash}

</CastPanel>

### `websearchToTsquery()` {#conditions.websearchToTsquery}

```ts
db.conditions.websearchToTsquery<T = TsvectorColumn>(config: string, query: string): SQLFragment<boolean | null, T>
```

`"col" @@ websearch_to_tsquery(CAST($1 AS "regconfig"), $2)`<!-- probe: db.sql`${{ col: db.conditions.websearchToTsquery('english', 'lanterns') }}` -->, la configuration et la requête en deux paramètres. Postgres lit la requête comme le fait un champ de recherche et ne lève jamais d’erreur de syntaxe : il prend donc telle quelle la saisie d’un utilisateur. Sur `title_search` :

| Requête | Postgres lit | Correspond à |
|---|---|---|
| `lanterns` | `'lantern'`, la racine | A Lantern for Edith |
| `salt orchard` | `'salt' & 'orchard'`, chaque mot | The Salt Orchard |
| `"orchard salt"` | `'orchard' <-> 'salt'`, la phrase dans cet ordre | aucun |
| `salt or lantern` | `'salt' \| 'lantern'` | The Salt Orchard, A Lantern for Edith |
| `-salt orchard` | `!'salt' & 'orchard'` | aucun |
| `salt & lantern`, `salt \| lantern` | `'salt' & 'lantern'` : `&` et `\|` ne sont pas des opérateurs | aucun |
| `lant:*` | `'lant'` : pas de préfixe | aucun |
| `the` | aucun mot, rien qu’un terme courant : Postgres envoie un avis | aucun |

- **La configuration** : nommez celle qui a construit le vecteur de la colonne, car la requête doit avoir les mêmes racines : `websearchToTsquery('simple', 'lanterns')` cherche `'lanterns'`, que `title_search` ne contient pas. Sans elle, Postgres prendrait `default_text_search_config`, un réglage du serveur ou de la session : la condition la nomme donc toujours. Postgres la cherche dans le `search_path` (`'pg_catalog.english'` marche aussi), et une configuration qu’il ne connaît pas donne l’erreur 42704, « <span lang="en">text search configuration "klingon" does not exist</span> » ; jusqu’à Postgres 15, un nom dont le schéma n’existe pas, `'nowhere.english'`, donne l’erreur 3F000, « <span lang="en">schema "nowhere" does not exist</span> ». Une configuration à vous, construite sur `unaccent` par exemple, est un nom comme un autre.
- **`NULL`** : un vecteur `NULL` donne `NULL`, donc la ligne ne correspond ni à la condition ni à son [`not()`](#conditions.not).
- **Type** : son `T` est [`TsvectorColumn`](#conditions.TsvectorColumn), que seule une colonne typée `any` accepte : une colonne `tsvector`, par son placeholder `PgTsvector` laissé tel que généré ([Types personnalisés](/fr/custom-types)). Une colonne `text` ne compile pas, ni une `varchar`, une `citext` ou un domaine sur l’un de ces types, tous typés `string` : Postgres lirait `text @@ tsquery`, et construirait le vecteur avec `default_text_search_config`, pas avec la configuration donnée. Toute autre colonne typée `any` passe : avec [`domainsTypedByContext: false`](/fr/generator#generate.domainsTypedByContext), Postgres exécute `text @@ tsquery` sans erreur sur une colonne de type domaine imbriqué sur `text`. Postgres refuse une colonne `xml` (42883). Une fois le placeholder modifié, donnez son type, `websearchToTsquery<PgTsvector>(…)`, ou pour une `string`, `db.conditions.websearchToTsquery<string>('english', 'lanterns')`<!-- tsc: db.select('films', { title_search: … }) -->.

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
db.select('films', { title: db.conditions.websearchToTsquery('english', 'lanterns') });
```

- **Les autres parseurs** : `to_tsquery()` lit `&`, `|`, `!` et les préfixes, `lant:*`, et lève une erreur de syntaxe sur un `&` isolé saisi par un utilisateur : il n’a donc pas de condition dédiée. Écrivez un fragment `sql`, la configuration castée en `regconfig`, `"title_search" @@ to_tsquery(CAST($1 AS "regconfig"), $2)`<!-- probe: db.sql`${{ title_search: db.sql`${db.self} @@ to_tsquery(${db.param('english', 'regconfig')}, ${db.param('lant:*')})` }}` --> :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.select('films', { title_search: db.sql`${db.self} @@ to_tsquery(${db.param('english', 'regconfig')}, ${db.param('lant:*')})` });
```

`Default`, `self`, `all`, `raw()`, `cols()`, `vals()`, un `Parameter`, un fragment `sql` ou `parent()` comme configuration ou comme requête ne compile pas (TS2345). En code non typé, la condition lève une erreur à la compilation de la requête, avec un message qui nomme la valeur :

> `` `websearchToTsquery()` sends its configuration and its query as parameters: give the query as a string, not `db.param()`; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message -->

Il en va de même pour toute autre valeur qui n’est pas une chaîne, que `pg` enverrait en texte ou en JSON : un tableau en `'{"salt","orchard"}'`, dont Postgres lit les mots, et `null` ou `undefined` en `NULL`, qui ne correspond à aucune ligne. Le message la nomme :

> `` `websearchToTsquery()` takes its query as a string, not `undefined`: give it as a string, `websearchToTsquery('english', 'salt orchard')`. ``<!-- message -->

### `TsvectorColumn` {#conditions.TsvectorColumn}

```ts
interface TsvectorColumn
```

Le `T` par défaut de [`websearchToTsquery()`](#conditions.websearchToTsquery) : un type que seule une colonne typée `any` accepte. Il n’existe que dans le type, sans valeur. Un projet compilé avec `declaration: true` l’écrit dans son `.d.ts` sous ce nom, mais pas un spread d’une valeur de ce type, dont les membres nomment un symbole que `zapatos/db` n’exporte pas : TS4023.

## Dates et heures {#dates}

[`after()`](#conditions.after) et [`before()`](#conditions.before) comparent à une valeur : un `Date`, une chaîne ISO 8601 avec son décalage (`'2030-03-01T20:00:00Z'`, un `TimestampTzString` ; le type refuse une autre forme comme `'2030-03-02'`, TS2322), ou l’un des deux fragments ci-dessous. `pg` envoie un `Date` comme une chaîne dans le fuseau horaire local, avec son décalage : sur une colonne `timestamptz`, le même instant. Sur une colonne `date`, Postgres garde le jour local et laisse tomber l’heure : `eq(new Date(2030, 2, 1, 23, 30))` correspond à `2030-03-01`, et `lt()` du même `Date`, non.

<CastPanel example="conditions_dates">

<<< ../examples/conditions_dates.ts{ts twoslash}

</CastPanel>

### `after()` {#conditions.after}

`gt()` sous un autre nom : `"col" > $1`<!-- probe: db.sql`${{ col: db.conditions.after(1) }}` -->.

### `before()` {#conditions.before}

`lt()` sous un autre nom : `"col" < $1`<!-- probe: db.sql`${{ col: db.conditions.before(1) }}` -->.

### `now` {#conditions.now}

`now()`<!-- probe: db.conditions.now --> : une constante, le début de la transaction en cours. Une valeur, pas une condition : `{ starts_at: after(now) }` donne `(("starts_at" > now()))`<!-- probe: db.sql`${{ starts_at: db.conditions.after(db.conditions.now) }}` -->, et dans `update()` elle fixe la colonne. Seule comme valeur d’un Whereable dans un `where`, `{ starts_at: now }`, Postgres la refuse (42804), bien que le type la laisse passer : dans une liste `SELECT`, le même Whereable s’exécute ([`conditions`](#conditions)).

### `fromNow()` {#conditions.fromNow}

```ts
db.conditions.fromNow(n: number, unit: IntervalUnit = 'millisecond')
```

`now() + $1`<!-- probe: db.conditions.fromNow(-7, 'days') -->, la valeur `` `${n} ${unit}` ``, que Postgres lit comme un `interval` : `fromNow(-7, 'days')` envoie `'-7 days'`, `fromNow(1.5, 'hours')` `'1.5 hours'`. Une valeur, comme [`now`](#conditions.now).

`unit` est l’un de `microsecond`, `millisecond`, `second`, `minute`, `hour`, `day`, `week`, `month`, `year`, `decade`, chacun avec ou sans `s`, puis `century`, `centuries`, `millennium`, `millennia`. Un `n` dont Postgres ne lit pas la chaîne (`NaN`, `1e21`, écrit `1e+21`) échoue avec 22007.

Les séances des sept prochains jours, à partir de `now()`, ici l’heure de la requête :

<CastPanel example="conditions_now">

<<< ../examples/conditions_now.ts{ts twoslash}

</CastPanel>

## L’arithmétique : `add()`, `subtract()` {#arithmetic}

```ts
db.conditions.add<T extends number | Date>(a: T)
db.conditions.subtract<T extends number | Date>(a: T)
```

Des opérations, pas des tests : pour une valeur d’[`update()`](/fr/insert#update), où `self` est la colonne qu’elle fixe.

<CastPanel example="conditions_add">

<<< ../examples/conditions_add.ts{ts twoslash}

</CastPanel>

- Dans un `where`, le type les laisse passer, et Postgres les refuse (42804 : « <span lang="en">argument of WHERE must be type boolean</span> ») ; dans une liste `SELECT`, le même Whereable s’exécute ([`conditions`](#conditions)).
- Dans le `updateValues` d’`upsert()`, il n’y a pas de colonne courante : elles lèvent "The 'self' column alias has no meaning here"<!-- message --> ([`upsert()`](/fr/insert#upsert)). Dans `insert()`, le type les refuse (TS2769), comme Postgres : la colonne est écrite dans `VALUES` (42703).
- Elles prennent un nombre ou un `Date`, pas un `Parameter` (TS2345) : pour un cast, écrivez une valeur en fragment `sql` (ci-dessous).
- Sur une colonne `date`, le type refuse un nombre (TS2322), et Postgres ne pourrait pas l’exécuter non plus : `date + unknown` est ambigu (42725).
- Sur une colonne `date`, `timestamp` ou `timestamptz`, un `Date` passe la vérification de types. `add()` d’un `Date` échoue où qu’il soit. Sur `date`, il est ambigu (42725), dans un `where` aussi. Sur les deux autres, un `where` le refuse avant de lire le `Date` (42804) ; comme valeur d’`update()`, imbriqué dans un fragment `sql` ou dans une liste `SELECT`, Postgres le lit comme un `interval` (22007). `subtract()` d’un `Date` donne un nombre de jours sur `date`, un `interval` sur les deux autres, pas le type de la colonne : Postgres le refuse comme valeur d’`update()` (42804), et l’exécute imbriqué dans un fragment `sql` ou dans une liste `SELECT`.

Pour les dates, écrivez une valeur en fragment `sql`, où `db.self` est la colonne, et castez son paramètre. Sur une colonne `date`, `` db.sql`${db.self} + ${db.param(3, 'int4')}` `` ajoute trois jours : `"col" + CAST($1 AS "int4")`<!-- probe: db.sql`${{ col: db.sql`${db.self} + ${db.param(3, 'int4')}` }}` -->. Sur une colonne `timestamptz`, ajoutez un `interval` : une séance déplacée au lendemain.

<CastPanel example="conditions_add_interval">

<<< ../examples/conditions_add_interval.ts{ts twoslash}

</CastPanel>

Le type ne vérifie pas un fragment : un `int4` sur une colonne `timestamptz` passe la vérification de types, et Postgres le refuse (42883).

### `add()` {#conditions.add}

`"col" + $1`<!-- probe: db.sql`${{ col: db.conditions.add(1) }}` -->.

### `subtract()` {#conditions.subtract}

`"col" - $1`<!-- probe: db.sql`${{ col: db.conditions.subtract(1) }}` -->.

## Les valeurs qu’une condition refuse {#refused-values}

`Default`, `self`, `all`, `raw()`, `cols()` et `vals()` n’ont pas de sens comme valeur d’une condition. Le type les refuse (TS2322, ou TS2345 là où la condition borne son argument : un motif, la seconde borne d’un intervalle, `add()`, `subtract()`, `websearchToTsquery()` ; TS2769 comme opérande d’une condition de tableau, comme liste d’`eqAny()`, comme valeur de `jsonbContains()` et comme chemin ou variables de `jsonbPathExists()`).

À l’exécution, c’est la compilation de la condition qui lève l’erreur, pas son appel : `run()` est donc rejetée avec une simple `Error` avant toute requête.

Zapatos 6.6.1 envoyait `Default`, `self` et `all` comme les chaînes `'Symbol(DEFAULT)'`, `'Symbol(self)'` et `'Symbol(all)'`, et `raw()`, `cols()` et `vals()` en JSON, `'{"value":…}'` : aucune ligne sur une colonne de texte, chaque ligne avec `ne()` ou `isNotIn()`, 22P02 ou 22007 sur les autres. Pourquoi une valeur `raw()` n’est pas du SQL : [Sécurité](/fr/security).

| Message | Quand |
|---|---|
| `` `db.Default` has no meaning as the value of `eq()`, `add()` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give `db.Default` as the value itself: `{ n: db.Default }`. ``<!-- message --> | `Default` comme valeur d’une comparaison, d’un intervalle, d’un motif, d’une condition de tableau, d’`add()` ou de `subtract()` |
| `` `db.self` has no meaning as the value of `eq()`, `add()` and the other conditions: it is already the column on the left. To compare the column with itself, write a `sql` fragment with `db.self` on both sides. ``<!-- message --> | `self` au même endroit |
| `` `db.all` has no meaning as the value of `eq()`, `add()` and the other conditions: compare with a value. To match every row, give `db.all` as the whole filter of `select()` and its kin: `select(table, db.all)`. ``<!-- message --> | `all` au même endroit, et comme élément du tableau d’une condition de tableau, à toute profondeur : `arrayContains([db.all])`, `[[db.all]]` |
| `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as the value of `eq()`, `add()` and the other conditions: for SQL, write a `sql` fragment with `db.self` in place of the condition; for a value, give the value itself, or `db.param()`. ``<!-- message --> | `raw()`, `cols()` ou `vals()` au même endroit |
| `` `db.Default` has no meaning as an item of `vals([…])` in a column's value, in a filter (as `isIn()` writes it) or in a `sql` fragment value of `vals({…})`, so of `insert()`, `upsert()` or `update()`: in a filter, leave the key out, or compare with a value; in a write, give `db.Default` as the value itself, `{ column: db.Default }`. ``<!-- message --> | `Default` dans `isIn()` ou `isNotIn()` |
| `` `db.self` has no meaning as an item of `vals([…])` in a column's value, in a filter (as `isIn()` writes it) or in a `sql` fragment value of `vals({…})`, so of `insert()`, `upsert()` or `update()`: give a value; in a filter or in `update()`, write `db.self` in a `sql` fragment value, outside `vals([…])`, where it stands for the column. ``<!-- message --> | `self` dans `isIn()` ou `isNotIn()` |
| `` `db.all` has no meaning as an item of `vals([…])` in a column's value, in a filter (as `isIn()` writes it) or in a `sql` fragment value of `vals({…})`, so of `insert()`, `upsert()` or `update()`: in a filter, leave the key out, or compare with a value; in a write, give a value. To match every row, give `db.all` as the whole filter of `select()` and its kin: `select(table, db.all)`. ``<!-- message --> | `all` dans `isIn()` ou `isNotIn()` |
| `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as an item of `vals([…])` in a column's value, in a filter (as `isIn()` writes it) or in a `sql` fragment value of `vals({…})`, so of `insert()`, `upsert()` or `update()`: for SQL, write it in a `sql` fragment value, outside `vals([…])` (in a filter or in `update()`, `db.self` there stands for the column); for a value, give the value itself, or `db.param()`. ``<!-- message --> | `raw()`, `cols()` ou `vals()` dans `isIn()` ou `isNotIn()` |
| `` `jsonbContains()` sends its value as JSON text, so it takes a JSON value, not `db.Default`: give a value; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message --> | `Default` comme valeur de [`jsonbContains()`](#conditions.jsonbContains) ; `self`, `all`, `raw()`, `cols()`, `vals()`, un `Parameter`, un fragment `sql` ou `parent()` au même endroit reçoit le même message, qui le nomme |
| `` `jsonbPathExists()` sends its variables as JSON text, so it takes an object of JSON values, not `db.Default`: give an object; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message --> | `Default` comme variables de [`jsonbPathExists()`](#conditions.jsonbPathExists) ; `self`, `all`, `raw()`, `cols()`, `vals()`, un `Parameter`, un fragment `sql` ou `parent()` au même endroit reçoit le même message, qui le nomme |
| `` `jsonbPathExists()` takes its path as a string, not `db.Default`: write the path as a string, and each value it compares with as a variable, `jsonbPathExists(path, { name: value })`. ``<!-- message --> | `Default` comme chemin de [`jsonbPathExists()`](#conditions.jsonbPathExists) ; `self`, `all`, `raw()`, `cols()`, `vals()`, un `Parameter`, un fragment `sql`, `parent()` ou toute valeur qui n’est pas une chaîne au même endroit reçoit le même message, qui le nomme |
| `` `eqAny()` takes an array of values, not `db.Default`: write `eqAny(values)`; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message --> | `Default` comme liste d’[`eqAny()`](#conditions.eqAny) ; `self`, `all`, `raw()`, `cols()`, `vals()`, un `Parameter` ou un fragment `sql` au même endroit reçoit le même message, qui le nomme |
| `` `eqAny()` sends its array as one parameter, so each item is a plain value, not `db.Default`: give a value. ``<!-- message --> | `Default` comme élément d’`eqAny()` ; `self`, `all`, `raw()`, `cols()` ou `vals()` au même endroit reçoit le même message, qui le nomme |
| `` `arrayContains()` sends its array as one parameter, so each item is a plain value, not `db.Default`: give a value. ``<!-- message --> | `Default` comme élément du tableau d’[`arrayContains()`](#conditions.arrayContains), à toute profondeur ; `self`, `raw()`, `cols()` ou `vals()` au même endroit reçoit le même message, qui le nomme, et chacun dans `arrayContainedIn()` ou `arrayOverlaps()` aussi, qui nomme la condition |
| `` `arrayContains()` sends its array as one parameter, so each item is a plain value, not `db.param()`: give the value itself; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message --> | un `Parameter` au même endroit ; un fragment `sql` ou `parent()` reçoit le même message, qui le nomme |
| `` `websearchToTsquery()` sends its configuration and its query as parameters: give the configuration as a string, not `db.Default`; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message --> | `Default` comme configuration de [`websearchToTsquery()`](#conditions.websearchToTsquery) ; comme requête, le message dit `query` ; `self`, `all`, `raw()`, `cols()`, `vals()`, un `Parameter`, un fragment `sql` ou `parent()` reçoit le même message, qui le nomme |
| `` `websearchToTsquery()` takes its configuration as a string, not `null`: give it as a string, `websearchToTsquery('english', 'salt orchard')`. ``<!-- message --> | `null` comme configuration de [`websearchToTsquery()`](#conditions.websearchToTsquery) ; comme requête, le message dit `query` ; `undefined`, un tableau, un objet ou toute autre valeur qui n’est pas une chaîne reçoit le même message, qui le nomme |
| `The 'self' column alias has no meaning here`<!-- message --> | une condition où `self` n’a pas de colonne : dans un template `sql` hors d’un Whereable, dans le `updateValues` d’`upsert()`, dans le `where` d’`exists()` ou d’`isInSelect()`, et `isInSelect()` hors d’une clé |
| `The 'parent' table alias has no meaning here`<!-- message --> | `parent()` dans une condition hors d’une sous-requête `lateral`, ou dans le `where` d’`exists()` ou d’`isInSelect()` sans `parent` |

Une comparaison avec du SQL est une valeur en fragment `sql`, `` { title: db.sql`${db.self} = ${db.raw("'x'")}` } `` : [SQL brut](/fr/raw-sql).
