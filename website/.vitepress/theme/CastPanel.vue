<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The cast panel of docs/design/art-direction.md: what you write (the slot, an example shown with Twoslash), what
// Postgres runs and what TypeScript knows (both computed at build by cast.data.ts from the same example).
import { data } from '../cast.data.ts';

const
  props = defineProps<{ example: string }>(),
  cast = data[props.example];

if (!cast) throw new Error(`<CastPanel example="${props.example}">: there is no examples/${props.example}.ts`);
</script>

<template>
  <div class="CastPanel-frame">
    <div class="CastPanel" role="group" aria-label="What you write, what Postgres runs, what TypeScript knows">
      <div>
        <h5><em>TS</em>You write</h5>
        <slot />
      </div>
      <div>
        <h5><em>SQL</em>Postgres runs</h5>
        <div v-html="cast.sql" />
        <p class="values">values <b>{{ cast.values }}</b></p>
      </div>
      <div>
        <h5><em>::</em>TypeScript knows</h5>
        <div v-html="cast.type" />
      </div>
    </div>
    <p v-if="$slots.caption" class="CastPanel-caption"><slot name="caption" /></p>
  </div>
</template>
