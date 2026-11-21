# Simple big wins: reference

The test cases of skill `simple-big-wins` that serve a minority of steps; [SKILL.md](SKILL.md) names each section with when to read it.

## Transactions

- **An abort is proved in Postgres**: `COMMIT` answering `ROLLBACK`, as an aborted transaction still accepts `ROLLBACK TO`. A fix that drops a server error replays the caller catching its cause, and drops it only on the status that makes it harmless, so the next statement still surfaces the abort (`RELEASE` gets 25P02): a 34000 of `CLOSE` inside a live block aborts it (#727, #748, #835).
- **Savepoints**: a claim that they stay balanced counts those still established, at depth 2 or more, with the error caught a level above where it was raised: a `RELEASE` tried inside a probe savepoint, rolled back to on 3B001, counts without aborting, highest depth first (releasing `_1` releases `_2`). A fixed name holds only if every exit (resolve, reject, a rethrow as is, a failing rollback) pops exactly one (#727).
- **Per isolation level**, read-only ones included: after the first query Postgres refuses a change of level (25001) but not `READ ONLY`; a lock waited on in the first statement of `REPEATABLE READ` keeps the snapshot from before the wait, so a check-then-insert passes twice, where `SERIALIZABLE` turns it into a 40001 and a retry; such an example runs under `readCommitted()` (#712, #728, #740).
- **A real 40001**: a claim about what follows one is replayed with a real serialisation conflict, a write skew; `RAISE … USING ERRCODE = '40001'` dooms nothing (replay at `REPEATABLE READ` too), and a unique violation becomes 40001 only if the transaction read the key. `transaction()` retries a 40001 its callback's own writes raise, so the caller's `await` resolves; a claim about a failed attempt replays a row deleted between attempts and the plan's evaluation order (#727, #740, #753).
- **`pg`'s status** (`getTransactionStatus()`) is the last ReadyForQuery's: fresh after a query resolves, often stale after one rejects (Postgres flushes the ErrorResponse first: 6 % to 96 % by error), and before an un-awaited `BEGIN` or `COMMIT`. A decision on it reads it again or stays correct when stale, and is tested through a TCP proxy that sends each backend message as its own chunk, or a client that always reports `T` (#728, #748).
- **A lock**: one probe per place it is taken (before the savepoint, inside it) and per error (a query error, a 40001, a JavaScript throw), read from another session's `pg_locks`: Postgres releases the aborting level's locks (the transaction's, or those taken in the savepoint) at the failing query, not at `ROLLBACK` or `ROLLBACK TO`; those taken before the savepoint stay (#728, #835).
- **An iterator's cleanup error** is probed under `for await` and by hand with `finally { await g.return() }`: the first drops it only when the body threw, the second lets it replace the body's (#748).

## Races

- Two transactions overlap only on a warm pool with a sleep inside the lock; `pg_locks` covers the whole server, so it is filtered by `database` (#740).
- The loser retries only after the winner's `COMMIT` has returned: with a 0 ms retry delay the outcome depends on the disk. `commit_delay=<µs>&commit_siblings=0` in the test URL (superuser) recreates CI's slow commits, and a mutant of an ordering wait runs with it (13/30 red without, 30/30 with) (#721).
- A promise of another transaction awaited inside a `transaction()` callback brings its error in, and its 40001 is retried as the callback's own: an ordering stops on the other side's failure (#721).
- A test where one client waits on another's lock rolls back the holder first in `finally`, or it hangs instead of failing (#727).
- Each participant's result is logged, not only the total, before a sentence names who did what (#740).

## Drivers

- **Per version**: a claim about a driver holds on each version of its peer range (postgres.js 4.0.0 is ESM only, reads `timestamp` as UTC and lets the server type parameters) and is replayed per version and time zone before an issue states its defaults; a Postgres claim runs on Postgres, not PGlite. A guard whose bug shows on some versions has its mutant run there. A race is counted per version, in both call orders, with and without an `await` between the calls (one `await` flipped it on every PGlite version), and a test that accepts either outcome pairs with a mutant on each CI leg (#698, #703, #709, #712, #747).
- **A parity table** has a row with a NULL beside the value, a second run of each prepared query, a forced rerun (`DEALLOCATE ALL`, a value that fails at bind), a text of its own where a fresh prepared statement matters, a row at 65,535 parameters with the default `returning` (a column list adds a value), a row per transform key alone (`postgres.camel` sets both), and calls sent at the same moment for shared state (#703, #709).
- **A hand-written protocol client** reads `''` as pg does, the unnamed statement re-parsed each time (a cache by name ran a `SELECT` as a `DELETE`), sends pg's `CopyFail` up front to an embedded backend, and builds a message without spreading each value into a variadic call (V8's limit, about 35,000); a bundle for a runtime without `Buffer` is loaded built with it deleted, as `postgres-bytea` reads it at load (#709).
- **State keyed by identity** (a `WeakMap` per client, `instanceof`) is probed with a `Proxy` of the object and a second copy of the library, which each start from scratch; `Object.create(client)` is no working pg client (#727).
