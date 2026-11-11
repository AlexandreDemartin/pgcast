# 002 — Noms de modules : `zapatos/*` ou `pgcast/*`

- **Statut** : accepté (2026-11-11) : option A maintenant, option C comme cible
- **Date** : 2026-11-11

## Contexte

Le paquet s'appelle désormais `pgcast`. Or le nom `zapatos` n'est pas seulement une marque, c'est un **nom de module** utilisé à trois endroits :

1. **Le code généré** (`zapatos/schema.d.ts`) contient :
   ```ts
   declare module 'zapatos/schema' {
     import type * as db from 'zapatos/db';          // ← résolution réelle dans node_modules
     import type * as c from 'zapatos/custom';
     …
   }
   ```
2. **Le runtime compilé** (`dist/db/*.d.ts`) importe `import type { … } from 'zapatos/schema'`. Ce module est *ambiant*, fourni par le fichier généré, donc il fonctionne quel que soit le nom du paquet.
3. **Le code utilisateur** importe `zapatos/db` et `zapatos/schema`.

Conséquence : si l'on installe `pgcast` sous son propre nom, `import 'zapatos/db'` ne résout plus rien et les types générés cassent.

## Options

| Option | Migration utilisateur | Sortie codegen | Risque |
|---|---|---|---|
| **A. Alias npm, statu quo des noms** : `npm i zapatos@npm:pgcast` | **Aucune** : on change une ligne du `package.json` et rien d'autre. | Inchangée | Nul. Inconvénient : le nom `pgcast` n'apparaît jamais dans les imports. |
| B. Noms natifs `pgcast/*` | Changer les imports (`zapatos/db` → `pgcast/db`) et régénérer. | Change (`declare module 'pgcast/schema'`…) | Moyen : deux noms de module à faire coexister dans la doc et dans les issues. |
| **C. A + B : double nom, opt-in** : `pgcast/db` est exporté par le paquet, et une option de config `moduleName: 'zapatos' \| 'pgcast'` (défaut `'zapatos'`) choisit les noms émis par le codegen. | Aucune par défaut. Les nouveaux projets peuvent écrire `pgcast/*`. | Inchangée par défaut, opt-in sinon | Faible, à une subtilité près : `src/db` importe `'zapatos/schema'`. En mode `pgcast`, le fichier généré devrait déclarer **les deux** modules ambiants (`pgcast/schema` qui réexporte, et `zapatos/schema`), ce qui reste à prototyper et à tester. |

## Choix proposé

**A immédiatement, C plus tard.**

- Phase 0 : on ne touche à aucune chaîne `zapatos/*`. Le README documente l'installation `zapatos@npm:pgcast`, qui garantit la promesse « changer d'import sans réécrire son code ». Le CLI s'appelle `pgcast`, avec l'alias `zapatos`.
- Après la phase 1 (snapshots du codegen en place) : prototyper C dans une PR dédiée, avec le snapshot du mode par défaut inchangé et un nouveau snapshot pour le mode `pgcast`.

## Question pour toi

Valides-tu A maintenant et C comme cible ? Ou préfères-tu rester définitivement sur A, avec `zapatos/*` pour toujours et `pgcast` réduit au nom du paquet ?
