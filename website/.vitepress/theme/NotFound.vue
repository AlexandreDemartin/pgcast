<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The 404 page, in VitePress's `not-found` slot (Layout.vue): a line, the search, then each group of the outline and the
// home, in the language of the address (`/fr/…` is French). Its head has no canonical nor Open Graph (`pageHead()`, meta.ts).
import { computed } from 'vue';
import { withBase } from 'vitepress';
import { outlineIn } from '../outline.ts';
import { useWords } from './words.ts';

const
  { lang, w, prefix } = useWords(),
  links = computed(() => [
    ...outlineIn(lang.value).map(({ text, link }) => ({ text, link })), { text: w.value.notFound.home, link: `${prefix.value}/` },
  ]);

// the top bar's search button opens the dialog, so that `⌘K` and `/` keep a single listener
function search() {
  document.querySelector<HTMLButtonElement>('.VPNavBar .VPNavBarSearchButton')?.click();
}
</script>

<template>
  <div class="NotFound">
    <p class="eyebrow">{{ w.notFound.eyebrow }}</p>
    <h1>{{ w.notFound.title }}</h1>
    <p class="lede">{{ w.notFound.lede }}</p>
    <button type="button" class="search" @click="search">
      <span class="vpi-search" aria-hidden="true" />{{ w.searchDocs }}
    </button>
    <ul>
      <li v-for="item in links" :key="item.link"><a :href="withBase(item.link)">{{ item.text }}</a></li>
    </ul>
  </div>
</template>
