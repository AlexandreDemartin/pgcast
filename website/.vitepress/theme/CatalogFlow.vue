<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// A diagram of catalog-types.md § Postgres describes itself (docs/design/art-direction.md § Diagrams): the generator
// reads the catalog and writes `zapatos/schema.d.ts`, against which TypeScript then checks your code, with no
// connection. Drawn top to bottom at 400 units wide, as ValuesFlow.vue; coloured by the theme's tokens (style.css,
// `.Diagram`). Every fact it shows, the page's text says too.
const arrows = [[200, 56, 80], [200, 136, 160], [200, 216, 240]];
</script>

<template>
  <figure class="Diagram">
    <svg viewBox="0 0 400 296" width="400" role="img" aria-labelledby="catalog-flow-title catalog-flow-desc">
      <title id="catalog-flow-title">Types read from the catalog, once</title>
      <desc id="catalog-flow-desc">
        Postgres's catalog, pg_catalog and information_schema, is read by pgcast's generator, npx pgcast, which writes
        zapatos/schema.d.ts. From then on, TypeScript checks your code against that file alone, without connecting
        again.
      </desc>
      <g aria-hidden="true">
        <rect class="box" x=".5" y=".5" width="399" height="55" rx="10" />
        <text class="label" x="16" y="22">Postgres's catalog</text>
        <text class="code" x="16" y="42">pg_catalog, information_schema</text>

        <rect class="box accent" x=".5" y="80.5" width="399" height="55" rx="10" />
        <text class="label accent" x="16" y="102">pgcast's generator asks it</text>
        <text class="code" x="16" y="122">npx pgcast</text>

        <rect class="box" x=".5" y="160.5" width="399" height="55" rx="10" />
        <text class="label" x="16" y="182">and writes the answers down</text>
        <text class="code" x="16" y="202">zapatos/schema.d.ts</text>

        <rect class="box" x=".5" y="240.5" width="399" height="55" rx="10" />
        <text class="label" x="16" y="262">Your code</text>
        <text class="text" x="16" y="282">checked against that file alone, no connection</text>

        <template v-for="[x, from, to] in arrows" :key="`${x}-${from}`">
          <line class="arrow" :x1="x" :y1="from" :x2="x" :y2="to - 6" />
          <path class="head" :d="`M${x - 5} ${to - 8} L${x + 5} ${to - 8} L${x} ${to} Z`" />
        </template>
      </g>
    </svg>
    <figcaption>The generator reads the catalog once; from then on, TypeScript checks your code against the file it wrote.</figcaption>
  </figure>
</template>
