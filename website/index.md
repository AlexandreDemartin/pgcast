---
layout: home
markdownStyles: false
title: pgcast
titleTemplate: The Postgres you know, with the full power of TypeScript
description: "The Postgres you know, with the full power of TypeScript. pgcast reads your schema and writes the types; each query is SQL you can read and predict."
---

<main class="landing">
<section class="hero">

<p class="eyebrow">-- a maintained fork of <a href="/switching">Zapatos 6.6.1</a></p>

<h1><span class="half">The Postgres you know,</span> <span class="half">with the full power of TypeScript<span class="op">::</span></span></h1>

<strong>Nothing between you and Postgres</strong>: you write your queries in its natural vocabulary, and pgcast carries the types read from your schema <strong>through to each query’s result</strong>.<br>
No ORM, no models, no hidden state: you stay in full control.
{.lede}

<div class="ctas">

[Get started](/install){.btn .primary} [Playground](/playground){.btn}

</div>

<InstallLine :commands="['npm install pgcast@npm:@pgcast/pgcast', 'pnpm add pgcast@npm:@pgcast/pgcast', 'yarn add pgcast@npm:@pgcast/pgcast@^6.7', 'bun add pgcast@npm:@pgcast/pgcast@^6.7']" />
</section>

<CastPanel example="home">

<<< ./examples/home.ts{ts twoslash}

<template #caption><span>Films with their cast, in one query and one round trip.</span><span>Hover a dashed name to see its type.</span></template>
</CastPanel>

<div class="pillars">
<div>

## Postgres is the source

Types come from `pg_catalog`, never written by hand. Change a column, regenerate, and the compiler finds every query that broke.

[How the catalog becomes types](/catalog-types){.next}

</div>
<div>

## SQL you can read

Each shortcut writes one documented query. Log it, test it, or write it yourself in a `sql` template.

[The SQL of each shortcut](/reference){.next}

</div>
<div>

## Values are parameters

Values travel as `$1`, `$2`. Names are quoted as Postgres quotes them, so a stray `"` cannot change your query.

[What pgcast guards against](/security){.next}

</div>
<div>

## Live playground

Write a query and see its SQL and its type as you type. Press Run, and a real Postgres answers, in your browser.

[Open the playground](/playground){.next}

</div>
</div>

<div class="readnext">

[**Tutorial**<small>Install pgcast and run your first typed query.</small>](/tutorial)
[**How-to guides**<small>Laterals, pages, batches, retries: one task each.</small>](/guides)
[**Reference**<small>Every export and option, and the SQL it writes.</small>](/reference)
[**Explanation**<small>Why pgcast works as it does.</small>](/explanation)

</div>

<SiteFooter />
</main>
