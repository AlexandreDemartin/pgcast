<script lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// Stands in for VitePress's VPSwitchAppearance (config.ts): one button that cycles system → light → dark
// (docs/design/art-direction.md). The choice goes under VitePress's own key, which its pre-paint script reads, and
// a `storage` event tells VitePress's `isDark` (VueUse's useStorage) to follow, as VueUse itself does. The same event,
// from another tab, moves the icon here.
import { onMounted, onUnmounted, ref } from 'vue';
import { useData } from 'vitepress';

const
  key = 'vitepress-theme-appearance',
  modes = ['auto', 'light', 'dark'],
  names: Record<string, string> = { auto: 'system', light: 'light', dark: 'dark' },
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <template v-if="mode === 'auto'"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></template>
      <template v-else-if="mode === 'light'">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </template>
      <path v-else d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  </button>
</template>
