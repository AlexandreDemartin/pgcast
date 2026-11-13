<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The pages of a group of the outline, on its landing page: listed from outline.ts, so a new entry needs no change here,
// each title then its line, the page's description (groups.data.ts).
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import { data as lines } from '../groups.data.ts';
import { outline } from '../outline.ts';

const
  { page } = useData(),
  items = computed(() => outline.find(group => group.link === `/${page.value.relativePath.replace(/\.md$/, '')}`)?.items ?? []);
</script>

<template>
  <ul class="GroupPages">
    <li v-for="item in items" :key="item.link">
      <a :href="withBase(item.link)" v-html="item.text" />
      <p v-if="lines[item.link]">{{ lines[item.link] }}</p>
    </li>
  </ul>
</template>
