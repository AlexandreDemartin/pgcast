---
name: type-tests
description: 'Tester un type public de pgcast : cas positifs et négatifs, expectTypeOf, @ts-expect-error, schéma généré de la fixture, coût de compilation (bench:types, seuil +20 %). USE FOR: écrire ou changer un type, un générique, une signature, un type généré. DO NOT USE FOR: tests runtime du SQL (zero-abstraction).'
---

# Tests de types

Un type qui compile n'est pas forcément correct : il peut être `any`, trop large, ou accepter un appel faux.

## Règles

- **Fichiers** : `test/**/*.test-d.ts`, lancés par `npm run test:types` (Vitest `--typecheck`).
- **Positif** : `expectTypeOf(x).toEqualTypeOf<…>()`, jamais `toMatchTypeOf` quand l'égalité est possible : il laisse passer un type trop large.
- **Négatif** : un appel faux par ligne sous `// @ts-expect-error <raison>` ; la raison dit ce qui doit être refusé.
- **Pas de `any` qui passe** : `expectTypeOf(x).not.toBeAny()` sur chaque retour de shortcut testé.
- **Schéma réel** : les types se testent contre le schéma généré depuis la fixture (`test/fixtures/schema.sql`), pas contre le schéma factice de `src/typings`.
- **Cas limites** : colonne nullable, avec défaut, générée, identity ; `columns`, `extras`, `lateral` imbriqué ; table de vue (pas d'`Insertable`).
- `exactOptionalPropertyTypes` est activé : un test couvre `{ col: undefined }` quand le type le concerne.

## Coût de compilation

- `npm run bench:types` compile un projet exemple et compare `Instantiations` (déterministe) à la référence stockée.
- Au-delà de **+20 %** : point d'arrêt (`AGENTS.md`), avec le chiffre et sa cause.
- Une hausse justifiée met la référence à jour dans la même PR, chiffre dans la description.

## Checklist

- [ ] Au moins un positif et un négatif par type changé
- [ ] `not.toBeAny()` sur les retours
- [ ] `bench:types` sous le seuil, chiffre dans la PR
