---
aside: false  # the panel takes the rail's width: code lines are long
---

<script setup>
import Playground from './.vitepress/theme/Playground.vue';
</script>

# Playground

Edit a query on the docs schema and watch, as you type, the SQL that pgcast writes and the type TypeScript gives its result; press Run to see what Postgres answers. It starts from the tutorial's first query; nothing you write leaves your browser.
{.lede}

<Playground>
<CastPanel example="first-query">

<<< ./examples/first-query.ts{ts twoslash}

</CastPanel>
</Playground>

## What runs here

- **The types**: TypeScript 5.9.3, the compiler of these docs, in Monaco, the editor of VS Code. Hover a name to see its type; an error is underlined as you type.
- **The SQL**: pgcast's own runtime, in a worker of this page, with a pool that records each query it is given. Each query appears with its values. As you type, a query gets no rows back, so code that needs a row stops after its query, with the error it got.
- **Postgres, on Run**: [PGlite](https://pglite.dev), Postgres 18 compiled to WebAssembly, in that worker: about 5 MB to download, on your first Run only. Each query then shows the rows it returns (the first 50), or its error with its SQLSTATE. Each Run starts on the docs schema as it ships, and stops after 10 seconds.
- **One connection**: PGlite has one, so the pool lends it to one transaction at a time, as a `pg.Pool` with `max: 1`. It takes `query(text, values)`, `connect()` and `end()`, which does nothing. Its rows are parsed as `pg` parses them, except an `interval` or a `circle`, which stay text, and its values are sent as `pg` sends them.
- **Prepared, always**: each query is sent with its values, as `pg` sends one that has values. So a text of several statements, `` db.sql`SELECT 1; SELECT 2` ``, rejects with 42601 here, where `pg` sends it as a simple query.
- **The keyboard**: in the editor, Ctrl+Enter (⌘+Enter on a Mac) runs the code, and Tab indents. To leave it with Tab, press Ctrl+M first (Ctrl+Shift+M on a Mac); press it again to indent with Tab.

## The schema

The tables you query, from [`schema.sql`](https://github.com/AlexandreDemartin/pgcast/blob/master/website/schema.sql), read-only here. Their types, `zapatos/schema`, are the ones pgcast generates from it for every page of these docs.

<<< ./schema.sql
