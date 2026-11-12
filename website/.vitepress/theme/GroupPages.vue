<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The pages of a group of the outline, on its landing page: listed from outline.ts, so a new entry needs no change here.
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import { outline } from '../outline.ts';

const
  { page } = useData(),
  items = computed(() => outline.find(group => group.link === `/${page.value.relativePath.replace(/\.md$/, '')}`)?.items ?? []);
</script>

<template>
  <ul class="GroupPages">
    <li v-for="item in items" :key="item.link"><a :href="withBase(item.link)" v-html="item.text" /></li>
  </ul>
</template>
