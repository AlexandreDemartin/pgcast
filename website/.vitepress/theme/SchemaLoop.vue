<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The home's loop (docs/design/art-direction.md § Signature components): a column changes, the generated type follows,
// and the compiler flags the query that broke. All three computed at build by loop.data.ts.
import { data as loop } from '../loop.data.ts';
</script>

<template>
  <div class="SchemaLoop" role="group" aria-label="A column changes, the type follows, the compiler flags the query">
    <div>
      <p class="label"><em>SQL</em>A column changes</p>
      <div v-html="loop.alter" />
    </div>
    <div>
      <p class="label"><em>::</em>The type follows<code class="command">npx zapatos</code></p>
      <div class="diff" v-html="loop.diff" />
    </div>
    <div>
      <p class="label"><em>TS</em>The query breaks<code class="command">npx tsc</code></p>
      <div v-html="loop.query" />
      <p v-for="error in loop.errors" :key="error.at" class="tsc-error">
        {{ error.at }} - <b>error</b> {{ error.code }}: {{ error.text }}
      </p>
    </div>
  </div>
</template>
