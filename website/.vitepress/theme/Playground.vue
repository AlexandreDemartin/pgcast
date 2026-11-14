<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The playground of decision 005. Its page's HTML is the slot, a cast panel computed at build: what a phone shows,
// read-only, and what a computer shows until the editor loads. Monaco is imported here alone, on mount, so that no
// other page loads it; its README: "Is the editor supported in mobile browsers? No."
// A link's code (`#code/…`, playground/share.ts) takes the slot's place, read-only, and is given to the editor, which
// runs it only on Run: nothing here runs it.
import { onMounted, shallowRef, type Component } from 'vue';
import { codeOf, limit } from '../playground/share.ts';

const
  editor = shallowRef<Component>(),
  state = shallowRef<'static' | 'loading' | 'phone'>('static'),
  shared = shallowRef<string | null>();  // a link's code; `null` for a link whose code cannot be read

// `import.meta.env.SSR` keeps Monaco out of the server bundle, which renders the slot only
if (!import.meta.env.SSR) onMounted(async () => {
  shared.value = await codeOf(location.hash);
  if (!matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)').matches) {
    state.value = 'phone';
    return;
  }
  state.value = 'loading';
  editor.value = (await import('./PlaygroundEditor.vue')).default;
});
</script>

<template>
  <component :is="editor" v-if="editor" :shared="shared" />
  <template v-else>
    <p v-if="state === 'phone' && typeof shared === 'string'">The playground edits and runs code on a computer. On a phone, here is the code of this link, read-only.</p>
    <!-- rendered by the server too, and shown by style.css where the editor will not load: no shift once the page runs -->
    <p v-else-if="typeof shared !== 'string'" class="Playground-phone">The playground edits code on a computer. On a phone, here is the tutorial's first query, read-only, with its SQL and its type.</p>
    <p v-if="shared === null">This link's code could not be read (damaged, or over {{ limit / 1000 }} KB), so here is the tutorial's first query.</p>
    <div v-if="typeof shared === 'string'" class="CastPanel-frame">
      <!-- one column: the link's code alone, with no SQL or type until the editor computes them -->
      <div class="CastPanel" style="grid-template-columns: minmax(0, 1fr)" role="group" aria-label="The code of this link">
        <div>
          <p class="label"><em>TS</em>You write</p>
          <div class="language-ts"><pre class="shiki pgcast" tabindex="0"><code>{{ shared }}</code></pre></div>
        </div>
      </div>
    </div>
    <slot v-else />
    <p v-if="state === 'loading'">Loading the editor…</p>
  </template>
</template>
