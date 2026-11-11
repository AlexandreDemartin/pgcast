# Roadmap pgcast

Ordre établi en fonction de trois critères : **les dépendances techniques entre les évolutions**, **le rapport valeur/risque** et **le principe que chaque étape prépare la suivante**. Une ligne = une branche = une PR.

## Vue d'ensemble

```
 Fondations          Le schéma dit tout                Runtime                       Pari final
 ───────────         ───────────────────────           ─────────────────────────     ──────────
 P0 fork setup  ─┐
 P1 tests+bench ─┼─► ① --check / watch  ─► ② FK + lateral ─► ③ validateurs + jsonb ─► ④ fonctions PG
 ADR 002 noms   ─┘    (+ modèle intermédiaire)                     │
                                                                   ▼
                                                            ⑤ conditions jsonb / FTS
                                                                   │
                                                                   ▼
                                                            ⑥ interface driver ─► ⑦ savepoints ─► ⑧ contexte RLS
                                                                   │                                       │
                                                                   └──────────► ⑨ streaming     ⑩ CTE typées ─► ⑪ inférence SQL brut
```

## Étapes

| Étape | Évolution (n° du brief) | Pourquoi à cette place | Prépare | Risque |
|---|---|---|---|---|
| **P0** | Fork setup | Sortie de build identique à l'octet, outillage à jour. | tout | — |
| **P1** | Harnais de tests + bench de compilation | Rien ne doit bouger sans filet. Les snapshots du codegen sont le contrat de rétrocompatibilité. | tout | faible |
| **P1.5** | Corrections des bugs trouvés en P1 | Une PR par bug, chacune avec un test qui échoue d'abord. Une fonctionnalité ne doit pas s'empiler sur un bug connu. | — | faible |
| **①** | `--check` + `--watch` (5) | Valeur immédiate en CI, risque quasi nul. Surtout, on en profite pour introduire un **modèle intermédiaire** de l'introspection (JSON sérialisable : relations, colonnes, index…). `--watch` en a besoin pour hasher le schéma, et ②, ③, ④ ne seront ensuite que de nouveaux « émetteurs » sur ce modèle. | ②③④⑪ | faible |
| **②** | Introspection des FK + `db.related` / `db.relatedMany` (2) | La fonctionnalité la plus demandée de Zapatos. Elle ajoute des FK au modèle sans rien changer d'autre : le SQL produit doit être **identique** à un `lateral` écrit à la main. Note de décision API d'abord. | ⑩ | moyen (types) |
| **③** | Validateurs Zod/Valibot + typage `jsonb` via `COMMENT ON` (3) | Avant ⑤, parce que la convention `COMMENT ON` donne des types `jsonb` précis que les opérateurs `@>` et `->` pourront exploiter. C'est aussi un émetteur de plus sur le modèle. Note de décision sur la convention de commentaire. | ⑤ | moyen |
| **④** | Wrappers typés pour les fonctions PG (4) | Introspection de `pg_proc` dans le même modèle. Il réutilise le mapping de types de ③ (y compris les `jsonb` typés en paramètres et en retour). | ⑪ | moyen (surcharges) |
| **⑤** | Opérateurs `jsonb` et full-text (7) | Runtime pur dans `conditions.ts`, sans toucher à `core.ts`. Placé ici, il profite des `jsonb` typés de ③. | — | faible |
| **⑥** | Interface de driver minimale (6) | Il faut une suite d'intégration solide avant de toucher `Queryable` et `transaction.ts`. C'est le prérequis de ⑦, ⑧ et ⑨, dont le comportement dépend du driver (curseurs, clients dédiés). | ⑦⑧⑨⑪ | **élevé** |
| **⑦** | Savepoints et transactions imbriquées (TODO d'origine) | Petit, mais à concevoir **sur** l'abstraction de transaction de ⑥, et **avant** RLS, qui doit se comporter correctement dans une transaction imbriquée. | ⑧ | moyen |
| **⑧** | Contexte RLS `db.withContext` (9) | `SET LOCAL` / `set_config(…, true)` n'ont de sens que dans une transaction, avec des savepoints bien définis. Très attendu par les utilisateurs de Supabase et de Postgres multi-tenant. | — | faible |
| **⑨** | Streaming typé par curseur (8) | Chaque driver a sa propre API de curseur (`pg-cursor`, `postgres.js` `.cursor()`…). Impossible à faire proprement avant ⑥. | — | moyen |
| **⑩** | CTE typées (10) | C'est le problème de typage de la composition de `SQLFragment`, et un bon banc d'essai pour la maîtrise du temps de compilation avant ⑪. | ⑪ | élevé (types) |
| **⑪** | Inférence de type du SQL brut (1) | La plus risquée. Elle s'appuie sur le modèle de ①, l'intégration `--check` de ①, la couche driver de ⑥ (describe statement) et la composition de ⑩. **Note de conception validée avant toute ligne de code.** | — | **très élevé** |

## Différences avec l'ordre initial du brief (5 → 2 → 3 → 4 → 7 → 6 → 8/9/10 → 1)

1. **Ajout d'un modèle intermédiaire dans ①.** Le brief demande de « hasher le schéma introspecté » pour `--watch`. Autant que ce hash porte sur un modèle sérialisable, qui deviendra la base commune de ②, ③ et ④. C'est un refactor sans changement de sortie, protégé par les snapshots de P1.
2. **Le lot 8/9/10 est ordonné : savepoints → RLS → streaming → CTE.** Les savepoints (TODO d'origine) passent avant RLS, qui en dépend. Les CTE vont en dernier parce qu'elles servent de répétition générale, côté typage, pour ⑪.
3. **P1.5 explicite** : les bugs révélés par la caractérisation sont corrigés avant les fonctionnalités, chacun dans sa PR.

## Jalons de publication (chacun est un point d'arrêt)

| Version | Contenu | Prérequis |
|---|---|---|
| `6.6.1-pgcast.0` (ou réservation du nom) | P0 + P1 | ADR 002 validée |
| `6.7.0` | P1.5 + ① + ② | — |
| `6.8.0` | ③ + ④ + ⑤ | — |
| `7.0.0-beta` | ⑥ → ⑩, puis 7.0.0 une fois stabilisé | uniquement si ⑥ impose un changement cassant, ce qui reste à éviter. Sinon on reste en 6.x. |
| ultérieur | ⑪ | note de conception validée |
