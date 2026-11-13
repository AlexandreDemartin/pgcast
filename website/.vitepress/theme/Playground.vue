<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The playground of decision 005. Its page's HTML is the slot, a cast panel computed at build: what a phone shows,
// read-only, and what a computer shows until the editor loads. Monaco is imported here alone, on mount, so that no
// other page loads it; its README: "Is the editor supported in mobile browsers? No."
import { onMounted, shallowRef, type Component } from 'vue';

const
  editor = shallowRef<Component>(),
  state = shallowRef<'static' | 'loading' | 'phone'>('static');

// `import.meta.env.SSR` keeps Monaco out of the server bundle, which renders the slot only
if (!import.meta.env.SSR) onMounted(async () => {
  if (!matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)').matches) {
    state.value = 'phone';
    return;
  }
  state.value = 'loading';
  editor.value = (await import('./PlaygroundEditor.vue')).default;
});
</script>

<template>
  <component :is="editor" v-if="editor" />
  <template v-else>
    <p v-if="state === 'phone'">The playground edits code on a computer. On a phone, here is the tutorial's first query, read-only, with its SQL and its type.</p>
    <slot />
    <p v-if="state === 'loading'">Loading the editor…</p>
  </template>
</template>
