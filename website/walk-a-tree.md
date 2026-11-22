# Trees

Walk a tree: each crew member's mentors, up the chain. No shortcut follows a column back to its own table level after level, so the query goes in a [`sql`](/sql-template#sql) template with `WITH RECURSIVE`, its row typed by hand, and Postgres's `CYCLE` clause stops it at a loop.
{.lede}

## Walk up the tree

Jonah Merriweather's mentors, from his own row up `crew.mentor_id`:

<CastPanel example="walk_a_tree">

<<< ./examples/walk_a_tree.ts{ts twoslash}

<template #caption><span>Jonah Merriweather at depth 0, his mentor Corin Halloway at 1, and Corin Halloway's, Wilhelmina Strand, at 2.</span></template>
</CastPanel>

- The first `SELECT` is the start, Jonah's row. The second joins `crew` to the rows found so far, one level up each time, on `"crew"."id" = chain.mentor_id`<!-- probe: examples/walk_a_tree.ts -->, and Postgres stops when it finds no new row.
- The names between `${…}` are checked against `s.crew.SQL`. The CTE's own, `chain` and its columns, are written in the text, and nothing checks them ([Raw SQL](/raw-sql)).
- The row's type is the one you write, `{ id: number; name: string; depth: number }[]`, not checked: [Typed SQL](/typed-sql) generates and checks it. `0 AS depth` is an `integer`, which `pg` gives as a number.
- [`withCTEs()`](/sql-template#withCTEs) writes no `RECURSIVE`, so a CTE that reads itself there is refused (42P01): the whole query goes in `sql` ([Raw SQL § Put a CTE before a shortcut](/raw-sql#put-a-cte-before-a-shortcut)).

## Go down the tree

Wilhelmina Strand's team: the crew she mentors, those they mentor, and so on. The join goes the other way:

<CastPanel example="walk_a_tree_down">

<<< ./examples/walk_a_tree_down.ts{ts twoslash}

<template #caption><span>Wilhelmina Strand at depth 0, Corin Halloway and Petra Ilves at 1, Jonah Merriweather at 2.</span></template>
</CastPanel>

- `"crew"."mentor_id" = team.id`<!-- probe: examples/walk_a_tree_down.ts -->: each step finds the crew whose mentor the step before found.
- The rows come in the order of the `ORDER BY`, here by depth, then by name.

## Stop at a loop

A tree kept in a column can loop: an edit that makes Jonah Merriweather the mentor of Wilhelmina Strand closes the chain. From Postgres 14, the `CYCLE` clause stops each branch at a row it has already seen:

<CastPanel example="walk_a_tree_cycle">

<<< ./examples/walk_a_tree_cycle.ts{ts twoslash}

<template #caption><span>The same three rows as above: the tree of the docs schema has no loop.</span></template>
</CastPanel>

- `CYCLE id SET is_loop USING path`<!-- probe: examples/walk_a_tree_cycle.ts --> adds two columns to the CTE: `path`, the ids of the branch so far, and `is_loop`, `true` on a row whose `id` is already in it. Postgres goes no further from that row.
- With the loop, Jonah's row comes back at depth 3 with `is_loop` true: `WHERE NOT is_loop` leaves it out.
- Without `CYCLE`, the same query never ends by itself: it runs until a `statement_timeout`, if one is set, cancels it (57014).

## See also

- [Raw SQL](/raw-sql) and [`sql`](/sql-template#sql): names, values and the row's type in a query of your own.
- [Joins § Join a table to itself](/lateral#join-a-table-to-itself): one level up, with a shortcut and `alias`.
- [`WITH` queries](https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-RECURSIVE), `RECURSIVE` and `CYCLE`, in the Postgres docs.
