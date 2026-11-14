// Copyright (C) 2026 Alexandre Demartin
// The words of the page's language (../words.ts), for the theme's components: VitePress's `localeIndex` is `root` on
// the English site, `fr` on the French one.
import { computed } from 'vue';
import { useData } from 'vitepress';
import { prefixOf, words, type Lang } from '../words.ts';

export function useWords() {
  const
    { localeIndex } = useData(),
    lang = computed<Lang>(() => localeIndex.value === 'fr' ? 'fr' : 'en');
  return { lang, w: computed(() => words[lang.value]), prefix: computed(() => prefixOf(lang.value)) };
}
