---
english: ea7adb2cd6ac
description: "Récupérez des lignes avec celles qui s’y rattachent, en une requête et un résultat typé : un film avec sa distribution, un membre de l’équipe avec son mentor."
---

# Jointures

Récupérez des lignes avec les lignes qui s’y rattachent, en une requête et un résultat typé : un film avec sa distribution, un membre de l’équipe avec son mentor. Vous imbriquez un raccourci dans l’option [`lateral`](/fr/select#lateral) de `select()` ; il devient un `LEFT JOIN LATERAL`<!-- probe: examples/lateral_cast.ts -->, et son résultat une clé de chaque ligne. Vous connaissez déjà `select()` grâce au [tutoriel](/fr/first-query).
{.lede}

## Ajouter les lignes qui pointent vers elle {#add-the-rows-that-point-to-it}

La distribution d’un film, ce sont les `roles` dont le `film_id` est l’`id` du film. Imbriquez un `select()` de `roles` sous une clé de `lateral`, et nommez la colonne du film avec `db.parent()` :

<CastPanel example="lateral_cast">

<<< ../examples/lateral_cast.ts{ts twoslash}

</CastPanel>

- `cast` devient une clé du film, qui contient un tableau : `[]` quand aucun rôle ne correspond.
- `db.parent('id')` est `"films"."id"`<!-- probe: examples/lateral_cast.ts -->, une colonne de la requête qui l’entoure ([`parent()`](/fr/sql-template#parent)). Quand les deux colonnes portent le même nom, `db.parent()` seul prend la colonne de son filtre.
- La sous-requête prend les options de tout `select()`, ici `columns` et `order` ([Options](/fr/select#options)).

## Ajouter la ligne vers laquelle elle pointe {#add-the-row-it-points-to}

Chaque film a un studio : `studio_id` est `NOT NULL REFERENCES studios(id)`, donc la ligne est toujours là. Imbriquez `selectExactlyOne()`, et la clé contient cette ligne, pas un tableau :

<CastPanel example="lateral_studio">

<<< ../examples/lateral_studio.ts{ts twoslash}

</CastPanel>

- Les jointures suivent l’ordre trié de leurs clés, quel que soit l’ordre dans lequel vous les écrivez.
- Sur une clé étrangère nullable, imbriquez [`selectOne()`](/fr/select#selectOne) : la clé contient la ligne ou `null`, comme le mentor plus bas.
- Dans un lateral, `selectExactlyOne()` ne vérifie rien : une ligne manquante donne `null` et aucune erreur, bien que son type n’ait pas de `null` ([`selectExactlyOne()`](/fr/select#selectExactlyOne)). Réservez-le à une clé étrangère qui exclut la ligne manquante, et imbriquez `selectOne()` sinon :
  - ses colonnes `NOT NULL` ;
  - validée : une clé ajoutée `NOT VALID` laisse sans vérification les lignes déjà là, donc l’une d’elles peut ne pointer vers aucune ligne ;
  - pas `DEFERRABLE` : une clé différée n’est vérifiée qu’au `COMMIT`, donc d’ici là la transaction peut contenir une ligne qui ne pointe vers aucune ;
  - sa table cible sans sécurité niveau ligne : la vérification de la clé contourne les politiques, votre requête non, donc une politique peut cacher la ligne.
- Il n’y a pas de `related()` qui déduirait la jointure de la clé étrangère : il économiserait un type, jamais une ligne de code ni le SQL ([décision 007](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/007-related.md)).

## Passer par une table de jointure {#go-through-a-join-table}

Films et acteurs sont liés en plusieurs-à-plusieurs, via `roles`. Imbriquez un lateral dans le lateral, pour donner à chaque rôle son acteur :

<CastPanel example="lateral_actors">

<<< ../examples/lateral_actors.ts{ts twoslash}

</CastPanel>

`db.parent()` nomme une colonne de la requête la plus proche qui l’entoure : dans `actor`, `"roles"."actor_id"`<!-- probe: examples/lateral_actors.ts -->. L’`actor` de chaque rôle est `{ name: string }`. Imbriquez autant de niveaux qu’il le faut ; chaque niveau ajoute un `LEFT JOIN LATERAL`<!-- probe: examples/lateral_actors.ts --> à la même requête.

## Ne garder que l’autre côté {#keep-only-the-far-side}

Pour les acteurs seuls, sans les colonnes du rôle, donnez au `lateral` intérieur une sous-requête plutôt qu’un objet : son résultat prend la place de chaque rôle.

<CastPanel example="lateral_passthrough">

<<< ../examples/lateral_passthrough.ts{ts twoslash}

</CastPanel>

L’`order` trie toujours les rôles, donc les acteurs viennent dans l’ordre du générique. Sans le rôle, `columns` et `extras` sur `roles` n’auraient plus rien à compléter : le type les refuse, avec `strictNullChecks` activé.

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
db.select('roles', { film_id: 1000 }, {
  columns: ['character'],
  lateral: db.selectExactlyOne('actors', { id: db.parent('actor_id') }),
});
```

## Joindre une table à elle-même {#join-a-table-to-itself}

Le mentor d’un membre de l’équipe est une autre ligne de `crew`. Donnez un `alias` à la sous-requête, pour que `db.parent()` atteigne toujours le `crew` extérieur :

<CastPanel example="lateral_mentor">

<<< ../examples/lateral_mentor.ts{ts twoslash}

</CastPanel>

- `mentor` contient la ligne ou `null` : Wilhelmina Strand n’a pas de mentor.
- [`count()`](/fr/aggregates#count) donne un nombre, ici les protégés de chaque membre.
- Sans les alias, le `FROM "crew"`<!-- probe: db.select('crew', db.all, { lateral: { mentor: db.selectOne('crew', { id: db.parent('mentor_id') }, { columns: ['name'] }) } }) --> de la sous-requête masque celui de la requête extérieure, et `"crew"."mentor_id"`<!-- probe: db.select('crew', db.all, { lateral: { mentor: db.selectOne('crew', { id: db.parent('mentor_id') }, { columns: ['name'] }) } }) --> est la ligne même de la sous-requête. Postgres l’exécute sans erreur, et chaque `mentor` revient `null`, chaque compte `0` :

  ```sql
  SELECT jsonb_build_object($5::text, "name") AS result
  FROM "crew"
  WHERE ("id" = "crew"."mentor_id")
  LIMIT $6
  ```

- Un seul alias, sur la requête extérieure, suffit pour les deux : avec `alias: 'member'` sur celle-ci, `db.parent('mentor_id')` est `"member"."mentor_id"`<!-- probe: db.select('crew', db.all, { alias: 'member', lateral: { mentor: db.selectOne('crew', { id: db.parent('mentor_id') }) } }) --> ([`alias`](/fr/select#alias)).

## Trier par une valeur calculée {#order-by-a-computed-value}

Chaque cinéma, et l’autre cinéma le plus proche : de nouveau une table jointe à elle-même, avec la distance comme clé d’[`extras`](/fr/select#extras) et comme `order`. Un fragment `sql` dans une sous-requête accepte aussi `db.parent()` :

<CastPanel example="lateral_nearest">

<<< ../examples/lateral_nearest.ts{ts twoslash}

</CastPanel>

- `<->` est la distance de Postgres entre deux points : des kilomètres ici, puisque `location` est en kilomètres à l’est et au nord du centre-ville.
- `km` est un `number` parce que le fragment le dit : `db.sql<s.cinemas.SQL, number>`.
- [`ne(db.parent('id'))`](/fr/conditions#conditions.ne) exclut le cinéma lui-même.
- Pour les trois plus proches, imbriquez `select()` avec [`limit: 3`](/fr/select#order-limit-offset-and-withties) : `nearest` devient un tableau.

## Filtrer, trier et grouper par un lateral {#filter-sort-and-group-by-a-lateral}

Chaque clé de `lateral` est jointe à la requête comme une table, `"lateral_<key>"`, d’une seule colonne, `result`. Un fragment `sql` la nomme dans le `where`, l’`order` ou le `groupBy` de la requête qui l’entoure :

<CastPanel example="lateral_result">

<<< ../examples/lateral_result.ts{ts twoslash}

</CastPanel>

- `WHERE "lateral_castSize".result >= $3`<!-- probe: examples/lateral_result.ts --> et `ORDER BY "lateral_castSize".result DESC`<!-- probe: examples/lateral_result.ts --> lisent le nombre de rôles de chaque film.
- Mettez le nom entre guillemets doubles, comme le fait pgcast : sans eux, Postgres le passe en minuscules, `lateral_castsize`, et refuse la requête (42P01). Un `"` dans une clé est doublé, `"lateral_a""b"`<!-- probe: db.select('films', db.all, { lateral: { 'a"b': db.count('roles', { film_id: db.parent('id') }) } }) -->.
- `result` est le résultat de la sous-requête : un nombre pour `count()`, du `jsonb` pour les autres. Lisez un champ avec `->>`, comme dans `ORDER BY "lateral_studio".result->>'name' ASC`<!-- probe: db.select('films', db.all, { columns: ['title'], lateral: { studio: db.selectExactlyOne('studios', { id: db.parent('studio_id') }, { columns: ['name'] }) }, order: { by: db.sql`"lateral_studio".result->>'name'`, direction: 'ASC' } }) -->.

Avec un `groupBy`, le résultat de chaque lateral figure aussi dans la ligne : groupez donc par lui également, sinon Postgres refuse la requête (42803). Donnez les deux dans un seul fragment, typé pour que ses colonnes soient vérifiées :

<CastPanel example="lateral_result_group">

<<< ../examples/lateral_result_group.ts{ts twoslash}

</CastPanel>

- `GROUP BY "studio_id", "lateral_studio".result`<!-- probe: examples/lateral_result_group.ts --> : chaque studio une seule fois, avec son nom et son nombre de films.
- `db.sql<s.films.SQL>` refuse `${'name'}`, une colonne de `studios`. Un tableau de colonnes ne peut pas contenir le fragment : [`groupBy`](/fr/select#groupby-and-having) prend une colonne, un tableau de colonnes ou un seul fragment.

## Nommer la ligne d’un lateral réutilisable {#name-the-row-of-a-reusable-lateral}

Un lateral que plusieurs requêtes partagent va dans une fonction. Nommez la ligne qu’il donne à partir du type de cette fonction, plutôt qu’avec une interface écrite à la main, qu’il vous faudrait tenir à jour à chaque changement de la requête :

<CastPanel example="lateral_row_map">

<<< ../examples/lateral_row_map.ts{ts twoslash}

</CastPanel>

- [`LateralResult`](/fr/select#LateralResult) donne à chaque clé de l’objet le type du résultat de sa sous-requête : `cast` est un tableau de `{ character, billing }`.
- `s.films.JSONSelectable` est la ligne entière du film, telle que la donne `db.all` sans `columns`. Avec `columns` ou `extras`, nommez plutôt la ligne entière de la requête (plus bas).

Un lateral générique dans ses colonnes donne un type par appel. Appelez-le, et nommez le résultat de cet appel avec [`RunResultForSQLFragment`](/fr/sql-template#RunResultForSQLFragment) :

<<< ../examples/plain/lateral_row_generic.ts{ts twoslash}

- `Mentor` est le `name` et le `job` du mentor, ou `null` : dans un lateral, un `selectOne()` qui ne trouve aucune ligne donne `null`, là où son propre `.run()` donne `undefined`.
- Nommée à partir de `ReturnType<typeof mentorLateral>`, la ligne aurait toutes les colonnes de `crew` : `C` y vaut sa contrainte, `s.crew.Column`.

Pour la ligne entière d’une requête, ses `columns`, ses `extras` et ses laterals ensemble, tirez-la de `.run()` (`Awaited` demande TypeScript 4.5) :

<<< ../examples/plain/lateral_row_whole.ts{ts twoslash}

## Vérifier la colonne parente {#check-the-parent-column}

`db.parent()` accepte une colonne de n’importe quelle table, donc une jointure sur la mauvaise colonne compile. Postgres refuse une colonne que le parent n’a pas : `db.parent('billing')` sous `films` échoue avec 42703, « <span lang="en">column films.billing does not exist</span> ». Donnez les colonnes du parent comme argument de type, `db.parent<s.films.Column>('id')`, et le type vérifie que le nom en fait partie :

```ts twoslash
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
db.select('films', db.all, {
  lateral: { cast: db.select('roles', { film_id: db.parent<s.films.Column>('id') }) },
});
db.select('films', db.all, {
  // @ts-expect-error billing is a column of roles, not of films (TS2345)
  lateral: { cast: db.select('roles', { film_id: db.parent<s.films.Column>('billing') }) },
});
```

- Il vérifie la table que vous nommez, pas la requête qui l’entoure : `db.parent<s.studios.Column>('id')` sous `films` compile aussi.
- Le type ne la vérifie pas sans qu’on le lui demande : la sous-requête est construite, et typée, avant la requête qui l’entoure, donc son type ne connaît pas la table parente. La vérifier ralentirait chaque compilation, et refuserait du code qui s’exécute.

### Dans un helper générique {#in-a-generic-helper}

Un helper générique sur sa table parente prend le `db.parent()` de l’appelant, typé `db.ParentColumn<s.ColumnForTable<T>>`, plutôt qu’une colonne qu’il passe lui-même à `db.parent()` :

```ts twoslash
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
const studioOf = <T extends s.Table>(col: db.ParentColumn<s.ColumnForTable<T>>) =>
  db.selectExactlyOne('studios', { id: col });

db.select('films', db.all, { lateral: { studio: studioOf<'films'>(db.parent('studio_id')) } });
// @ts-expect-error billing is a column of roles, not of films (TS2345)
db.select('films', db.all, { lateral: { studio: studioOf<'films'>(db.parent('billing')) } });
```

- Le type vérifie toujours la colonne par rapport à `T`.
- Sa vérification est bien moins coûteuse. Sur un schéma synthétique de 300 tables et vues, la vérification de types de ce helper prend 0,4 s environ, et plus de 9 s avec `col: s.ColumnForTable<T>` et `db.parent(col)` à l’intérieur : TypeScript compare alors la colonne générique à chaque nom de colonne du schéma.

## À surveiller {#watch-for}

- **`strictNullChecks`** : sans lui (ou `strict`), `columns`, `extras` et `lateral` laissent au type la ligne entière, et il ne refuse rien ([Strict](/fr/select#options)).
- **Une jointure non vérifiée** : `db.parent()` accepte une colonne de n’importe quelle table, sauf si vous nommez la table ([Vérifier la colonne parente](#check-the-parent-column)).
- **[`withTies`](/fr/select#order-limit-offset-and-withties) dans un `selectOne()` imbriqué** : il écrit `FETCH FIRST $2 ROWS WITH TIES`<!-- probe: db.select('films', db.all, { lateral: { lead: db.selectOne('roles', { film_id: db.parent('id') }, { order: { by: 'billing', direction: 'ASC' }, withTies: true }) } }) -->, qui garde toutes les lignes ex æquo : sous un `select()` extérieur, la ligne parente revient une fois par ligne ex æquo ; sous `selectOne()` ou `selectExactlyOne()`, elle revient une fois, avec l’une des lignes ex æquo, mais avec [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), `selectExactlyOne()` est rejetée avec une `NotExactlyOneError`. Dans un `select()` imbriqué, les ex æquo restent dans le tableau. Comme `lateral` de `count()`, chaque ex æquo est compté : 6 pour deux films de trois rôles ex æquo chacun. Dans un `lateral`, inchangé depuis Zapatos 6.6.1, et conservé : c’est le SQL que demande `withTies` ([#164](https://github.com/AlexandreDemartin/pgcast/issues/164#issuecomment-6883146644)). Comme valeur d’`extras`, un ex æquo fait refuser la requête par Postgres (21000) : « <span lang="en">more than one row returned by a subquery used as an expression</span> » ; Zapatos 6.6.1 refusait tout raccourci comme valeur d’`extras` (42601), ex æquo ou non.
- **Un `lock`** : sans `of`, `FOR UPDATE`<!-- probe: db.select('films', db.all, { lock: { for: 'UPDATE' } }) --> atteint les sous-requêtes, et Postgres refuse la requête (0A000) : « <span lang="en">FOR UPDATE is not allowed with aggregate functions</span> » sous `select()` ou `count()`, « <span lang="en">FOR UPDATE cannot be applied to the nullable side of an outer join</span> » sous `selectOne()`. Nommez la table ([`lock`](/fr/select#lock)) :

<CastPanel example="lateral_lock">

<<< ../examples/lateral_lock.ts{ts twoslash}

</CastPanel>

`FOR UPDATE OF "films"`<!-- probe: examples/lateral_lock.ts --> verrouille la ligne du film, et elle seule, jusqu’à la fin de la transaction : exécutez-le sur un [`txnClient`](/fr/transaction#transaction). Les lignes de `roles` sont lues, pas verrouillées.

## Voir aussi {#see-also}

- [`lateral`](/fr/select#lateral), [`alias`](/fr/select#alias) et [`extras`](/fr/select#extras) : chaque option, le SQL qu’elle écrit, son type.
- [`parent()`](/fr/sql-template#parent) : où elle fonctionne, et ce qu’elle donne une fois compilée.
- [Pourquoi pgcast](/fr/why) : pourquoi il fonctionne ainsi.
