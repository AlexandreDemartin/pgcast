---
layout: home
markdownStyles: false
title: pgcast
titleTemplate: Zero-abstraction Postgres for TypeScript
description: "pgcast reads your Postgres schema and writes the TypeScript types. Readable, predictable SQL: no ORM, no models, no hidden state. A maintained fork of Zapatos."
---

<div class="landing">
<section class="hero">

<p class="eyebrow">-- a maintained fork of Zapatos 6.6.1</p>
<h1>Your types, cast from your database<span class="op">::</span></h1>

pgcast reads your Postgres schema and writes the TypeScript types. Its shortcuts produce SQL you can read and predict, and you can always drop down to a plain `sql` template. No ORM, no models, no hidden state.
{.lede}

<div class="ctas">

[Get started](/install){.btn .primary} [Switching from Zapatos](/switching){.btn}

</div>

<InstallLine command="npm install zapatos@npm:@pgcast/pgcast" />
</section>

<CastPanel example="home">

<<< ./examples/home.ts{ts twoslash}

<template #caption><span>Hover a dashed name to see its type.</span><span>Films with their cast, in one query and one round trip.</span></template>
</CastPanel>

<div class="pillars">
<div>

## Postgres is the source

Types come from `pg_catalog`, never written by hand. Change a column, regenerate, and the compiler finds every query that broke.

</div>
<div>

## SQL you can read

Each shortcut writes one documented query. Log it, test it, or write it yourself in a `sql` template.

</div>
<div>

## Values are parameters

Values travel as `$1`, `$2`. Names are quoted as Postgres quotes them, so a stray `"` cannot change your query.

</div>
<div>

## Drop-in for Zapatos

Same module names, same SQL, same types. Safer behaviours wait behind opt-ins until 7.0.

</div>
</div>

<div class="readnext">

[**Tutorial**<small>Install pgcast and run your first typed query.</small>](/tutorial)
[**How-to guides**<small>Laterals, pages, batches, retries: one task each.</small>](/guides)
[**Reference**<small>Every export and option, and the SQL it writes.</small>](/reference)
[**Explanation**<small>Why pgcast works as it does.</small>](/explanation)

</div>

<SiteFooter />
</div>
