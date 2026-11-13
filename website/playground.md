---
aside: false  # the panel takes the rail's width: code lines are long
---

<script setup>
import Playground from './.vitepress/theme/Playground.vue';
</script>

# Playground

Edit a query on the docs schema and watch, as you type, the SQL that pgcast writes and the type TypeScript gives its result. It starts from the tutorial's first query; nothing you write leaves your browser.
{.lede}

<Playground>
<CastPanel example="first-query">

<<< ./examples/first-query.ts{ts twoslash}

</CastPanel>
</Playground>

## What runs here

- **The types**: TypeScript 5.9.3, the compiler of these docs, in Monaco, the editor of VS Code. Hover a name to see its type; an error is underlined as you type.
- **The SQL**: pgcast's own runtime, in a worker of this page, with a pool that records each query it is given. Each query appears with its values.
- **No database yet**: a query gets no rows back, so code that needs a row stops after its query, with the error it got.
- **The keyboard**: in the editor, Tab indents. To leave it with Tab, press Ctrl+M first (Ctrl+Shift+M on a Mac); press it again to indent with Tab.

## The schema

The tables you query, from [`schema.sql`](https://github.com/AlexandreDemartin/pgcast/blob/master/website/schema.sql), read-only here. Their types, `zapatos/schema`, are the ones pgcast generates from it for every page of these docs.

<<< ./schema.sql
