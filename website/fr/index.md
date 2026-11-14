---
english: 4a55a7ed608d
layout: home
markdownStyles: false
title: pgcast
titleTemplate: Postgres sans abstraction pour TypeScript
description: "pgcast lit votre schéma Postgres et écrit les types TypeScript. Un SQL lisible et prévisible : pas d’ORM, pas de modèles, pas d’état caché."
---

<main class="landing">
<section class="hero">

<p class="eyebrow">-- un fork maintenu de <a href="/fr/switching">Zapatos 6.6.1</a></p>

<h1>Vos types, moulés sur votre base<span class="op">::</span></h1>

pgcast lit votre schéma Postgres et écrit les types TypeScript. Ses raccourcis produisent un SQL que vous pouvez lire et prévoir, et vous pouvez toujours revenir à un simple template `sql`. Pas d’ORM, pas de modèles, pas d’état caché.
{.lede}

<div class="ctas">

[Commencer](/fr/install){.btn .primary} [Playground](/fr/playground){.btn}

</div>

<InstallLine :commands="['npm install zapatos@npm:@pgcast/pgcast', 'pnpm add zapatos@npm:@pgcast/pgcast', 'yarn add zapatos@npm:@pgcast/pgcast@^6', 'bun add zapatos@npm:@pgcast/pgcast@^6']" />
</section>

<CastPanel example="home">

<<< ../examples/home.ts{ts twoslash}

<template #caption><span>Des films avec leur distribution, en une requête et un aller-retour.</span><span>Survolez un nom souligné en pointillés pour voir son type.</span></template>
</CastPanel>

<div class="pillars">
<div>

## Postgres est la source {#postgres-is-the-source}

Les types viennent de `pg_catalog`, jamais écrits à la main. Changez une colonne, régénérez, et le compilateur trouve chaque requête cassée.

[Comment le catalogue devient des types](/fr/catalog-types){.next}

</div>
<div>

## Un SQL que vous pouvez lire {#sql-you-can-read}

Chaque raccourci écrit une requête documentée. Journalisez-la, testez-la, ou écrivez-la vous-même dans un template `sql`.

[Le SQL de chaque raccourci](/fr/reference){.next}

</div>
<div>

## Les valeurs sont des paramètres {#values-are-parameters}

Les valeurs voyagent en `$1`, `$2`. Les noms sont mis entre guillemets comme le fait Postgres, donc un `"` égaré ne peut pas changer votre requête.

[Ce contre quoi pgcast protège](/fr/security){.next}

</div>
<div>

## Playground en direct {#live-playground}

Écrivez une requête et voyez son SQL et son type pendant la saisie. Appuyez sur Exécuter, et un vrai Postgres répond, dans votre navigateur.

[Ouvrir le playground](/fr/playground){.next}

</div>
</div>

<div class="readnext">

[**Tutoriel**<small>Installez pgcast et lancez votre première requête typée.</small>](/fr/tutorial)
[**Guides pratiques**<small>Laterals, pages, lots, nouvelles tentatives : une tâche chacun.</small>](/fr/guides)
[**Référence**<small>Chaque export et chaque option, et le SQL qu’ils écrivent.</small>](/fr/reference)
[**Explication**<small>Pourquoi pgcast fonctionne comme il le fait.</small>](/fr/explanation)

</div>

<SiteFooter />
</main>
