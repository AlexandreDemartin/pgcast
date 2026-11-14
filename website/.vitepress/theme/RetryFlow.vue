<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// A diagram of transaction.md § Retries (docs/design/art-direction.md § Diagrams): an attempt either resolves, or is
// rolled back and run again whole on 40001 or 40P01, or is rolled back and rejects. Drawn top to bottom at 400 units
// wide, as ValuesFlow.vue; coloured by the theme's tokens (style.css, `.Diagram`). Its SQL is what the page probes in
// § The SQL it sends; every fact it shows, the page's text says too, in each language.
import { computed } from 'vue';
import { useWords } from './words.ts';

const
  branches = [156, 245, 344],  // the middle of each outcome's box, where its arrow from the spine ends
  texts = {
    en: {
      title: 'A transaction retried on 40001 or 40P01',
      desc: 'An attempt: START TRANSACTION, the whole callback on the transaction\'s client, then COMMIT. If all three ' +
        'resolve, transaction() resolves with the callback\'s value. If one rejects with 40001 or 40P01 and an attempt ' +
        'is left, pgcast sends ROLLBACK, waits, 25 to 250 ms by default, and runs a new attempt. On any other error, or ' +
        'the last attempt\'s, it sends ROLLBACK and transaction() rejects with that error.',
      attempt: 'An attempt',
      callback: "the whole callback, on the transaction's client",
      resolve: 'all three resolve',
      gives: " gives the callback's value",
      retried: '40001 or 40P01, and an attempt left',
      wait: 'a wait, 25 to 250 ms by default, then again',
      other: "any other error, or the last attempt's",
      rejects: ' rejects with it',
      caption: 'On 40001 or 40P01, pgcast rolls back, waits and runs the whole attempt again; on any other error, it rolls back and rejects.',
    },
    fr: {
      title: 'Une transaction relancée sur 40001 ou 40P01',
      desc: 'Une tentative : START TRANSACTION, tout le callback sur le client de la transaction, puis COMMIT. Si les ' +
        'trois réussissent, transaction() se résout avec la valeur du callback. Si l’un est rejeté avec 40001 ou ' +
        '40P01 et qu’il reste une tentative, pgcast envoie ROLLBACK, attend, de 25 à 250 ms par défaut, et lance une ' +
        'nouvelle tentative. Sur toute autre erreur, ou celle de la dernière tentative, il envoie ROLLBACK et ' +
        'transaction() est rejetée avec cette erreur.',
      attempt: 'Une tentative',
      callback: 'tout le callback, sur le client de la transaction',
      resolve: 'les trois réussissent',
      gives: ' rend la valeur du callback',
      retried: '40001 ou 40P01, une tentative restante',
      wait: 'une pause, 25 à 250 ms par défaut, puis encore',
      other: 'une autre erreur, ou celle du dernier essai',
      rejects: ' est rejetée avec elle',
      caption: 'Sur 40001 ou 40P01, pgcast annule, attend et relance toute la tentative ; sur toute autre erreur, il annule et rejette.',
    },
  },
  { lang } = useWords(),
  t = computed(() => texts[lang.value]);
</script>

<template>
  <figure class="Diagram">
    <svg viewBox="0 0 400 382" width="400" role="img" aria-labelledby="retry-flow-title retry-flow-desc">
      <title id="retry-flow-title">{{ t.title }}</title>
      <desc id="retry-flow-desc">{{ t.desc }}</desc>
      <g aria-hidden="true">
        <rect class="box" x=".5" y=".5" width="359" height="103" rx="10" />
        <text class="label" x="16" y="22">{{ t.attempt }}</text>
        <text class="code" x="16" y="44">START TRANSACTION</text>
        <text class="text" x="16" y="64">{{ t.callback }}</text>
        <text class="code" x="16" y="84">COMMIT</text>

        <rect class="box" x="40.5" y="128.5" width="319" height="55" rx="10" />
        <text class="label" x="56" y="150">{{ t.resolve }}</text>
        <text class="text" x="56" y="170"><tspan class="code">transaction()</tspan>{{ t.gives }}</text>

        <rect class="box accent" x="40.5" y="207.5" width="319" height="75" rx="10" />
        <text class="label accent" x="56" y="229">{{ t.retried }}</text>
        <text class="code" x="56" y="251">ROLLBACK</text>
        <text class="text" x="56" y="271">{{ t.wait }}</text>

        <rect class="box" x="40.5" y="306.5" width="319" height="75" rx="10" />
        <text class="label" x="56" y="328">{{ t.other }}</text>
        <text class="code" x="56" y="350">ROLLBACK</text>
        <text class="text" x="56" y="370"><tspan class="code">transaction()</tspan>{{ t.rejects }}</text>

        <line class="arrow" x1="20" y1="104" x2="20" :y2="branches[2]" />
        <template v-for="y in branches" :key="y">
          <line class="arrow" x1="20" :y1="y" x2="34" :y2="y" />
          <path class="head" :d="`M32 ${y - 5} L32 ${y + 5} L40 ${y} Z`" />
        </template>

        <path class="arrow" fill="none" d="M360 245 H385 V52 H368" />
        <path class="head" d="M368 47 L368 57 L360 52 Z" />
      </g>
    </svg>
    <figcaption>{{ t.caption }}</figcaption>
  </figure>
</template>
