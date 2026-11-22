---
english: e76d485c11c1
---

# Curseurs

Envoyez tous les films à un index de recherche par batchs. Pour servir une page par requête HTTP, voir [Pagination](/fr/paginate).
{.lede}

## Indexer les films {#index-the-films}

Choisissez les colonnes dont l’index a besoin et triez les films par identifiant. Dans la transaction, attendez que l’index ait accepté chaque batch avant de lire le suivant.

<<< ../examples/plain/cursors_films.ts{ts twoslash}

Survolez `films` pour voir son type, `{ id: number; title: string }[]`. C’est le type que donne [`select()`](/fr/select#select) pour les mêmes colonnes. Utilisez ici [`selectRows()`](/fr/select#selectRows) pour que Postgres renvoie une ligne par film. Avec `select()`, le curseur lirait l’unique ligne produite par l’agrégat (`jsonb_agg`) et transmettrait les quatre films à l’index en une seule fois.

Dans ses logs, l’index de l’exemple regroupe les identifiants 1000 et 1001, puis 1002 et 1003. Si vous fixez la taille du batch à trois films, le second batch ne contient que le quatrième film. Les valeurs de la déclaration sont `['id', 'title']`.

<!-- probe: db.repeatableReadRO(pool, async txnClient => { for await (const films of db.cursor(txnClient, db.selectRows('films', db.all, { columns: ['id', 'title'], order: { by: 'id', direction: 'ASC' } }), { batchSize: 2 })) { } }) -->
```sql
START TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY
DECLARE pgcast_cursor_1 NO SCROLL CURSOR FOR SELECT jsonb_build_object($1::text, "id", $2::text, "title") AS result FROM "films" ORDER BY "id" ASC
FETCH FORWARD 2 FROM pgcast_cursor_1
-- The second FETCH returns the last two films. A third returns no rows.
CLOSE pgcast_cursor_1
COMMIT
```

Chaque lecture coûte un aller-retour. Pour limiter le nombre de lignes chargées en mémoire à chaque lecture, fixez la taille du batch à un entier compris entre 1 et 2147483647. Prévoyez assez de mémoire pour que deux batchs successifs puissent s’y trouver en même temps.

[`cursor()`](/fr/transaction#cursor) envoie la déclaration sans nom de requête préparée. Vous pouvez réutiliser les fragments préparés à n’importe quel niveau d’imbrication. Le numéro du curseur peut changer le texte SQL de la déclaration. `pg` exige qu’un nom de requête préparée corresponde à un seul texte SQL.

## Garder un seul instantané {#keep-one-snapshot}

Lisez le curseur dans l’appel à [`transaction()`](/fr/transaction#transaction) dont il dépend. Postgres refuse la déclaration hors transaction (25P01) et ferme le curseur à la fin de la transaction. Si vous lisez le générateur pour la première fois après la fin de cette transaction, pgcast rejette la lecture avant d’envoyer une requête.

Dans l’exemple, la requête de sélection simple utilise l’instantané visible à la déclaration du curseur. En lecture répétable, une requête exécutée plus tôt dans la transaction peut avoir déjà fixé cet instantané.

Supposons qu’une autre transaction commite l’insertion d’un cinquième film après le premier batch. En `READ COMMITTED`, un appel à [`count()`](/fr/aggregates#count) dans la boucle renvoie cinq, alors que le curseur lit quatre films. En `REPEATABLE READ, READ ONLY`, les deux en voient quatre.

## Gérer une sortie anticipée de la boucle ou un retry {#handle-an-early-exit-or-a-retry}

Tant que la transaction est active, le curseur se ferme si vous quittez la boucle avec `break` ou `return`, ou si l’index lève une erreur. Si une requête SQL échoue dans la boucle, voir [`cursor()`](/fr/transaction#cursor).

Si une lecture échoue, l’index garde les batchs qu’il a déjà reçus. Après une erreur de sérialisation (40001), un retry relance le parcours sur un nouvel instantané. Un film reçu lors de la tentative qui a échoué peut manquer dans le nouveau parcours.

Si l’index publié doit correspondre à un seul parcours réussi, utilisez `txnClient` dans une transaction en lecture-écriture pour écrire les batchs dans une table intermédiaire prévue pour ce parcours. Un rollback annule l’écriture des lignes de cette tentative. Publiez un nouvel index à partir des lignes de cette table [après le commit](/fr/retries#keep-side-effects-out-of-the-callback).

## Travailler dans la boucle {#work-inside-the-loop}

- Dans une transaction en lecture-écriture, `lock: { for: 'UPDATE' }` verrouille les lignes à mesure que le curseur les lit. En `READ COMMITTED`, si une autre transaction commite un changement de titre après la déclaration du curseur, une lecture ultérieure peut renvoyer le nouveau titre.
- Un film inséré par la boucle reste en dehors de l’instantané du curseur ouvert.
- Si le curseur était déjà ouvert lors de l’appel à [`savepoint()`](/fr/transaction#savepoint) et que vous lisez un film dans le savepoint, la première lecture après le rollback reprend après ce film.
- Chaque curseur utilise le plus petit numéro libre sur son client pour former son nom, `pgcast_cursor_<n>`.

La doc de Postgres décrit la durée de vie du curseur dans [DECLARE](https://www.postgresql.org/docs/current/sql-declare.html) et explique dans [FETCH](https://www.postgresql.org/docs/current/sql-fetch.html) comment il avance.
