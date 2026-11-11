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
- 1.2 — Les sources de `src/db` ne compilent que contre le schéma factice ; un test de types importe les déclarations émises, comme un consommateur — `builder`, `test/generated/tsconfig.json`
- 1.2 — Un dossier `.d.ts` de snapshots sous `test/` doit être exclu de `test/tsconfig.json`, sinon `tsc -p test` le compile — `builder`
- 1.2 — Un tsconfig qui `extends` et pose `files` garde l'`include` du parent : ajouter `"include": []` — `builder`
- 1.2 — `toMatchFileSnapshot` et `-u` ne suppriment jamais de fichier : chaque dossier de snapshots fichiers a son contrôle des fichiers en trop ou orphelins (candidat : skill `codegen-output`) — `branch-reviewer`
- 1.3 — Déstructurer `const { all, Default } = db` élargit les `unique symbol` en `symbol` : imports nommés — `builder`
- 1.3 — Un helper d'affichage dans un test (`JSON.stringify`) efface ce qu'il doit attraper (Date / chaîne, `undefined` / `null`) : snapshotter l'objet compilé brut (candidat : skill `type-tests` ou un skill de tests) — `branch-reviewer`, `test/unit/conditions.test.ts:14`
- 1.3 — `RETURNING` sans `ORDER BY` n'a pas d'ordre : un résultat multi-lignes se trie avant `toEqual` — `branch-reviewer`
- 1.3 — Une surprise vue sur un cas s'essaie en changeant un paramètre avant d'être écrite en règle (niveau d'isolation : warning ou 25001) — `branch-reviewer`
- 1.3 — `npx vitest run -u <fichier>` a parfois relancé toute la suite : vérifier `git status` après — `builder`
- 1.3 — Un worktree dont `node_modules` est un lien vers le checkout écrit dans son cache (`node_modules/.cache/pgcast`) — `branch-reviewer`
- 1.5 — Un test « rien n'a fui » placé en dernier ne prouve rien lancé seul ou mélangé : l'isolement se vérifie dans le test même, en relisant par une autre connexion — `branch-reviewer`, `test/integration/injection.test.ts`
- 1.5 — Les points d'entrée d'injection se listent en cherchant `raw(` et les interpolations dans `src/`, pas en suivant la doc des options ; un paramètre public « used internally » (`aggregate`) reste un point d'entrée (candidat : skill `sql-safety`) — `branch-reviewer`
- 1.5 — Vitest `-t` prend une regex JS : `a\|b` ne trouve rien — `builder`
- 1.5 — `toMatchInlineSnapshot` écrit un octet nul brut dans la source : le remplacer par un marqueur visible avant de figer — `builder`
- 1.5 — Dans une boucle de reprise, `git push … | tail` masque le code de sortie : tester la commande elle-même — `builder`
- 1.4 — Un négatif écrit à travers un helper typé (`constraint<'users'>(…)`) teste le helper, pas le shortcut : construire la valeur à part, puis la passer (candidat : skill `type-tests`) — `branch-reviewer`, `test/types/shortcuts.test-d.ts:155`
- 1.4 — `X extends T ? true : false` ne vérifie qu'une inclusion, comme `toMatchTypeOf` : `toEqualTypeOf` dès que le type s'écrit — `branch-reviewer`
- 1.4 — Un type faux seulement quand il est inféré dans l'appel d'un shortcut n'apparaît pas sur une variable annotée : tester l'appel lui-même — `builder`
- 1.4 — Des déclarations émises dans le dossier temporaire du système ne résolvent pas `pg` : les émettre sous `node_modules/.cache/` — `builder`
- 1.4 — Un merge de `master` fait un conflit dans `AGENTS.md` dès qu'une branche a modifié le tableau des commandes : le prévoir dans le brief — `builder`
- 1.4 — Découper une PR déjà poussée se fait par de nouvelles branches et `cherry-pick`, l'ancienne PR fermée avec un renvoi — `builder`
- 1.6 — `Instantiations` d'un projet entier est dominé par `lib.dom` et `@types` (~82 %) : une mesure de coût soustrait un plancher — `builder`, `scripts/bench-types.mjs`
- 1.6 — Un garde-fou `if (x > seuil) fail` laisse passer `NaN` : valider toute valeur lue d'un outil ou d'un fichier (`Number.isInteger`) avant de comparer (candidat : skill `type-tests`) — `branch-reviewer`
- 1.6 — Une référence comparée sur une seule borne dérive vers le haut : une mesure déterministe a aussi une borne basse, ou une mise à jour obligatoire — `branch-reviewer`
- 1.6 — `git commit --no-edit` après un merge résolu garde les lignes `# Conflicts:` : écrire le message avec `-m` — `builder`
- 1.6 — Un `paths` redéfini dans un tsconfig enfant efface celui du parent (`"*": ["src/typings/*"]`) : c'est ce qui laisse `zapatos/schema` au module ambiant généré — `builder`
- 1.6 — `scripts/` n'a ni lint ni tests : un garde-fou de script se vérifie par essais rapportés, ou s'extrait en fonction testable — `builder`
- 1.7 — Réécrire une section Markdown par une regex `re.S` a laissé `.*` courir jusqu'à la fin du fichier : remplacer une section exacte, ou vérifier `git diff --stat` avant de commiter — `builder`
- 1.7 — Dans un tableau Markdown, un nom de test qui contient des backticks demande un code span à double backtick — `builder`

## Mineurs gardés

Défauts mineurs de relecture, repris par la relecture de fin de chapitre.

- 1.1 — `test/helpers/db.ts:44` : un seul `client` par fichier ; `it.concurrent` écraserait la transaction d'un autre test — lever une erreur si `client` est déjà défini — `branch-reviewer`
- 1.1 — `vitest.config.mts:7` : `globalSetup` tourne aussi sous `test:types` et crée une base modèle pour rien — `branch-reviewer`
- 1.2 — `test/integration/codegen.test.ts:88` : seule la sortie principale est compilée ; les variantes (sauf `edge`) ne le sont pas — à reprendre en 1.4 — `branch-reviewer`
- 1.2 — `test/integration/codegen.test.ts:8` : l'en-tête ne dit pas qu'après `-u` un fichier obsolète de `test/generated/zapatos/` se supprime à la main — `branch-reviewer`
- 1.2 — `test/integration/codegen.test.ts:92` : rien ne repère un fichier orphelin dans `test/__snapshots__/codegen/` — `branch-reviewer`
