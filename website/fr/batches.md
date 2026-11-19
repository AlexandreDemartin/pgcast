---
english: 610a348f86d0
description: "Écrivez beaucoup de lignes d’un coup : découpez-les sous la limite de paramètres, ignorez celles déjà là, additionnez des comptes, ne récupérez que l’utile."
---

# Batches

Écrivez beaucoup de lignes d’un coup : découpez-les sous la limite de paramètres de Postgres, ignorez celles qui sont déjà présentes, additionnez des comptes, empêchez des lignes aux clés différentes d’effacer ce qui est stocké, et ne récupérez que ce dont vous avez besoin. Cette page suppose que vous connaissez [`insert()` et `upsert()`](/fr/insert).
{.lede}

## Insérer un tableau {#insert-an-array}

Donnez un tableau à [`insert()`](/fr/insert#insert), et toutes les lignes partent en une seule requête :

<CastPanel example="batches_insert">

<<< ../examples/batches_insert.ts{ts twoslash}

</CastPanel>

Chaque cellule est un paramètre : trois lignes de deux colonnes, `VALUES ($1, $2), ($3, $4), ($5, $6) RETURNING`<!-- probe: examples/batches_insert.ts -->. Un tableau vide n’envoie rien et se résout avec `[]`.

## Découper sous la limite de paramètres {#split-under-the-parameter-limit}

Postgres accepte au plus 65 535 paramètres dans une requête. Au-delà, il refuse la requête pour violation de protocole, 08P01, avec un message qui varie selon le nombre et ne dit pas pourquoi, comme `bind message supplies 0 parameters, but prepared statement "" requires 65536`.

Les paramètres d’une requête, à compter avant de l’envoyer :

- un par cellule : lignes × colonnes ;
- aucun pour une cellule qui vaut `DEFAULT`, une clé absente de sa ligne ou [`db.Default`](/fr/sql-template#Default) ; un fragment `sql` envoie les siens ;
- un par colonne de `returning` et par clé d’[`extras`](/fr/insert#insert-options), et les paramètres d’`updateValues`, une fois.

Ou demandez-le à la requête elle-même : [`.compile()`](/fr/sql-template#compile)`.values.length` d’un insert d’une ligne, comme ci-dessous, quand toutes les lignes ont les mêmes clés.

Envoyez ensuite les lignes par chunks d’une taille fixe, bien en dessous de la limite. Dans une transaction, soit tous les chunks sont insérés, soit aucun :

<<< ../examples/plain/batches_chunks.ts{ts twoslash}

<!-- probe: db.readCommitted(pool, async () => {}) -->
```sql
START TRANSACTION ISOLATION LEVEL READ COMMITTED
-- the insert() of each chunk: 20 of them for 100,000 tags
COMMIT
```

- Si un chunk échoue, [`readCommitted()`](/fr/transaction#readCommitted) envoie `ROLLBACK`<!-- probe: db.readCommitted(pool, async () => { throw new Error(); }) --> et est rejetée avec son erreur : aucun tag n’est conservé. Un deadlock (40P01) relance d’abord les chunks ([Retries](/fr/retries)).
- Sur le pool, sans la transaction, chaque chunk est commité au fur et à mesure : les chunks passés avant celui qui a échoué restent en base.
- Pour `upsert()`, le découpage est le même.

## Ignorer les lignes déjà présentes {#skip-the-rows-already-there}

Donnez à [`upsert()`](/fr/insert#upsert) les lignes et [`updateColumns: db.doNothing`](/fr/insert#doNothing) : Postgres insère les nouvelles et laisse les autres telles qu’elles sont.

<CastPanel example="batches_skip_existing">

<<< ../examples/batches_skip_existing.ts{ts twoslash}

</CastPanel>

- Seules les lignes insérées reviennent ([`doNothing`](/fr/insert#doNothing)) : si `orchards` est déjà un tag, `added` ne contient que `lighthouses`.
- Une ligne donnée deux fois dans le tableau est insérée une fois.

## Additionner des comptes {#add-up-counts}

Sauf avec `doNothing`, un upsert refuse un tableau qui contient deux fois la même clé : 21000, `ON CONFLICT DO UPDATE command cannot affect row a second time`. Totalisez donc d’abord les bulletins, une ligne par `film_id` et `stars` :

```ts twoslash
const ballots = [
  { film_id: 1002, stars: 4 },
  { film_id: 1002, stars: 4 },
  { film_id: 1002, stars: 5 },
  { film_id: 1000, stars: 5 },
  { film_id: 1000, stars: 5 },
  { film_id: 1000, stars: 5 },
];

const counts = new Map<string, { film_id: number; stars: number; votes: number }>();
for (const { film_id, stars } of ballots) {
  const key = `${film_id}:${stars}`;
  const row = counts.get(key) ?? { film_id, stars, votes: 0 };
  row.votes += 1;
  counts.set(key, row);
}
const rows = [...counts.values()];  // the three rows below
```

Ajoutez ensuite les votes de chaque ligne à ceux déjà stockés : calculez `votes` dans [`updateValues`](/fr/insert#upsert-options) à partir des deux : la ligne stockée par le nom de sa table, la nouvelle par `EXCLUDED`.

<CastPanel example="batches_counts">

<<< ../examples/batches_counts.ts{ts twoslash}

</CastPanel>

- La première exécution insère les trois lignes. La seconde les passe à 4, 2 et 6 votes, chacune avec `$action: 'UPDATE'`.
- Un `undefined` dans `updateValues` donne à `votes` le compte du batch, puisque les lignes l’insèrent : `EXCLUDED."votes"`<!-- probe: db.upsert('ratings', [{ film_id: 1000, stars: 5, votes: 3 }], ['film_id', 'stars'], { updateValues: { votes: undefined } }) -->, avec les deux réglages ([Une valeur `undefined`](/fr/insert#undefined-values)).

## Lignes aux clés différentes {#rows-with-different-keys}

Vous corrigez les noms sur deux réservations, et une seule ligne contient `booked_at`. Un upsert sans option lève une erreur avant l’envoi du SQL : en cas de conflit, la cellule manquante écraserait l’heure de l’autre réservation avec `DEFAULT` (`now()`).

Nommez la colonne à modifier dans [`updateColumns`](/fr/insert#upsert-options) :

<CastPanel example="batches_different_keys">

<<< ../examples/batches_different_keys.ts{ts twoslash}

</CastPanel>

- La mise à jour est `DO UPDATE SET ("customer") = ROW(EXCLUDED."customer")`<!-- probe: examples/batches_different_keys.ts --> : F8 garde son heure de réservation. Une nouvelle ligne prend toujours le `booked_at` donné, ou la valeur par défaut.
- Ou donnez à chaque ligne les mêmes clés : faites l’upsert des lignes qui ont un `booked_at` et de celles qui n’en ont pas en deux appels.
- Toutes les clés ne comptent pas comme manquantes ([Lignes aux clés différentes](/fr/insert#upsert-different-keys)).

### Un `undefined` dans une ligne {#an-undefined-in-a-row}

Si le formulaire donne à F8 `booked_at: undefined`, la même règle s’applique. Avec `updateColumns: 'customer'`, la cellule prend la valeur par défaut, `(DEFAULT, $5, $6, $7)`<!-- probe: db.upsert('seat_bookings', [{ screening_id: 1000, seat: 'F7', customer: 'Ines Calloway', booked_at: '2030-02-20T09:15:00Z' }, { screening_id: 1000, seat: 'F8', customer: 'Barnaby Quill-Hart', booked_at: undefined }], ['screening_id', 'seat'], { updateColumns: 'customer' }) -->, et une réservation existante garde son heure. Voir [Une valeur `undefined`](/fr/insert#undefined-values).

## Choisir ce qui revient {#choose-what-comes-back}

Par défaut, chaque ligne revient entière, avec son `$action` pour un upsert. Pour un gros batch, demandez moins :

<CastPanel example="batches_returning">

<<< ../examples/batches_returning.ts{ts twoslash}

</CastPanel>

- [`returning: ['seat']`](/fr/insert#insert-options) envoie `jsonb_build_object($8::text, "seat")`<!-- probe: examples/batches_returning.ts --> au lieu de `to_jsonb("seat_bookings".*)`<!-- probe: examples/batches_different_keys.ts -->.
- `$action` distingue les nouvelles lignes des lignes mises à jour : `newSeats` vaut `['F8']` quand F7 était déjà réservé.
- [`reportAction: 'suppress'`](/fr/insert#upsert-options) retire `$action` du SQL et du type, pour un batch qui n’en a pas besoin.
- Tous deux n’affinent le type qu’avec `strictNullChecks` activé ([Options](/fr/insert#insert-options)).

## Voir aussi {#see-also}

- [`insert()`](/fr/insert#insert) et [`upsert()`](/fr/insert#upsert) : chaque option, le SQL qu’elle ajoute.
- [`transaction()`](/fr/transaction#transaction) : ses niveaux, ses retries et ses erreurs.
- [Versions](/fr/versions) : les opt-ins et leurs avertissements.
