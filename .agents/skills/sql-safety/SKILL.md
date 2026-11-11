---
name: sql-safety
description: 'Zone sensible core.ts : échappement des identifiants, paramétrisation, raw, cols/vals, parent/self, compilation. Point d’arrêt et tests d’injection obligatoires. USE FOR: toucher compileExpression, param, raw, un identifiant interpolé, une clé d’objet compilée en SQL. DO NOT USE FOR: forme d’un helper (zero-abstraction).'
---

# Sécurité du SQL

`src/db/core.ts` (`SQLFragment.compile`, `compileExpression`) transforme chaque interpolation en SQL. Une erreur ici est une injection chez tous les utilisateurs.

## Point d'arrêt

- Toute modification de `compileExpression`, `Parameter`, `DangerousRawString`, `ColumnNames`, `ColumnValues`, `ParentColumn` ou de la mise entre guillemets : **le signaler à l'utilisateur avant d'écrire**, avec le SQL avant/après.
- Niveau de relecture `élevé`, lentille `sql` (skill `run-step`).

## Règles

- **Une valeur est un paramètre** (`$n`), jamais concaténée ; `raw` n'est réservé qu'aux mots-clés fixes du code (`ASC`, `FOR UPDATE`), jamais à une entrée.
- **Un identifiant vient du type** (`Table`, `Column`) ; à l'exécution il peut venir d'un objet non typé (`req.body` passé en `Whereable` ou en `Insertable`) : le compiler comme s'il était hostile.
- **Les clés d'objet** (`Whereable`, `cols`, `vals`, `extras`, `lateral`) sont des identifiants : même règle.
- `cast` de `param(x, 'type')` et le nom d'une clé de `lateral` sont interpolés : même règle.

## Tests d'injection

Chaque changement ajoute, dans `test/unit/injection.test.ts` :

- l'entrée hostile (`"`, `'`, `;`, `--`, `/*`, `$1`, `\`, octet nul) sur chaque point d'entrée touché ;
- le `text` compilé attendu, figé ;
- l'exécution réelle contre Postgres qui prouve que la requête reste une seule instruction.

## Checklist

- [ ] Utilisateur prévenu avant d'écrire, SQL avant/après dans la PR
- [ ] Entrées hostiles testées en compilation et en exécution
- [ ] Aucune valeur concaténée ; `raw` seulement sur des constantes du code
