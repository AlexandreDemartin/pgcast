<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// VitePress's layout, plus the wordmark and the version pill by it, a written page's actions (beside its title, or
// under "On this page" where that rail shows: PageActions.vue), the footer under every page and the 404 page; and, on
// each page, its code groups of package managers on the reader's pick (packageManager.ts).
import { onMounted, onUnmounted } from 'vue';
import { onContentUpdated } from 'vitepress';
import DefaultTheme from 'vitepress/theme-without-fonts';
import NotFound from './NotFound.vue';
import PageActions from './PageActions.vue';
import SiteFooter from './SiteFooter.vue';
import Wordmark from './Wordmark.vue';
import { rememberPicked, showRemembered } from './packageManager.ts';

const version = __PGCAST_VERSION__;  // the root package.json's (config.ts)

onContentUpdated(showRemembered);
onMounted(() => window.addEventListener('change', rememberPicked));
onUnmounted(() => window.removeEventListener('change', rememberPicked));
</script>

<template>
  <DefaultTheme.Layout>
    <template #nav-bar-title-before><Wordmark /></template>
    <template #nav-bar-title-after>
      <span class="version" title="Version shown in these docs">{{ version }}</span>
    </template>
    <template #doc-before><PageActions place="title" /></template>
    <template #aside-outline-after><PageActions place="rail" /></template>
    <template #doc-after><SiteFooter /></template>
    <template #not-found><NotFound /></template>
  </DefaultTheme.Layout>
</template>
