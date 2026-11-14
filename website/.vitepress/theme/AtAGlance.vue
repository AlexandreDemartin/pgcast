<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// At a glance, under a long page's lede (docs/design/art-direction.md § Signature components): three to five bullets,
// the page's Markdown list in the slot. A label, not a heading, so "On this page" does not list it; llms.ts gives it
// back as `**At a glance**` (`**En bref**` in French).
import { useWords } from './words.ts';

const { w } = useWords();
</script>

<template>
  <aside class="AtAGlance" :aria-label="w.atAGlance">
    <p class="AtAGlance-label">{{ w.atAGlance }}</p>
    <slot />
  </aside>
</template>
