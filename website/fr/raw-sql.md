---
english: db76e97da576
description: "Quand aucun raccourci n’écrit la requête dont vous avez besoin, écrivez-la dans le template sql, et gardez hors de son texte toute valeur venue de l’extérieur."
---

# SQL brut

Quand aucun raccourci n’écrit la requête dont vous avez besoin (une jointure, une fonction de fenêtrage, un `INSERT … SELECT`), écrivez-la dans le template `sql`, et gardez hors de son texte toute valeur venue de l’extérieur. Vous connaissez déjà les raccourcis grâce au [tutoriel](/fr/tutorial) ; chaque interpolation est dans [Template SQL](/fr/sql-template).
{.lede}

<AtAGlance>

- Les noms vont entre `${…}`, vérifiés d’après les tables que vous donnez à `sql` ; une valeur venue de l’extérieur entre comme `db.param()` ou dans un Whereable.
- La syntaxe que choisit un appelant, comme un sens de tri, est l’une de vos propres constantes : ne donnez jamais à `raw()` le texte d’un appelant.
- `.compile()` montre le `text` et les `values` qu’enverrait une requête : un test qui fige `text` garde dans `values` chaque valeur venue de l’extérieur.

</AtAGlance>

## Écrire la requête, ses noms interpolés {#write-the-query-its-names-interpolated}

Écrivez le SQL comme dans `psql`, mais mettez chaque nom de table et de colonne entre `${…}` plutôt que dans le texte. Donnez à `sql` les tables que la requête peut nommer, puis le type des lignes que vous attendez :

<CastPanel example="raw_sql_join">

<<< ../examples/raw_sql_join.ts{ts twoslash}

</CastPanel>

- Un nom interpolé est mis entre guillemets, `"films"`<!-- probe: examples/raw_sql_join.ts -->, et vérifié d’après le premier argument de type : ici `Tables`, le type `SQL` de chaque table que nomme la requête. Qualifiez une colonne en écrivant `${'films'}.${'title'}` : le type connaît les colonnes de chaque table, pas `'films.title'`, à moins de nommer la paire ([Qualifier une colonne par son alias](#qualify-a-column-by-its-alias)).
- Le second argument de type est ce que vous affirmez de ce qui revient : rien ne le confronte au SQL. Les lignes arrivent telles que `pg` les parse, comme un `Selectable` les décrit (un `Date` pour un `timestamptz`), et non comme le JSON du `JSONSelectable` des raccourcis. Un `count(*)` est un `bigint`, que `pg` donne sous forme de chaîne : `'4'`.
- Les mots-clés restent dans le texte. Le SQL que vous écrivez vous-même n’y risque rien ; seul ce qui vient de l’extérieur demande les étapes ci-dessous.

Un nom que le type ne connaît pas ne compile pas : une requête qui nomme `screenings` demande `s.screenings.SQL` dans son premier argument de type.

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
db.sql<s.films.SQL>`SELECT * FROM ${'screenings'}`;
```

Une requête d’écriture s’écrit de la même façon. Cet `INSERT … SELECT` copie les tags d’un film vers un autre, et `RETURNING *` renvoie les lignes qu’il a ajoutées :

<CastPanel example="raw_sql_insert_select">

<<< ../examples/raw_sql_insert_select.ts{ts twoslash}

</CastPanel>

- [`db.cols()`](/fr/sql-template#cols) écrit la liste des colonnes, `"film_id", "tag"`<!-- probe: examples/raw_sql_insert_select.ts -->. `columns`, typé `s.tags.Column[]`, vérifie les noms : `db.cols()` seul en accepte n’importe lequel, donc `'tagz'` compilerait, et Postgres le refuserait (42703).
- `ON CONFLICT DO NOTHING` saute un tag que le film a déjà. Sans lui, Postgres refuse tout l’`INSERT` avec 23505, et n’ajoute rien.

## Passer chaque valeur comme paramètre {#pass-each-value-as-a-parameter}

Une valeur venue d’un appelant (un formulaire, une URL, une ligne lue ailleurs) entre comme [`db.param()`](/fr/sql-template#param), ou dans un [objet Whereable](/fr/sql-template#whereable), qui fait un paramètre de chaque valeur :

<CastPanel example="raw_sql_values">

<<< ../examples/raw_sql_values.ts{ts twoslash}

</CastPanel>

- <code v-pre>${{ studio_id: studioId }}</code> donne `("studio_id" = $1)`<!-- probe: examples/raw_sql_values.ts --> : un filtre de `films`, tel que le prend le `where` de [`select()`](/fr/select#select), donc les [conditions](/fr/conditions) y fonctionnent aussi : [`gte()`](/fr/conditions#conditions.gte) dans `{ release_year: db.conditions.gte(1990) }`.
- `${db.param(genre)}` donne `$2`, dans `$2 = ANY("genres")`<!-- probe: examples/raw_sql_values.ts --> : un paramètre va partout où le SQL accepte une valeur.
- Un tableau est un seul paramètre : `` ${'id'} = ANY(${db.param(ids)}) `` envoie `ids` comme un tableau Postgres par défaut ; avec `castArrayParamsToJson` activé, non ([plus bas](#cast-a-parameter-postgres-can-t-type)).
- Une partie de la requête dont seuls certains appels ont besoin est un fragment imbriqué, ou `[]` pour rien ([Fragments imbriqués](/fr/sql-template#nested-fragments)).

Une chaîne seule entre `${…}` est un nom, pas une valeur, donc le type la refuse :

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
function filmTitled(title: string) {
  return db.sql<s.films.SQL>`SELECT * FROM ${'films'} WHERE ${'title'} = ${title}`;
}
```

Si elle passait la vérification de types (un `any`, un `@ts-ignore`), elle resterait un nom, et c’est l’appelant qui le choisirait :

- Une vraie colonne correspond à chaque ligne : `'title'` compile en `"title" = "title"`<!-- probe: db.sql`${'title'} = ${'title'}` -->, vrai partout où `title` n’est pas nul, et de même pour `'films.title'` et `'"title"'`. Dans un `DELETE`, cela les supprime toutes.
- Une colonne inconnue échoue : `'The Salt Orchard'` donne `"title" = "The Salt Orchard"`<!-- probe: db.sql`${'title'} = ${'The Salt Orchard'}` -->, une colonne qui n’existe pas (42703).
- Ce peut être n’importe quelle colonne à portée, y compris une colonne système comme `xmin`, et, là où va une table, n’importe quelle relation que le rôle peut lire, `'schema.table'` compris : `` FROM ${'pg_catalog.pg_roles'} `` liste les rôles de la base.
- Chaque `"` qu’elle contient est doublé, donc elle ne peut pas fermer ses guillemets (dans Zapatos 6.6.1, elle le pouvait, [Identifiants](/fr/sql-template#identifiers)), mais cela n’en fait pas une valeur.

Les clés d’un objet interpolé sont aussi des noms. Le type ne refuse une clé inconnue que dans un objet littéral (TS2353) : un objet construit à l’exécution (un `Record<string, string>`, `Object.fromEntries()`, une variable avec des clés en trop) la laisse passer, quelle qu’elle soit.

::: warning Sécurité
Un objet interpolé qui n’est ni un `param()`, ni un fragment, ni une autre des valeurs de pgcast compile comme un Whereable, une instance de classe comprise.

Un objet natif du realm qui exécute pgcast lève une erreur à la compilation, avant toute requête ; un objet d’un autre realm, comme un contexte `vm`, non. `` db.sql`DELETE FROM ${'ratings'} WHERE ${when}` ``, avec `when` un `Date` typé `any`, ne compile plus en `DELETE FROM "ratings" WHERE TRUE`, comme dans Zapatos 6.6.1, ce qui supprimait toutes les notes ([Objets Whereable](/fr/sql-template#whereable)). Passez une date comme `db.param(when)`.

Tout objet sans clé donne `TRUE`, Whereable typé compris : `const where: s.ratings.Whereable = {}`, qui ne reçoit un `film_id` que `if (filmId)`, compile sans erreur en ce même `DELETE`. Vérifiez qu’un filtre n’est pas vide avant un `DELETE` ou un `UPDATE` ([Objets Whereable](/fr/sql-template#whereable)). La vérification ci-dessous attrape `{}`, pas une clé dont la valeur compile en `true`, comme `film_id: db.conditions.isNotIn([])` :

```ts twoslash
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
function removeRatings(filmId?: number) {
  const where: s.ratings.Whereable = {};
  if (filmId) where.film_id = filmId;
  if (Object.keys(where).length === 0) throw new Error('No filter: that would delete every rating');
  return db.deletes('ratings', where);
}
```

:::

## Caster un paramètre que Postgres ne sait pas typer {#cast-a-parameter-postgres-can-t-type}

Postgres donne un type à un paramètre d’après sa place. Comparé à une colonne, il prend le type de la colonne ; ailleurs, Postgres peut en déduire un autre. Donnez-lui le type en second argument de `param()` :

<CastPanel example="raw_sql_cast">

<<< ../examples/raw_sql_cast.ts{ts twoslash}

</CastPanel>

- `$1`, comparé à `starts_at` dans `"starts_at" >= $1`<!-- probe: examples/raw_sql_cast.ts -->, est déjà un `timestamptz`.
- `$2`, dans `CAST($2 AS "timestamptz") + make_interval(hours => $3)`<!-- probe: examples/raw_sql_cast.ts -->, est ajouté à un `interval` : sans son cast, Postgres le lit donc comme un `interval`, et échoue : `operator does not exist: timestamp with time zone < interval` (42883).
- `db.param(from, 'timestamptz')` écrit `CAST($2 AS "timestamptz")`<!-- probe: examples/raw_sql_cast.ts --> ; `` ${db.param(from)}::timestamptz `` dans le texte fait de même.
- Le cast est le nom du type dans le catalogue, en minuscules (`int4`, `timestamptz`, `crew_job`), chaque partie entre guillemets. `'integer'` donne `CAST($1 AS "integer")`<!-- probe: db.sql`${db.param(1, 'integer')}` -->, un type qui n’existe pas (42704), tout comme `'int'` et `'TIMESTAMPTZ'`.
- Nommez un schéma ainsi : `'public.crew_job'`, qui donne `"public"."crew_job"`<!-- probe: db.sql`${db.param(1, 'public.crew_job')}` -->, comme `'public"."crew_job'`. Un type tableau garde ses crochets hors des guillemets : `'int4[]'` donne `"int4"[]`<!-- probe: db.sql`${db.param(1, 'int4[]')}` -->.
- Avec [`castArrayParamsToJson`](/fr/runtime-config#Config.castArrayParamsToJson) activé, un paramètre tableau est envoyé en JSON, `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1])}`) -->, sauf si son cast se termine par `[]` ou `[n]` : `db.param(ids, 'int4[]')` donne `CAST($1 AS "int4"[])`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1], 'int4[]')}`) --> avec le tableau ([#36](https://github.com/AlexandreDemartin/pgcast/issues/36)). Tout autre cast en chaîne garde le JSON, casté vers ce type, `'_int4'` compris.
- Avec [`castObjectParamsToJson`](/fr/runtime-config#Config.castObjectParamsToJson) activé, un objet simple est envoyé en JSON quel que soit son cast, casté vers le type écrit.

Toutes les formes du cast : [`param()`](/fr/sql-template#param).

## Appeler une fonction Postgres {#call-a-postgres-function}

Un appel est du SQL comme un autre : le nom de la fonction dans le texte, chaque colonne entre `${…}`, chaque valeur en `db.param()`. pgcast ne lit aucune fonction dans le catalogue : c’est à vous d’écrire le type du résultat :

<CastPanel example="raw_sql_function">

<<< ../examples/raw_sql_function.ts{ts twoslash}

</CastPanel>

- `${'title'}` est une colonne de la table du raccourci, `film_label("title", "release_year")`<!-- probe: examples/raw_sql_function.ts -->, vérifiée d’après `s.films.SQL`. Une valeur venue de l’extérieur est un [`db.param()`](/fr/sql-template#param) ; la notation nommée fonctionne aussi, `film_label(year => ${db.param(year)}, title => ${db.param(title)})`.
- Typez le résultat `| null` : aucune fonction ne promet une valeur. Celle-ci donne `NULL` pour un argument `NULL`, et une fonction `STRICT` le donne toujours.
- Le nom reste dans le texte : un nom en casse mixte y garde donc ses guillemets, `"filmCount"(…)`. Sans eux, Postgres cherche `filmcount`, et n’en trouve aucune (42883).

Ce qui revient dépend de l’endroit où l’appel s’exécute. Dans un raccourci (`extras`, un `lateral`), sa valeur passe par JSON, comme celle d’une colonne dans un `JSONSelectable` ([pourquoi](/fr/catalog-types#why-the-shortcuts-return-json)) ; exécuté seul, `pg` la parse, comme la décrit un `Selectable` :

| Postgres donne | Dans un raccourci | Exécuté seul, ``sql`SELECT …` `` |
|---|---|---|
| un `int8` | un nombre | une chaîne |
| un `timestamptz` | une chaîne, `'2030-03-01T19:30:00+00:00'` en UTC | un `Date` |
| deux paramètres `OUT` | un objet, `{ first_at, last_at }` | le texte de l’enregistrement, `'("2030-03-01 19:30:00+00",…)'` en UTC ; `SELECT * FROM` l’appel donne ses colonnes |

### Choisir une surcharge {#pick-an-overload}

`films_of()` renvoie les films d’un studio, `SETOF films` : elle va donc dans le `FROM`, ses lignes en `Selectable[]`. Elle prend l’id du studio ou son nom :

<CastPanel example="raw_sql_function_overload">

<<< ../examples/raw_sql_function_overload.ts{ts twoslash}

</CastPanel>

- `pg` envoie chaque valeur sans type, et Postgres lit un paramètre sans type comme `unknown`. Parmi les fonctions de l’arité de l’appel, il en choisit une qui prend une chaîne : sans cast, `films_of($1)`<!-- probe: db.sql`films_of(${db.param(1000)})` --> avec `1000` cherche un studio nommé `'1000'`, et ne trouve aucun film.
- `db.param(studioId, 'int4')` écrit `CAST($1 AS "int4")`<!-- probe: examples/raw_sql_function_overload.ts -->, et Postgres appelle celle qui prend un `integer`. Le cast prend le nom du catalogue : `'int'` donne `"int"`, un type qui n’existe pas (42704). Nommer l’argument la choisit aussi : `films_of(studio_id => ${db.param(studioId)})`.
- Une colonne a déjà un type : `films_of("studios"."id")`<!-- probe: examples/raw_sql_function_lateral.ts --> choisit celle qui prend un `integer`, sans cast ([plus bas](#return-rows-into-a-shortcut)).

La règle que suit Postgres pour un paramètre sans type, selon les fonctions de ce nom et de cette arité :

| Les candidates | Postgres |
|---|---|
| l’une prend une chaîne (`text`) | l’appelle |
| aucune, mais l’une prend le type préféré de sa catégorie : `float8` à côté de `int` | l’appelle |
| toute autre paire : `int` et `bigint`, `int` et `numeric`, `boolean` et `int` | refuse l’appel, 42725 `function … is not unique` : castez le paramètre |
| `g(x int)` et `g(x int, y int DEFAULT 0)`, que sa valeur par défaut laisse appeler avec un seul argument | refuse `g($1)`, avec ou sans cast (42725) ; `g($1, $2)` appelle la seconde |
| une fonction polymorphe, `first_genre(a anyarray)` | refuse l’appel, 42804 `could not determine polymorphic type` : castez-le, `db.param(genres, 'text[]')` |

### Passer un tableau à `VARIADIC` {#pass-an-array-to-variadic}

`total_runtime()` prend un nombre quelconque d’ids de films, `VARIADIC film_ids INTEGER[]`. Passez le tableau avec le mot-clé :

<CastPanel example="raw_sql_function_variadic">

<<< ../examples/raw_sql_function_variadic.ts{ts twoslash}

</CastPanel>

- Le tableau est un seul paramètre, `VARIADIC $1`<!-- probe: examples/raw_sql_function_variadic.ts -->, si bien que la requête est la même quelle que soit sa longueur, `[]` compris (une somme sans ligne : `null`).
- Sans le mot-clé, Postgres lit le tableau comme le premier entier, et le refuse (22P02). Des valeurs une à une, `total_runtime($1, $2)`, se passent du mot-clé.

### Renvoyer des lignes dans un raccourci {#return-rows-into-a-shortcut}

Une fonction qui renvoie des lignes va dans un `lateral`, ses lignes réunies en une seule valeur :

<CastPanel example="raw_sql_function_lateral">

<<< ../examples/raw_sql_function_lateral.ts{ts twoslash}

</CastPanel>

- `jsonb_agg(to_jsonb(f) ORDER BY …)` fait des lignes un seul tableau JSON, typé `s.films.JSONSelectable[] | null` : `null` pour un studio sans film.
- Jamais dans `extras` : là, l’appel donne à la requête extérieure une ligne par ligne qu’il renvoie. Un studio qui a deux films revient deux fois, et un studio sans film disparaît.

pgcast n’a pas de `fn()` et ne génère la signature d’aucune fonction : le code réel appelle peu de fonctions, la plupart sans argument, et un helper ne saurait ni écrire `VARIADIC` ni choisir une surcharge parmi celles d’une même arité ([décision 009](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/009-functions.md)).

## Choisir le SQL à l’exécution parmi vos propres constantes {#choose-sql-at-run-time-from-your-own-constants}

Certains choix relèvent de la syntaxe, pas des valeurs : un sens de tri, la colonne sur laquelle trier. Un paramètre ne peut pas en tenir lieu, alors faites correspondre le choix de l’appelant à l’un des vôtres :

<CastPanel example="raw_sql_order">

<<< ../examples/raw_sql_order.ts{ts twoslash}

</CastPanel>

- [`db.raw()`](/fr/sql-template#raw) écrit sa chaîne telle quelle. Ici, il ne reçoit jamais que `'DESC'` ou `'ASC'`, quoi que l’appelant ait envoyé.
- La colonne est un nom : entre guillemets, elle ne peut pas fermer ses guillemets, mais la chaîne de l’appelant pourrait nommer n’importe quelle colonne à portée, y compris une colonne système comme `xmin`, ou aucune (42703, ou 42P01 pour une table hors de la requête). `find()` ne retient que l’une des vôtres, typée comme le template l’attend.

::: warning Sécurité
Tout ce qui atteint `raw()` s’exécute comme du SQL, et son type accepte n’importe quelle chaîne. Donnez-lui le texte d’un appelant, et c’est l’appelant qui écrit votre requête :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const title = "x' OR TRUE --";  // from the caller
db.sql`SELECT ${'title'} FROM ${'films'} WHERE ${'title'} = ${db.raw(`'${title}'`)}`;
```

<!-- probe: db.sql`SELECT ${'title'} FROM ${'films'} WHERE ${'title'} = ${db.raw("'x' OR TRUE -" + "-'")}` -->
```sql
SELECT "title" FROM "films" WHERE "title" = 'x' OR TRUE --'
```

Cela renvoie tous les films. Une valeur est un `param()`, toujours : `${db.param(title)}` donne `"title" = $1`<!-- probe: db.sql`SELECT ${'title'} FROM ${'films'} WHERE ${'title'} = ${db.param('x')}` -->, et aucun film.
:::

## Comparer une colonne à du SQL, avec `self` {#compare-a-column-with-sql-through-self}

Un fragment en valeur d’un Whereable compare sa colonne à du SQL de votre cru, [`db.self`](/fr/sql-template#self) tenant lieu de la colonne :

<CastPanel example="raw_sql_self">

<<< ../examples/raw_sql_self.ts{ts twoslash}

</CastPanel>

- `lower(${db.self})` donne `lower("title")`<!-- probe: examples/raw_sql_self.ts -->, et le texte de l’appelant reste un paramètre, `lower($1)`<!-- probe: examples/raw_sql_self.ts -->.
- C’est une égalité, contrairement à [`ilike()`](/fr/conditions#conditions.ilike) : un `_` ou un `%` dans le texte de l’appelant ne correspond qu’à lui-même.
- Le même objet fonctionne comme `where` de [`select()`](/fr/select#select) et des autres raccourcis.
- Là où il n’a aucune colonne à représenter, `self` lève l’erreur "The 'self' column alias has no meaning here"<!-- message -->, donc la promesse de [`run()`](/fr/sql-template#run) est rejetée avant toute requête.

## Atteindre la ligne extérieure, avec `parent()` {#reach-the-outer-row-through-parent}

Une sous-requête écrite à la main peut aller dans le `lateral` d’un raccourci, où [`db.parent()`](/fr/sql-template#parent) nomme une colonne de la table de la requête extérieure :

<CastPanel example="raw_sql_parent">

<<< ../examples/raw_sql_parent.ts{ts twoslash}

</CastPanel>

- `${db.parent('id')}` donne `"studios"."id"`<!-- probe: examples/raw_sql_parent.ts -->, le studio de chaque ligne.
- La sous-requête donne une seule colonne, nommée `result` : c’est ce que lit `lateral`. Son argument de type, `string | null`, est le type de la clé : `string_agg()` sur aucune ligne vaut `NULL`.
- Avec `strict` désactivé, la clé n’est pas dans le type ([`lateral`](/fr/select#lateral)).
- Hors d’un `lateral`, `parent()` lève l’erreur "The 'parent' table alias has no meaning here"<!-- message -->, donc la promesse de [`run()`](/fr/sql-template#run) est rejetée avant toute requête.

Les jointures par `lateral`, pas à pas : [Jointures](/fr/lateral).

## Qualifier une colonne par son alias {#qualify-a-column-by-its-alias}

Une table jointe à elle-même a besoin d’un alias pour l’un de ses côtés, sinon Postgres la refuse (42712). Nommez l’alias dans le premier argument de type de `sql`, en paire avec les colonnes de la table, et chaque `${'alias.column'}` est vérifié :

<CastPanel example="raw_sql_alias">

<<< ../examples/raw_sql_alias.ts{ts twoslash}

</CastPanel>

- Une chaîne interpolée est découpée sur les `.`, chaque partie mise entre guillemets : `${'mentors.name'}` donne `"mentors"."name"`<!-- probe: examples/raw_sql_alias.ts -->. Le nom même de la table forme une paire de la même façon, `` `crew.${s.crew.Column}` ``.
- L’alias reste nu dans le texte, `"crew" AS mentors`<!-- probe: examples/raw_sql_alias.ts --> : `${'mentors'}` n’est ni une table ni une colonne de l’argument de type.
- Wilhelmina Strand n’a pas de mentor, donc le `JOIN` l’écarte : trois lignes.

Une colonne que `crew` n’a pas, ou un alias que l’argument de type ne nomme pas, ne compile pas :

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
type CrewAndMentors = s.crew.SQL | `crew.${s.crew.Column}` | `mentors.${s.crew.Column}`;
// ---cut---
db.sql<CrewAndMentors>`SELECT ${'mentors.title'} FROM ${'crew'} AS mentors`;
db.sql<CrewAndMentors>`SELECT ${'mentor.name'} FROM ${'crew'} AS mentors`;
```

Le type vérifie la paire, pas la requête ; Postgres vérifie le reste à l’exécution :

- Écrivez l’alias en minuscules : sans guillemets, `AS Mentors` est `mentors` pour Postgres, donc `${'Mentors.name'}`, mis entre guillemets, donne 42P01.
- Une fois qu’une table a un alias, son propre nom ne qualifie plus ses colonnes : 42P01.
- Rien ne vérifie le `FROM` : un alias qu’il ne définit pas donne 42P01.
- Une colonne dont le nom contient un `.` entre dans la paire, mais `${'mentors.a.b'}` donne `"mentors"."a"."b"`<!-- probe: db.sql`${'mentors.a.b'}` --> (42P01) : seule la chaîne entre guillemets s’exécute, `${'"mentors"."a.b"'}`, nommée telle quelle dans l’argument de type.
- La paire n’est vérifiée que tant que le `SQL` de la table refuse une chaîne nue. Dans un schéma généré par Zapatos 6.6.1 ou par pgcast jusqu’à la 6.10.0, une colonne nommée comme un membre de `String`, d’un type auquel ce membre correspond (`search` typée `any`, `length` un nombre), laisse passer n’importe quelle chaîne, comme pour une colonne nue. À partir de la 6.11.0, le `SQL` de la table la refuse une fois le schéma régénéré : régénérez-le ([#670](https://github.com/AlexandreDemartin/pgcast/issues/670)). À partir de la 6.11.0 aussi, les raccourcis refusent une telle chaîne comme `where` ou comme ligne, quel que soit le schéma ; `db.SQL`, `and()`, `or()`, `not()` et un Whereable donné comme argument de type de `sql` l’acceptent toujours, à dessein ([#674](https://github.com/AlexandreDemartin/pgcast/issues/674)).

L’[`alias`](/fr/select#alias) d’un raccourci n’a besoin de rien de tout cela : ses colonnes et les clés de son Whereable se rapportent à l’alias, et `db.parent()` atteint la requête extérieure. Un fragment `where` ou `extras` qui nomme l’alias prend le même argument de type : `"member"."mentor_id" IS NULL`<!-- probe: db.select('crew', db.sql`${'member.mentor_id'} IS NULL`, { alias: 'member' }) -->.

Il n’y a pas de helper d’alias : l’argument de type vérifie déjà la paire, sans nouvel export ([décision 010](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/010-aliases-and-with.md#3-qualified-column-names)).

## Placer une CTE avant un raccourci {#put-a-cte-before-a-shortcut}

À partir de la 6.11.0, [`db.withCTEs()`](/fr/sql-template#withCTEs) place des CTE avant un raccourci, ou n’importe quel fragment, et garde son résultat : ici un nombre, comme le donne `count()`.

<CastPanel example="raw_sql_ctes">

<<< ../examples/raw_sql_ctes.ts{ts twoslash}

</CastPanel>

- Chaque clé nomme une CTE, écrite comme un seul nom entre guillemets : `"recent"`<!-- probe: examples/raw_sql_ctes.ts -->. Nommez-la en minuscules, comme le littéral la lit : une clé `Recent` donne `"Recent"`<!-- probe: db.withCTEs({ Recent: db.sql`SELECT 1` }, db.sql`SELECT 2`) -->, que `FROM Recent` ne trouve pas (42P01).
- Les CTE viennent dans l’ordre de l’objet, si bien que chacune peut lire celles qui la précèdent. Une CTE qui en lit une suivante est refusée (42P01) ; une clé entière vient en premier, comme `Object.keys` la donne.
- `withCTEs({}, query)` donne une copie de `query`, son propre SQL. Une liste de CTE construite à l’exécution n’a besoin d’aucune branche pour le cas vide, là où un `WITH` que `sql` écrit sur une liste vide est refusé (42601).
- Écrivez le nom d’une CTE et ses colonnes dans le littéral, `SELECT id FROM recent`, comme les noms propres à la requête : aucun type ne les connaît, et `db.raw()` d’une constante n’en vérifierait pas davantage.
- Nommez une CTE autrement que vos tables. `WITH "films" AS (…)` avant `select('films', …)` lit les lignes de la CTE, typées comme celles de la table. Une colonne absente de la CTE est absente des lignes, bien que le type la prévoie, et n’est refusée (42703) que là où la requête la nomme : dans `columns`, un Whereable ou `order`.

Un raccourci d’écriture peut aussi être une CTE. Il s’exécute, et la requête principale voit chaque table telle qu’elle était avant l’instruction :

<CastPanel example="raw_sql_ctes_insert">

<<< ../examples/raw_sql_ctes_insert.ts{ts twoslash}

</CastPanel>

- `tagsBefore` vaut `0` sur le schéma de la doc : le tag n’est là qu’une fois l’instruction exécutée. Pour lire les lignes insérées, lisez la CTE, ``db.sql`SELECT result FROM added` ``, chaque ligne en JSON dans `result`, comme le raccourci la renvoie.
- Postgres n’exécute une CTE qui modifie des données qu’au premier niveau. Imbriquée, dans un `lateral` par exemple, elle est refusée (0A000).
- Un `insert()` ou un `upsert()` sans ligne, comme requête principale ou comme CTE, s’écrit `SELECT NULL::jsonb AS result WHERE false`<!-- probe: db.withCTEs({ a: db.sql`SELECT 1` }, db.insert('films', [])) -->, qu’aucune table ne refuse : les CTE s’exécutent, et la requête principale se résout en `[]`.

Imbriqué, `withCTEs()` va là où irait sa requête : entre parenthèses comme valeur d’`extras` ou d’`insert()`, comme sous-requête dans un `lateral`.

Si la requête principale est un `selectExactlyOne()`, elle garde ses vérifications. Au premier niveau, avec [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), elle demande toujours une deuxième ligne (par défaut `LIMIT $1`<!-- probe: (db.setConfig({ selectExactlyOneChecksForSecondRow: true }), db.withCTEs({ r: db.sql`SELECT 1` }, db.selectExactlyOne('films', db.all))) --> avec `2`). Si elle en trouve une, sa promesse est rejetée. Imbriquée, elle demande une ligne et, avec `withTies: true`, les éventuelles lignes ex æquo, comme une [`copy()`](/fr/sql-template#copy). Si elle ne trouve aucune ligne, sa promesse est rejetée avec une `NotExactlyOneError` dont la propriété `.query` contient le raccourci sans le `WITH`.

`withCTEs()` n’écrit ni `RECURSIVE` ni `MATERIALIZED` : écrivez un tel `WITH` en `sql`, avec sa requête principale. Mettez toutes les CTE dans un seul appel : une requête qui commence déjà par un `WITH`, un résultat de `withCTEs()` par exemple, est refusée (42601).

Le résultat n’est jamais une requête préparée, quelle que soit la requête d’origine, `{}` compris, pour qu’un même nom ne désigne jamais deux textes : appelez [`prepared()`](/fr/sql-template#prepared) sur le résultat. Une liste construite à l’exécution donne un texte par liste : donnez à chacun son propre nom.

## Vérifier le SQL avant de l’exécuter {#check-the-sql-before-you-run-it}

[`.compile()`](/fr/sql-template#compile) donne le `text` et les `values` qu’enverrait `run()`, et n’envoie rien. Chaque valeur venue de l’extérieur a sa place dans `values`, avec un `$n` à sa place dans `text`. Un test qui compile chaque requête avec une entrée hostile, l’attend dans `values` et fige `text` y veille, ici pour `listings()` plus haut :

<<< ../examples/plain/raw_sql_test.ts{ts twoslash}

- Ici avec `test` de `node:test` et `assert` de `node:assert/strict` ; n’importe quel test runner convient.
- `text` garde les retours à la ligne du template : le test réduit ses espaces, pour que seul un changement du SQL le fasse échouer.
- Chercher dans `text` ne suffit pas : un nom compilé depuis `x" --` y figure sous la forme `"x"" --"`<!-- probe: db.sql`${'x" -' + '-'}` -->, son `"` doublé, et une `'` isolée correspond aux littéraux de la requête elle-même.

## Voir aussi {#see-also}

- [Template SQL](/fr/sql-template) : chaque interpolation, et le SQL qu’elle donne.
- [Sécurité](/fr/security) : pourquoi les valeurs sont des paramètres, et ce que pgcast met entre guillemets.
- [Jointures](/fr/lateral) : les sous-requêtes avec `parent()`, imbriquées.
