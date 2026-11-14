---
english: cf4d8a957694
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
  - [`and()`](#conditions.and), [`or()`](#conditions.or) et [`not()`](#conditions.not) prennent aussi des Whereables, et peuvent donc former tout un `where` ; [`now`](#conditions.now) et [`fromNow()`](#conditions.fromNow) ne contiennent pas de `self`, et vont partout.
- **Valeurs** : chaque valeur est un paramètre, `$1`, sauf un [`Parameter`](/fr/sql-template#Parameter), gardé tel quel avec son cast ; un fragment `sql`, écrit comme son SQL ; et [`parent()`](/fr/sql-template#parent), la colonne de la requête parente dans une sous-requête `lateral`. `Default`, `self`, `raw()`, `cols()` et `vals()` lèvent une erreur : [Les valeurs qu’une condition refuse](#refused-values).
- **Type** : une condition est un `SQLFragment` dont le second argument de type, `T`, est le type de la valeur à laquelle elle compare (sa `Constraint`, [`sql`](/fr/sql-template#sql)) ; le Whereable vérifie `T` contre le type de la colonne. Les huit tests, `now` et `fromNow()` n’ont pas de `T`, et passent sur n’importe quelle colonne.

Une valeur d’un autre type ne compile pas :

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
db.select('films', { release_year: db.conditions.eq('1991') });
```

Avec `strictNullChecks` (ou `strict`) activé, le type refuse aussi `null` comme valeur, dans `eq()`, `isIn()` et les autres ; désactivé, `eq(null)` compile en `"col" = $1`<!-- probe: db.sql`${{ col: db.conditions.eq(null) }}` -->, qui ne trouve aucune ligne. Le test de `NULL` est [`isNull`](#conditions.isNull).

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

`isNull` et `isNotNull` fonctionnent sur n’importe quelle colonne. Les six autres sont pour un `boolean` : sur un autre type, Postgres les refuse (42804), bien que le type les laisse passer.

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

`"col" IS NOT DISTINCT FROM $1`<!-- probe: db.sql`${{ col: db.conditions.isNotDistinctFrom(1) }}` --> : comme `eq()`, où `NULL` est une valeur comme une autre. Avec `strictNullChecks` activé, le type refuse aussi `null` ici : c’est [`isNull`](#conditions.isNull) qui le teste.

## Les plages {#ranges}

Chacune prend deux valeurs du type de la colonne, `<T>(a: T, b: T)`, chacune un paramètre entre ses propres parenthèses. Les deux bornes sont comprises dans la plage : `between()` les trouve, `notBetween()` non.

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

Chacune prend un motif, `<T extends string>(a: T)`, donc seulement sur une colonne dont le type est une chaîne : sur `release_year`, le type les refuse (TS2322).

| Famille | Syntaxe | Trouve |
|---|---|---|
| `like()`, `ilike()` | `%` n’importe quel texte, `_` un caractère | la valeur entière |
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

Chacune prend un tableau de valeurs du type de la colonne, `<T>(a: readonly T[])`, compilé comme le compilerait [`vals()`](/fr/sql-template#vals) : un paramètre par élément.

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
| `Default`, `self`, `raw()`, `cols()`, `vals()` | lève une erreur ([Les valeurs qu’une condition refuse](#refused-values)) |

Zapatos 6.6.1 y envoyait un `Parameter` et `parent()` comme un paramètre de plus, en JSON (`'{"value":"x","cast":"text"}'`, `'{"value":"id"}'`), si bien que `isIn()` ne trouvait rien et que `isNotIn()` trouvait chaque ligne sur une colonne de texte.

### `isIn()` {#conditions.isIn}

`"col" IN ($1, $2)`<!-- probe: db.sql`${{ col: db.conditions.isIn([1, 2]) }}` -->. Un tableau vide donne `false` : aucune ligne.

### `isNotIn()` {#conditions.isNotIn}

`"col" NOT IN ($1, $2)`<!-- probe: db.sql`${{ col: db.conditions.isNotIn([1, 2]) }}` -->. Un tableau vide donne `true` : chaque ligne. Avec un `NULL` dans la liste, elle ne trouve aucune ligne, vu la façon dont Postgres lit `NOT IN` ; avec `strictNullChecks` activé, le type y refuse `null`.

<CastPanel example="conditions_isNotIn">

<<< ../examples/conditions_isNotIn.ts{ts twoslash}

</CastPanel>

## Les tableaux {#arrays}

Chacune prend un tableau, envoyé comme un seul paramètre, ou [`parent()`](/fr/sql-template#parent) : `<T>(a: T[] | ParentColumn)`. Elles comparent les éléments, quelles que soient les dimensions : `{drama,romance}` chevauche `{{romance,thriller}}`.

`T` est l’élément, comme dans Zapatos 6.6.1, là où le Whereable attend le type tableau de la colonne : sur `genres`, un `text[]`, le type refuse `arrayOverlaps(['romance'])`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
// @ts-expect-error genres takes a string[], and arrayOverlaps(['romance']) gives a string (TS2322)
db.select('films', { genres: db.conditions.arrayOverlaps(['romance']) });
```

Cela reste ainsi : chaque type que j’ai essayé sur la colonne cassait du code qui compile sous 6.6.1, soit un mock écrit selon sa signature, soit le résultat typé de `.map(db.conditions.arrayContains)` ([#40](https://github.com/AlexandreDemartin/pgcast/issues/40)). Deux façons compilent. Avec le type de la colonne comme `T`, la valeur est un tableau de tableaux :

<CastPanel example="conditions_arrays">

<<< ../examples/conditions_arrays.ts{ts twoslash}

</CastPanel>

Ou écrivez une valeur en fragment `sql`, où `db.self` est la colonne, et castez son paramètre : `` db.sql`${db.self} @> ${db.param(['drama'], 'text[]')}` `` donne `"col" @> CAST($1 AS "text"[])`<!-- probe: db.sql`${{ col: db.sql`${db.self} @> ${db.param(['drama'], 'text[]')}` }}` -->.

<CastPanel example="conditions_arrays_fragment">

<<< ../examples/conditions_arrays_fragment.ts{ts twoslash}

</CastPanel>

Avec [`castArrayParamsToJson`](/fr/runtime-config#Config.castArrayParamsToJson) activé, une condition envoie son tableau en `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${{ genres: db.conditions.arrayContains(['drama']) }}`) -->, un tableau de tableaux aussi, que Postgres refuse (42883 : `text[] @> json`). Le type de la condition refuse un `Parameter` (TS2345), mais dans le fragment, le cast donné à `param()` l’emporte sur l’option ([#36](https://github.com/AlexandreDemartin/pgcast/issues/36)) : il s’exécute dans les deux cas.

### `arrayContains()` {#conditions.arrayContains}

`"col" @> $1`<!-- probe: db.sql`${{ col: db.conditions.arrayContains(['x']) }}` --> : la colonne contient chaque élément de la valeur.

### `arrayContainedIn()` {#conditions.arrayContainedIn}

`"col" <@ $1`<!-- probe: db.sql`${{ col: db.conditions.arrayContainedIn(['x']) }}` --> : chaque élément de la colonne est dans la valeur.

### `arrayOverlaps()` {#conditions.arrayOverlaps}

`"col" && $1`<!-- probe: db.sql`${{ col: db.conditions.arrayOverlaps(['x']) }}` --> : la colonne et la valeur ont au moins un élément en commun.

## Combiner : `and()`, `or()`, `not()` {#combining}

Chacune prend des conditions ou des Whereables, un Whereable compilé avec ses propres clés. Comme valeur d’un Whereable, `self` atteint les conditions à l’intérieur : `{ release_year: or(lt(1980), gt(2010)) }` donne `((("release_year" < $1 OR "release_year" > $2)))`<!-- probe: db.sql`${{ release_year: db.conditions.or(db.conditions.lt(1980), db.conditions.gt(2010)) }}` -->. Comme `where` entier, elles prennent des Whereables :

<CastPanel example="conditions_or">

<<< ../examples/conditions_or.ts{ts twoslash}

</CastPanel>

### `and()` {#conditions.and}

```ts
db.conditions.and<T>(...conditions: (SQLFragment<any, T> | Whereable)[])
```

`((a) AND (b))`<!-- probe: db.conditions.and(db.sql`a`, db.sql`b`) --> : chaque opérande entre ses propres parenthèses, reliés par `AND`.

- Un fragment `sql` avec un `OR` nu à son niveau supérieur reste entier : `` and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) `` donne `(("id" = 1000 OR "id" = 1001) AND (("studio_id" = $1)))`<!-- probe: db.conditions.and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) --> : seul le film 1001.
- Sans argument, `TRUE`<!-- probe: db.conditions.and() --> : chaque ligne, comme un Whereable `{}`. Zapatos 6.6.1 écrivait `()`, que Postgres refuse (42601).

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

`(a OR b)`<!-- probe: db.conditions.or(db.sql`a`, db.sql`b`) --> : ses opérandes reliés par `OR`, tels quels : `AND` lie plus fort que `OR`, donc aucun ne passe par-dessus. Sans argument, `FALSE`<!-- probe: db.conditions.or() --> : aucune ligne. Zapatos 6.6.1 écrivait `()` ici aussi.

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

## Dates et heures {#dates}

[`after()`](#conditions.after) et [`before()`](#conditions.before) comparent à une valeur : une `Date`, une chaîne ISO 8601 avec son décalage (`'2030-03-01T20:00:00Z'`, un `TimestampTzString` ; le type refuse une autre forme comme `'2030-03-02'`, TS2322), ou l’un des deux fragments ci-dessous. `pg` envoie une `Date` comme une chaîne dans le fuseau horaire local, avec son décalage : sur une colonne `timestamptz`, le même instant.

<CastPanel example="conditions_dates">

<<< ../examples/conditions_dates.ts{ts twoslash}

</CastPanel>

### `after()` {#conditions.after}

`gt()` sous un autre nom : `"col" > $1`<!-- probe: db.sql`${{ col: db.conditions.after(1) }}` -->.

### `before()` {#conditions.before}

`lt()` sous un autre nom : `"col" < $1`<!-- probe: db.sql`${{ col: db.conditions.before(1) }}` -->.

### `now` {#conditions.now}

`now()`<!-- probe: db.conditions.now --> : une constante, le début de la transaction en cours. Une valeur, pas une condition : `{ starts_at: after(now) }` donne `(("starts_at" > now()))`<!-- probe: db.sql`${{ starts_at: db.conditions.after(db.conditions.now) }}` -->, et dans `update()` elle fixe la colonne. Seule comme valeur d’un Whereable, `{ starts_at: now }`, Postgres la refuse (42804), bien que le type la laisse passer.

### `fromNow()` {#conditions.fromNow}

```ts
db.conditions.fromNow(n: number, unit: IntervalUnit = 'millisecond')
```

`now() + $1`<!-- probe: db.conditions.fromNow(-7, 'days') -->, la valeur `` `${n} ${unit}` ``, que Postgres lit comme un intervalle : `fromNow(-7, 'days')` envoie `'-7 days'`, `fromNow(1.5, 'hours')` `'1.5 hours'`. Une valeur, comme [`now`](#conditions.now).

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

- Dans un `where`, le type les laisse passer, et Postgres les refuse (42804 : « <span lang="en">argument of WHERE must be type boolean</span> »).
- Dans le `updateValues` d’`upsert()`, il n’y a pas de colonne courante : elles lèvent "The 'self' column alias has no meaning here"<!-- message --> ([`upsert()`](/fr/insert#upsert)). Dans `insert()`, la colonne est écrite, et Postgres la refuse (42703).
- Elles prennent un nombre ou une `Date`, pas un `Parameter` (TS2345) : pour un cast, écrivez une valeur en fragment `sql` (ci-dessous).
- Sur une colonne `date`, le type refuse un nombre (TS2322), et Postgres ne pourrait pas l’exécuter non plus : `date + unknown` est ambigu (42725).
- Sur une colonne `date`, `timestamp` ou `timestamptz`, une `Date` passe la vérification de types, et Postgres la refuse ([#180](https://github.com/AlexandreDemartin/pgcast/issues/180)). Sur `date`, `add()` est ambigu (42725) et `subtract()` donne un entier, pas une date (42804) ; sur les deux autres, `add()` la lit comme un intervalle (22007), `subtract()` donne un intervalle, pas un instant (42804).

Pour les dates, écrivez une valeur en fragment `sql`, où `db.self` est la colonne, et castez son paramètre. Sur une colonne `date`, `` db.sql`${db.self} + ${db.param(3, 'int4')}` `` ajoute trois jours : `"col" + CAST($1 AS "int4")`<!-- probe: db.sql`${{ col: db.sql`${db.self} + ${db.param(3, 'int4')}` }}` -->. Sur une colonne `timestamptz`, ajoutez un intervalle : une séance déplacée au lendemain.

<CastPanel example="conditions_add_interval">

<<< ../examples/conditions_add_interval.ts{ts twoslash}

</CastPanel>

Le type ne vérifie pas un fragment : un `int4` sur une colonne `timestamptz` passe la vérification de types, et Postgres le refuse (42883).

### `add()` {#conditions.add}

`"col" + $1`<!-- probe: db.sql`${{ col: db.conditions.add(1) }}` -->.

### `subtract()` {#conditions.subtract}

`"col" - $1`<!-- probe: db.sql`${{ col: db.conditions.subtract(1) }}` -->.

## Les valeurs qu’une condition refuse {#refused-values}

`Default`, `self`, `raw()`, `cols()` et `vals()` n’ont pas de sens comme valeur d’une condition. Le type les refuse (TS2322, ou TS2345 là où la condition borne son argument : un motif, la seconde borne d’une plage, une condition de tableau, `add()`, `subtract()`).

À l’exécution, c’est la compilation de la condition qui lève l’erreur, pas son appel : `run()` est donc rejetée avec une simple `Error` avant toute requête.

Zapatos 6.6.1 envoyait `Default` et `self` comme les chaînes `'Symbol(DEFAULT)'` et `'Symbol(self)'`, et `raw()`, `cols()` et `vals()` en JSON, `'{"value":…}'` : aucune ligne sur une colonne de texte, chaque ligne avec `ne()` ou `isNotIn()`, 22P02 ou 22007 sur les autres. Pourquoi une valeur `raw()` n’est pas du SQL : [Sécurité](/fr/security).

| Message | Quand |
|---|---|
| `` `db.Default` has no meaning as the value of `eq()`, `add()` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give `db.Default` as the value itself: `{ n: db.Default }`. ``<!-- message --> | `Default` comme valeur d’une comparaison, d’une plage, d’un motif, d’une condition de tableau, d’`add()` ou de `subtract()` |
| `` `db.self` has no meaning as the value of `eq()`, `add()` and the other conditions: it is already the column on the left. To compare the column with itself, write a `sql` fragment with `db.self` on both sides. ``<!-- message --> | `self` au même endroit |
| `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as the value of `eq()`, `add()` and the other conditions: for SQL, write a `sql` fragment with `db.self` in place of the condition; for a value, give the value itself, or `db.param()`. ``<!-- message --> | `raw()`, `cols()` ou `vals()` au même endroit |
| `` `db.Default` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. `DEFAULT` is for INSERT and UPDATE values. ``<!-- message --> | `Default` dans `isIn()` ou `isNotIn()` |
| `` `db.self` has no meaning as a value in a Whereable (a filter), nor in `isIn()`: compare with a value, or use it in a `sql` fragment value, where it stands for the column. ``<!-- message --> | `self` dans `isIn()` ou `isNotIn()` |
| `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in a Whereable (a filter), nor in `isIn()`: to compare with SQL, use a `sql` fragment value, where `db.self` stands for the column; to compare with a value, give the value itself, or `db.param()`. ``<!-- message --> | `raw()`, `cols()` ou `vals()` dans `isIn()` ou `isNotIn()` |
| `The 'self' column alias has no meaning here`<!-- message --> | une condition où `self` n’a pas de colonne : dans un template `sql` hors d’un Whereable, dans le `updateValues` d’`upsert()` |
| `The 'parent' table alias has no meaning here`<!-- message --> | `parent()` dans une condition hors d’une sous-requête `lateral` |

Une comparaison avec du SQL est une valeur en fragment `sql`, `` { title: db.sql`${db.self} = ${db.raw("'x'")}` } `` : [SQL brut](/fr/raw-sql).
