<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The mould beside the home's hero (docs/design/art-direction.md § Signature components): a table of schema.sql, and
// the type pgcast generates from it, both read at build by mould.data.ts.
import { data } from '../mould.data.ts';

const
  props = defineProps<{ table: string }>(),
  mould = data[props.table];

if (!mould) throw new Error(`<SchemaMould table="${props.table}">: schema.sql has no CREATE TABLE ${props.table}`);
</script>

<template>
  <div class="SchemaMould" role="group" :aria-label="`The ${table} table, and the type pgcast generates from it`">
    <div>
      <p class="label"><em>SQL</em>schema.sql</p>
      <div v-html="mould.sql" />
    </div>
    <div class="poured">
      <p class="label"><em>::</em>zapatos/schema.d.ts<code class="command">npx zapatos</code></p>
      <div v-html="mould.type" />
    </div>
  </div>
</template>
