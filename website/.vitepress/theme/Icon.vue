<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// One of the site's icons (icons.ts), hidden from assistive technologies: the text beside it says what it does.
import { attributes, icons, type IconName } from './icons.ts';

defineProps<{ name: IconName }>();
</script>

<template>
  <svg class="icon" v-bind="attributes" v-html="icons[name]" />
</template>
