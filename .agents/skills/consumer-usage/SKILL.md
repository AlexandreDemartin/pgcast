---
name: consumer-usage
description: 'Valider un besoin et une API contre le corpus local d’usages réels de Zapatos : où chercher, quoi relever, ce qui ne sort jamais du poste. USE FOR: justifier une option ou un helper, choisir une API, trouver les contournements existants, préparer une note de décision. DO NOT USE FOR: forme du helper (zero-abstraction).'
---

# Usage réel

Des projets réels qui utilisent Zapatos forment un **corpus d'exemples**, pas la cible : pgcast vise un Zapatos qui fait le dernier kilomètre pour toute application (`README.md` § Roadmap). Leurs contournements montrent où l'on sort du chemin typé.

## Où

- Les projets, leurs chemins et leurs points d'entrée sont dans `.agents/local/corpus.md`, **ignoré par git** : il ne vit que sur le poste de l'utilisateur.
- Fichier absent : demander à l'utilisateur ; ne jamais deviner un chemin.

## Règles

- **Lecture seule**, jamais de modification ni de commit dans ces dépôts.
- **Confidentialité** : le code du corpus ne sort pas du poste, et le nom de ses projets non plus. Rien n'en est cité dans le dépôt, une PR, une issue ou un service externe : on décrit le **motif**, jamais l'extrait, le projet ni un nom métier.
- **Public** : les issues et les PR de pgcast sont publiques, comme le dépôt. On n'y écrit que des **motifs sans nom** : ni projet, ni extrait, ni nom métier, ni chemin ; « un corpus d'usages réels », avec des ordres de grandeur (« environ un millier de laterals écrits à la main »).
- **Chercher le contournement**, pas seulement l'usage : `as unknown as`, `runResultTransform` réécrit, `db.raw` sur une valeur, `sql```  qui réimplémente un shortcut, helper maison autour de `db.conditions`.
- **Un besoin vaut une API** s'il est **général à Postgres** (un motif que toute application rencontre) et s'il revient dans le corpus. Un choix propre à un projet (configuration `simple` + `unaccent`, nom de domaine métier) devient un paramètre, jamais un helper dédié. Un cas isolé reste un fragment `sql`.
- **L'API proposée** remplace le contournement sans changer le SQL produit, ou en le rendant valide (`and()` vide).

## Checklist

- [ ] Motif cité avec son ordre de grandeur, sans nom ni extrait
- [ ] SQL du contournement comparé au SQL du helper proposé
- [ ] Migration de l'appelant décrite en une ligne
