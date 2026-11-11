---
name: ci-gate
description: 'Quand la CI tourne, quand l’attendre, quand la sauter : PR draft pendant l’itération, `gh pr ready`, docs-only, `[skip ci]`, fusion, relance. USE FOR: ouvrir, finaliser ou fusionner une PR, relancer la CI, commit qui coche les cases. DO NOT USE FOR: checks locaux (clé **Vérifier**), niveau de relecture (run-step).'
---

# Lancer, attendre, ou avancer

On valide en local pendant l'itération ; la CI se lance **une fois prêt**.

## Quand la CI tourne

| Situation | Ce qui se passe |
|---|---|
| PR **draft** | aucun job (`.github/workflows/ci.yml`, condition sur `draft`) |
| `gh pr ready`, ou push ensuite | run complet |
| Push sur `master` | run complet |
| `[skip ci]` dans le message du commit | workflow non déclenché |

## Itérer puis lancer

1. `gh pr create --draft --base master` : relectures possibles tout de suite.
2. Vérifier en local (clé **Vérifier** de l'étape).
3. Prête : `gh pr ready`, puis `gh pr checks --watch`.
4. Correctifs après ready : chaque push relance la CI ; les regrouper.

## Docs-only

- Seulement des `.md` au-dessus d'un commit vert : `[skip ci]` permis, fusion sans attendre.
- Exemple : `docs: tick step 1.1 [skip ci]`.
- Tout le reste (`src/`, `test/`, `package*.json`, `.github/`, configs) : attendre la CI verte.

## Pièges

- **Draft oublié** : pas de checks ; `gh pr ready` avant d'attendre.
- **`[skip ci]` sur un HEAD qui contient du code** : aucun verdict pour ce SHA.
- **Cases cochées sans `[skip ci]`** : relance un run complet pour rien.

## Relancer

- PR draft : `gh pr ready` d'abord.
- Puis `gh run rerun <id>`, ou `git commit --allow-empty -m "chore: rerun CI"`.
- Suivre par `gh pr checks --watch` en arrière-plan, jamais en sondant à la main.

## Branches

- Après fusion : `git branch -d <branche>`, `git fetch --prune`, `git switch master && git pull --ff-only`.
