---
name: simple-big-wins
description: 'Gros gains simples, rien de bancal : gain mesuré rapporté à la complexité ajoutée, réutiliser avant d’écrire, quoi tester. USE FOR: avant d’écrire un mécanisme, choisir entre deux solutions, optimiser, ajouter une dépendance, règle sur l’existant. DO NOT USE FOR: forme d’un helper (zero-abstraction), consigner une décision (decision-philosophy).'
---

# Gros gains simples, pas de petits gains compliqués

- Le bon équilibre se juge au **gain mesuré** rapporté à la **complexité ajoutée** : lignes, cas particuliers, types conditionnels, hypothèses à garder en tête.
- **Gros gain simple** : se prend tout de suite. **Petit gain coûteux** : se laisse, même juste et testé.
- **Solution bancale** (contournement fragile, dépendance à un détail interne de `pg` ou de TS, comportement dû au hasard) : refusée, même si elle marche aujourd'hui.
- Supprimer du code ou une dépendance sans perte de fonction est un gros gain.

## Avant d'écrire du code

1. Déjà dans `src/` ? Réutiliser (`mapWithSeparator`, `SQLFragment.copy`, `conditionalParam`…).
2. Postgres le fait déjà ? Exposer le SQL, ne pas le réimplémenter en JS.
3. Sinon du code maison court, sans dépendance runtime (`AGENTS.md` § Philosophie, point 4).

## Types

- Un type conditionnel de plus se paie à chaque compilation chez chaque utilisateur : le mesurer (`npm run bench:types`).
- Le type le plus simple qui refuse les cas faux ; pas de prouesse qui n'attrape rien de plus.

## Tests

- Chaque comportement observable : son SQL compilé (`text` + `values`) et son exécution réelle.
- Chaque type public : un cas positif et un cas négatif (skill `type-tests`).
- Hors de Pareto, couverts en entier : l'échappement et la paramétrisation (skill `sql-safety`).

## Adopter une règle sur l'existant

- Une règle nouvelle s'applique au code neuf ou touché ; pas de balayage de tout `src/` (sauf un bug ou une faille).
- Le code d'origine de Zapatos garde son style ; on ne le reformate pas.
