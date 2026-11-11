---
name: consumer-usage
description: 'Valider un besoin et une API contre le corpus d’usages réels de Zapatos (Project A, Project B) : où chercher, quoi relever, ce qui ne sort jamais du poste. USE FOR: justifier une option ou un helper, choisir une API, trouver les contournements existants, préparer une note de décision. DO NOT USE FOR: forme du helper (zero-abstraction).'
---

# Usage réel

Project A et Project B sont un **corpus d'exemples**, pas la cible : pgcast vise un Zapatos qui fait le dernier kilomètre pour toute application (`README.md` § Roadmap). Leurs contournements montrent où l'on sort du chemin typé.

## Où

| Projet | Chemin | Points d'entrée |
|---|---|---|
| Project A (pro) | `<corpus project>` | `packages/server/src/utils/dbQueriesHelpers.ts` |
| Project B (perso) | `<corpus project>` | `packages/server/src/utils/conditions.ts`, `.agents/skills/zapatos-queries/` |

## Règles

- **Lecture seule**, jamais de modification ni de commit dans ces dépôts.
- **Confidentialité** : le code de Project A ne sort pas du poste. Il n'est cité ni dans une PR, ni dans une issue, ni dans un service externe. Dans pgcast, on décrit le **motif**, jamais l'extrait ni un nom métier.
- **Public** : les issues et les PR de pgcast sont publiques, comme le dépôt. On n'y écrit que des **motifs sans nom** : ni projet, ni extrait, ni nom métier, ni chemin ; « un corpus d'usages réels », avec des ordres de grandeur (« environ un millier de laterals écrits à la main »).
- **Chercher le contournement**, pas seulement l'usage : `as unknown as`, `runResultTransform` réécrit, `db.raw` sur une valeur, `sql```  qui réimplémente un shortcut, helper maison autour de `db.conditions`.
- **Un besoin vaut une API** s'il est **général à Postgres** (un motif que toute application rencontre) et s'il revient dans le corpus. Un choix propre à un projet (configuration `simple` + `unaccent`, nom de domaine métier) devient un paramètre, jamais un helper dédié. Un cas isolé reste un fragment `sql`.
- **L'API proposée** remplace le contournement sans changer le SQL produit, ou en le rendant valide (`and()` vide).

## Checklist

- [ ] Motif cité avec son ordre de grandeur, sans nom ni extrait
- [ ] SQL du contournement comparé au SQL du helper proposé
- [ ] Migration de l'appelant décrite en une ligne
