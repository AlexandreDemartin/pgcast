<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The playground of decision 005. Its page's HTML is the slot, a cast panel computed at build: what a phone shows,
// read-only. A computer shows a skeleton of the editor instead, from the server's HTML until the editor loads. Monaco
// is imported here alone, on mount, so that no other page loads it; its README: "Is the editor supported in mobile
// browsers? No."
// A link's code (`#code/…`, playground/share.ts) takes the slot's place, read-only, and is given to the editor, which
// runs it only on Run: nothing here runs it.
import { onMounted, shallowRef, type Component } from 'vue';
import { codeOf, limit } from '../playground/share.ts';
import { useWords } from './words.ts';

const
  editor = shallowRef<Component>(),
  phone = shallowRef(false),
  shared = shallowRef<string | null>(),  // a link's code; `null` for a link whose code cannot be read
  { w } = useWords(),
  // the skeleton's lines, [indent, width] in ch (0 wide: a blank line; `full`: as wide as the column), in the shape of
  // the editor's first frame: the tutorial's first query, its long third line wrapped (`wrapped`, `wrapped-twice`: the
  // lines it takes on, by the column's width, below); then its SQL, and its type. Each column as tall as the editor's,
  // so nothing moves when it replaces them.
  full = 999,
  skeleton: Record<'code' | 'sql' | 'type', [indent: number, width: number, wrap?: string][]> = {
    code: [[0, 33], [0, 25], [0, full], [2, full, 'wrapped-twice'], [2, 36, 'wrapped'], [0, 0], [0, 42], [2, 28],
      [0, 13], [0, 0]],
    sql: [[0, 36], [0, 12], [0, 20], [0, 8]],
    type: [[0, 44], [0, 10], [0, 13], [2, 17], [2, 11], [2, 21], [2, 24], [2, 18], [2, 23], [2, 14], [0, 13]],
  };

// `import.meta.env.SSR` keeps Monaco out of the server bundle, which renders the slot and the skeleton only
if (!import.meta.env.SSR) onMounted(async () => {
  shared.value = await codeOf(location.hash);
  if (!matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)').matches) {
    phone.value = true;
    return;
  }
  editor.value = (await import('./PlaygroundEditor.vue')).default;
});
</script>

<template>
  <component :is="editor" v-if="editor" :shared="shared" />
  <template v-else>
    <p v-if="phone && typeof shared === 'string'">{{ w.playgroundWords.phoneShared }}</p>
    <!-- rendered by the server too, and shown by style.css where the editor will not load: no shift once the page runs -->
    <p v-else-if="typeof shared !== 'string'" class="Playground-phone">{{ w.playgroundWords.phone }}</p>
    <p v-if="shared === null">{{ w.playgroundWords.broken(limit / 1000) }}</p>
    <div v-if="typeof shared === 'string'" class="CastPanel-frame Playground-static">
      <!-- one column: the link's code alone, with no SQL or type until the editor computes them -->
      <div class="CastPanel" style="grid-template-columns: minmax(0, 1fr)" role="group" :aria-label="w.playgroundWords.linkCode">
        <div>
          <p class="label"><em>TS</em>{{ w.youWrite }}</p>
          <div class="language-ts"><pre class="shiki pgcast" tabindex="0"><code>{{ shared }}</code></pre></div>
        </div>
      </div>
    </div>
    <div v-else class="Playground-static"><slot /></div>
    <!-- the editor's panel, its labels and its lines' places; rendered by the server, shown where the editor loads -->
    <div v-if="!phone" class="CastPanel-frame Playground-skeleton" role="status" aria-busy="true">
      <span class="visually-hidden">{{ w.playgroundWords.loading }}</span>
      <div class="CastPanel" aria-hidden="true">
        <div>
          <p class="label"><em>TS</em>{{ w.youWrite }}</p>
          <div class="lines code">
            <span
              v-for="([indent, width, wrap], i) in skeleton.code" :key="i" :class="wrap"
              :style="{ '--indent': indent, '--width': width }"
            />
          </div>
        </div>
        <div>
          <p class="label"><em>SQL</em>{{ w.postgresRuns }}<span class="button run" /><span class="button share" /></p>
          <div class="lines">
            <span
              v-for="([indent, width], i) in skeleton.sql" :key="i" :style="{ '--indent': indent, '--width': width }"
            />
          </div>
          <p class="values"><span :style="{ '--indent': 0, '--width': 30 }" /></p>
        </div>
        <div>
          <p class="label"><em>::</em>{{ w.typescriptKnows }}</p>
          <div class="lines">
            <span
              v-for="([indent, width], i) in skeleton.type" :key="i" :style="{ '--indent': indent, '--width': width }"
            />
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
/* where the editor loads (the test above, and scripts on), the skeleton takes the slot's place from the first paint;
   elsewhere the slot stays, and a phone drops the skeleton once the page runs */
.Playground-skeleton { display: none; }
@media (scripting: enabled) and (min-width: 768px) and (hover: hover) and (pointer: fine) {
  .Playground-skeleton { display: block; }
  .Playground-static { display: none; }
}

/* a line: a bar in the column's code type, as long as the text it stands for, vertically in its middle. Monaco's
   rhythm in the code column (PlaygroundEditor.vue: 21px lines, 14px above and below, the text 16px in); a cast panel's
   in the others (style.css § the cast panel) */
/* a column of flex items: their margins do not collapse */
.lines { display: flex; flex-direction: column; padding: 14px 16px; font: 13px/1.6 var(--font-mono); }
.lines.code { flex: none; line-height: 21px; }
/* the third line takes two lines, but one where the column is wide enough, and three in the narrowest two columns:
   measured with the editor's font, between 768px and 1440px wide (a page's panel is 1052px at most) */
.lines .wrapped-twice { display: none; }
@container (min-width: 869px) and (max-width: 900px) { .lines .wrapped { display: none; } }
@container (min-width: 901px) and (max-width: 941px) { .lines .wrapped-twice { display: block; } }
.lines > span, .values > span {
  display: block; position: relative; overflow: hidden;
  width: min(calc(var(--width) * 1ch), 100% - var(--indent) * 1ch); height: 8px;
  margin: calc((1lh - 8px) / 2) 0 calc((1lh - 8px) / 2) calc(var(--indent) * 1ch);
  border-radius: 4px; background: var(--raised);
}
/* Run and Share, at the end of the SQL label, as tall and wide as they come */
.label .button { height: 24px; margin: -6px 0; border-radius: 9px; background: var(--raised); }
.label .run { width: 64px; margin-left: auto; }
.label .share { width: 74px; }

/* the shimmer: a band of teal light, 40% of the panel wide, that crosses it left to right every 1.4s, on each bar at
   once: it starts at the panel's left edge (`cqw`, the cast panel's frame is a container), less the column's own
   (`--x`). It moves by a transform in % of its own width, which the compositor runs. With reduced motion, no band:
   the bars stand still */
.lines > span::after, .values > span::after {
  content: ''; position: absolute; top: 0; bottom: 0; left: calc(-1 * var(--x, 0px)); width: 40cqw;
  background: linear-gradient(90deg, transparent,
    color-mix(in srgb, var(--accent) 18%, var(--raised)), transparent);
  transform: translateX(-100%);
  animation: skeleton-sweep 1.4s ease-in-out infinite;
}
@keyframes skeleton-sweep { to { transform: translateX(250%); } }  /* the panel's whole width: 100 / 40 */
/* each column's left edge in the panel, as style.css lays it out: 1.15fr 1fr 1fr, then two columns, then one */
.CastPanel > div:nth-child(2) { --x: calc(100cqw * 1.15 / 3.15); }
.CastPanel > div:nth-child(3) { --x: calc(100cqw * 2.15 / 3.15); }
@container (max-width: 1139px) {
  .CastPanel > div:nth-child(2) { --x: 50cqw; }
  .CastPanel > div:nth-child(3) { --x: 0px; }
}
@container (max-width: 900px) { .CastPanel > div:nth-child(2) { --x: 0px; } }
@media (prefers-reduced-motion: reduce) {
  .lines > span::after, .values > span::after { display: none; }
}
</style>
