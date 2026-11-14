<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// A diagram of transaction.md § Retries (docs/design/art-direction.md § Diagrams): an attempt either resolves, or is
// rolled back and run again whole on 40001 or 40P01, or is rolled back and rejects. Drawn top to bottom at 400 units
// wide, as ValuesFlow.vue; coloured by the theme's tokens (style.css, `.Diagram`). Its SQL is what the page probes in
// § The SQL it sends; every fact it shows, the page's text says too, in each language.
import { computed } from 'vue';
import { useWords } from './words.ts';

const
  branches = [156, 245, 344],  // the middle of each outcome's box, where its arrow from the spine ends
  { w } = useWords(),
  t = computed(() => w.value.diagrams.retry);  // its texts in the page's language (words.ts)
</script>

<template>
  <figure class="Diagram">
    <svg viewBox="0 0 400 382" width="400" role="img" aria-labelledby="retry-flow-title retry-flow-desc">
      <title id="retry-flow-title">{{ t.title }}</title>
      <desc id="retry-flow-desc">{{ t.desc }}</desc>
      <g aria-hidden="true">
        <rect class="box" x=".5" y=".5" width="359" height="103" rx="10" />
        <text class="label" x="16" y="22">{{ t.attempt }}</text>
        <text class="code" x="16" y="44">START TRANSACTION</text>
        <text class="text" x="16" y="64">{{ t.callback }}</text>
        <text class="code" x="16" y="84">COMMIT</text>

        <rect class="box" x="40.5" y="128.5" width="319" height="55" rx="10" />
        <text class="label" x="56" y="150">{{ t.resolve }}</text>
        <text class="text" x="56" y="170"><tspan class="code">transaction()</tspan>{{ t.gives }}</text>

        <rect class="box accent" x="40.5" y="207.5" width="319" height="75" rx="10" />
        <text class="label accent" x="56" y="229">{{ t.retried }}</text>
        <text class="code" x="56" y="251">ROLLBACK</text>
        <text class="text" x="56" y="271">{{ t.wait }}</text>

        <rect class="box" x="40.5" y="306.5" width="319" height="75" rx="10" />
        <text class="label" x="56" y="328">{{ t.other }}</text>
        <text class="code" x="56" y="350">ROLLBACK</text>
        <text class="text" x="56" y="370"><tspan class="code">transaction()</tspan>{{ t.rejects }}</text>

        <line class="arrow" x1="20" y1="104" x2="20" :y2="branches[2]" />
        <template v-for="y in branches" :key="y">
          <line class="arrow" x1="20" :y1="y" x2="34" :y2="y" />
          <path class="head" :d="`M32 ${y - 5} L32 ${y + 5} L40 ${y} Z`" />
        </template>

        <path class="arrow" fill="none" d="M360 245 H385 V52 H368" />
        <path class="head" d="M368 47 L368 57 L360 52 Z" />
      </g>
    </svg>
    <figcaption>{{ t.caption }}</figcaption>
  </figure>
</template>
