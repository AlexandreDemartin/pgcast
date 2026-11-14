<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// A diagram of catalog-types.md § Postgres describes itself (docs/design/art-direction.md § Diagrams): the generator
// reads the catalog and writes `zapatos/schema.d.ts`, against which TypeScript then checks your code, with no
// connection. Drawn top to bottom at 400 units wide, as ValuesFlow.vue; coloured by the theme's tokens (style.css,
// `.Diagram`). Every fact it shows, the page's text says too, in each language.
import { computed } from 'vue';
import { useWords } from './words.ts';

const
  arrows = [[200, 56, 80], [200, 136, 160], [200, 216, 240]],
  { w } = useWords(),
  t = computed(() => w.value.diagrams.catalog);  // its texts in the page's language (words.ts)
</script>

<template>
  <figure class="Diagram">
    <svg viewBox="0 0 400 296" width="400" role="img" aria-labelledby="catalog-flow-title catalog-flow-desc">
      <title id="catalog-flow-title">{{ t.title }}</title>
      <desc id="catalog-flow-desc">{{ t.desc }}</desc>
      <g aria-hidden="true">
        <rect class="box" x=".5" y=".5" width="399" height="55" rx="10" />
        <text class="label" x="16" y="22">{{ t.catalog }}</text>
        <text class="code" x="16" y="42">pg_catalog, information_schema</text>

        <rect class="box accent" x=".5" y="80.5" width="399" height="55" rx="10" />
        <text class="label accent" x="16" y="102">{{ t.asks }}</text>
        <text class="code" x="16" y="122">npx pgcast</text>

        <rect class="box" x=".5" y="160.5" width="399" height="55" rx="10" />
        <text class="label" x="16" y="182">{{ t.writes }}</text>
        <text class="code" x="16" y="202">zapatos/schema.d.ts</text>

        <rect class="box" x=".5" y="240.5" width="399" height="55" rx="10" />
        <text class="label" x="16" y="262">{{ t.code }}</text>
        <text class="text" x="16" y="282">{{ t.checked }}</text>

        <template v-for="[x, from, to] in arrows" :key="`${x}-${from}`">
          <line class="arrow" :x1="x" :y1="from" :x2="x" :y2="to - 6" />
          <path class="head" :d="`M${x - 5} ${to - 8} L${x + 5} ${to - 8} L${x} ${to} Z`" />
        </template>
      </g>
    </svg>
    <figcaption>{{ t.caption }}</figcaption>
  </figure>
</template>
