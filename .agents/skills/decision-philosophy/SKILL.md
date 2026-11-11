---
name: decision-philosophy
description: 'Trancher seul un choix que rien n’écrit : où chercher, quelles limites priment, ce qui attend l’utilisateur, où l’écrire. USE FOR: choisir sans règle écrite, principes en conflit, « puis-je décider seul », challenger un besoin. DO NOT USE FOR: mesurer un gain (simple-big-wins), concevoir un helper (zero-abstraction).'
---

# Trancher seul

Une règle écrite (`AGENTS.md`, un skill, une note acceptée) gagne toujours : ce skill ne sert que là où rien n'est écrit.

## 1. Chercher avant de décider

Dans cet ordre, s'arrêter dès que la réponse est écrite :

1. `AGENTS.md` § Philosophie et § Points d'arrêt.
2. `docs/decisions/` (notes acceptées), puis `docs/ROADMAP.md`.
3. Le skill du sujet (`.agents/README.md` § Carte des skills).
4. Le code de Zapatos qui résout déjà le même problème.
5. L'usage réel dans Belco et Bienvenue (skill `consumer-usage`).
6. Le standard du marché : la doc Postgres, puis pgTyped, sqlc, Kysely, Slonik.

- **Trouvé** : appliquer sans rediscuter ; une meilleure idée se propose, ne s'impose pas.
- **Besoin bancal** (contournement, cas tordu, magie) : on ne code pas autour, on le remonte.

## 2. Les limites, dans cet ordre

1. **Sécurité** : pas d'injection, paramètre plutôt que littéral, l'option la plus sûre (skill `sql-safety`).
2. **Rétrocompatibilité 6.6.1** (skill `backward-compat`).
3. **Les 5 principes** de `AGENTS.md` § Philosophie.

## 3. Dans ces limites, à égalité

- Le SQL le plus proche de ce qu'on écrirait à la main.
- Le type déduit de la base plutôt qu'écrit à la main.
- L'opt-in plutôt que le défaut ; le package séparé plutôt que le cœur.
- Celle qu'un test ou le compilateur vérifie plutôt que la relecture.
- Celle qui coûte le moins de temps de compilation (`bench:types`).
- La plus réversible.

## 4. Seul, ou avec l'utilisateur

| Se décide seul, s'écrit dans la PR (« décidé seul »), et on continue | Attend l'utilisateur |
|---|---|
| Forme du code, tests, outillage de dev, méthode | Toute dépendance nouvelle, même de dev |
| Découpage d'une étape, ordre des tâches | Un changement de l'API publique ou de la sortie par défaut du codegen |
| Un correctif circonscrit avec son test | `core.ts` : échappement ou compilation |
| Nommage interne | Une note de décision (`docs/decisions/`) |
| | Publication npm, release, tout ce qui est visible dehors |
