<script lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// Stands in for VitePress's VPSwitchAppearance (config.ts): one button that cycles system → light → dark
// (docs/design/art-direction.md). The choice goes under VitePress's own key, which its pre-paint script reads, and
// a `storage` event tells VitePress's `isDark` (VueUse's useStorage) to follow, as VueUse itself does. The same event,
// from another tab, moves the icon here.
import { onMounted, onUnmounted, ref } from 'vue';
import { useData } from 'vitepress';
import Icon from './Icon.vue';
import type { IconName } from './icons.ts';

const
  key = 'vitepress-theme-appearance',
  modes = ['auto', 'light', 'dark'],
  names: Record<string, IconName> = { auto: 'system', light: 'light', dark: 'dark' },  // a mode's name, and its icon's
  mode = ref('auto');  // shared by the switches of the bar, the menu and the mobile screen
</script>

<script setup lang="ts">
// VitePress passes `aria-labelledby` in the `⋯` menu and the mobile screen: it would hide the mode in `aria-label`
defineOptions({ inheritAttrs: false });

const { isDark } = useData();

function show(stored: string | null) {
  mode.value = stored && modes.includes(stored) ? stored : 'auto';
}

function onStorage(e: StorageEvent) {
  if (e.key === key || e.key === null) show(e.newValue);  // `null`: the storage was cleared
}

onMounted(() => {
  try { show(localStorage.getItem(key)); } catch { /* no storage: the system decides */ }
  window.addEventListener('storage', onStorage);
});
onUnmounted(() => window.removeEventListener('storage', onStorage));

function cycle() {
  const next = modes[(modes.indexOf(mode.value) + 1) % modes.length];
  mode.value = next;
  try {
    const oldValue = localStorage.getItem(key);
    localStorage.setItem(key, next);
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue: next, storageArea: localStorage }));
  } catch {
    // no storage (some private windows): this page only
    isDark.value = next === 'dark' || (next === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  }
}
</script>

<template>
  <button
    type="button"
    class="AppearanceSwitch"
    :title="`Theme: ${names[mode]}`"
    :aria-label="`Colour theme: ${names[mode]}. Change it`"
    @click="cycle"
  >
    <Icon :name="names[mode]" />
  </button>
</template>
