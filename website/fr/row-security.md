---
english: 9a7a61b5a0ad
description: "Ne montrez à chaque client que ses propres réservations : une politique de sécurité niveau ligne lit un réglage, que setLocal() définit pour une transaction."
---

# Sécurité des lignes

Ne montrez à chaque client que ses propres réservations : une politique de sécurité niveau ligne, la vôtre, lit un réglage, et `setLocal()` le définit pour le reste d’une transaction. Ensuite, pourquoi l’exemple définit un rôle, pourquoi un réglage dure une transaction, et ce qu’il faut éviter. La page suppose que vous connaissez [`transaction()`](/fr/transaction#transaction).
{.lede}

## Écrire la politique {#write-the-policy}

Le schéma de la doc active la sécurité niveau ligne sur `seat_bookings`, avec une politique qui garde les lignes dont `customer` vaut le réglage `app.customer`, et un rôle qui ne peut que les lire :

```sql
CREATE ROLE cinema_customer NOLOGIN;
GRANT SELECT ON seat_bookings TO cinema_customer;
ALTER TABLE seat_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_bookings ON seat_bookings USING (customer = current_setting('app.customer', true));
```

Avec `true`, `current_setting()` renvoie `NULL` pour un nom qui n’est pas défini, là où il échouerait avec 42704. La politique est celle de Postgres : [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Lire en tant que client {#read-as-the-customer}

Dans un seul [`readCommitted()`](/fr/transaction#readCommitted), [`setLocal()`](/fr/transaction#setLocal) définit le rôle et le client, puis [`select()`](/fr/select#select) lit chaque réservation que la politique laisse passer :

<<< ../examples/plain/row_security_bookings.ts{ts twoslash}

`bookings` contient les deux réservations d’Ada Quill, C4 et D2, et non la C5 de Felix Ambrose. Son type est `s.seat_bookings.JSONSelectable[]` (survolez-le), comme sans politique : une politique filtre les lignes, jamais les colonnes. La transaction envoie :

<!-- probe: db.readCommitted(pool, txnClient => db.setLocal(txnClient, { role: 'cinema_customer', 'app.customer': 'Ada Quill' })) -->
```sql
START TRANSACTION ISOLATION LEVEL READ COMMITTED
SELECT set_config($1, $2, true), set_config($3, $4, true)
-- the callback's select()
COMMIT
```

Les valeurs sont `['role', 'cinema_customer', 'app.customer', 'Ada Quill']`, chaque nom et chaque valeur étant un paramètre ([`setLocal()`](/fr/transaction#setLocal)).

## Pourquoi le rôle {#why-the-role}

Une politique ne s’applique jamais à un superutilisateur ni à un rôle doté de `BYPASSRLS`, même avec `FORCE ROW LEVEL SECURITY`, ni au propriétaire de la table sans cette option. La doc se connecte en superutilisateur, comme le fait l’insert ci-dessus, donc l’exemple définit aussi `role` : le reste de la transaction s’exécute en tant que `cinema_customer`, auquel la politique s’applique. Au `COMMIT`, le rôle redevient celui de la session.

- Un rôle qui n’est pas superutilisateur ne peut définir `role` que sur un rôle dont il est membre : `GRANT cinema_customer TO <your app's role>`, sinon 42501.
- Une app qui se connecte avec un rôle qui n’est ni propriétaire de la table, ni superutilisateur, ni doté de `BYPASSRLS` y est déjà soumise, et n’a besoin que d’`app.customer`.

## Pourquoi une seule transaction {#why-one-transaction}

`setLocal()` définit chaque réglage jusqu’au `COMMIT` ou au `ROLLBACK` : le prochain utilisateur d’une connexion du pool ne le reçoit donc jamais. Un réglage de session, `SET` ou `set_config(…, false)`, resterait sur la connexion, et pgcast n’a pas de fonction pour cela.

## Éviter les pièges {#avoid-the-pitfalls}

- Après la transaction, `current_setting(name, true)` lit `''` sur cette connexion, et non `NULL` comme sur une connexion neuve, pour un nom à vous qu’aucune base, aucun rôle ni aucune connexion ne définit. Une politique qui le caste, `current_setting('app.tenant', true)::int`, échoue alors avec 22P02 à la prochaine transaction de cette connexion qui ne le définit pas. Écrivez `NULLIF(current_setting('app.tenant', true), '')::int`.
- Une valeur est du texte : donnez `String(tenantId)`, et castez-la dans la politique. Un nombre ne compile pas ([`setLocal()`](/fr/transaction#setLocal)).
- Postgres ignore la casse de `A` à `Z` dans un nom : `app.Customer` est donc `app.customer`. Un nom à vous demande un point : 42704 sans point, `customer_id`, et 42602 quand une partie n’est pas un identifiant, `app.customer-id`.
- Un `ROLLBACK TO` vers un savepoint pris avant ce réglage, comme le `ROLLBACK TO` qu’envoie un [`savepoint()`](/fr/transaction#savepoint) dont le callback est rejeté, rend la valeur d’avant ce savepoint.
- Une tentative que `transaction()` réessaie commence sans aucun des réglages de la précédente : son `ROLLBACK` les a annulés. Définissez-les dans le callback, que chaque tentative exécute en entier ([Retries](/fr/retries)).
- Une interface de réglages ne compile pas, faute de signature d’index : passez-en le spread, `{ ...context }`.

## Voir aussi {#see-also}

- [`setLocal()`](/fr/transaction#setLocal) : le SQL, les clients et les réglages qu’elle accepte, et quand elle est rejetée.
- [`transaction()`](/fr/transaction#transaction) : niveaux d’isolation et retries ; [Retries](/fr/retries) : ce qui va dans le callback.
- [Sécurité](/fr/security) : ce que pgcast échappe, et ce contre quoi il ne peut rien.
- [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), dans la doc de Postgres.
