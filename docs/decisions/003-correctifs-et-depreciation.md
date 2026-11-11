# 003 — Correctifs cassants : corriger, ou déprécier

- **Statut** : accepté (2026-11-12), par délégation de l'utilisateur : « la meilleure solution selon la philosophie, ne pas tout casser, du deprecated fonctionnel et signalé ».
- **Portée** : les constats « cassant » de [RAPPORT-CARACTERISATION.md](../RAPPORT-CARACTERISATION.md), chapitre 2 de [SUIVI.md](../SUIVI.md).

## Contexte

29 constats sur 61 sont cassants : le correctif change un résultat aujourd'hui valide. La promesse de pgcast est qu'un projet sous Zapatos 6.6.1 change d'import sans réécrire son code (note 002).

## Standard du marché

| Référence | Ce qu'elle fait |
|---|---|
| Node.js, cycle de dépréciation | doc seule → avertissement à l'exécution (`DeprecationWarning`, code `DEPxxxx`) → retrait dans une version majeure |
| React Router, Remix : *future flags* | le nouveau comportement est opt-in par un drapeau, puis devient le défaut à la majeure suivante |
| TypeScript, la famille `--strict*` | une option par comportement plus sûr, désactivée par défaut |

## Règle

Trois classes, de la plus directe à la plus prudente :

| Classe | Critère | Ce qu'on fait | CHANGELOG |
|---|---|---|---|
| **Corriger** | Postgres refusait déjà le SQL, le type refusait déjà l'appel, ou l'ancien résultat contredit le nom, le type ou la doc de la fonction, si bien que personne ne peut raisonnablement en dépendre. Les failles de sécurité aussi. | correctif direct, test rouge d'abord | `Fixed` (`Security` pour une faille) |
| **Opt-in, puis défaut en 7.0** | Le résultat actuel est valide et du code peut en dépendre. | option de config (défaut : l'ancien comportement) ; l'ancien chemin émet **une fois par processus** un `DeprecationWarning` qui nomme l'option ; elle devient le défaut en 7.0 et l'ancien comportement disparaît en 8.0 | `Added` (l'option) + `Deprecated` (l'ancien comportement) |
| **Documenter** | Le comportement suit Postgres, ou il est voulu. | une ligne de doc ou de JSDoc | `Changed` (doc) |

- **Avertissement** :
  - runtime : `process.emitWarning(message, { type: 'DeprecationWarning', code: 'PGCAST_DEP00n' })`, seulement quand le chemin déprécié est réellement emprunté ;
  - codegen : par `warningListener`, seulement si le schéma est concerné.
  - Le message dit l'option à activer et que ce sera le défaut en 7.0.
- **Nom des options** : clés plates, à la manière des options existantes (`castArrayParamsToJson`, `unprefixedSchema`).
- **JSDoc** : `@deprecated` sur l'ancien comportement quand il a une forme propre (une valeur d'option, une signature).

## Les 10 constats cassants

| # | Classe | Pourquoi | Option (défaut = 6.6.1) |
|---|---|---|---|
| R4 | Corriger (`Security`) | le type promet une valeur ; une chaîne compilée en identifiant est aussi une voie d'injection | — |
| R8 | Opt-in | perte de données, mais du code peut compter sur la mise à jour de toutes les colonnes | `upsertUpdatesSharedColumnsOnly: true` : sans `updateColumns`, seules les colonnes présentes dans toutes les lignes sont mises à jour ; l'ancien chemin avertit dès que les lignes n'ont pas les mêmes clés |
| R9, R11 | Opt-in | `undefined` → `NULL` est observable et peut être voulu | `undefinedMeansMissing: true` : une valeur `undefined` se comporte comme une clé absente (`update` l'omet, `insert` envoie `DEFAULT`) ; l'ancien chemin avertit à la première valeur `undefined` |
| R12 | Corriger | `not()` doit nier toute sa condition ; `(NOT a) OR b` contredit son nom | — |
| R13 | Corriger | le type accepte un `Parameter`, le runtime l'enveloppe deux fois ; `Default` dans un filtre lève une erreur qui dit quoi faire | — |
| R14 | Opt-in | des centaines d'appels dans le corpus ; un `LIMIT 2` qui lève peut casser du code en production | `selectExactlyOneChecksForSecondRow: true` ; sans l'option, un avertissement à la première utilisation |
| R35 | Corriger | `never[]` ne sert à personne ; le type correct ne refuse aucun appel qui marchait | — |
| R40 | Opt-in (codegen) | `any` → union littérale peut refuser du code qui compile aujourd'hui | `typeEnumsAcrossSchemas: true` |
| R50 | Opt-in (codegen) | l'ordre du tuple `every.<enum>` est observable | `enumOrder: 'declared'` (défaut `'alphabetical'`, déprécié) |

## Les autres points d'arrêt du chapitre 2

- **`core.ts`** (R1, R2, R3, R13) : couverts par cette délégation. Relecture `élevé`, lentille `sql`, puis `verify`. Le SQL avant et après est écrit dans la PR.
- **Sortie du codegen non cassante** (R41, R47, R48, R49) : corriger. Une sortie invalide devient valide, ou des commentaires s'ajoutent. Le diff de snapshot est justifié ligne à ligne (skill `codegen-output`).
- **Casts de `param()`** (R27, R28) : corriger. Postgres refusait déjà ces requêtes.

## Conséquences

- Aucun projet sous 6.6.1 ne change de comportement sans l'avoir demandé, sauf pour un bug de la classe « Corriger ».
- La version 7.0 se résume à basculer les défauts des options listées ici ; elle est annoncée par les avertissements.
