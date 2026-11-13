<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// A diagram of security.md § Values never enter the SQL (docs/design/art-direction.md § Diagrams): a caller's value
// travels as a parameter, beside the SQL text, and Postgres binds it only once it has parsed the text. Drawn top to
// bottom at 400 units wide, so a phone shows it at nearly its size; coloured by the theme's tokens (style.css,
// `.Diagram`). Its SQL is the span that the page probes beside it; every fact it shows, the page's text says too.
const arrows = [[200, 56, 78], [100, 134, 160], [300, 134, 160], [100, 246, 272], [300, 246, 272]];
</script>

<template>
  <figure class="Diagram">
    <svg viewBox="0 0 400 378" width="400" role="img" aria-labelledby="values-flow-title values-flow-desc">
      <title id="values-flow-title">A value travels beside the SQL, never inside it</title>
      <desc id="values-flow-desc">
        The caller's title, x' OR 'a' = 'a, goes to pgcast's select('films', { title }). pgcast sends two things apart:
        the SQL text, ending WHERE ("title" = $1), and the values, ["x' OR 'a' = 'a"]. Postgres parses the text first,
        then binds $1, which by then can only be data: a title no film has, so no row.
      </desc>
      <g aria-hidden="true">
        <rect class="box" x=".5" y=".5" width="399" height="55" rx="10" />
        <text class="label" x="16" y="22">The caller's title</text>
        <text class="code param" x="16" y="42">x' OR 'a' = 'a</text>

        <rect class="box accent" x=".5" y="80.5" width="399" height="53" rx="10" />
        <text class="label accent" x="16" y="102">pgcast compiles</text>
        <text class="code" x="16" y="122">select('films', { title })</text>

        <rect class="box" x=".5" y="162.5" width="188" height="83" rx="10" />
        <text class="label" x="16" y="184">SQL text</text>
        <text class="code" x="16" y="206">… WHERE</text>
        <text class="code" x="16" y="226">("title" = <tspan class="param">$1</tspan>)</text>

        <rect class="box" x="211.5" y="162.5" width="188" height="83" rx="10" />
        <text class="label" x="227" y="184">values, beside it</text>
        <text class="code" x="227" y="206">[<tspan class="param">"x' OR 'a' = 'a"</tspan>]</text>

        <rect class="box" x=".5" y="272.5" width="399" height="105" rx="10" />
        <text class="label" x="16" y="294">Postgres</text>
        <text class="text" x="16" y="316">1. parses the text</text>
        <text class="text" x="16" y="336">2. binds <tspan class="code param">$1</tspan>, which by then can only be data</text>
        <text class="text" x="16" y="356">3. finds no film with that title: no row</text>

        <template v-for="[x, from, to] in arrows" :key="`${x}-${from}`">
          <line class="arrow" :x1="x" :y1="from" :x2="x" :y2="to - 6" />
          <path class="head" :d="`M${x - 5} ${to - 8} L${x + 5} ${to - 8} L${x} ${to} Z`" />
        </template>
      </g>
    </svg>
    <figcaption>The SQL text and the values travel apart: Postgres parses the text before it binds a value.</figcaption>
  </figure>
</template>
