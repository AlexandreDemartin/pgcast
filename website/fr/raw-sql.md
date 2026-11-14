---
english: d456b7097851
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

- Un nom interpolé est mis entre guillemets, `"films"`<!-- probe: examples/raw_sql_join.ts -->, et vérifié d’après le premier argument de type : ici `Tables`, le type `SQL` de chaque table que nomme la requête. Qualifiez une colonne en écrivant `${'films'}.${'title'}` : le type connaît les colonnes de chaque table, pas `'films.title'`.
- Le second argument de type est ce que vous affirmez de ce qui revient : rien ne le confronte au SQL. Les lignes arrivent telles que `pg` les analyse, comme un `Selectable` les décrit (une `Date` pour un `timestamptz`), et non comme le JSON du `JSONSelectable` des raccourcis. Un `count(*)` est un `bigint`, que `pg` donne sous forme de chaîne : `'4'`.
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

Un objet natif lève une erreur à la compilation, avant toute requête : `` db.sql`DELETE FROM ${'ratings'} WHERE ${when}` ``, avec `when` une `Date` typée `any`, ne compile plus en `DELETE FROM "ratings" WHERE TRUE`, comme dans Zapatos 6.6.1, ce qui supprimait toutes les notes ([Objets Whereable](/fr/sql-template#whereable)). Passez une date comme `db.param(when)`.

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

## Vérifier le SQL avant de l’exécuter {#check-the-sql-before-you-run-it}

[`.compile()`](/fr/sql-template#compile) donne le `text` et les `values` qu’enverrait `run()`, et n’envoie rien. Chaque valeur venue de l’extérieur a sa place dans `values`, avec un `$n` à sa place dans `text`. Un test qui compile chaque requête avec une entrée hostile, l’attend dans `values` et fige `text` y veille, ici pour `listings()` plus haut :

<<< ../examples/plain/raw_sql_test.ts{ts twoslash}

- Ici avec `test` de `node:test` et `assert` de `node:assert/strict` ; n’importe quel lanceur de tests convient.
- `text` garde les retours à la ligne du template : le test réduit ses espaces, pour que seul un changement du SQL le fasse échouer.
- Chercher dans `text` ne suffit pas : un nom compilé depuis `x" --` y figure sous la forme `"x"" --"`<!-- probe: db.sql`${'x" -' + '-'}` -->, son `"` doublé, et une `'` isolée correspond aux littéraux de la requête elle-même.

## Voir aussi {#see-also}

- [Template SQL](/fr/sql-template) : chaque interpolation, et le SQL qu’elle donne.
- [Sécurité](/fr/security) : pourquoi les valeurs sont des paramètres, et ce que pgcast met entre guillemets.
- [Jointures](/fr/lateral) : les sous-requêtes avec `parent()`, imbriquées.
