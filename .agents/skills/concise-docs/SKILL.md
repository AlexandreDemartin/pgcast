---
name: concise-docs
description: 'Toute la doc, complète mais concise : une information à un endroit, structure avant prose, phrases courtes. USE FOR: écrire ou condenser un Markdown (AGENTS, README, CHANGELOG, skill, note de décision), une description de PR, un JSDoc. DO NOT USE FOR: contenu d’une note de décision (decision-philosophy).'
---

# Documentation concise

Complet sur le fond, concis sur la forme.

## Une information, un endroit

| Information | Source |
|---|---|
| Philosophie, points d'arrêt, commandes | `AGENTS.md` |
| Règle de code | un seul skill |
| Décision et son pourquoi | `docs/decisions/NNN-*.md` |
| Ordre des évolutions et leur raison | `docs/ROADMAP.md` |
| État des étapes | `docs/SUIVI.md` |
| Changement visible par l'utilisateur | `CHANGELOG.md` (anglais) |
| Usage public | `README.md` (anglais) |

- Ailleurs, on renvoie : un lien, ou « skill `<nom>` ». Un résumé d'une ligne plus le lien est permis ; recopier, jamais.

## Règles

- **Structure avant prose** : titres, puces, tableaux ; un paragraphe de 3 phrases au plus.
- **Une puce, une idée**, environ 20 mots.
- **L'essentiel d'abord**, le pourquoi en une ligne s'il n'est pas évident.
- **Termes exacts** en backticks : chemins, fonctions, commandes copiables.
- **Un exemple par règle**, le plus court, extrait réel du dépôt.
- **Complet** : condenser ne retire jamais une règle, une exception ou un piège.
- Langue : docs de travail en français ; `README.md`, `CHANGELOG.md`, commits, JSDoc et code en anglais.

## À couper

- Introductions, transitions, conclusions ; « il est important de noter que ».
- Historique (il est dans git) ; listes exhaustives qui se périment.

## Longueurs cibles

| Document | Cible |
|---|---|
| Skill | ≤ 150 lignes |
| JSDoc | 1 à 3 lignes : le contrat, et le SQL produit pour un helper |
| Description de PR | **Quoi** · **Pourquoi** · **Vérifier**, en puces |
| Note de décision | contexte, options en tableau, choix proposé, question à l'utilisateur |
