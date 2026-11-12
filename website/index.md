---
layout: home
markdownStyles: false
title: pgcast
titleTemplate: Zero-abstraction Postgres for TypeScript
---

<div class="landing">
<section class="hero">

<p class="eyebrow">-- a maintained fork of Zapatos 6.6.1</p>
<h1>Your types, cast from your database<span class="op">::</span></h1>

pgcast reads your Postgres schema and writes the TypeScript types. Its shortcuts produce SQL you can read and predict, and you can always drop down to a plain `sql` template. No ORM, no models, no hidden state.
{.lede}

<div class="ctas">

[Get started](/install){.btn .primary} [Switching from Zapatos](/switching){.btn}

<InstallLine command="npm install zapatos@npm:pgcast" />
</div>
</section>

<CastPanel example="home">

<<< ./examples/home.ts{ts twoslash}

<template #caption><span>Hover a dashed name to see its type.</span><span>Films with their cast, in one query and one round trip.</span></template>
</CastPanel>

<div class="pillars">
<div>

### Postgres is the source

Types come from `pg_catalog`, never written by hand. Change a column, regenerate, and the compiler finds every query that broke.

</div>
<div>

### SQL you can read

Each shortcut writes one documented query. Log it, test it, or write it yourself in a `sql` template.

</div>
<div>

### Values are parameters

Values travel as `$1`, `$2`. Names are quoted as Postgres quotes them, so a stray `"` cannot change your query.

</div>
<div>

### Drop-in for Zapatos

Same module names, same SQL, same types. Safer behaviours wait behind opt-ins until 7.0.

</div>
</div>

<div class="readnext">

[**Install**<small>Add the package and run your first query.</small>](/install)
[**select()**<small>Read rows, with lateral joins and typed results.</small>](/select)
[**Opt-ins**<small>The safer behaviours, and their warnings.</small>](/opt-ins)

</div>

<SiteFooter />
</div>
