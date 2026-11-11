---
name: ci-gate
description: 'Quand la CI tourne et quand l’attendre : PR draft pendant l’itération, `gh pr ready`, docs seules, check CI passed de master, `[skip ci]` exceptionnel, fusion, relance. USE FOR: ouvrir, finaliser ou fusionner une PR, relancer la CI, commit qui coche les cases. DO NOT USE FOR: checks locaux (clé **Vérifier**), niveau de relecture (run-step).'
---

# Lancer, attendre, ou avancer

On valide en local pendant l'itération ; la CI se lance **une fois prêt**.

## Quand la CI tourne

| Situation | Ce qui se passe |
|---|---|
| PR **draft** | aucun job lourd (`.github/workflows/ci.yml`, condition sur `draft`) |
| PR prête, **docs seules** (`.md` hors de `.agents/` et `.claude/`) | `changes` puis **CI passed** ; `build` et `bench-types` sautés |
| PR prête, autre chose | run complet : `build` (9 jobs), `bench-types`, puis **CI passed** |
| Push sur `master` | run complet |

## Itérer puis lancer

1. `gh pr create --draft --base master` : relectures possibles tout de suite.
2. Vérifier en local (clé **Vérifier** de l'étape).
3. Prête : `gh pr ready`, puis `gh pr checks --watch`.
4. Correctifs après ready : chaque push relance la CI ; les regrouper.

## Le check de `master`

- `master` est protégée : une PR ne fusionne qu'avec **CI passed** vert **sur son dernier commit**. Ce job échoue si un job a échoué ; un job sauté exprès (docs seules) compte comme réussi.
- Une PR de docs seules ne coûte donc que deux petits jobs : pas besoin de `[skip ci]` pour économiser un run. Exemple : `Tick step 2.2`.
- **`[skip ci]` exceptionnel** : sur un commit **intermédiaire** d'une PR prête, quand le suivant arrive aussitôt (il évite un run qui serait jeté). **Jamais sur le dernier commit** : sans run, pas de **CI passed**, la fusion reste bloquée.

## Pièges

- **Draft oublié** : pas de checks ; `gh pr ready` avant d'attendre.
- **`[skip ci]` sur le dernier commit** : aucun check, la fusion est bloquée ; pousser un commit sans.
- **Un job ajouté dans `ci.yml`** : l'ajouter aux `needs` de **CI passed**, sinon son échec ne bloque pas la fusion.

## Relancer

- PR draft : `gh pr ready` d'abord.
- Puis `gh run rerun <id>`, ou `git commit --allow-empty -m "Rerun CI"`.
- Suivre par `gh pr checks --watch` en arrière-plan, jamais en sondant à la main.

## Branches

- Après fusion : `git branch -d <branche>`, `git fetch --prune`, `git switch master && git pull --ff-only`.
