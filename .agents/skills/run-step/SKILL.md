---
name: run-step
description: 'Orchestrer une étape, sous-issue d’un Epic GitHub : builder, relecture selon **Review**, tri bloquant / mineur, verify, fusion qui ferme l’issue, fin de chapitre, apprentissages. USE FOR: lancer l’étape suivante, démarrer une feature, choisir la relecture, trier des défauts, fusionner. DO NOT USE FOR: écrire le code (agent builder), CI (ci-gate).'
---

# Orchestrer une étape

L'orchestrateur est la session principale : il lance les agents, trie et fusionne ; il n'écrit pas le code de l'étape.

## Le plan

Il vit dans les issues de `AlexandreDemartin/pgcast` (`--repo AlexandreDemartin/pgcast` partout, jamais `jawj/zapatos`) :

| Issue | Rôle | Fermée par |
|---|---|---|
| `type: epic` | un chapitre : résultat, pourquoi, ordre, écarté | la PR de méthode de fin de chapitre (`Closes #epic`) |
| `type: feature` | une fonctionnalité ; ses **Planned PRs** en liste de titres | la dernière PR de ses tâches (`Closes #tâche`, `Closes #feature`) |
| `type: task` | une étape = une branche = une PR | sa PR (`Closes #n`) |

- Sous-issues natives : leur ordre est l'ordre des étapes ; l'Epic compte les fermées tout seul.
- Labels de sujet : `security`, `opt-in` (note 003), `needs decision`, `runtime`, `codegen`, `types`. Milestones : les versions.

## Trouver l'étape

- Epics ouverts : `gh issue list --repo AlexandreDemartin/pgcast --label 'type: epic' --state open`.
- La prochaine : la première sous-issue ouverte du premier Epic ouvert :
  `gh api 'repos/AlexandreDemartin/pgcast/issues/<epic>/sub_issues?per_page=100' -q '.[] | select(.state == "open") | "\(.number) \(.title)"' | head -1`.
- La lire : `gh issue view <n> --repo AlexandreDemartin/pgcast` ; seulement elle, et son Epic si l'ordre le demande.
- Une `type: feature` qui démarre : créer d'abord ses `type: task` depuis **Planned PRs**, dans l'ordre, chacune sous la feature :
  `gh api repos/AlexandreDemartin/pgcast/issues/<feature>/sub_issues -F sub_issue_id=<id>`, où `<id>` est l'`id` de la tâche, pas son numéro (`gh api repos/AlexandreDemartin/pgcast/issues/<n> -q .id`).
- Une étape trop large pour une PR à la manière de George (skill `zapatos-spirit` § Découper comme George) : la découper en sous-issues avant de lancer le `builder`.
- `needs decision`, ou un point d'arrêt de `AGENTS.md` (`core.ts`, sortie du codegen, publication) : demander à l'utilisateur **avant** le `builder`.
- Une idée nouvelle : une issue `type: feature` sous son Epic, à sa place dans l'ordre (`PATCH …/issues/<epic>/sub_issues/priority`, avec `sub_issue_id` et `after_id`).
- Réseau instable : chaque appel `gh` se relance ; avant de recréer, lister ce qui existe (aucun doublon).

## Corps d'une issue

En anglais, concis (skill `concise-docs`) : **What** (le comportement attendu, le SQL avant / après quand il compte) · **Why** · **Done when** · **Notes** : **Class** (note 003), **Review** (niveau, lentille, bloquants), **Read** (skills), **Frozen by** (tests). **Done when** nomme les commandes en plus de `lint`, `typecheck`, `test`, `test:types`, `build` (`bench:types`…). Public : des motifs sans nom (skill `consumer-usage`).

## Niveau de relecture

| Niveau | Pour | Relecture |
|---|---|---|
| `faible` | docs, méthode, CI seule | la CI, et le `builder` relit son diff avant la PR ; aucun relecteur |
| `normal` | tests, ajout opt-in (condition, option, émetteur du codegen) | `branch-reviewer` ; un `builder` neuf seulement pour des bloquants ; pas de `verify` |
| `élevé` | `core.ts` (compilation, échappement), `transaction.ts`, interface de driver, types publics existants, sortie par défaut du codegen | `branch-reviewer` avec la lentille du sujet ; `builder` neuf ; `verify` |

## Déroulé

1. `builder` construit l'étape, vérifie en local, ouvre sa PR en **draft**, base `master` (skill `ci-gate`), avec `Closes #n` dans le corps et `(closes #n)` en fin de titre.
2. Les relectures du niveau, en parallèle, même sur une PR draft.
3. Chaque défaut est classé :
   - **bloquant** (bug, injection, changement cassant, type faux ou trop large, SQL différent de celui annoncé, test manquant sur un risque) : un `builder` neuf le corrige dans l'étape ;
   - **mineur** (nommage, JSDoc, forme) : ajouté à `docs/APPRENTISSAGES.md` § Mineurs gardés, ou abandonné.
4. Niveau `élevé` : `branch-reviewer` en mode `verify` sur les commits de correction ; `not fixed` ou `regressed` repart en 3.
5. Remarques « apprentissage » des agents : une ligne chacune dans `docs/APPRENTISSAGES.md`, dernier commit de la branche (« Record what #22 taught »).
6. `gh pr ready`, CI verte sur le dernier commit (skill `ci-gate`) ; `gh pr merge --merge` : la fusion ferme l'issue, l'Epic se coche seul. Aucun commit « Tick step ». Nettoyer (`builder.md` § Nettoyer).

## Briefs

Un agent ne sait que ce que dit son brief.

- **`builder`** : le numéro de l'issue, les décisions prises avec l'utilisateur ; pour corriger, la PR, sa branche et les bloquants (`fichier:ligne`, correction attendue).
- **`branch-reviewer`** : la PR, le niveau, les bloquants de **Review**, la lentille (`sql`, `types`, `codegen`, `compat`) si l'issue en a une.
- Jamais la conclusion attendue : un relecteur à qui l'on souffle l'hypothèse la confirme.

## Règles du rituel

- **Rapport d'un relecteur** : au plus 10 défauts, du plus grave au moins grave, chacun bloquant ou mineur.
- **Pas de worktree par défaut** ; un seul pour deux travaux en parallèle, retiré après la fusion.
- **Pas de pile**, sauf une étape qui a besoin du code de la précédente avant sa fusion : un niveau, fusionné dans l'ordre.
- Une branche poussée n'est jamais rebasée ni forcée ; une correction du dessous monte par merge (`guard.mjs`).

## Fin de chapitre

1. Une relecture de toute la plage fusionnée (`<master avant le chapitre>..master`) par `branch-reviewer`, avec `docs/APPRENTISSAGES.md` § Mineurs gardés ; ses corrections dans une PR de suite.
2. La PR de méthode : chaque apprentissage jugé (`.agents/README.md` § Auto-amélioration), retenu ou écarté ; le fichier est vidé dans la même PR, qui ferme l'Epic (`Closes #epic`).

## Checklist

- [ ] Seule l'issue de l'étape lue ; points d'arrêt demandés avant le `builder`
- [ ] Relecture du niveau, brief sans conclusion soufflée
- [ ] Chaque défaut classé ; bloquants corrigés par un `builder` neuf
- [ ] Mineurs et apprentissages écrits dans `docs/APPRENTISSAGES.md`
- [ ] PR fusionnée avec `Closes #n`, issue fermée, local nettoyé
