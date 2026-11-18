# Row security

Let each customer see only their own bookings: a row-level security policy of yours reads a setting, and `setLocal()` sets it for the rest of a transaction. Then why the example sets a role, why a setting lasts one transaction, and what to avoid. It assumes you know [`transaction()`](/transaction#transaction).
{.lede}

## Write the policy

The docs schema enables row-level security on `seat_bookings`, with a policy that keeps the rows whose `customer` is the setting `app.customer`, and a role that may only read them:

```sql
CREATE ROLE cinema_customer NOLOGIN;
GRANT SELECT ON seat_bookings TO cinema_customer;
ALTER TABLE seat_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_bookings ON seat_bookings USING (customer = current_setting('app.customer', true));
```

With `true`, `current_setting()` returns `NULL` for a name this connection has never set (`''` once it has, see [the pitfalls](#avoid-the-pitfalls)), where without `true` it would fail with 42704. The policy is Postgres's: [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Read as the customer

In one [`readCommitted()`](/transaction#readCommitted), [`setLocal()`](/transaction#setLocal) sets the role and the customer, then [`select()`](/select#select) reads every booking the policy lets through:

<<< ./examples/plain/row_security_bookings.ts{ts twoslash}

`bookings` holds Ada Quill's two bookings, C4 and D2, not Felix Ambrose's C5. Its type is `s.seat_bookings.JSONSelectable[]` (hover it), as without a policy: a policy filters rows, never columns. The transaction sends:

<!-- probe: db.readCommitted(pool, txnClient => db.setLocal(txnClient, { role: 'cinema_customer', 'app.customer': 'Ada Quill' })) -->
```sql
START TRANSACTION ISOLATION LEVEL READ COMMITTED
SELECT set_config($1, $2, true), set_config($3, $4, true)
-- the callback's select()
COMMIT
```

The values are `['role', 'cinema_customer', 'app.customer', 'Ada Quill']`, each name and each value a parameter ([`setLocal()`](/transaction#setLocal)).

## Why the role

A policy never binds a superuser or a role with `BYPASSRLS`, even with `FORCE ROW LEVEL SECURITY`, nor the table's owner without it. The docs connect as a superuser, as the insert above does, so the example sets `role` too: the rest of the transaction runs as `cinema_customer`, which the policy binds. At `COMMIT` the role is the session's again.

- A role that is not a superuser may set `role` only to a role it is a member of: `GRANT cinema_customer TO <your app's role>`, or 42501.
- An app that connects as a role that neither owns the table, nor is a superuser, nor has `BYPASSRLS` is bound already, and needs only `app.customer`.

## Why one transaction

`setLocal()` sets each setting until `COMMIT` or `ROLLBACK`, so the next user of a pooled connection never gets it. A session setting, `SET` or `set_config(…, false)`, would stay with the connection, and pgcast has no function for it.

## Avoid the pitfalls

- After the transaction, `current_setting(name, true)` reads `''` on that connection, not `NULL` as on a fresh one, for a name of your own that no database, role or connection sets. A policy that casts it, `current_setting('app.tenant', true)::int`, then fails with 22P02 on the next transaction of that connection that does not set it. Write `NULLIF(current_setting('app.tenant', true), '')::int`.
- A value is text: give `String(tenantId)`, and cast it in the policy. A number does not compile ([`setLocal()`](/transaction#setLocal)).
- Postgres ignores case from `A` to `Z` in a name, so `app.Customer` is `app.customer`. A name of your own needs a dot: 42704 without one, `customer_id`, and 42602 when a part is not an identifier, `app.customer-id`.
- A `ROLLBACK TO` a savepoint taken before the setting, as a [`savepoint()`](/transaction#savepoint) whose callback rejects sends, gives back the value from before that savepoint.
- An attempt that `transaction()` retries starts with none of the last one's settings, as its `ROLLBACK` undid them: set them in the callback, which each attempt runs whole ([Retries](/retries)).
- An interface of settings does not compile, as it has no index signature: spread it, `{ ...context }`.

## See also

- [`setLocal()`](/transaction#setLocal): the SQL, the clients and settings it takes, and when it rejects.
- [`transaction()`](/transaction#transaction): isolation levels and retries; [Retries](/retries): what goes in the callback.
- [Security](/security): what pgcast escapes, and what it can't guard against.
- [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), in the Postgres docs.
