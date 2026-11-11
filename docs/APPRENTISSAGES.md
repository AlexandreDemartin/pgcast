# Apprentissages du chapitre

Ce que les agents ont rendu pendant le chapitre et qui attend sa fin. Écrit par l'orchestrateur, jugé et vidé par la PR de méthode (skill `run-step` § Fin de chapitre).

- Une ligne par remarque : `<étape> — <remarque> — <source>` (agent, `fichier:ligne`, standard).
- Rien ne s'applique avant la fin du chapitre : la méthode y est gelée (`.agents/README.md` § Auto-amélioration).

## Apprentissages

Candidats à un contrôle, une règle ou une ligne de skill.

- 1.1 — Supprimer des bases par `LIKE 'pgcast_test_%'` est faux : `_` est un joker ; `starts_with()` et une garde JS sur le nom — `builder`, `test/helpers/databases.ts`
- 1.1 — `string_agg(… ORDER BY 1)` trie par la constante 1, pas par la première colonne : trier par l'expression — `builder`
- 1.1 — Le mode auto refuse toute commande qui pourrait afficher `TEST_DATABASE_URL` : n'afficher que des booléens — `builder`
- 1.1 — `timeout` n'existe pas sur macOS ; les reprises réseau se font par une boucle `for` — `builder`
- 1.1 — `new URL()` met la chaîne entière dans `err.input`, que Vitest affiche : une URL porteuse d'un secret ne se parse jamais sans redaction — `branch-reviewer`, `test/helpers/databases.ts:44`
- 1.1 — `ROLLBACK` n'annule pas `nextval` : un test ne fige jamais une valeur de séquence, il la lit par `RETURNING` (candidat : skill `type-tests` ou un skill de tests) — `branch-reviewer`, `test/helpers/db.ts`
- 1.1 — `process.loadEnvFile` ne remplace pas une variable déjà définie : l'environnement prime sur le fichier — `branch-reviewer`
- 1.1 — Une base de test se crée en `ENCODING 'UTF8' LOCALE 'C'` : la collation libc diffère entre macOS et glibc — `branch-reviewer`, `test/helpers/globalSetup.ts`
- 1.1 — `git stash` d'un seul fichier casse les fichiers qui en dépendent ; pour montrer un test rouge avant un correctif, un `node -e` direct est plus sûr — `builder`

## Mineurs gardés

Défauts mineurs de relecture, repris par la relecture de fin de chapitre.

- 1.1 — `test/helpers/db.ts:44` : un seul `client` par fichier ; `it.concurrent` écraserait la transaction d'un autre test — lever une erreur si `client` est déjà défini — `branch-reviewer`
- 1.1 — `vitest.config.mts:7` : `globalSetup` tourne aussi sous `test:types` et crée une base modèle pour rien — `branch-reviewer`
