---
name: backward-compat
description: 'Rétrocompatibilité avec Zapatos 6.6.1 : ce qui est l’API publique, ce qui est cassant, comment ajouter sans casser, noms de modules zapatos/*. USE FOR: changer un export, une signature, un type public, un comportement runtime, la config. DO NOT USE FOR: sortie du codegen (codegen-output).'
---

# Rester rétrocompatible

Promesse : un projet sous Zapatos 6.6.1 passe à `zapatos@npm:pgcast` sans changer une ligne (note 002).

## L'API publique

- Tout ce qu'exportent `zapatos/db` et `zapatos/generate` (`db.mjs` et `generate.mjs` en donnent la liste).
- Les types générés et leur forme (`Selectable`, `Insertable`, `Whereable`, `Updatable`, `*ForTable<T>`).
- Le SQL produit par chaque shortcut : un utilisateur peut le logger, le tester ou en dépendre.
- La config (`zapatosconfig.json`, `setConfig`) et le CLI (`npx zapatos`).

## Cassant, donc point d'arrêt

- Retirer ou renommer un export, un paramètre, une option.
- Rétrécir un type accepté, élargir un type renvoyé.
- Changer le SQL produit par défaut, même « équivalent ».
- Renommer une chaîne `zapatos/*` (note 002).

## Non cassant

- Ajouter un export, une option facultative, une condition.
- Élargir un type accepté sans changer l'inférence des appels existants (le vérifier par un test de types).
- Corriger un SQL **invalide** (Postgres le refusait) : c'est un correctif, avec son test et sa ligne de CHANGELOG.

## Correction d'un bug existant

Règle de la note [003](../../../docs/decisions/003-correctifs-et-depreciation.md) :

- **Corriger** directement si Postgres refusait déjà le SQL, si le type refusait déjà l'appel, si l'ancien résultat contredit le nom, le type ou la doc de la fonction, ou si c'est une faille.
- **Sinon, opt-in** : une option de config, dont le défaut garde l'ancien comportement ; l'ancien chemin émet une fois `process.emitWarning(…, { type: 'DeprecationWarning', code: 'PGCAST_DEP00n' })` qui nomme l'option ; défaut en 7.0.
- Le test de caractérisation de la phase 1 change dans la même PR, avec la raison ; un opt-in garde aussi le test de l'ancien comportement.

## Checklist

- [ ] Aucun export retiré : `git diff master -- db.mjs generate.mjs` après `npm run build`
- [ ] Tests de caractérisation inchangés, ou diff justifié
- [ ] Ligne de `CHANGELOG.md` (`Added`, `Changed`, `Fixed`)
