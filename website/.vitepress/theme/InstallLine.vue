<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The home's install command and its Copy button: "Copied" for 1.4 s, or the command selected when the clipboard is
// refused (docs/design/art-direction.md § Signature components).
import { ref } from 'vue';

const
  props = defineProps<{ command: string }>(),
  label = ref('Copy'),
  code = ref<HTMLElement>();

async function copy() {
  try {
    await navigator.clipboard.writeText(props.command);
    label.value = 'Copied';
    setTimeout(() => { label.value = 'Copy'; }, 1400);
  } catch {
    if (code.value) getSelection()?.selectAllChildren(code.value);
  }
}
</script>

<template>
  <div class="InstallLine">
    <span class="dollar" aria-hidden="true">$</span>
    <code ref="code">{{ command }}</code>
    <button type="button" class="copy" @click="copy">{{ label }}</button>
  </div>
</template>
