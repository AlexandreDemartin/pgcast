<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// Stands in for VitePress's VPNavTranslations (config.ts), the language switcher (README.md § Languages): in the bar, a
// globe and the page's language code, `FR`, then a menu of both languages by their own names, the page's ticked; each
// opens the same page in that language, its `#…` kept. In the `⋯` menu and the phone's nav screen, the same list. It
// keeps VitePress's own parts, for its keyboard, hover and overflow behaviour: VPFlyout, VPMenuLink, `useLangs` and
// `useNavOverflow`, imported from `vitepress/dist/`, where the pinned version (package.json) has them.
import { computed, ref, useId } from 'vue';
import { useData } from 'vitepress';
import VPFlyout from 'vitepress/dist/client/theme-default/components/VPFlyout.vue';
import VPLink from 'vitepress/dist/client/theme-default/components/VPLink.vue';
import VPMenuLink from 'vitepress/dist/client/theme-default/components/VPMenuLink.vue';
import { useLangs } from 'vitepress/dist/client/theme-default/composables/langs.js';
import { useNavOverflow } from 'vitepress/dist/client/theme-default/composables/nav-overflow.js';
import { languageKey } from '../words.ts';
import { svg } from './icons.ts';
import { useWords } from './words.ts';

const { screen = false, menu = false } = defineProps<{ screen?: boolean; menu?: boolean }>();

const
  { site } = useData(),
  { w } = useWords(),
  { localeLinks, currentLang } = useLangs({ linkToCorrespondingPage: true }),
  show = computed(() => localeLinks.value.length > 0 && !!currentLang.value.label),
  // only the bar's flyout takes part in the overflow into `⋯`, as VitePress's
  overflow = screen || menu ? null : useNavOverflow(),
  collapsed = computed(() => !!overflow && !overflow.state.translations),
  open = ref(false),
  listId = useId(),
  // every language in the config's order, the page's own ticked and linking the page itself
  items = computed(() => Object.values(site.value.locales).map(({ label, lang }) => {
    const other = localeLinks.value.find(link => link.text === label);
    return {
      text: other ? label : `${label}${svg('check')}`,
      link: other?.link ?? '',
      lang,
      current: !other,
    };
  })),
  // a language picked here is remembered: the home opens in it from then on (config.ts, `languageHome`)
  attributes = (lang?: string) => ({
    lang, hreflang: lang, rel: 'alternate', 'data-allow-mismatch': 'attribute',
    onClick: () => {
      try { localStorage.setItem(languageKey, lang?.split('-')[0] ?? ''); } catch { /* no storage: the browser's language */ }
    },
  });
</script>

<template>
  <!-- the phone's nav screen: an accordion -->
  <div v-if="screen && show" class="LanguageSwitch screen" :class="{ open }">
    <button type="button" class="title" :aria-expanded="open" :aria-controls="listId" @click="open = !open">
      <span class="vpi-globe icon" aria-hidden="true" />
      {{ currentLang.label }}
      <span class="vpi-chevron-down icon chevron" aria-hidden="true" />
    </button>
    <ul v-show="open" :id="listId" class="list">
      <li v-for="item in items.filter(item => !item.current)" :key="item.link">
        <VPLink class="link" :href="item.link" :external="false" v-bind="attributes(item.lang)">{{ item.text }}</VPLink>
      </li>
    </ul>
  </div>

  <!-- the `⋯` menu: a group, the bar's list -->
  <div v-else-if="menu && show" class="LanguageSwitch group">
    <ul class="items">
      <template v-for="item in items" :key="item.text">
        <li v-if="item.current" class="current" aria-current="true"><span v-html="item.text" /></li>
        <VPMenuLink v-else :item="{ text: item.text, link: item.link }" :external="false" v-bind="attributes(item.lang)" />
      </template>
    </ul>
  </div>

  <!-- the bar: the globe and the language's code, then the menu -->
  <VPFlyout
    v-else-if="!menu && show"
    class="LanguageSwitch bar"
    :class="{ collapsed }"
    icon="vpi-globe"
    :button="w.code"
    :label="`${w.changeLanguage}: ${currentLang.label}`"
    :ref="(instance: any) => overflow?.setClusterEl('translations', instance?.$el ?? null)"
  >
    <ul class="items">
      <template v-for="item in items" :key="item.text">
        <li v-if="item.current" class="current" aria-current="true"><span v-html="item.text" /></li>
        <VPMenuLink v-else :item="{ text: item.text, link: item.link }" :external="false" v-bind="attributes(item.lang)" />
      </template>
    </ul>
  </VPFlyout>
</template>
