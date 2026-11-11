---
name: zero-abstraction
description: 'Concevoir un helper, une condition ou une option de pgcast : SQL visible et unique, types déduits de Postgres, surface minimale, opt-in. USE FOR: ajouter à db.conditions, un shortcut, une option de select, un helper (related, fn, with), nommer une API. DO NOT USE FOR: échappement (sql-safety), tests de types (type-tests).'
---

# Zéro abstraction

Un helper de pgcast est un raccourci d'écriture vers un SQL qu'on aurait écrit à la main ; rien de plus.

## Règles

- **Le SQL est le contrat** : chaque helper documente en JSDoc le SQL exact qu'il produit, et un test fige ce SQL (`text` + `values`).
- **Un seul SQL par appel** : pas de branche cachée qui change la forme de la requête selon les valeurs, sauf le cas vide documenté (`isIn([])` → `false`).
- **Toujours composable** : un helper renvoie un `SQLFragment` qu'on peut glisser dans `sql```, un `Whereable`, `extras` ou `lateral`.
- **Paramètre, jamais littéral** : une valeur passe par `param()` ; un identifiant passe par le typage `Column`/`Table` (skill `sql-safety`).
- **Déduit de la base** : un type vient du schéma généré (`ColumnForTable<T>`, `SelectableForTable<T>`), jamais d'une déclaration à la main.
- **Pas d'état, pas de magie** : ni cache, ni registre global, ni lecture paresseuse, ni requête supplémentaire implicite.
- **Surface minimale** : une option de plus seulement si un usage réel la demande (skill `consumer-usage`) ; sinon un fragment `sql` suffit.
- **Opt-in** : tout ce qui change la sortie par défaut ou ajoute une dépendance est derrière une option (skill `backward-compat`).
- **Cas vide valide** : un helper variadique ou à tableau produit un SQL valide sans argument (`and()` → `TRUE`, `or()` → `FALSE`), jamais `()`.

## Forme d'une condition

```ts
// src/db/conditions.ts
export const like = <T extends string>(a: T) => sql<SQL, boolean | null, T>`${self} LIKE ${conditionalParam(a)}`;
```

- `self` pour la colonne courante, `conditionalParam` pour accepter valeur, `SQLFragment`, `Parameter` ou `parent()`.
- Le troisième paramètre de type (`T`) contraint la colonne ; le `RunResult` dit `boolean | null`.

## Nommage

- Le nom de l'opérateur ou de la fonction Postgres quand il existe (`arrayOverlaps` pour `&&`, `websearchToTsquery`).
- Pas de synonyme d'un helper existant ; pas d'alias « pratique ».

## Checklist

- [ ] SQL produit écrit en JSDoc et figé par un test
- [ ] Composable dans `Whereable`, `extras`, `lateral`, `sql```
- [ ] Valeurs en `param`, identifiants typés
- [ ] Cas vide valide et testé
- [ ] Type positif et négatif (skill `type-tests`), coût mesuré si type conditionnel
- [ ] Besoin réel cité (skill `consumer-usage`)
