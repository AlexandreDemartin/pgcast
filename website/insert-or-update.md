# Upserts

Insert or update: save a row that may already exist, and know which happened. [`upsert()`](/insert#upsert) is the entry; this page adds the tasks around it: reading [`$action`](/insert#UpsertAction), keeping a stored column with `updateColumns`, and getting the stored row when [`doNothing`](/insert#doNothing) returns none.
{.lede}

## Save the rows, and read what happened

The cast of The Salt Orchard comes back from an edit: billing 3 changes actor, and billing 4 is new. The key of a role is `(film_id, billing)`:

<CastPanel example="insert_or_update">

<<< ./examples/insert_or_update.ts{ts twoslash}

<template #caption><span>Billing 3 is now Halvard Brecke, with $action 'UPDATE'; billing 4 is a new role, with $action 'INSERT'.</span></template>
</CastPanel>

- `ON CONFLICT ("film_id", "billing")`<!-- probe: examples/insert_or_update.ts --> names the primary key's columns. Columns that no unique index or constraint covers make Postgres refuse the query (42P10).
- To act on the new rows only, filter on it: `roles.filter(role => role.$action === 'INSERT')`<!-- tsc: const roles = await db.upsert('roles', [{ film_id: 1000, billing: 4, actor_id: 1002, character: 'The orchard keeper' }], ['film_id', 'billing']).run(pool); … -->.
- Two rows with the same key in one call make Postgres refuse it (21000): "ON CONFLICT DO UPDATE command cannot affect row a second time". Merge them first.

## Keep a stored column

Billing 2 changes actor, and the role keeps the character's name already stored, `Silas Vey`, not the feed's `Silas`:

<CastPanel example="insert_or_update_keep">

<<< ./examples/insert_or_update_keep.ts{ts twoslash}

<template #caption><span>Billing 2 is now Ambrose Okafor, still as Silas Vey, with $action 'UPDATE'.</span></template>
</CastPanel>

`DO UPDATE SET ("actor_id") = ROW(EXCLUDED."actor_id")`<!-- probe: examples/insert_or_update_keep.ts -->: the update sets `actor_id` alone, and an insert still writes every column given. [Options](/insert#upsert-options) has the others, `noNullUpdateColumns` and `updateValues` among them.

## Insert only, then read the row

Add a role unless its billing is taken, and get the role there either way. With `doNothing`, a row already there returns nothing:

<CastPanel example="insert_or_update_do_nothing">

<<< ./examples/insert_or_update_do_nothing.ts{ts twoslash}

<template #caption><span>undefined: A Lantern for Edith already has a billing 3, Aunt Lise.</span></template>
</CastPanel>

So a select follows it, by the same key, when it gives `undefined`:

<<< ./examples/plain/insert_or_update_cast_once.ts{ts twoslash}

- `role` is the new row, with its `$action`, or the stored one, with none.
- The row is not locked between the two queries: if another client deletes it meanwhile, [`selectExactlyOne()`](/select#selectExactlyOne) rejects with `NotExactlyOneError`.
- In a batch, `doNothing` returns the rows inserted only: [Batches § Skip the rows already there](/batches#skip-the-rows-already-there).

## See also

- [`upsert()`](/insert#upsert) and its [Options](/insert#upsert-options): the SQL of each option.
- [`UpsertAction`](/insert#UpsertAction) and [`doNothing`](/insert#doNothing): what the result holds.
- [Batches](/batches): many rows in one query.
