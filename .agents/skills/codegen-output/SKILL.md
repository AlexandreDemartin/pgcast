---
name: codegen-output
description: 'Changer la sortie du codegen (src/generate) : snapshots de la fixture, opt-in, canary de version, diff justifié, chaînes zapatos/*. USE FOR: introspection pg_catalog, nouveau type ou constante générée, option de config du codegen, --check, --watch. DO NOT USE FOR: types runtime de src/db (type-tests), compat de l’API (backward-compat).'
---

# Sortie du codegen

Le fichier généré (`zapatos/schema.d.ts`) est compilé par chaque projet utilisateur : son contenu fait partie de l'API (skill `backward-compat`).

## Règles

- **Snapshot d'abord** : la sortie générée depuis `test/fixtures/schema.sql` est figée ; tout diff de snapshot est expliqué ligne à ligne dans la PR.
- **Sortie par défaut inchangée** : une nouveauté (FK, fonctions, validateurs) est derrière une option de config, défaut = sortie 6.6.1. Sinon point d'arrêt.
- **Déterministe** : ordre trié explicitement (`ORDER BY` + nom), jamais l'ordre de `pg_catalog`.
- **Qualifier par schéma** : toute requête d'introspection filtre sur `pg_namespace`, jamais sur le seul nom d'objet.
- **Le généré compile** : `npm run typecheck` compile la sortie de la fixture.
- **Canary** : un changement incompatible du format incrémente `SchemaVersionCanary` (`src/db/canary.ts` et `src/generate/tsOutput.ts`) : point d'arrêt.
- **Chaînes `zapatos/*`** inchangées (note 002).
- **Commentaires** : un texte de `COMMENT ON` va dans un JSDoc ; `*/` doit y être neutralisé.

## Checklist

- [ ] Diff de snapshot justifié, ou aucun
- [ ] Option opt-in, défaut = sortie actuelle
- [ ] Requêtes d'introspection qualifiées par schéma et triées
- [ ] La sortie de la fixture compile
