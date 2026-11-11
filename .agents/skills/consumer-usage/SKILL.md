---
name: consumer-usage
description: 'Valider un besoin et une API contre le corpus d’usages réels de Zapatos (Belco, Bienvenue) : où chercher, quoi relever, ce qui ne sort jamais du poste. USE FOR: justifier une option ou un helper, choisir une API, trouver les contournements existants, préparer une note de décision. DO NOT USE FOR: forme du helper (zero-abstraction).'
---

# Usage réel

Belco et Bienvenue sont un **corpus d'exemples**, pas la cible : pgcast vise un Zapatos qui fait le dernier kilomètre pour toute application (`docs/ROADMAP.md` § Objectif). Leurs contournements montrent où l'on sort du chemin typé.

## Où

| Projet | Chemin | Points d'entrée |
|---|---|---|
| Belco (pro) | `/Users/alex/Documents/PRO/Belco/hub` | `packages/server/src/utils/dbQueriesHelpers.ts` |
| Bienvenue (perso) | `/Users/alex/Documents/PERSO/Dev/Bienvenue` | `packages/server/src/utils/conditions.ts`, `.agents/skills/zapatos-queries/` |

## Règles

- **Lecture seule**, jamais de modification ni de commit dans ces dépôts.
- **Confidentialité** : le code de Belco ne sort pas du poste. Il n'est cité ni dans une PR, ni dans une issue, ni dans un service externe. Dans pgcast, on décrit le **motif**, jamais l'extrait ni un nom métier.
- **Chercher le contournement**, pas seulement l'usage : `as unknown as`, `runResultTransform` réécrit, `db.raw` sur une valeur, `sql```  qui réimplémente un shortcut, helper maison autour de `db.conditions`.
- **Un besoin vaut une API** s'il est **général à Postgres** (un motif que toute application rencontre) et s'il revient dans le corpus. Un choix propre à un projet (configuration `simple` + `unaccent`, nom de domaine métier) devient un paramètre, jamais un helper dédié. Un cas isolé reste un fragment `sql`.
- **L'API proposée** remplace le contournement sans changer le SQL produit, ou en le rendant valide (`and()` vide).

## Checklist

- [ ] Motif cité avec son nombre d'occurrences approximatif, sans extrait de Belco
- [ ] SQL du contournement comparé au SQL du helper proposé
- [ ] Migration de l'appelant décrite en une ligne
