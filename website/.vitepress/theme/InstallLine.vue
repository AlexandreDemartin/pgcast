<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The home's install command, beside the hero's buttons: one field as tall as they are, a tab per package manager (its
// mark, its name for assistive technology), then the command and a copy button, which copies the command shown: a tick
// and "Copied" for 1.4 s, or the command selected when the clipboard is refused (docs/design/art-direction.md § Layout,
// Home). On a phone, a card: the tabs, named, over the command. The tabs are WAI-ARIA's, picked as they get
// the focus (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/); the pick is remembered with the code groups'
// (packageManager.ts).
import { computed, onMounted, ref, useId } from 'vue';
import Icon from './Icon.vue';
import type { IconName } from './icons.ts';
import { remember, remembered } from './packageManager.ts';

const
  props = defineProps<{ commands: string[] }>(),  // each names its tab by its first word, the package manager
  names = computed(() => props.commands.map(command => command.split(' ')[0])),
  selected = ref(0),  // npm, the first, until the page is mounted: the server renders no stored pick
  name = computed(() => names.value[selected.value]),
  command = computed(() => props.commands[selected.value]),
  id = useId(),
  copied = ref(false),
  code = ref<HTMLElement>();

let timer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  const i = names.value.indexOf(remembered() ?? '');
  if (i > 0) selected.value = i;
});

function pick(i: number) {
  selected.value = i;
  copied.value = false;
  remember(names.value[i]);
}

function onKey(e: KeyboardEvent) {
  const
    n = props.commands.length,
    to =
      e.key === 'ArrowRight' ? (selected.value + 1) % n :
      e.key === 'ArrowLeft' ? (selected.value + n - 1) % n :
      e.key === 'Home' ? 0 :
      e.key === 'End' ? n - 1 :
      undefined;
  if (to === undefined) return;
  e.preventDefault();
  pick(to);
  ((e.currentTarget as HTMLElement).children[to] as HTMLElement).focus();
}

async function copy() {
  clearTimeout(timer);
  try {
    await navigator.clipboard.writeText(command.value);
    copied.value = true;
    timer = setTimeout(() => { copied.value = false; }, 1400);
  } catch {
    if (code.value) getSelection()?.selectAllChildren(code.value);
  }
}
</script>

<template>
  <div class="InstallLine">
    <div class="tabs" role="tablist" aria-label="Package manager" @keydown="onKey">
      <button
        v-for="(tab, i) in names"
        :id="`${id}-${tab}`"
        :key="tab"
        type="button"
        role="tab"
        :aria-selected="String(i === selected)"
        :aria-controls="`${id}-panel`"
        :tabindex="i === selected ? 0 : -1"
        @click="pick(i)"
      ><Icon :name="tab as IconName" /><span class="name">{{ tab }}</span></button>
    </div>
    <div :id="`${id}-panel`" class="panel" role="tabpanel" :aria-labelledby="`${id}-${name}`">
      <code ref="code"><span class="manager">{{ name }}</span>{{ command.slice(name.length) }}</code>
      <button type="button" class="copy" :aria-label="`Copy the ${name} command`" @click="copy">
        <span class="IconSwap" :class="{ done: copied }"><Icon name="copy" /><Icon name="check" /></span>
      </button>
    </div>
    <span class="copied" aria-live="polite">{{ copied ? 'Copied' : '' }}</span>
  </div>
</template>
