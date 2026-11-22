---
english: 24141a4f5f40
---

# Locks de job

Lancer sur un seul worker : sauter un job qu’un autre worker est déjà en train de lancer. `pg_try_advisory_xact_lock()` dans un template [`sql`](/fr/sql-template#sql), dans une [`transaction()`](/fr/transaction#transaction), prend un lock ou dit qu’il est pris, sans attendre ; [`advisoryXactLock()`](/fr/transaction#advisoryXactLock) l’attend.
{.lede}

## Essayer le lock {#try-the-lock}

Chaque worker lance le job qui règle les sous-titres d’un cinéma : une séance d’avant le 3 mars 2030 dont `subtitled` est encore `NULL` passe à `false`. Chaque worker essaie d’abord le lock du job, la paire `[3, 1001]`, 3 pour ce job et 1001 pour le cinéma :

<CastPanel example="one_worker">

<<< ../examples/one_worker.ts{ts twoslash}

<template #caption><span>[{ locked : true }] : aucune autre transaction ne détient la clé.</span></template>
</CastPanel>

- `SELECT pg_try_advisory_xact_lock($1, $2)`<!-- probe: examples/one_worker.ts --> répond tout de suite : `true` si la transaction détient maintenant le lock, `false` si une autre le détient. Un second worker reçoit son `false` en quelques millisecondes, là où `advisoryXactLock()` attendrait.
- La clé est une paire d’entiers 32 bits, ou un seul `bigint` : [`advisoryXactLock()`](/fr/transaction#advisoryXactLock) en donne les règles, et une clé tirée d’un texte.
- Le type de la ligne est écrit à la main, `{ locked: boolean }[]`. Un `SELECT` sans `FROM` donne une ligne, que le job lit avec `const [{ locked }]`.
- Sur le pool, le lock partirait avec la transaction propre à la requête, aussitôt : lancez-la sur le client de la transaction du job, comme ci-dessous.

## Lancer le job sous le lock {#run-the-job-under-the-lock}

<<< ../examples/plain/one_worker_job.ts{ts twoslash}

`settled` contient la séance 1002, désormais `subtitled: false`. Un worker qui trouve le lock pris reçoit `undefined`, et ne lance rien. Chaque worker envoie :

<!-- probe: db.readCommitted(pool, txnClient => db.sql`SELECT pg_try_advisory_xact_lock(${db.param(3)}, ${db.param(1001)}) AS locked`.run(txnClient)) -->
```sql
START TRANSACTION ISOLATION LEVEL READ COMMITTED
SELECT pg_try_advisory_xact_lock($1, $2) AS locked
-- the job's update(), if locked is true
COMMIT
```

- Le job lance ses requêtes sur `txnClient`, dans la transaction qui détient le lock. Postgres le libère au `COMMIT` ou au `ROLLBACK`, et dès qu’une requête échoue ([`advisoryXactLock()`](/fr/transaction#advisoryXactLock)).
- Le lock empêche deux workers de lancer le job en même temps, pas de le lancer deux fois : un worker qui essaie après le `COMMIT` du premier obtient le lock. Le job laisse donc de côté ce qui est déjà fait, ici les séances dont `subtitled` n’est plus `NULL`.
- Le SQL de la requête du job : [`update()`](/fr/insert#update).

## Attendre plutôt le lock {#wait-for-the-lock-instead}

Quand chaque worker doit passer à son tour, l’un après l’autre, [`advisoryXactLock()`](/fr/transaction#advisoryXactLock) prend le même lock et attend tant qu’une autre transaction le détient : [Retries § Mettre les requêtes en file avec un lock](/fr/retries#queue-the-requests-with-a-lock). pgcast n’a pas de fonction pour le lock qui n’attend pas, donc il va dans `sql`, comme plus haut.

## Voir aussi {#see-also}

- [`advisoryXactLock()`](/fr/transaction#advisoryXactLock) : les clés, et quand Postgres libère le lock.
- [`transaction()`](/fr/transaction#transaction) et [`readCommitted()`](/fr/transaction#readCommitted) : le client sur lequel le job s’exécute.
- [Fonctions d’advisory lock](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS), dans la doc de Postgres.
