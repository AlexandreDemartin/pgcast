<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The top bar's wordmark, PG⟨mark⟩CAST (docs/design/art-direction.md § Identity), in the link to the home: the mark is
// favicon.svg's tile drawn on a 14px grid, the cap height of the letters, so that it stays sharp at 1x and 2x. Its name
// is "pgcast"; what it shows is hidden from assistive technology. The server renders it at rest. On the first page of a
// session, config.ts's pre-paint script sets `data-wordmark` on <html> to the entrance chosen there, A or B, and
// style.css plays it; this removes the attribute once the entrance is over, so that it never plays again on this page.
import { onMounted, ref } from 'vue';

const wordmark = ref<HTMLElement>();

onMounted(() => {
  const root = document.documentElement;
  if (root.dataset.wordmark === undefined || !wordmark.value) return;
  const done = () => { delete root.dataset.wordmark; };
  // nothing left to wait for if the entrance ended before the page's script ran
  Promise.all(wordmark.value.getAnimations({ subtree: true }).map(animation => animation.finished)).then(done, done);
});
</script>

<template>
  <span ref="wordmark" class="Wordmark">
    <span class="visually-hidden">pgcast</span>
    <!-- each letter's `--i`, its rank from the tile, staggers entrance B -->
    <span class="pg" aria-hidden="true"><span><span style="--i: 1">P</span><span style="--i: 0">G</span></span></span>
    <svg class="mark" viewBox="0 0 14 14" aria-hidden="true">
      <!-- favicon.svg's tile on 14px: its radius 3/16 of the side; four 3px holes, 2px in, 4px apart -->
      <path
        fill-rule="evenodd"
        d="M2.625 0h8.75A2.625 2.625 0 0 1 14 2.625v8.75A2.625 2.625 0 0 1 11.375 14h-8.75A2.625 2.625 0 0 1 0 11.375v-8.75A2.625 2.625 0 0 1 2.625 0ZM2.5 2h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5ZM9.5 2h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5ZM2.5 9h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5ZM9.5 9h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5Z"
      />
    </svg>
    <span class="cast" aria-hidden="true"><span><span style="--i: 0">C</span><span style="--i: 1">A</span><span style="--i: 2">S</span><span style="--i: 3">T</span></span></span>
  </span>
</template>
