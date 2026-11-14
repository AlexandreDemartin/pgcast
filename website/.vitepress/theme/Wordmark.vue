<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The top bar's wordmark, PG⟨mark⟩CAST (docs/design/art-direction.md § Identity), in the link to the home: the mark is
// favicon.svg's tile drawn on a 14px grid, the cap height of the letters, so that it stays sharp at 1x and 2x. Its name
// is "pgcast"; what it shows is hidden from assistive technology. The server renders it at rest. When the home loads
// for the first time in a session, config.ts's pre-paint script sets `data-wordmark` on <html> and style.css plays the
// entrance; this removes the attribute once it is over, so that it never plays again on this page.
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
    <!-- each letter's `--delay` staggers the entrance outward from the tile, in gaps that shrink (120, 80, 50ms) -->
    <span class="pg" aria-hidden="true"><span style="--delay: 120ms">P</span><span style="--delay: 0ms">G</span></span>
    <svg class="mark" viewBox="0 0 14 14" aria-hidden="true">
      <!-- favicon.svg's tile on 14px: its radius 3/16 of the side; four 3px holes, 2px in, 4px apart -->
      <path
        fill-rule="evenodd"
        d="M2.625 0h8.75A2.625 2.625 0 0 1 14 2.625v8.75A2.625 2.625 0 0 1 11.375 14h-8.75A2.625 2.625 0 0 1 0 11.375v-8.75A2.625 2.625 0 0 1 2.625 0ZM2.5 2h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5ZM9.5 2h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5ZM2.5 9h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5ZM9.5 9h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5Z"
      />
    </svg>
    <span class="cast" aria-hidden="true"><span style="--delay: 0ms">C</span><span style="--delay: 120ms">A</span><span style="--delay: 200ms">S</span><span style="--delay: 250ms">T</span></span>
  </span>
</template>
