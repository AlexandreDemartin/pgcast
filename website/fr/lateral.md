---
english: d5e0f9e80979
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
- Dans un lateral, `selectExactlyOne()` ne vérifie rien : une ligne manquante donne `null` et aucune erreur, bien que son type n’ait pas de `null` ([`selectExactlyOne()`](/fr/select#selectExactlyOne)). Réservez-le à une clé étrangère `NOT NULL`.

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
- [`count()`](/fr/select#count) donne un nombre, ici les protégés de chaque membre.
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

## À surveiller {#watch-for}

- **`strictNullChecks`** : sans lui (ou `strict`), `columns`, `extras` et `lateral` laissent au type la ligne entière, et il ne refuse rien ([Strict](/fr/select#options)).
- **Une jointure non vérifiée** : `db.parent()` accepte une colonne de n’importe quelle table, donc une jointure sur la mauvaise colonne compile. Postgres refuse une colonne que le parent n’a pas : `db.parent('billing')` sous `films` échoue avec 42703, « <span lang="en">column films.billing does not exist</span> ».
- **[`withTies`](/fr/select#order-limit-offset-and-withties) dans un `selectOne()` imbriqué** : il écrit `FETCH FIRST $2 ROWS WITH TIES`<!-- probe: db.select('films', db.all, { lateral: { lead: db.selectOne('roles', { film_id: db.parent('id') }, { order: { by: 'billing', direction: 'ASC' }, withTies: true }) } }) -->, qui garde toutes les lignes ex æquo : sous un `select()` extérieur, la ligne parente revient une fois par ex æquo ; sous `selectOne()`, avec l’un d’eux. Dans un `select()` imbriqué, les ex æquo restent dans le tableau. Inchangé depuis Zapatos 6.6.1, et conservé : c’est le SQL que demande `withTies` ([#164](https://github.com/AlexandreDemartin/pgcast/issues/164#issuecomment-6883146644)).
- **Un `lock`** : sans `of`, `FOR UPDATE`<!-- probe: db.select('films', db.all, { lock: { for: 'UPDATE' } }) --> atteint les sous-requêtes, et Postgres refuse la requête (0A000) : « <span lang="en">FOR UPDATE is not allowed with aggregate functions</span> » sous `select()` ou `count()`, « <span lang="en">FOR UPDATE cannot be applied to the nullable side of an outer join</span> » sous `selectOne()`. Nommez la table ([`lock`](/fr/select#lock)) :

<CastPanel example="lateral_lock">

<<< ../examples/lateral_lock.ts{ts twoslash}

</CastPanel>

`FOR UPDATE OF "films"`<!-- probe: examples/lateral_lock.ts --> verrouille la ligne du film, et elle seule, jusqu’à la fin de la transaction : exécutez-le sur un [`txnClient`](/fr/transaction#transaction). Les lignes de `roles` sont lues, pas verrouillées.

## Voir aussi {#see-also}

- [`lateral`](/fr/select#lateral), [`alias`](/fr/select#alias) et [`extras`](/fr/select#extras) : chaque option, le SQL qu’elle écrit, son type.
- [`parent()`](/fr/sql-template#parent) : où elle fonctionne, et ce qu’elle donne une fois compilée.
- [Pourquoi pgcast](/fr/why) : pourquoi il fonctionne ainsi.
