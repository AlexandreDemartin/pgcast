# Configuration

What `zapatos/db` lets you set while your code runs: `setConfig()` and each option of `Config`, the listeners, the opt-ins and their warning codes. Then the types the generated schema gives values that JSON or `pg` hand back as strings, and the helpers that convert them.
{.lede}

## `setConfig()` {#setConfig}

```ts
db.setConfig(newConfig: NewConfig): Config
```

Sets the keys of `newConfig` on the configuration, and leaves the others as they are. There is one configuration per process, shared by `import` and `require`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({
  transactionAttemptsMax: 3,
  transactionRetryDelay: { minMs: 50, maxMs: 500 },
});
```

- The merge is one level deep: `transactionRetryDelay` is replaced whole, so the type needs both `minMs` and `maxMs`.
- A key that has a default and that you give as `undefined` (or `null`) goes back to its default: `setConfig({ transactionRetryDelay: undefined })` sets `{ minMs: 25, maxMs: 250 }`. A listener has none, so `undefined` removes it. Giving `undefined` compiles, except under `exactOptionalPropertyTypes`.
  - Zapatos 6.6.1 set the key to `undefined`. After `transactionAttemptsMax: undefined`, `transaction()` gave up after its first attempt ("… on attempt 1 of undefined, giving up"); after `transactionRetryDelay: undefined`, every `transaction()` rejected with "TypeError: Cannot destructure property 'minMs' of 'config.transactionRetryDelay' as it is undefined." and never released the client it took from a pool ([#246](https://github.com/AlexandreDemartin/pgcast/issues/246)).
- It returns a copy of the new configuration, as `getConfig()` does: changing that object changes nothing. Zapatos 6.6.1 returned the configuration itself ([#245](https://github.com/AlexandreDemartin/pgcast/issues/245)).
- It keeps the `transactionRetryDelay` object you give it, not a copy: changing its `minMs` or `maxMs` afterwards changes the configuration.
- An unknown key does not compile (TS2353), and neither does a value of the wrong type (TS2322):

```ts twoslash
// @errors: 2353
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({ retries: 3 });
```

## `getConfig()` {#getConfig}

```ts
db.getConfig(): Config
```

A copy of the configuration, `transactionRetryDelay` included: `getConfig().transactionRetryDelay.minMs = 1` changes nothing. The listeners are the functions you set. Zapatos 6.6.1 shared `transactionRetryDelay`, so that line changed the configuration ([#245](https://github.com/AlexandreDemartin/pgcast/issues/245)).

To change the configuration for a while, as tests do, keep the copy and give it back in a `finally`, so that a throw in between, a failing test, still restores it:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const saved = db.getConfig();
db.setConfig({ transactionRetryDelay: { minMs: 0, maxMs: 0 } });
try {
  // … the transactions that should retry at once
} finally {
  db.setConfig(saved);
}
```

- It puts back each key `saved` holds.
- A key `saved` doesn't hold stays as set: a listener set in between keeps listening. Give it as `undefined` to remove it: `db.setConfig({ queryListener: undefined })`. Under `exactOptionalPropertyTypes`, which refuses it (TS2379), cast it, as the type has no other way, in Zapatos 6.6.1 too: `{ queryListener: undefined } as unknown as db.NewConfig`.

## `Config` {#Config}

```ts
interface Config {
  transactionAttemptsMax: number;
  transactionRetryDelay: { minMs: number; maxMs: number };
  castArrayParamsToJson: boolean;
  castObjectParamsToJson: boolean;
  upsertRequiresSameKeys?: boolean;
  undefinedMeansMissing?: boolean;
  transactionRequiresCommit?: boolean;
  transactionRequiresIdleClient?: boolean;
  transactionRequiresSatisfyingLevel?: boolean;
  selectExactlyOneChecksForSecondRow?: boolean;
  aggregatesTypedByColumn?: boolean;
  queryListener?(query: SQLQuery, txnId?: number): void;
  resultListener?(result: any, txnId?: number, elapsedMs?: number, query?: SQLQuery): void;
  transactionListener?(message: string, txnId?: number): void;
  transactionEventListener?: (event: TransactionEvent, txnId?: number) => void;
}
```

The keys pgcast adds are optional, so a `Config` written for Zapatos 6.6.1 still compiles; `getConfig()` types them `boolean | undefined`, though it always gives a value. When you set `aggregatesTypedByColumn: false`, also declare it in [`ConfigTypes`](#ConfigTypes).

<div class="stack">

| Option | Default | What it changes | Read |
|---|---|---|---|
| [`transactionAttemptsMax`](#Config.transactionAttemptsMax) | `5` | how many times `transaction()` runs its callback | at each `transaction()` |
| [`transactionRetryDelay`](#Config.transactionRetryDelay) | `{ minMs: 25, maxMs: 250 }` | the wait before each retry | at each `transaction()` |
| [`castArrayParamsToJson`](#Config.castArrayParamsToJson) | `false` | an array parameter: `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1])}`) --> in place of `$1` | at each `compile()` |
| [`castObjectParamsToJson`](#Config.castObjectParamsToJson) | `false` | a plain object parameter: `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castObjectParamsToJson: true }), db.sql`${db.param({ a: 1 })}`) --> in place of `$1` | at each `compile()` |
| [`upsertRequiresSameKeys`](#Config.upsertRequiresSameKeys) | `true` | By default, a batch upsert throws at construction if its implicit update includes a column missing from any row, unless the conflict target names it or `updateValues` gives it a defined value. Explicit `updateColumns` skips the check. With `noNullUpdateColumns` alone, it still applies. | at each `upsert()` |
| [`undefinedMeansMissing`](#Config.undefinedMeansMissing) | `true` | an `undefined` value in `insert()`, `update()` and `upsert()`: treat it as a missing key | at each call of those |
| [`transactionRequiresCommit`](#Config.transactionRequiresCommit) | `true` | a `COMMIT` that Postgres answers with `ROLLBACK`: reject, not resolve | at each `transaction()` |
| [`transactionRequiresIdleClient`](#Config.transactionRequiresIdleClient) | `true` | reject before `START TRANSACTION` only if your unmarked client reports `T` or `E` both before and after the empty query. Without a status, the call proceeds | at each `transaction()` given such a client |
| [`transactionRequiresSatisfyingLevel`](#Config.transactionRequiresSatisfyingLevel) | `true` | the client of a transaction at a level that doesn't satisfy the one asked for: reject, not run the callback at that level | at each `transaction()` given such a client |
| [`selectExactlyOneChecksForSecondRow`](#Config.selectExactlyOneChecksForSecondRow) | `false` | a standalone `selectExactlyOne()` requests two rows and rejects on a second | at each `selectExactlyOne()` |
| [`aggregatesTypedByColumn`](#Config.aggregatesTypedByColumn) | `true` | `sum()`, `avg()`, `min()` and `max()`: `null` when no row matches, and `min()` and `max()` the column's value, not `Number()` of it | at each `run()` of those |
| [`queryListener`](#Config.queryListener) | none | called with each query `run()` sends | at each `run()` |
| [`resultListener`](#Config.resultListener) | none | called with each result `run()` gives | at each `run()` |
| [`transactionListener`](#Config.transactionListener) | none | called when an attempt of `transaction()` fails with `40001` or `40P01`, and at each retry | at each `transaction()` |
| [`transactionEventListener`](#Config.transactionEventListener) | none | called right after `transactionListener`, with a [`TransactionEvent`](#TransactionEvent) in place of the message | at each `transaction()` |

</div>

### `transactionAttemptsMax` {#Config.transactionAttemptsMax}

```ts
transactionAttemptsMax: number  // default: 5
```

How many times [`transaction()`](/transaction#transaction) runs its callback. After a serialisation failure (`40001`) or a deadlock (`40P01`), it rolls back and runs the callback again, until this many attempts have failed; then it throws the last error. Any other error is rolled back and thrown at once.

- `1`, `0`, a negative value or `NaN`: one attempt, no retry, and the message reads "… on attempt 1 of 1, giving up". A fraction is rounded up: `2.5` makes three attempts.
- Read when `transaction()` starts, so a change affects the next transaction, not the one running.
- How to write a callback that can run twice: [Retries](/retries).

### `transactionRetryDelay` {#Config.transactionRetryDelay}

```ts
transactionRetryDelay: { minMs: number; maxMs: number }  // default: { minMs: 25, maxMs: 250 }
```

Before each retry, `transaction()` waits a whole number of milliseconds from `minMs` to `maxMs`, rounded from a uniform draw between them: `Math.round(minMs + (maxMs - minMs) * Math.random())`. So `minMs` and `maxMs` come up half as often as each value between them. [`transactionListener`](#Config.transactionListener) is told the wait, and [`transactionEventListener`](#Config.transactionEventListener) gets it as `delayMs`.

### `castArrayParamsToJson` {#Config.castArrayParamsToJson}

```ts
castArrayParamsToJson: boolean  // default: false
```

With `true`, every array sent as a parameter is sent as JSON: `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1])}`) -->, its value `JSON.stringify()`'d. That is `param(x)`, and the values of the shortcuts and Whereables, which are parameters too. Off, `pg` sends an array as a Postgres array.

A string cast wins ([#36](https://github.com/AlexandreDemartin/pgcast/issues/36)); Zapatos 6.6.1 dropped it for `"json"`:

- An array whose cast ends with `[]` or `[n]` is sent as an array: `param([1, 2], 'int4[]')` gives `CAST($1 AS "int4"[])`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1, 2], 'int4[]')}`) -->.
- Any other array keeps the JSON, `'_int4'` and a domain over an array included: `param([1, 2], 'jsonb')` gives `CAST($1 AS "jsonb")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1, 2], 'jsonb')}`) -->.

<CastPanel example="castArrayParamsToJson">

<<< ./examples/castArrayParamsToJson.ts{ts twoslash}

</CastPanel>

- Off, the same query fails: `json_array_length($1)` gives 22P02 "invalid input syntax for type json". `param(x, true)` sends the array as JSON under either setting.
- On a Postgres array column, Postgres refuses an array sent as JSON: 42804 "column "genres" is of type text[] but expression is of type json" in an `insert()` or `update()`, 42883 "operator does not exist: text[] = json" in a Whereable, and "… text[] && json" with [`arrayOverlaps()`](/conditions#conditions.arrayOverlaps).
- In an `insert()`, an `update()` or a Whereable, `db.param(genres, 'text[]')` sends it as an array. The array conditions refuse a `Parameter` of the array ([#40](https://github.com/AlexandreDemartin/pgcast/issues/40)): compare in a [`sql` fragment](/conditions#arrays) there.
- `param(x, false)` sends the array as it is, under either setting: `{ genres: db.param(['mystery', 'drama'], false) }` gives `SET ("genres") = ROW($1)`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.update('films', { genres: db.param(['mystery', 'drama'], false) }, { id: 1000 })) -->.
- The items of `isIn()` are parameters one by one, so an array of numbers there is unchanged: `"id" IN ($1, $2)`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${{ id: db.conditions.isIn([1000, 1001]) }}`) -->.
- How `param()` compiles each `cast`: [`param()`](/sql-template#param).

### `castObjectParamsToJson` {#Config.castObjectParamsToJson}

```ts
castObjectParamsToJson: boolean  // default: false
```

With `true`, every plain object sent as a parameter is sent as `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castObjectParamsToJson: true }), db.sql`${db.param({ a: 1 })}`) -->, its value `JSON.stringify()`'d. Off, it is `$1`, and `pg` sends the same JSON text, with no type: Postgres then infers one from where `$1` stands.

A string cast wins, the value still JSON text: `param({ a: 1 }, 'jsonb')` gives `CAST($1 AS "jsonb")`<!-- probe: (db.setConfig({ castObjectParamsToJson: true }), db.sql`${db.param({ a: 1 }, 'jsonb')}`) -->, which `=` and `@>` on a `jsonb` column take ([#36](https://github.com/AlexandreDemartin/pgcast/issues/36)); Zapatos 6.6.1 dropped it for `"json"`, which they refuse (42883).

<CastPanel example="castObjectParamsToJson">

<<< ./examples/castObjectParamsToJson.ts{ts twoslash}

</CastPanel>

- Off, the same query fails: `$1 ->> 'title'` gives 42725 "operator is not unique: unknown ->> unknown". A cast in the SQL, `$1::jsonb`, works either way.
- A plain object is an object literal, `{…}`: a `Date`, a `Buffer` or a class instance is sent as `$1`, unchanged.
- `param(x, false)` gives `$1`<!-- probe: db.sql`${db.param({ a: 1 }, false)}` --> under either setting; `param(x, true)` gives `CAST($1 AS "json")`<!-- probe: db.sql`${db.param({ a: 1 }, true)}` -->.

### `upsertRequiresSameKeys` {#Config.upsertRequiresSameKeys}

From 7.0.0. The default is now `true`.

```ts
upsertRequiresSameKeys?: boolean  // default: true
```

By default, a batch upsert throws at construction if its implicit update includes a column missing from any row, unless the conflict target names it or `updateValues` gives it a defined value. Explicit `updateColumns` skips the check. With `noNullUpdateColumns` alone, it still applies. Error: "rows have different keys: pass updateColumns, or give every row the same keys"<!-- message -->.

With `false`, the missing key can overwrite the stored value without a warning. See [Rows with different keys](/insert#upsert-different-keys).

### `undefinedMeansMissing` {#Config.undefinedMeansMissing}

From 7.0.0. The default is now `true`.

```ts
undefinedMeansMissing?: boolean  // default: true
```

With `true`, an `undefined` value in [`insert()`](/insert#insert), [`update()`](/insert#update) and [`upsert()`](/insert#upsert) is a missing key: `DEFAULT` in `insert()`, left out of `update()` and `upsert()`, its `updateValues` included. With `false`, it is sent as `NULL` (in `updateValues`, set from `EXCLUDED`), as in Zapatos 6.6.1, without a warning. The SQL of each: [An `undefined` value](/insert#undefined-values).

### `transactionRequiresCommit` {#Config.transactionRequiresCommit}

From 7.0.0. The default is now `true`.

```ts
transactionRequiresCommit?: boolean  // default: true
```

If Postgres answers the `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> of [`transaction()`](/transaction#transaction) with the command tag `ROLLBACK`, nothing is saved.

With `true`, `transaction()` then rejects, without a retry, with "the transaction was rolled back, not committed: a query in it failed and the callback caught the error, so Postgres answered COMMIT with ROLLBACK; let the error out of the callback, or ROLLBACK TO a SAVEPOINT before going on"<!-- message -->.

With `false`, it resolves quietly with the callback result. See [Let the error through](/retries#let-the-error-through).

- Not covered: a callback that sends `COMMIT` or `ROLLBACK` itself.
- Not tested with `pg-native`.

### `transactionRequiresIdleClient` {#Config.transactionRequiresIdleClient}

From 7.0.0. The default is now `true`.

```ts
transactionRequiresIdleClient?: boolean  // default: true
```

Given a client you opened a transaction on yourself, with `BEGIN`, [`transaction()`](/transaction#transaction) would end your transaction: its `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> commits it, or its `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw 0; }) --> undoes it ([Your own `BEGIN`](/transaction#your-own-begin)).

With `true`, it rejects before sending its `START TRANSACTION`, with "transaction() was given a client inside a transaction block, so its COMMIT or ROLLBACK would end that transaction: COMMIT or ROLLBACK it first, or run the queries on that client without transaction()"<!-- message -->. Your transaction stays open, for your `COMMIT` or `ROLLBACK`.

With `false`, it skips the status recheck and sends `START TRANSACTION` without a pgcast warning, as in Zapatos 6.6.1.

- pg says whether a client is in a block from pg 8.21 (`getTransactionStatus()`). On older versions, `transaction()` runs as in 6.6.1, option or not, with no warning.
- With `true`, when pg reports a block, `transaction()` first sends an empty query, to read the status again; [`queryListener`](#Config.queryListener) and [`resultListener`](#Config.resultListener) get it, with the transaction's id ([Your own `BEGIN`](/transaction#your-own-begin)).
- During the recheck, the first call's marker holds its requested level. By default, a second call runs its callback on that client only if the marked level satisfies its request. In an open block, its queries run at that block's level.
- Only a client you pass is checked: one the pool hands out, released while still in a block, is not.
- A `BEGIN` you sent without `await` is not seen yet: the client reads as outside a block.
- A `BEGIN` sent in one query string with a statement that fails can read as outside a block too: `transaction()` then runs as in 6.6.1, with no warning.
- Not tested with `pg-native`.
- If pg still reports a block after a failed `COMMIT`, the recheck can find the client idle. Writes from a second callback can commit separately before the first call's `START TRANSACTION` or after its transaction ends.

### `transactionRequiresSatisfyingLevel` {#Config.transactionRequiresSatisfyingLevel}

From 7.0.0. The default is now `true`.

```ts
transactionRequiresSatisfyingLevel?: boolean  // default: true
```

A nested callback runs at the outer transaction's isolation level. A `serializable()` request on a `readCommitted()` client therefore cannot provide the requested isolation ([Passing a transaction through](/transaction#passing-a-transaction-through)).

With `true`, when that level doesn't satisfy the one asked for ([`IsolationSatisfying`](/transaction#IsolationSatisfying)), it rejects before calling its callback, with "transaction() at … was given the client of a transaction at …, so its callback would run at …: open the outer transaction at a level that satisfies … (IsolationSatisfying)"<!-- message -->, each `…` a level of the call (`SERIALIZABLE`, `READ COMMITTED`). Unless the outer callback catches it, the outer transaction then rolls back.

With `false`, an insufficient level also passes through without a warning.

- With or without the option, the call passes the client through if its level appears in the requested level's row of the [isolation table](/transaction#IsolationSatisfying).
- Only the client of a `transaction()` is checked, by its `_zapatos` mark, which a plain client also carries while a `transaction()` runs on it, so a second call at the same moment on that client is checked: a pool, an idle plain client and a client kept after its transaction ended get a transaction of their own, as before.
- The types don't change: a `Queryable` takes the client of any level ([`TxnClient`](/transaction#TxnClient)).
- A test that runs code inside a `transaction()` of its own, and hands it that client: open it at `IsolationLevel.Serializable`, which satisfies every level.

### `selectExactlyOneChecksForSecondRow` {#Config.selectExactlyOneChecksForSecondRow}

```ts
selectExactlyOneChecksForSecondRow?: boolean  // default: false, in 7.0 too
```

With the check enabled and `withTies` off, a [`selectExactlyOne()`](/select#selectExactlyOne) run on its own asks for two rows, `LIMIT $2`<!-- probe: (db.setConfig({ selectExactlyOneChecksForSecondRow: true }), db.selectExactlyOne('films', { id: 1000 })) --> with `2`, and `.run()` rejects with a [`NotExactlyOneError`](/select#NotExactlyOneError) when a second row comes: "One result expected but more returned (hint: check `.query.compile()` on this Error)"<!-- message -->. With both off, it asks for one, `LIMIT 1`, and gives the first row that matches, as in Zapatos 6.6.1.

- Nested in a `lateral` or a `sql` template, or copied with [`.copy()`](/sql-template#copy), it requests one row.
- [`withTies: true`](/select#order-limit-offset-and-withties) compiles each limit as `FETCH FIRST … ROWS WITH TIES`. A nested query can return all ties. A standalone copy still requests one row plus ties and rejects with `NotExactlyOneError` if it gets a second row with the check enabled.
- With a [`lock`](/select#lock), `LIMIT $2` locks the second row too: after `.run()` rejects, both rows stay locked until the transaction ends, and another session's `FOR UPDATE NOWAIT` on either gets 55P03.
- Off, it never warns, and it stays off in 7.0: "at least one row" is how Zapatos reads `selectExactlyOne()`, nested in a `lateral` on a `NOT NULL` foreign key ([decision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md)).
- Read when `selectExactlyOne()` is called, not at `.run()`.

### `aggregatesTypedByColumn` {#Config.aggregatesTypedByColumn}

```ts
aggregatesTypedByColumn?: boolean  // default: true
```

From 7.0.0. By default, [`sum()`](/select#sum), [`avg()`](/select#avg), [`min()`](/select#min) and [`max()`](/select#max) give `null` when no row matches, and `min()` and `max()` give the column's value as `pg` reads it: with the default parsers, a `Date` for a finite `timestamptz` and a string for `text` or an enum. The SQL doesn't change, nor does [`count()`](/select#count).

With `false`, `.run()` applies `Number()` to the result. An empty set gives `0`, a finite date read as a `Date` gives its epoch milliseconds and non-numeric text gives `NaN`. This setting runs silently through 7.x and goes in 8.0.

- For the 6.x types, also declare `false` in [`ConfigTypes`](#ConfigTypes). An existing `true` declaration still works.
- Under a `lateral` key or as an `extras` value, the value comes back as JSON, option or not, and `null` when no row matches; by default it is typed as its column's `JSONSelectable`.
  - For a [passed-through `lateral`](/select#lateral), calling `.run()` on the outer `selectOne()`, `selectExactlyOne()` or `selectRows()` gives the column as `pg` parses it. An outer `select()` gives JSON. [`selectRows()`](/select#selectRows) refuses a direct numeric fragment such as `count()` at compile time.
- Each `.run()` reads the setting, even for a query built before `setConfig()`. Set it to `true` to restore the default. JavaScript also accepts `null` or `undefined`. TypeScript rejects `null` with `strictNullChecks` and `undefined` with `exactOptionalPropertyTypes`. A query that returns no row then gives `null`.
- Examples, and each type: [Typed by column](/select#typed-by-column).

### `queryListener` {#Config.queryListener}

```ts
queryListener?(query: SQLQuery, txnId?: number): void
```

Called by [`run()`](/sql-template#run) once the query is compiled, before it is sent.

- `query`: the [`SQLQuery`](#SQLQuery) `run()` sends, `{ text, values }`, and `name` once [prepared](/sql-template#prepared).
- `txnId`: in a [transaction](#transaction-ids), its id; otherwise `undefined`.
- It is called for a no-op fragment too, which sends nothing: `insert('tags', [])` gives `/* marked no-op: won't hit DB unless forced -> */ INSERT INTO "tags" SELECT null WHERE false`<!-- probe: db.insert('tags', []) -->.
- It is not called when compiling throws. If it throws, `run()` rejects, and the query is not sent.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({
  queryListener: (query, txnId) =>
    console.log(`(${txnId ?? '-'})`, query.text, query.values),
  resultListener: (result, txnId, elapsedMs) =>
    console.log(`(${txnId ?? '-'}, ${elapsedMs?.toFixed(1)}ms)`, result),
  transactionListener: (message, txnId) =>
    console.log(`(${txnId})`, message),
});
```

### `resultListener` {#Config.resultListener}

```ts
resultListener?(result: any, txnId?: number, elapsedMs?: number, query?: SQLQuery): void
```

Called by `run()` with what it resolves to, once [`runResultTransform`](/sql-template#runResultTransform) has run.

- `result`: `{ title: 'The Salt Orchard' }` for `selectOne('films', { id: 1000 }, { columns: ['title'] })`, a number for `count()`, `[]` for a no-op.
- `txnId`: as for [`queryListener`](#Config.queryListener).
- `elapsedMs`: from just before the query is sent to just after the transform, from `performance.now()`, in fractions of a millisecond.
- `query`: the query, as `queryListener` got it.
- It is not called when the query rejects, nor when the transform throws (a `selectExactlyOne()` that finds no row).

### `transactionListener` {#Config.transactionListener}

```ts
transactionListener?(message: string, txnId?: number): void
```

Called by `transaction()` when an attempt fails with `40001` or `40P01`, and again when the next attempt starts, with one of these messages and the transaction's id:

| When | Message |
|---|---|
| an attempt failed, another is left | `` `Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, retrying in ${delayBeforeRetry}ms` ``<!-- message --> |
| the next attempt starts | `` `Retrying transaction, attempt ${attempt} of ${maxAttempts}` ``<!-- message --> |
| the last attempt failed | `` `Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, giving up` ``<!-- message --> |

With `transactionAttemptsMax: 3` and `transactionRetryDelay: { minMs: 1, maxMs: 2 }`, a callback that fails with `40001` each time gives `Transaction rollback (code 40001) on attempt 1 of 3, retrying in 1ms`<!-- message -->, `Retrying transaction, attempt 2 of 3`<!-- message -->, then the same for attempt 2, and `Transaction rollback (code 40001) on attempt 3 of 3, giving up`<!-- message -->.

It is not called for a transaction that commits on its first attempt, nor for any other error.

### `transactionEventListener` {#Config.transactionEventListener}

```ts
transactionEventListener?: (event: TransactionEvent, txnId?: number) => void
```

From 6.12.0. Called by `transaction()` right after [`transactionListener`](#Config.transactionListener), at the same three points, with a [`TransactionEvent`](#TransactionEvent) that holds the message's numbers, and the transaction's id after it. Each listener is called if it is set, the other or not. So a log or a metric reads the kind of event, the code and the attempt as fields, not from the text:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({
  transactionEventListener: (event, txnId) =>
    console.log(JSON.stringify({ txnId, ...event })),
});
```

On a `40001` at the first of five attempts, this prints `{"txnId":0,"type":"rollback","code":"40001","attempt":1,"maxAttempts":5,"delayMs":97}`, `delayMs` being the wait drawn from [`transactionRetryDelay`](#Config.transactionRetryDelay), then `{"txnId":0,"type":"retry","attempt":2,"maxAttempts":5}`.

- As for `transactionListener`, it is not called for a transaction that commits on its first attempt, for any other error, or by a `transaction()` given the client of a transaction, which passes it through.
- If it throws, `transaction()` rejects with its error, as when `transactionListener` throws: once `ROLLBACK` is sent, and the client is released. An error that it throws at `retry` with a `code` of `40001` or `40P01` counts as that attempt's failure, which is retried while an attempt is left, as any `40001`.
- It is a property, where the other listeners are methods: a listener typed for some of the events, which would read a key the others lack, doesn't compile under `strict` (`strictFunctionTypes`).
- Zapatos 6.6.1 has no such option ([Go back](/switching#go-back)).

### Transaction ids {#transaction-ids}

The `txnId` the listeners get.

- Each `transaction()` call that opens a transaction takes the next id: `0` for the first in the process, then `1`…
- Every query `run()` sends on its client gets that id, through every retry: yours, and `transaction()`'s own `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.serializable(pool, async () => {}) -->, `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> and `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw new Error(); }) -->, which go through both query listeners like any other.
- A `transaction()` given that client opens no transaction, and its queries keep the outer id.
- Outside a transaction, and on the client once it has ended, the id is `undefined`.

## `NewConfig` {#NewConfig}

```ts
type NewConfig = Partial<Config>
```

What [`setConfig()`](#setConfig) takes: any keys of `Config`, each one whole.

## `ConfigTypes` {#ConfigTypes}

```ts
interface ConfigTypes { }
```

From 6.7.0. The options of `Config` that change a type, declared as you set them, since TypeScript can't read `setConfig()`. An empty interface uses the 7.0 defaults. For 6.x numeric aggregates, declare the option once, in a module your `tsconfig.json` includes, a file with an `import` or an `export`, and set the option to match:

```ts twoslash
import * as db from 'zapatos/db';

declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: false }
}

db.setConfig({ aggregatesTypedByColumn: false });
```

A `.d.ts` that holds only the declaration needs `export {}`: without it, the file declares a `zapatos/db` of its own, which hides the package's (`db.min`, `db.all` and the rest are gone).

```ts
// pgcast.d.ts
export {};

declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: false }
}
```

With [`moduleNames: "pgcast"`](/generator#generate.moduleNames), it is `declare module 'pgcast/db'`. The only key it reads is [`aggregatesTypedByColumn`](#Config.aggregatesTypedByColumn).

## `SQLQuery` {#SQLQuery}

```ts
interface SQLQuery { text: string; values: any[]; name?: string }
```

A compiled query, as `pg`'s `query()` takes it: what [`compile()`](/sql-template#compile) returns and the listeners get. `name` is set by [`prepared()`](/sql-template#prepared).

## `TransactionEvent` {#TransactionEvent}

```ts
type TransactionEvent =
  | { type: 'rollback'; code: '40001' | '40P01'; attempt: number; maxAttempts: number; delayMs: number }
  | { type: 'retry'; attempt: number; maxAttempts: number }
  | { type: 'giveUp'; code: '40001' | '40P01'; attempt: number; maxAttempts: number };
```

From 6.12.0. What [`transactionEventListener`](#Config.transactionEventListener) gets, one per message of [`transactionListener`](#Config.transactionListener):

| `type` | When | Its message |
|---|---|---|
| `rollback` | an attempt failed, another is left: before the wait of `delayMs` | `` `Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, retrying in ${delayBeforeRetry}ms` ``<!-- message --> |
| `retry` | the next attempt starts, before its `START TRANSACTION` | `` `Retrying transaction, attempt ${attempt} of ${maxAttempts}` ``<!-- message --> |
| `giveUp` | the last attempt failed, before `transaction()` rejects | `` `Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, giving up` ``<!-- message --> |

- `code` is the error's `code`, as the message prints it: a string, though `isDatabaseError()` also matches a `String` object.
- `attempt` counts from 1. `maxAttempts` is the attempts `transaction()` makes, which the message counts too: `1` for a `transactionAttemptsMax` of `0`.
- `type` narrows the event: `event.delayMs` compiles only after `event.type === 'rollback'`.

## Opt-ins and warnings

In 6.x, [`undefinedMeansMissing`](#Config.undefinedMeansMissing), [`upsertRequiresSameKeys`](#Config.upsertRequiresSameKeys), [`transactionRequiresCommit`](#Config.transactionRequiresCommit), [`aggregatesTypedByColumn`](#Config.aggregatesTypedByColumn), [`transactionRequiresIdleClient`](#Config.transactionRequiresIdleClient) and [`transactionRequiresSatisfyingLevel`](#Config.transactionRequiresSatisfyingLevel) were opt-ins whose old behaviour triggered warnings. In 7.0, all six are on by default and none warns. An explicit `false` keeps the old behaviour without warnings through 7.x (see [Versions](/versions) and the [7.0 migration](/switching#from-7-0)).

One opt-in stays off by default in 7.0 and emits no warning: [`selectExactlyOneChecksForSecondRow`](#Config.selectExactlyOneChecksForSecondRow), since 6.6.1's reading of `selectExactlyOne()`, at least one row, is one Zapatos documents.

From 7.0, the generator enables [`domainsTypedByContext`](/generator#generate.domainsTypedByContext), [`enumArraysTypedAsText`](/generator#generate.enumArraysTypedAsText) and [`intervalsTypedAsObjects`](/generator#generate.intervalsTypedAsObjects) by default without migration notes. Its [`domainsTypedAsUnions`](/generator#generate.domainsTypedAsUnions) has no note, and stays off in 7.0. From 7.0, [`typeEnumsAcrossSchemas`](/generator#generate.typeEnumsAcrossSchemas) and [`enumOrder`](/generator#generate.enumOrder) use the enum's own schema and declaration order by default, without a migration note. The generator also enables [`uniqueIndexConstraintsOnly`](/generator#generate.uniqueIndexConstraintsOnly) by default without a migration note.

In pgcast 6.7.0, a programmatic generator could send `PGCAST_DEP006` through [`warningListener`](/generator#generate.warningListener) before exiting on a database error. From 7.0, [`rejectOnQueryError`](/generator#generate.rejectOnQueryError) defaults to `true`. Explicit `false` keeps the immediate exit without a migration note.

In 6.x Node emits each [migration warning](/switching#read-the-warnings) once per process and names the option in its message. For example, in pgcast 6.7.0 a rolled-back commit produced this warning on `stderr`:

```txt
(node:4242) [PGCAST_DEP003] DeprecationWarning: transaction() resolved, but Postgres answered its COMMIT with ROLLBACK: a query failed and the callback caught the error, so nothing was saved. Set transactionRequiresCommit: true (db.setConfig) to reject instead; it will be the default in pgcast 7.0.
```

- `process.on('warning', …)` received it in 6.x, with `name` `'DeprecationWarning'` and `code` `'PGCAST_DEP003'`.
- `node --no-deprecation` hides it, from that hook too; `node --no-warnings` hides it from `stderr` only. `node --throw-deprecation` throws it, uncaught, so the process ends.
- With the option on, the call never warns.

To pick out pgcast's warnings in that hook, to log them your way: `@types/node` types the warning `Error`, which has no `code`, so say it may have one. Node still prints each warning to `stderr`; run with `node --no-warnings` to leave the hook's as the only output.

```ts twoslash
process.on('warning', (warning: Error & { code?: string }) => {
  if (warning.code?.startsWith('PGCAST_')) console.warn(warning.code, warning.message);
});
```

## Value types

`pg` and JSON give some Postgres values as strings. The generated schema types them with the template string types below, by where the value is ([The catalog](/catalog-types)):

| Postgres type | `Selectable` | `JSONSelectable` | `Insertable`, `Updatable`, `Whereable` |
|---|---|---|---|
| `int8` | [`Int8String`](#Int8String) | `number` | `number \| Int8String \| bigint` |
| `numeric` | [`NumericString`](#NumericString) | `number` | `number \| NumericString` |
| `bytea` | `Buffer` | [`ByteArrayString`](#ByteArrayString) | `ByteArrayString \| Buffer` |
| `date` | `Date` | [`DateString`](#DateString) | `DateString \| Date` |
| `timestamp` | `Date` | [`TimestampString`](#TimestampString) | `TimestampString \| Date` |
| `timestamptz` | `Date` | [`TimestampTzString`](#TimestampTzString) | `TimestampTzString \| Date` |
| `time` | [`TimeString`](#TimeString) | `TimeString` | `TimeString` |
| `timetz` | [`TimeTzString`](#TimeTzString) | `TimeTzString` | `TimeTzString` |
| `int4range`, `int8range`, `numrange` | [`NumberRangeString`](#NumberRangeString) | `NumberRangeString` | `NumberRangeString` |
| `tsrange`, `tstzrange`, `daterange` | [`DateRangeString`](#DateRangeString) | `DateRangeString` | `DateRangeString` |
| `json`, `jsonb` | [`JSONValue`](#JSONValue) | `JSONValue` | `JSONValue` |

- In a `Selectable`, `int8[]` gives `Int8String[]`. A raw [enum array](/generator#generate.enumArraysTypedAsText) is text by default.
- With the generator's [`customJSONParsingForLargeNumbers`](/generator#generate.customJSONParsingForLargeNumbers), `int8` and `numeric` are `number | Int8String` and `number | NumericString` in a `JSONSelectable` ([`enableCustomJSONParsingForLargeNumbers()`](#enableCustomJSONParsingForLargeNumbers)).
- The shortcuts return `JSONSelectable`s. A `Selectable` is what `pg` returns for a plain `SELECT` of the row.
- A domain follows its base type in each context while its placeholder holds the generated type ([`DomainInContext`](#DomainInContext)). [`domainsTypedByContext: false`](/generator#generate.domainsTypedByContext) uses the placeholder, except in raw rows for a [direct domain over an enum array](/switching#domain-and-parser-types). There, `enumArraysTypedAsText: false` alone restores the placeholder. For interval domains, `intervalsTypedAsObjects` determines the type of a fresh placeholder.
- An `interval` gives a [`PostgresInterval`](#PostgresInterval) in `Selectable`, a `string` in JSON and `string | PostgresInterval` in a write. With [`intervalsTypedAsObjects: false`](/generator#generate.intervalsTypedAsObjects), all five interfaces use `string`.

Each type checks the shape of a string, not its value: `'2030-13-45'` is a `DateString`.

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
const opening: db.DateString = '2030-03-01';
const premiere: db.TimestampTzString = '2030-03-01T19:30:00';
```

### `DomainInContext` {#DomainInContext}

```ts
type DomainInContext<Custom, Generated, InContext> =
  (<T>() => T extends Custom ? 1 : 2) extends (<T>() => T extends Generated ? 1 : 2) ? InContext : Custom
```

The type that the generator's [`domainsTypedByContext`](/generator#generate.domainsTypedByContext) writes for a column of a domain, in `JSONSelectable`, `Whereable`, `Insertable` and `Updatable`, and in `Selectable` too for a domain over a domain or an array of a domain: `InContext`, its base type's type there, while the placeholder `Custom` is still exactly `Generated`, the type the generator wrote in it; otherwise `Custom`, as with `domainsTypedByContext: false`.

- `DomainInContext<db.Int8String, db.Int8String, number>` is `number`: a placeholder left as generated.
- `DomainInContext<number | db.Int8String, db.Int8String, number>` is `number | db.Int8String`: an edited placeholder keeps its type, in every context.
- An `any` stays `any`, and an `any[]` stays `any[]`, such as a placeholder Zapatos 6.6.1 wrote over `int8[]` with no import. A placeholder edited to the same type, `` `${number}` `` for `db.Int8String`, counts as left as generated.
- `DomainInContext<any, any, number>` is `number`: a domain over a domain, whose placeholder the generator wrote as `any`. Edited to `unknown`, it stays `unknown`.

### `PostgresInterval` {#PostgresInterval}

```ts
interface PostgresInterval {
  years?: number; months?: number; days?: number; hours?: number;
  minutes?: number; seconds?: number; milliseconds?: number;
  toPostgres(): string;
  toISO(): string;
}
```

An `interval` as `pg`'s default type parser returns it, which the generator's [`intervalsTypedAsObjects`](/generator#generate.intervalsTypedAsObjects) writes in `Selectable`: each part that isn't zero, `{ minutes: 15 }` for `'00:15:00'`, and `{}` for a zero interval. `toPostgres()` gives the text `pg` writes back, `'15 minutes'`; `toISO()`, ISO 8601, `'P0Y0M0DT0H15M0S'`.

- It is the shape of `postgres-interval`'s `PostgresInterval`, which `pg` 7 and 8 bring through `pg-types`, written out: pgcast doesn't depend on that package.
- A plain object isn't one: without `toPostgres()`, `pg` sends it as JSON. Postgres 17 and later refuse it (22007), and Postgres 16 and earlier store something else: `00:00:15` for `{ minutes: 15 }`.

## JSON {#json}

### `JSONValue` {#JSONValue}

```ts
type JSONValue = null | boolean | number | string | JSONObject | JSONArray
```

A value JSON can hold: the type of a `json` or `jsonb` column. `undefined`, a `Date` and a function are not one.

### `JSONObject` {#JSONObject}

```ts
type JSONObject = { [k: string]: JSONValue }
```

A JSON object, each value a `JSONValue`: the `vars` of [`jsonbPathExists()`](/conditions#conditions.jsonbPathExists).

### `JSONArray` {#JSONArray}

```ts
type JSONArray = JSONValue[]
```

A JSON array, each item a `JSONValue`.

## Large numbers {#large-numbers}

### `Int8String` {#Int8String}

```ts
type Int8String = `${number}`
```

An `int8` as `pg` returns it, a string: `'9007199254740993'`, which no `number` holds.

### `NumericString` {#NumericString}

```ts
type NumericString = `${number}`
```

A `numeric` as `pg` returns it, a string that keeps its digits: `'1.10'`.

### `enableCustomJSONParsingForLargeNumbers()` {#enableCustomJSONParsingForLargeNumbers}

```ts
db.enableCustomJSONParsingForLargeNumbers(pg: typeof import('pg')): void
```

Makes `pg` parse `json` and `jsonb` values with [json-custom-numbers](https://www.npmjs.com/package/json-custom-numbers), which gives a number as a string when a `number` would change it. Each shortcut except the aggregates returns `jsonb`, so it applies to their results.

```ts twoslash
import * as db from 'zapatos/db';
import pg from 'pg';
// ---cut---
db.enableCustomJSONParsingForLargeNumbers(pg);
```

| A number in JSON | `JSON.parse()`, the default | Once enabled |
|---|---|---|
| `12`, `0.1` | `12`, `0.1` | `12`, `0.1` |
| `9007199254740993` | `9007199254740992` | `'9007199254740993'` |
| `9007199254740992`, an integer past `Number.MAX_SAFE_INTEGER` | `9007199254740992` | `'9007199254740992'` |
| `1.00000000000000000001` | `1` | `'1.00000000000000000001'` |
| a `numeric` past `Number.MAX_VALUE` | `Infinity` | its digits, as a string |

- Direct [`count()`](/select#count), `sum()` and `avg()` convert non-null values with `Number()`. Direct `min()` and `max()` use the pg value by default and `Number()` with runtime `aggregatesTypedByColumn: false`. Under a lateral key the outer JSON parser applies, so enabling it preserves large numbers there.
- It sets the type parsers of the `pg` module you give, so every pool and client of that module, from then on, pgcast's queries or not.
- It does not change the types: the generator's [`customJSONParsingForLargeNumbers`](/generator#generate.customJSONParsingForLargeNumbers) does.
- An `int8` or `numeric` column outside JSON is a string already, by `pg`'s own parser.

## Ranges {#ranges}

### `RangeString` {#RangeString}

```ts
type RangeString<Bound extends string | number> = `${'[' | '('}${RangeBound<Bound>},${RangeBound<Bound>}${']' | ')'}` | 'empty'
type RangeBound<Bound extends string | number> = Bound | (number extends Bound ? 'Infinity' | '-Infinity' | 'NaN' : never)
```

A range as Postgres writes it: a bracket, two bounds, a bracket, or `'empty'` for an empty range. A range whose bounds enclose no value is empty too: `'[5,5)'::int4range` comes back as `'empty'`. Postgres also reads `'EMPTY'` and spaces around it, but writes only `'empty'`, so the type takes only that. A `number` bound may also be `Infinity`, `-Infinity` or `NaN`, as Postgres writes them in a `numrange`, from `infinity`, `inf` or `nan` too; the type takes only these spellings. Zapatos 6.6.1 left out `'empty'` and these three.

### `NumberRangeString` {#NumberRangeString}

```ts
type NumberRangeString = RangeString<number | ''>
```

An `int4range`, `int8range` or `numrange`: `'[1,5)'`, `'[1.5,)'` with no upper bound, or `'[0,Infinity)'` for a `numrange`, whose bounds may be infinite or `NaN`. The type takes such a bound for the integer ranges too, though Postgres refuses it there.

### `DateRangeString` {#DateRangeString}

```ts
type DateRangeString = RangeString<string>
```

A `tsrange`, `tstzrange` or `daterange`. Its bounds follow the session's `DateStyle`, so they are typed `string`: `daterange('2030-03-01', '2030-03-08')` is `'[2030-03-01,2030-03-08)'` with the `ISO` style, and `'[01/03/2030,08/03/2030)'` with `SQL, DMY`. The bounds of a `tsrange` or `tstzrange` come quoted, since they hold a space: `'["2030-03-01 19:30:00","2030-03-02 00:00:00")'`.

## Bytes {#bytes}

### `ByteArrayString` {#ByteArrayString}

```ts
type ByteArrayString = `\\x${string}`
```

A `bytea` in JSON, as hex after `\x`: `'\\x4c61'` in TypeScript source.

### `toBuffer()` {#toBuffer}

```ts
db.toBuffer<T extends ByteArrayString | null>(d: T): T extends ByteArrayString ? Buffer<ArrayBuffer> | Exclude<T, ByteArrayString> : T
```

Decodes the hex of a `ByteArrayString` into a `Buffer`, typed `Buffer<ArrayBuffer>`. `null` gives `null`, and the type keeps it; `undefined` throws, and the type refuses it with `strictNullChecks` on ([`strict()`](#strict)). It decodes the whole value in memory.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const bytes = db.toBuffer('\\x4c61726b73707572');
const word = bytes.toString();  // 'Larkspur'
```

## Dates and times {#dates-and-times}

A date or time in a `JSONSelectable` is the string `to_jsonb()` writes, ISO 8601. A `timestamptz` carries the session's `TimeZone` offset: `'2030-03-01T19:30:00+00:00'` in `UTC`, `'2030-03-02T01:00:00+05:30'` in `Asia/Kolkata`.

<CastPanel example="toDate">

<<< ./examples/toDate.ts{ts twoslash}

</CastPanel>

| Type | Is | For example |
|---|---|---|
| [`DateString`](#DateString) | `${number}-${number}-${number}` | `'2030-03-01'` |
| [`TimeString`](#TimeString) | `${number}:${number}`, then an optional `:${number}` | `'19:30'`, `'19:30:00'` |
| [`TzSuffix`](#TzSuffix) | `'Z'`, or `+` or `-` and a number, then an optional `:${number}` | `'Z'`, `'+01'`, `'+05:30'` |
| [`TimeTzString`](#TimeTzString) | `${TimeString}${TzSuffix}` | `'19:30:00+01'` |
| [`TimestampString`](#TimestampString) | `${DateString}T${TimeString}` | `'2030-03-01T19:30:00'` |
| [`TimestampTzString`](#TimestampTzString) | `${TimestampString}${TzSuffix}` | `'2030-03-01T19:30:00+00:00'` |

### `DateString` {#DateString}

```ts
type DateString = `${number}-${number}-${number}`
```

A `date`.

### `TimeString` {#TimeString}

```ts
type TimeString = `${number}:${number}${'' | `:${number}`}`
```

A `time`, with or without its seconds.

### `TzSuffix` {#TzSuffix}

```ts
type TzSuffix = 'Z' | `${'+' | '-'}${number}${'' | `:${number}`}`
```

The time zone at the end of a `TimeTzString` or a `TimestampTzString`.

### `TimeTzString` {#TimeTzString}

```ts
type TimeTzString = `${TimeString}${TzSuffix}`
```

A `timetz`.

### `TimestampString` {#TimestampString}

```ts
type TimestampString = `${DateString}T${TimeString}`
```

A `timestamp`: no time zone.

### `TimestampTzString` {#TimestampTzString}

```ts
type TimestampTzString = `${TimestampString}${TzSuffix}`
```

A `timestamptz`.

### `toDate()` {#toDate}

```ts
db.toDate<D extends null | TimestampTzString>(d: D, tzInterpretation?: undefined): D extends null ? null : Date
db.toDate<D extends null | TimestampString | DateString>(d: D, tzInterpretation: 'UTC' | 'local'): D extends null ? null : Date
```

Makes a `Date` of a string from Postgres. A `TimestampTzString` has its time zone. A `TimestampString` or a `DateString` has none, so you say which to read it in: `'UTC'`, or `'local'`, the time zone of the JavaScript process.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const curtain = db.toDate('2030-03-01T19:30:00+00:00');
const rehearsal = db.toDate('2030-03-01T15:00:00', 'UTC');
const opening = db.toDate('2030-03-01', 'local');
```

- `toDate('2030-03-01', 'UTC')` is midnight UTC; `'local'` is local midnight.
- `null` gives `null`; the type keeps it, so `TimestampTzString | null` gives `Date | null`.
- A `Date` keeps milliseconds: the microseconds of a Postgres value are dropped.
- It does not check the string: one a `Date` cannot read gives an Invalid Date.

A `TimestampString` or a `DateString` without `tzInterpretation` does not compile (TS2345). Nor does a `TimestampTzString` with one, since the first overload takes `tzInterpretation` only as `undefined` (TS2769):

```ts twoslash
// @errors: 2345 2769
import * as db from 'zapatos/db';
// ---cut---
db.toDate('2030-03-01T15:00:00');
db.toDate('2030-03-01T19:30:00+00:00', 'UTC');
```

### `toString()` {#toString}

```ts
db.toString<D extends Date | null, T extends 'timestamptz' | 'timestamp:UTC' | 'timestamp:local' | 'date:UTC' | 'date:local'>(
  d: D,
  stringTypeTz: T,
): D extends null ? null : { timestamptz: TimestampTzString; 'timestamp:UTC': TimestampString; … }[T]
```

Makes a string Postgres reads of a `Date`, typed by `stringTypeTz`; `null` gives `null`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const curtain = new Date('2030-03-01T19:30:00Z');
const day: db.DateString = db.toString(curtain, 'date:UTC');              // '2030-03-01'
const stamp: db.TimestampTzString = db.toString(curtain, 'timestamptz');  // '2030-03-01T19:30:00.000Z'
```

| `stringTypeTz` | Gives | For 19:30 UTC on 1 March 2030, in a process with `TZ=Asia/Kolkata` |
|---|---|---|
| `'timestamptz'` | `TimestampTzString`, from `toISOString()` | `'2030-03-01T19:30:00.000Z'` |
| `'timestamp:UTC'` | `TimestampString` | `'2030-03-01T19:30:00.000'` |
| `'timestamp:local'` | `TimestampString`, in the process's time zone | `'2030-03-02T01:00:00.000'` |
| `'date:UTC'` | `DateString` | `'2030-03-01'` |
| `'date:local'` | `DateString`, in the process's time zone | `'2030-03-02'` |

## `strict()` {#strict}

```ts
db.strict<FnIn, FnOut>(fn: (x: FnIn) => FnOut):
  <T extends FnIn | null>(d: T) => T extends FnIn ? Exclude<T, FnIn> | FnOut : T
```

Wraps a one-argument function so that `null` gives `null` without calling it, as a Postgres function declared `STRICT` does. The type follows: `FnIn` gives `FnOut`, `FnIn | null` gives `FnOut | null`, `null` gives `null`. [`toBuffer()`](#toBuffer) is `strict()` of a `ByteArrayString` decoder.

```ts twoslash
import * as db from 'zapatos/db';
declare const tagline: string | null;
// ---cut---
const shout = db.strict((s: string) => s.toUpperCase());
const loud = shout(tagline);
```

- Only `null` passes through, as only `NULL` does for a `STRICT` function in Postgres: `undefined` reaches `fn`. A function that takes it handles it: `db.strict((title: string | undefined) => title ?? 'untitled')(undefined)` gives `'untitled'`.
- With `strictNullChecks` on, the type refuses `undefined` unless `fn` takes it: `shout(undefined)` and `db.toBuffer(undefined)` do not compile (TS2345).
- With `strictNullChecks` off, a type has no `null` nor `undefined` in it, and none of these types say anything of them: `toDate(null)` is typed `Date`, `shout(null)` `any`. `db.toBuffer(undefined)` then compiles, and throws "TypeError: Cannot read properties of undefined (reading 'slice')".

## `SchemaVersionCanary` {#SchemaVersionCanary}

```ts
interface SchemaVersionCanary { version: 104 }
```

The version of the generated schema's format that this `zapatos/db` reads. The generated `zapatos/schema` declares `interface schemaVersionCanary extends db.SchemaVersionCanary { version: 104 }`, so a schema written for another format does not compile:

```txt
error TS2430: Interface 'schemaVersionCanary' incorrectly extends interface 'SchemaVersionCanary'.
  Types of property 'version' are incompatible.
```

- pgcast's version is Zapatos 6.6.1's, `104`, so the canary of a schema that Zapatos 6.6.1 generated passes.
- Regenerating the schema clears the error ([Generator](/generator)).
