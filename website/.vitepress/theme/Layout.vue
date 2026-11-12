<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// VitePress's layout, plus the version pill by the wordmark and the footer under every page.
import DefaultTheme from 'vitepress/theme-without-fonts';
import SiteFooter from './SiteFooter.vue';

const version = __PGCAST_VERSION__;  // the root package.json's (config.ts)
</script>

<template>
  <DefaultTheme.Layout>
    <template #nav-bar-title-after>
      <span class="version" title="Version shown in these docs">{{ version }}</span>
    </template>
    <template #doc-after><SiteFooter /></template>
  </DefaultTheme.Layout>
</template>
