<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The cast panel of docs/design/art-direction.md: what you write (the slot, an example shown with Twoslash), what
// Postgres runs and what TypeScript knows (both computed at build by cast.data.ts from the same example). On a docs
// page, "Open in playground" ends the code's label: a link made at build (playgroundLinks.ts), named after its section.
import { computed } from 'vue';
import { data } from '../cast.data.ts';
import { useWords } from './words.ts';

const
  props = defineProps<{ example: string; playground?: string; section?: string }>(),
  cast = data[props.example],
  { w } = useWords(),
  // its SQL and its type, rendered once for both languages: their copy buttons named in the page's
  localized = (html: string) => html.replace('title="Copy code" data-copied="Copied"',
    () => `title="${w.value.copyCode}" data-copied="${w.value.copied}"`),
  sql = computed(() => localized(cast?.sql ?? '')),
  type = computed(() => localized(cast?.type ?? ''));

if (!cast) throw new Error(`<CastPanel example="${props.example}">: there is no examples/${props.example}.ts`);
</script>

<template>
  <div class="CastPanel-frame">
    <div class="CastPanel" role="group" :aria-label="w.castPanel">
      <div>
        <!-- two paragraphs, not a `v-if` inside one: without a link, the label's HTML is what it was -->
        <p v-if="playground" class="label">
          <em>TS</em>{{ w.youWrite }}
          <a class="CastPanel-open" :href="playground" :aria-label="w.openInPlaygroundOf(section ?? '')">{{ w.openInPlayground }}</a>
        </p>
        <p v-else class="label"><em>TS</em>{{ w.youWrite }}</p>
        <slot />
      </div>
      <div>
        <p class="label"><em>SQL</em>{{ w.postgresRuns }}</p>
        <div v-html="sql" />
        <p class="values">{{ w.values }} <b>{{ cast.values }}</b></p>
      </div>
      <div>
        <p class="label"><em>::</em>{{ w.typescriptKnows }}</p>
        <div v-html="type" />
      </div>
    </div>
    <p v-if="$slots.caption" class="CastPanel-caption"><slot name="caption" /></p>
  </div>
</template>
