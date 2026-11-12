# `select()` and the aggregates

What this page lists, in one sentence: its exports, the SQL they write, their effect on the type.
{.lede}

## `select()` {#select}

```ts
db.select(table, where, options?)
```

What it does, in one sentence, then its parameters as a list: `table`, a table of the schema; `where`, a `Whereable`, a `sql` fragment or `db.all`; `options`, below. Dry and complete: no steps, no opinions, the why in its explanation.

<CastPanel example="select">

<<< ./examples/select.ts{ts twoslash}

</CastPanel>

### Options

| Option | SQL it adds | Effect on the type |
|---|---|---|
| `columns: ['character']` | `jsonb_build_object($1::text, "character")` in place of `to_jsonb("roles".*)` | `Pick<roles.JSONSelectable, 'character'>` |
| `order: { by: 'billing', direction: 'ASC' }` | `ORDER BY "billing" ASC` | none |
| `limit: 10` | `LIMIT $2` | none |

::: tip Opt-in
Only for a behaviour behind an opt-in: the option, what it changes, the warning code until 7.0 (`PGCAST_DEP001`), and a link to [Versions, opt-ins and warnings](/versions).
:::

## `count()` {#count}

Each export its own entry, even when it shares its options with another: its signature, what differs, and a link back for the rest ([`select()`](#select)).

## `SelectResultMode` {#SelectResultMode}

A type or a constant: what it is, and where it is used, in one or two sentences.
