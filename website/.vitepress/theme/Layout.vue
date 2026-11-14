<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// VitePress's layout, plus the wordmark and the version pill by it, the footer under every page and the 404 page.
import DefaultTheme from 'vitepress/theme-without-fonts';
import NotFound from './NotFound.vue';
import PageActions from './PageActions.vue';
import SiteFooter from './SiteFooter.vue';
import Wordmark from './Wordmark.vue';

const version = __PGCAST_VERSION__;  // the root package.json's (config.ts)
</script>

<template>
  <DefaultTheme.Layout>
    <template #nav-bar-title-before><Wordmark /></template>
    <template #nav-bar-title-after>
      <span class="version" title="Version shown in these docs">{{ version }}</span>
    </template>
    <template #doc-before><PageActions /></template>
    <template #doc-after><SiteFooter /></template>
    <template #not-found><NotFound /></template>
  </DefaultTheme.Layout>
</template>
