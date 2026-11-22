# Job locks

Run on one worker: skip a job another worker is already running. `pg_try_advisory_xact_lock()` in a [`sql`](/sql-template#sql) template, inside [`transaction()`](/transaction#transaction), takes a lock or says that it is taken, without waiting; [`advisoryXactLock()`](/transaction#advisoryXactLock) waits for it.
{.lede}

## Try the lock

Every worker runs the job that settles a cinema's subtitles: a screening before 3 March 2030 whose `subtitled` is still `NULL` becomes `false`. Each worker first tries the job's lock, the pair `[3, 1001]`, 3 for this job and 1001 for the cinema:

<CastPanel example="one_worker">

<<< ./examples/one_worker.ts{ts twoslash}

<template #caption><span>[{ locked: true }]: no other transaction holds the key.</span></template>
</CastPanel>

- `SELECT pg_try_advisory_xact_lock($1, $2)`<!-- probe: examples/one_worker.ts --> answers at once: `true` if the transaction now holds the lock, `false` if another one does. A second worker gets its `false` within milliseconds, where `advisoryXactLock()` would wait.
- The key is a pair of 32-bit integers, or one `bigint`: [`advisoryXactLock()`](/transaction#advisoryXactLock) has the rules, and a key made from a text.
- A `SELECT` with no `FROM` gives one row, so the type is a tuple, `[{ locked: boolean }]`, written by hand.
- On the pool, the lock would go with the query's own transaction, at once: run it on the client of the job's transaction, as below.

## Run the job under the lock

<<< ./examples/plain/one_worker_job.ts{ts twoslash}

`settled` holds screening 1002, now `subtitled: false`. A worker that finds the lock taken gets `undefined`, and runs nothing. Each worker sends:

<!-- probe: db.readCommitted(pool, txnClient => db.sql`SELECT pg_try_advisory_xact_lock(${db.param(3)}, ${db.param(1001)}) AS locked`.run(txnClient)) -->
```sql
START TRANSACTION ISOLATION LEVEL READ COMMITTED
SELECT pg_try_advisory_xact_lock($1, $2) AS locked
-- the job's update(), if locked is true
COMMIT
```

- The job runs its queries on `txnClient`, in the transaction that holds the lock. Postgres releases it at `COMMIT` or `ROLLBACK`, and as soon as a query fails ([`advisoryXactLock()`](/transaction#advisoryXactLock)).
- The lock stops two workers from running the job at the same time, not from running it twice: a worker that tries after the first one's `COMMIT` gets the lock. So the job leaves alone what is done already, here the screenings whose `subtitled` is no longer `NULL`.
- The SQL of the job's query: [`update()`](/insert#update).

## Wait for the lock instead

When every worker must run its turn, one after the other, [`advisoryXactLock()`](/transaction#advisoryXactLock) takes the same lock and waits while another transaction holds it: [Retries § Queue the requests with a lock](/retries#queue-the-requests-with-a-lock). pgcast has no function for the lock that does not wait, so it goes in `sql`, as above.

## See also

- [`advisoryXactLock()`](/transaction#advisoryXactLock): the keys, and when Postgres releases the lock.
- [`transaction()`](/transaction#transaction) and [`readCommitted()`](/transaction#readCommitted): the client the job runs on.
- [Advisory lock functions](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS), in the Postgres docs.
