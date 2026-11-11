---
name: ci-gate
description: 'Quand la CI tourne et quand l’attendre : PR draft pendant l’itération, `gh pr ready`, checks obligatoires de master, fusion, relance. USE FOR: ouvrir, finaliser ou fusionner une PR, relancer la CI, commit qui coche les cases. DO NOT USE FOR: checks locaux (clé **Vérifier**), niveau de relecture (run-step).'
---

# Lancer, attendre, ou avancer

On valide en local pendant l'itération ; la CI se lance **une fois prêt**.

## Quand la CI tourne

| Situation | Ce qui se passe |
|---|---|
| PR **draft** | aucun job (`.github/workflows/ci.yml`, condition sur `draft`) |
| `gh pr ready`, ou push ensuite | run complet |
| Push sur `master` | run complet |

## Itérer puis lancer

1. `gh pr create --draft --base master` : relectures possibles tout de suite.
2. Vérifier en local (clé **Vérifier** de l'étape).
3. Prête : `gh pr ready`, puis `gh pr checks --watch`.
4. Correctifs après ready : chaque push relance la CI ; les regrouper.

## Docs-only

- `master` est protégée : une PR ne fusionne qu'avec les 10 checks verts **sur son dernier commit** (`bench-types` et les 9 `build (…)`), même pour des `.md` seuls.
- Donc **jamais `[skip ci]`** : un commit sans run n'a pas de checks, et la fusion reste bloquée. Le run d'un docs-only dure environ une minute.
- Exemple : `Tick step 2.2`.
- Tout le reste (`src/`, `test/`, `package*.json`, `.github/`, configs) : attendre la CI verte.

## Pièges

- **Draft oublié** : pas de checks ; `gh pr ready` avant d'attendre.
- **`[skip ci]`** : le commit n'a aucun check, la fusion est bloquée ; pousser un nouveau commit sans.
- **Un job renommé ou ajouté dans `ci.yml`** : mettre à jour la liste des checks obligatoires de `master` (`gh api repos/AlexandreDemartin/pgcast/branches/master/protection`) dans la même PR, sinon toutes les PR restent bloquées.

## Relancer

- PR draft : `gh pr ready` d'abord.
- Puis `gh run rerun <id>`, ou `git commit --allow-empty -m "Rerun CI"`.
- Suivre par `gh pr checks --watch` en arrière-plan, jamais en sondant à la main.

## Branches

- Après fusion : `git branch -d <branche>`, `git fetch --prune`, `git switch master && git pull --ff-only`.
