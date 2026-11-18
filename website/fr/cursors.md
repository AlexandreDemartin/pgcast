---
english: d67af2a17166
---

# Curseurs

Envoyez tous les films à un index de recherche par batchs, en gardant seulement le batch en cours en mémoire. Pour servir une page par requête HTTP, voir [Pagination](/fr/paginate).
{.lede}

## Indexer les films {#index-the-films}

Choisissez les colonnes dont l’index a besoin et triez les films par identifiant. Dans la transaction, attendez que l’index ait accepté chaque batch avant de lire le suivant.

<<< ../examples/plain/cursors_films.ts{ts twoslash}

Survolez `films` pour voir son type, `{ id: number; title: string }[]`. C’est le type que donne [`select()`](/fr/select#select) pour les mêmes colonnes. Utilisez ici [`selectRows()`](/fr/select#selectRows) pour que Postgres renvoie une ligne par film. Avec `select()`, le curseur lirait l’unique ligne produite par l’agrégat (`jsonb_agg`) et donnerait les quatre films à l’index en une fois.

L’index de l’exemple affiche dans ses logs les identifiants 1000 et 1001 ensemble, puis 1002 et 1003. La déclaration prend les valeurs `['id', 'title']`.

<!-- probe: db.repeatableReadRO(pool, async txnClient => { for await (const films of db.cursor(txnClient, db.selectRows('films', db.all, { columns: ['id', 'title'], order: { by: 'id', direction: 'ASC' } }), { batchSize: 2 })) { } }) -->
```sql
START TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY
DECLARE pgcast_cursor_1 NO SCROLL CURSOR FOR SELECT jsonb_build_object($1::text, "id", $2::text, "title") AS result FROM "films" ORDER BY "id" ASC
FETCH FORWARD 2 FROM pgcast_cursor_1
-- The second FETCH returns the last two films. A third returns no rows.
CLOSE pgcast_cursor_1
COMMIT
```

Chaque lecture coûte un aller-retour. Choisissez une taille de batch de 1 à 2147483647 en prévoyant assez de mémoire pour un tableau pouvant contenir autant de lignes. Avec une taille de trois, le second batch contient seulement le quatrième film.

Dans [`cursor()`](/fr/transaction#cursor), même un fragment préparé s’exécute sans préparation. Le numéro du curseur change le SQL de la déclaration, et `pg` exige un seul texte de requête par nom de requête préparée. Le fragment garde son nom pour sa prochaine exécution ordinaire.

## Garder un seul instantané {#keep-one-snapshot}

Lisez le curseur dans le callback de [`transaction()`](/fr/transaction#transaction). Postgres refuse la déclaration hors transaction (25P01) et ferme le curseur à la fin de la transaction. Si le callback renvoie le générateur, pgcast rejette la première lecture avant d’envoyer une requête.

Le curseur voit les films tels qu’ils étaient au moment de sa déclaration. Supposons qu’une autre transaction commite l’insertion d’un cinquième film après le premier batch. En `READ COMMITTED`, un [`count()`](/fr/select#count) dans la boucle compte cinq films, alors que le curseur en lit quatre. En `REPEATABLE READ, READ ONLY`, les deux en voient quatre.

## Gérer une sortie anticipée de la boucle ou un retry {#handle-an-early-exit-or-a-retry}

Quitter la boucle avec `break` ou `return` ferme le curseur. Lever une erreur dans la boucle le ferme aussi et transmet la même erreur à l’appelant.

Une erreur dans une colonne calculée, par exemple une division par zéro sur le troisième film, se manifeste quand la deuxième lecture arrive à ce film. L’index a déjà reçu les deux premiers films et la transaction passe en échec côté Postgres.

Si une lecture échoue avec une erreur de sérialisation (40001), un [retry](/fr/retries) reprend le callback au début et relit le premier batch. Prévoyez une indexation que vous pouvez répéter sans risque, par exemple en vous servant de l’identifiant du film pour remplacer l’entrée correspondante. Pour écrire dans Postgres, utilisez le même client dans une transaction en lecture-écriture afin qu’un rollback annule aussi les écritures du batch.

## Travailler dans la boucle {#work-inside-the-loop}

- Dans une transaction en lecture-écriture, `lock: { for: 'UPDATE' }` verrouille les lignes à mesure que le curseur les lit. Après le premier batch, une autre transaction peut encore verrouiller le troisième film.
- Un film inséré par la boucle reste en dehors de l’instantané du curseur ouvert.
- Un [`savepoint()`](/fr/transaction#savepoint) établi pendant que le curseur est ouvert permet d’annuler des opérations. Le curseur garde sa position. Si vous lisez un film dans le savepoint, la lecture qui suit le rollback commence après ce film.
- Deux boucles imbriquées ou exécutées en même temps sur le même client ont chacune leur curseur, `pgcast_cursor_1` et `pgcast_cursor_2`.

La doc de Postgres décrit la durée de vie du curseur dans [DECLARE](https://www.postgresql.org/docs/current/sql-declare.html) et explique dans [FETCH](https://www.postgresql.org/docs/current/sql-fetch.html) comment il avance.
