# Configuration

What `zapatos/db` lets you set while your code runs: `setConfig()` and each option of `Config`, the listeners, the opt-ins and their warning codes.
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
- A key 8.0 removed, [`undefinedMeansMissing`](#Config.undefinedMeansMissing), [`upsertRequiresSameKeys`](#Config.upsertRequiresSameKeys), [`transactionRequiresCommit`](#Config.transactionRequiresCommit), [`transactionRequiresIdleClient`](#Config.transactionRequiresIdleClient), [`transactionRequiresSatisfyingLevel`](#Config.transactionRequiresSatisfyingLevel) or [`aggregatesTypedByColumn`](#Config.aggregatesTypedByColumn), does not compile (TS2353). Given anyway, from a variable or JavaScript, it throws unless its value is the one 8.0 always behaves as (`true`), `null` or `undefined`, and the configuration keeps none of them. Error: `undefinedMeansMissing was removed in 8.0, which always does what undefinedMeansMissing: true did; delete it from setConfig(): https://pgcast.dev/switching#from-8-0-undefinedMeansMissing`<!-- message -->.
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
  selectExactlyOneChecksForSecondRow?: boolean;
  shortcutsUseJson?: boolean;
  topLevelSelectAsRows?: boolean;
  queryListener?(query: SQLQuery, txnId?: number): void;
  resultListener?(result: any, txnId?: number, elapsedMs?: number, query?: SQLQuery): void;
  transactionListener?(message: string, txnId?: number): void;
  transactionEventListener?: (event: TransactionEvent, txnId?: number) => void;
}
```

The keys pgcast adds are optional, so a `Config` written for Zapatos 6.6.1 still compiles; `getConfig()` types them `boolean | undefined`, though it always gives a value.

<div class="stack">

| Option | Default | What it changes | Read |
|---|---|---|---|
| [`transactionAttemptsMax`](#Config.transactionAttemptsMax) | `5` | how many times `transaction()` runs its callback | at each `transaction()` |
| [`transactionRetryDelay`](#Config.transactionRetryDelay) | `{ minMs: 25, maxMs: 250 }` | the wait before each retry | at each `transaction()` |
| [`castArrayParamsToJson`](#Config.castArrayParamsToJson) | `false` | an array parameter: `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1])}`) --> in place of `$1` | at each `compile()` |
| [`castObjectParamsToJson`](#Config.castObjectParamsToJson) | `false` | a plain object parameter: `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castObjectParamsToJson: true }), db.sql`${db.param({ a: 1 })}`) --> in place of `$1` | at each `compile()` |
| [`selectExactlyOneChecksForSecondRow`](#Config.selectExactlyOneChecksForSecondRow) | `false` | a standalone `selectExactlyOne()` requests two rows and rejects on a second | at each `selectExactlyOne()` |
| [`shortcutsUseJson`](#Config.shortcutsUseJson) | `false` | `select()` and its kin, and the writes' `RETURNING`, build their JSON with `json` functions: `coalesce(json_agg(result), '[]')`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all)) --> | at each `select()`, `selectOne()`, `selectExactlyOne()`, `selectRows()`, `withCTEs()`, `insert()`, `upsert()`, `update()` and `deletes()` |
| [`topLevelSelectAsRows`](#Config.topLevelSelectAsRows) | `false` | a standalone `select()` sends `selectRows()`'s query, one row per result, in place of one aggregate value | at each `select()` |
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

From 7.0.0, the default was `true`. From 8.0.0, the key is removed and pgcast always behaves as `true` ([8.0 migration](/switching#from-8-0-upsertRequiresSameKeys)).

A batch upsert throws at construction if its implicit update includes a column missing from any row, unless the conflict target names it or `updateValues` gives it a defined value. Explicit `updateColumns` skips the check. With `noNullUpdateColumns` alone, it still applies. Error: "rows have different keys: pass updateColumns, or give every row the same keys"<!-- message -->.

Through 7.x, `false` let the missing key overwrite the stored value without a warning. See [Rows with different keys](/insert#upsert-different-keys).

### `undefinedMeansMissing` {#Config.undefinedMeansMissing}

From 7.0.0, the default was `true`. From 8.0.0, the key is removed and pgcast always behaves as `true` ([8.0 migration](/switching#from-8-0-undefinedMeansMissing)).

An `undefined` value in [`insert()`](/insert#insert), [`update()`](/insert#update) and [`upsert()`](/insert#upsert) is a missing key: `DEFAULT` in `insert()`, left out of `update()` and `upsert()`, its `updateValues` included. Through 7.x, `false` sent it as `NULL` (in `updateValues`, set from `EXCLUDED`), as in Zapatos 6.6.1, without a warning. The SQL of each: [An `undefined` value](/insert#undefined-values).

### `transactionRequiresCommit` {#Config.transactionRequiresCommit}

From 7.0.0, the default was `true`. From 8.0.0, the key is removed and pgcast always behaves as `true` ([8.0 migration](/switching#from-8-0-transactionRequiresCommit)).

If Postgres answers the `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> of [`transaction()`](/transaction#transaction) with the command tag `ROLLBACK`, nothing is saved.

`transaction()` then rejects, without a retry, with "the transaction was rolled back, not committed: a query in it failed and the callback caught the error, so Postgres answered COMMIT with ROLLBACK; let the error out of the callback, or ROLLBACK TO a SAVEPOINT before going on"<!-- message -->.

Through 7.x, `false` resolved quietly with the callback result. See [Let the error through](/retries#let-the-error-through).

- Not covered: a callback that sends `COMMIT` or `ROLLBACK` itself.
- Not tested with `pg-native`.

### `transactionRequiresIdleClient` {#Config.transactionRequiresIdleClient}

From 7.0.0, the default was `true`. From 8.0.0, the key is removed and pgcast always behaves as `true` ([8.0 migration](/switching#from-8-0-transactionRequiresIdleClient)).

Given a client you opened a transaction on yourself, with `BEGIN`, [`transaction()`](/transaction#transaction) would end your transaction: its `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> commits it, or its `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw 0; }) --> undoes it ([Your own `BEGIN`](/transaction#your-own-begin)).

It rejects before sending its `START TRANSACTION`, with "transaction() was given a client inside a transaction block, so its COMMIT or ROLLBACK would end that transaction: COMMIT or ROLLBACK it first, or run the queries on that client without transaction()"<!-- message -->. Your transaction stays open, for your `COMMIT` or `ROLLBACK`.

Through 7.x, `false` skipped the status recheck and sent `START TRANSACTION` without a pgcast warning, as in Zapatos 6.6.1.

- pg says whether a client is in a block from pg 8.21 (`getTransactionStatus()`). On older versions, `transaction()` runs as in 6.6.1, with no warning.
- When pg reports a block, `transaction()` first sends an empty query, to read the status again; [`queryListener`](#Config.queryListener) and [`resultListener`](#Config.resultListener) get it, with the transaction's id ([Your own `BEGIN`](/transaction#your-own-begin)).
- During the recheck, the first call's marker holds its requested level. A second call runs its callback on that client only if the marked level satisfies its request. In an open block, its queries run at that block's level.
- Only a client you pass is checked: one the pool hands out, released while still in a block, is not.
- A `BEGIN` you sent without `await` is not seen yet: the client reads as outside a block.
- A `BEGIN` sent in one query string with a statement that fails can read as outside a block too: `transaction()` then runs as in 6.6.1, with no warning.
- Not tested with `pg-native`.
- If pg still reports a block after a failed `COMMIT`, the recheck can find the client idle. Writes from a second callback can commit separately before the first call's `START TRANSACTION` or after its transaction ends.

### `transactionRequiresSatisfyingLevel` {#Config.transactionRequiresSatisfyingLevel}

From 7.0.0, the default was `true`. From 8.0.0, the key is removed and pgcast always behaves as `true` ([8.0 migration](/switching#from-8-0-transactionRequiresSatisfyingLevel)).

A nested callback runs at the outer transaction's isolation level. A `serializable()` request on a `readCommitted()` client therefore cannot provide the requested isolation ([Passing a transaction through](/transaction#passing-a-transaction-through)).

When that level doesn't satisfy the one asked for ([`IsolationSatisfying`](/transaction#IsolationSatisfying)), it rejects before calling its callback, with "transaction() at … was given the client of a transaction at …, so its callback would run at …: open the outer transaction at a level that satisfies … (IsolationSatisfying)"<!-- message -->, each `…` a level of the call (`SERIALIZABLE`, `READ COMMITTED`). Unless the outer callback catches it, the outer transaction then rolls back.

Through 7.x, `false` let an insufficient level pass through too, without a warning.

- The call passes the client through if its level appears in the requested level's row of the [isolation table](/transaction#IsolationSatisfying).
- Only the client of a `transaction()` is checked, by its `_zapatos` mark, which a plain client also carries while a `transaction()` runs on it, so a second call at the same moment on that client is checked: a pool, an idle plain client and a client kept after its transaction ended get a transaction of their own, as before.
- The types don't change: a `Queryable` takes the client of any level ([`TxnClient`](/transaction#TxnClient)).
- A test that runs code inside a `transaction()` of its own, and hands it that client: open it at `IsolationLevel.Serializable`, which satisfies every level.

### `selectExactlyOneChecksForSecondRow` {#Config.selectExactlyOneChecksForSecondRow}

```ts
selectExactlyOneChecksForSecondRow?: boolean  // default: false through 7.x; removed in 8.0
```

With the check enabled and `withTies` off, a [`selectExactlyOne()`](/select#selectExactlyOne) run on its own asks for two rows, `LIMIT $2`<!-- probe: (db.setConfig({ selectExactlyOneChecksForSecondRow: true }), db.selectExactlyOne('films', { id: 1000 })) --> with `2`, and `.run()` rejects with a [`NotExactlyOneError`](/select#NotExactlyOneError) when a second row comes: "One result expected but more returned (hint: check `.query.compile()` on this Error)"<!-- message -->. With both off, it asks for one, `LIMIT 1`, and gives the first row that matches, as in Zapatos 6.6.1.

- Nested in a `lateral` or a `sql` template, or copied with [`.copy()`](/sql-template#copy), it requests one row.
- [`withTies: true`](/select#order-limit-offset-and-withties) compiles each limit as `FETCH FIRST … ROWS WITH TIES`. A nested query can return all ties. A standalone copy still requests one row plus ties and rejects with `NotExactlyOneError` if it gets a second row with the check enabled.
- With a [`lock`](/select#lock), `LIMIT $2` locks the second row too: after `.run()` rejects, both rows stay locked until the transaction ends, and another session's `FOR UPDATE NOWAIT` on either gets 55P03.
- Off, it never warns, and it stays off through 7.x: "at least one row" is how Zapatos reads `selectExactlyOne()`, nested in a `lateral` on a `NOT NULL` foreign key ([decision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md)). 8.0 removes it: `selectExactlyOne()` asks for `LIMIT 1` alone, and the key set to `true` throws ([decision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).
- Read when `selectExactlyOne()` is called, not at `.run()`.

### `aggregatesTypedByColumn` {#Config.aggregatesTypedByColumn}

From 7.0.0, the default was `true`. From 8.0.0, the key is removed and pgcast always behaves as `true` ([8.0 migration](/switching#from-8-0-aggregatesTypedByColumn)).

[`sum()`](/aggregates#sum), [`avg()`](/aggregates#avg), [`min()`](/aggregates#min) and [`max()`](/aggregates#max) give `null` when no row matches, and `min()` and `max()` give the column's value as `pg` reads it: with the default parsers, a `Date` for a finite `timestamptz` and a string for `text` or an enum. The SQL doesn't change, nor does [`count()`](/aggregates#count).

Through 7.x, `false` applied `Number()` to the result, without a warning: an empty set gave `0`, a finite date read as a `Date` its epoch milliseconds and non-numeric text `NaN`. Declared `false` in [`ConfigTypes`](#ConfigTypes) too, it typed the four `number`.

- Under a `lateral` key or as an `extras` value, the value comes back as JSON, and `null` when no row matches; it is typed as its column's `JSONSelectable`.
  - For a [passed-through `lateral`](/select#lateral), calling `.run()` on the outer `selectOne()`, `selectExactlyOne()` or `selectRows()` gives the column as `pg` parses it. An outer `select()` gives JSON. [`selectRows()`](/select#selectRows) refuses a direct numeric fragment such as `count()` at compile time.
- Examples, and each type: [Typed by column](/aggregates#typed-by-column).

### `shortcutsUseJson` {#Config.shortcutsUseJson}

```ts
shortcutsUseJson?: boolean  // default: false; true in 8.0
```

From 7.3.0. With `true`, [`select()`](/select#select), [`selectOne()`](/select#selectOne), [`selectExactlyOne()`](/select#selectExactlyOne) and [`selectRows()`](/select#selectRows) build each row with `to_json` and `json_build_object`, and `select()` its array with `json_agg`, in place of their `jsonb` twins: `to_json("films".*)`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all)) -->. So do [`insert()`](/insert#insert), [`upsert()`](/insert#upsert), [`update()`](/insert#update) and [`deletes()`](/insert#deletes) in their `RETURNING`. `json` keeps the text as Postgres writes it, where `jsonb` parses and sorts it: on 1000 studios with a `lateral` of 20 films each, 37 ms in place of 110 ([decision 018](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/018-json-output.md)). The SQL of each option: [reads](/select#shortcutsUseJson) and [writes](/insert#shortcutsUseJson).

The values and the types are the same, except:

- A row's keys come in the table's order, then `extras`, then the `lateral` keys or `upsert()`'s `$action`, not `jsonb`'s shorter keys first: code that reads `Object.keys()` or compares `JSON.stringify()` sees it. A `json` column keeps its keys as stored, and a `float8` `-0` stays `-0`.
- A nested result is `json`: a `jsonb` function over it fails, `jsonb_typeof((…))` gives 42883, and so do `DISTINCT` and `UNION`; `->` and `->>` work, and so does a cast, `::jsonb`.
- A type parser set for `jsonb` (3802) alone no longer applies; [`enableCustomJSONParsingForLargeNumbers()`](/value-types#enableCustomJSONParsingForLargeNumbers) sets both.
- Beside every column, each `extras` or `lateral` key is a column alias. A key Postgres would refuse or truncate, empty, with a NUL or over 63 bytes in UTF-8, throws while compiling, so `.run()` rejects before any query: give `columns`, or a write's `returning`, whose keys stay parameters.
- Beside every column, a write's `extras` run in a subquery over its row, which takes some that `RETURNING` refuses off: `count(*)` gives 1 there ([Writes](/insert#shortcutsUseJson)).
- With `columns` or `returning`, the columns, `extras`, `lateral` keys and `$action` share one `json_build_object()`, which Postgres limits to 100 arguments: over 50 keys throw while compiling, where each part had 50 of its own.
- `select()`'s array may reach a value's 1 GB, where `jsonb_agg` stops at 256 MB (54000).

[The aggregates](/aggregates) keep their SQL, as they build no JSON. Read when the shortcut is called, not at `.run()`. Off, the SQL is unchanged; it stays off, with no warning, through 7.x. 8.0 removes the option and keeps `json` alone ([decision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).

### `topLevelSelectAsRows` {#Config.topLevelSelectAsRows}

```ts
topLevelSelectAsRows?: boolean  // default: false; true in 8.0
```

From 7.3.0. With it on, a [`select()`](/select#select) run or compiled on its own sends [`selectRows()`](/select#selectRows)'s query, one row per result, and `.run()` gives the same array, `[]` when none match. No single value holds the whole result, so a large read costs less, and `jsonb_agg`'s 256 MB [limit](/performance#limits) no longer applies to it.

| Call | `.compile().text` |
|---|---|
| `db.select('films', { studio_id: 1000 })` | `SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("films".*) AS result FROM "films" WHERE ("studio_id" = $1)) AS "sq_films"`<!-- probe: db.select('films', { studio_id: 1000 }) --> |
| the same, with the option | `SELECT to_jsonb("films".*) AS result FROM "films" WHERE ("studio_id" = $1)`<!-- probe: (db.setConfig({ topLevelSelectAsRows: true }), db.select('films', { studio_id: 1000 })) --> |

- `.compile()` shows the rows query: code that runs its text with a client of its own and reads `rows[0].result` gets the first row alone: read `rows.map(r => r.result)`, or call `.run()`. 8.0 removes the option and keeps the rows query alone ([decision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).
- As the main query of [`withCTEs()`](/sql-template#withCTEs), the same. Nested in a `lateral`, `extras`, a `sql` template or a CTE, copied with [`.copy()`](/sql-template#copy), and in [`cursor()`](/transaction#cursor), `select()` keeps its aggregate: its parent reads it as one value.
- A single [`lateral` passed through](/select#lateral) is converted above the rows query, `SELECT to_jsonb(result) AS result FROM (…) AS "sq_studios"`<!-- probe: (db.setConfig({ topLevelSelectAsRows: true }), db.select('studios', db.all, { lateral: db.count('films', { studio_id: db.parent('id') }) })) --> (`to_json` with [`shortcutsUseJson`](#Config.shortcutsUseJson)), so a `count()` stays a number, as in `select()`'s array, where `selectRows()` gives the string `pg` parses, and `order` and `distinct` act on its raw value, as in the aggregate.
- The rows query runs with a `runResultTransform` of its own: one you set on the query applies only to its copies and to the query nested.
- [`prepared()`](/sql-template#prepared), `noop` and the listeners work as before: [`queryListener`](#Config.queryListener) gets the rows query.
- `selectOne()`, `selectExactlyOne()`, `selectRows()`, `count()` and the other aggregates don't change, nor do the types.
- Read when `select()` is called, not at `.run()`. Off, it never warns: the values are the same ([decision 018](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/018-json-output.md)).

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

From 6.7.0 through 7.x. 8.0 removes the interface with [`aggregatesTypedByColumn`](#Config.aggregatesTypedByColumn), the only key it read ([8.0 migration](/switching#from-8-0-ConfigTypes)). It declared the options of `Config` that change a type, since TypeScript can't read `setConfig()`:

```ts
declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: false }
}
```

- From 8.0.0, a declaration left from 7.x still compiles and changes no type: `sum()`, `avg()`, `min()` and `max()` are typed by column whatever it holds.
- With no such declaration, naming `db.ConfigTypes` no longer compiles (TS2694).

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

In 6.x, [`undefinedMeansMissing`](#Config.undefinedMeansMissing), [`upsertRequiresSameKeys`](#Config.upsertRequiresSameKeys), [`transactionRequiresCommit`](#Config.transactionRequiresCommit), [`aggregatesTypedByColumn`](#Config.aggregatesTypedByColumn), [`transactionRequiresIdleClient`](#Config.transactionRequiresIdleClient) and [`transactionRequiresSatisfyingLevel`](#Config.transactionRequiresSatisfyingLevel) were opt-ins whose old behaviour triggered warnings. In 7.0, all six are on by default and none warns. An explicit `false` keeps the old behaviour without warnings through 7.x; 8.0 removes all six, and always behaves as `true` (see [Versions](/versions) and the [7.0 migration](/switching#from-7-0)).

One opt-in stays off by default in 7.0 and emits no warning: [`selectExactlyOneChecksForSecondRow`](#Config.selectExactlyOneChecksForSecondRow), since 6.6.1's reading of `selectExactlyOne()`, at least one row, is one Zapatos documents; 8.0 removes it, `LIMIT 1` alone. Nor does [`shortcutsUseJson`](#Config.shortcutsUseJson), from 7.3.0, warn, as its values are the same: it is off in 7.x, and 8.0 keeps `json` alone.

[`topLevelSelectAsRows`](#Config.topLevelSelectAsRows), from 7.3.0, emits no warning either, as its values are the same: off through 7.x; 8.0 removes it and keeps the rows query alone ([decision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).

From 7.0, the generator enables [`domainsTypedByContext`](/generator#generate.domainsTypedByContext), [`enumArraysTypedAsText`](/generator#generate.enumArraysTypedAsText) and [`intervalsTypedAsObjects`](/generator#generate.intervalsTypedAsObjects) by default without migration notes. Its [`domainsTypedAsUnions`](/generator#generate.domainsTypedAsUnions) has no note, and stays off through 7.x; 8.0 keeps it alone. Nor has [`valuesTypedAsAliases`](/generator#generate.valuesTypedAsAliases), whose types are the same: it stays off until 8.0. From 7.0, [`typeEnumsAcrossSchemas`](/generator#generate.typeEnumsAcrossSchemas) and [`enumOrder`](/generator#generate.enumOrder) use the enum's own schema and declaration order by default, without a migration note; 8.0 removes both, and keeps that behaviour alone. The generator also enables [`uniqueIndexConstraintsOnly`](/generator#generate.uniqueIndexConstraintsOnly) by default without a migration note.

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
