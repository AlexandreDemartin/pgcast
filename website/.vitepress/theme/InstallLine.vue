<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The home's install command, one quiet line under the hero's buttons, and its copy button: "Copied" for 1.4 s, or the
// command selected when the clipboard is refused (docs/design/art-direction.md § Signature components).
import { ref } from 'vue';

const
  props = defineProps<{ command: string }>(),
  copied = ref(false),
  code = ref<HTMLElement>();

async function copy() {
  try {
    await navigator.clipboard.writeText(props.command);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1400);
  } catch {
    if (code.value) getSelection()?.selectAllChildren(code.value);
  }
}
</script>

<template>
  <div class="InstallLine">
    <span class="dollar" aria-hidden="true">$</span>
    <code ref="code">{{ command }}</code>
    <button type="button" class="copy" aria-label="Copy the install command" @click="copy">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path v-if="copied" d="M20 6 9 17l-5-5" />
        <template v-else><rect x="8" y="8" width="14" height="14" rx="2" /><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" /></template>
      </svg>
    </button>
    <span class="copied" aria-live="polite">{{ copied ? 'Copied' : '' }}</span>
  </div>
</template>
