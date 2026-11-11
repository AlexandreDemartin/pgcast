---
name: run-step
description: 'Orchestrer une étape de docs/SUIVI.md : builder, relecture selon **Relecture**, tri bloquant / mineur, verify, fusion, fin de chapitre, apprentissages. USE FOR: lancer l’étape suivante, choisir la relecture, trier des défauts, fusionner. DO NOT USE FOR: écrire le code (agent builder), CI (ci-gate).'
---

# Orchestrer une étape

L'orchestrateur est la session principale : il lance les agents, trie, coche et fusionne ; il n'écrit pas le code de l'étape.

## Trouver l'étape

- La prochaine : la première dont **Livrée** n'est pas cochée (`docs/SUIVI.md` § Mode d'emploi).
- Ne lire que sa section : `grep -n '^### ' docs/SUIVI.md`, puis sa plage de lignes ; jamais tout le fichier.
- Une étape part de `master` à jour et se fusionne dès qu'elle est finie.
- Une étape trop large pour une PR à la manière de George (skill `zapatos-spirit` § Découper comme George) : la découper en étapes avant de lancer le `builder`.
- Un point d'arrêt de `AGENTS.md` dans l'étape (note de décision, `core.ts`, sortie du codegen, publication) : demander à l'utilisateur **avant** de lancer le `builder`.

## Niveau de relecture

| Niveau | Pour | Relecture |
|---|---|---|
| `faible` | docs, méthode, CI seule | la CI, et le `builder` relit son diff avant la PR ; aucun relecteur |
| `normal` | tests, ajout opt-in (condition, option, émetteur du codegen) | `branch-reviewer` ; un `builder` neuf seulement pour des bloquants ; pas de `verify` |
| `élevé` | `core.ts` (compilation, échappement), `transaction.ts`, interface de driver, types publics existants, sortie par défaut du codegen | `branch-reviewer` avec la lentille du sujet ; `builder` neuf ; `verify` |

## Déroulé

1. `builder` construit l'étape, vérifie en local, ouvre sa PR en **draft**, base `master` (skill `ci-gate`).
2. Les relectures du niveau, en parallèle, même sur une PR draft.
3. Chaque défaut est classé :
   - **bloquant** (bug, injection, changement cassant, type faux ou trop large, SQL différent de celui annoncé, test manquant sur un risque) : un `builder` neuf le corrige dans l'étape ;
   - **mineur** (nommage, JSDoc, forme) : ajouté à `docs/APPRENTISSAGES.md` § Mineurs gardés, ou abandonné.
4. Niveau `élevé` : `branch-reviewer` en mode `verify` sur les commits de correction ; `not fixed` ou `regressed` repart en 3.
5. `gh pr ready`, CI verte (skill `ci-gate`) ; dernier commit : cases cochées, **Livrée** avec le numéro, `[skip ci]` ; `gh pr merge --merge` ; nettoyer (`builder.md` § Nettoyer).
6. Remarques « apprentissage » des agents : une ligne chacune dans `docs/APPRENTISSAGES.md`, dans le commit qui coche les cases.

## Briefs

Un agent ne sait que ce que dit son brief.

- **`builder`** : le titre de l'étape et sa plage de lignes dans `docs/SUIVI.md`, les décisions prises avec l'utilisateur ; pour corriger, la PR, sa branche et les bloquants (`fichier:ligne`, correction attendue).
- **`branch-reviewer`** : la PR, le niveau, les points bloquants de **Relecture**, la lentille (`sql`, `types`, `codegen`, `compat`) si l'étape en a une.
- Jamais la conclusion attendue : un relecteur à qui l'on souffle l'hypothèse la confirme.

## Règles du rituel

- **Rapport d'un relecteur** : au plus 10 défauts, du plus grave au moins grave, chacun bloquant ou mineur.
- **Pas de worktree par défaut** ; un seul pour deux travaux en parallèle, retiré après la fusion.
- **Pas de pile**, sauf une étape qui a besoin du code de la précédente avant sa fusion : un niveau, fusionné dans l'ordre.
- Une branche poussée n'est jamais rebasée ni forcée ; une correction du dessous monte par merge (`guard.mjs`).

## Fin de chapitre

1. Une relecture de toute la plage fusionnée (`<master avant le chapitre>..master`) par `branch-reviewer`, avec `docs/APPRENTISSAGES.md` § Mineurs gardés ; ses corrections dans une PR de suite.
2. La PR de méthode : chaque apprentissage jugé (`.agents/README.md` § Auto-amélioration), retenu ou écarté ; le fichier est vidé dans la même PR.

## Checklist

- [ ] Seule la section de l'étape lue ; points d'arrêt demandés avant le `builder`
- [ ] Relecture du niveau, brief sans conclusion soufflée
- [ ] Chaque défaut classé ; bloquants corrigés par un `builder` neuf
- [ ] Mineurs et apprentissages écrits dans `docs/APPRENTISSAGES.md`
- [ ] Cases cochées, PR fusionnée, local nettoyé
