<!-- Copyright (C) 2026 Alexandre Demartin. The footer of docs/design/art-direction.md, on the home and under every page, in its language. -->
<script setup lang="ts">
import { useWords } from './words.ts';

const { w, prefix } = useWords();
</script>

<template>
  <p class="SiteFooter">
    {{ w.footer.maintained }} <a href="https://github.com/AlexandreDemartin">Alexandre Demartin</a>.
    {{ w.footer.zapatos }} <a href="https://github.com/jawj">George MacKerron</a>.
    {{ w.footer.licence }} <a :href="`${prefix}/changelog`">{{ w.footer.changelog }}</a>.
  </p>
</template>
