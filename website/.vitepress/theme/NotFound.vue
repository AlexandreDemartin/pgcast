<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The 404 page, in VitePress's `not-found` slot (Layout.vue): a line, the search, then each group of the outline and the
// home. Its head has no canonical nor Open Graph (`pageHead()`, meta.ts).
import { withBase } from 'vitepress';
import { outline } from '../outline.ts';

const links = [...outline.map(({ text, link }) => ({ text, link })), { text: 'Home', link: '/' }];

// the top bar's search button opens the dialog, so that `⌘K` and `/` keep a single listener
function search() {
  document.querySelector<HTMLButtonElement>('.VPNavBar .VPNavBarSearchButton')?.click();
}
</script>

<template>
  <div class="NotFound">
    <p class="eyebrow">-- 404: 0 rows</p>
    <h1>Page not found</h1>
    <p class="lede">
      Sorry: there's nothing at this address. The page may have moved, or the link may have a typo.
      Try a search, or start again from one of these.
    </p>
    <button type="button" class="search" @click="search">
      <span class="vpi-search" aria-hidden="true" />Search the docs
    </button>
    <ul>
      <li v-for="item in links" :key="item.link"><a :href="withBase(item.link)">{{ item.text }}</a></li>
    </ul>
  </div>
</template>
