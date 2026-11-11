# Rapport de caractérisation

Ce que les étapes 1.1 à 1.5 ont trouvé dans Zapatos 6.6.1. Rien n'est corrigé : chaque constat est figé tel quel par son test, et les correctifs deviennent les sous-issues de l'Epic du chapitre 2, [#18](https://github.com/AlexandreDemartin/pgcast/issues/18).

Sources : les sections « Surprises » des PR #4, #5, #7 et #8, les tests `characterization:` de `test/`, et une lecture de `src/db/transaction.ts`.

## Synthèse

| Gravité | Constats | Cassant | Non cassant |
|---|---|---|---|
| Sécurité | 7 | 1 | 6 |
| Perte de données | 3 | 3 | 0 |
| Résultat faux | 12 | 11 | 1 |
| SQL invalide ou erreur | 9 | 0 | 9 |
| Type faux | 15 | 7 | 8 |
| Codegen | 11 | 4 | 7 |
| Doc | 4 | 3 | 1 |
| **Total** | **61** | **29** | **32** |

32 constats sont à corriger, 17 à documenter et 12 à laisser.

Les trois qui comptent le plus :

1. **R1** : un `"` dans un identifiant n'est pas doublé. Une clé de `Whereable` venue de l'extérieur peut élargir un filtre à toutes les lignes, ou lancer une seconde requête sans paramètres.
2. **R8** : `upsert` de plusieurs lignes efface, sur une ligne existante, la valeur d'une colonne absente d'une autre ligne.
3. **R9** : une valeur `undefined` dans `update()` met la colonne à `NULL` au lieu de la laisser.

## Lire le tableau

- **Test qui le fige** : `fichier › nom du test`. Le chemin part de `test/`, sans `.test.ts` ni `.test-d.ts`. Le préfixe `characterization:` est omis.
- `integration/codegen › <variante>` : le test `tsForConfig()` de cette variante, qui fige son snapshot.
- **Compat** : l'effet du correctif sur Zapatos 6.6.1 (skill `backward-compat`).
  - *Non cassant* : Postgres refusait déjà ce SQL, ou le type refusait déjà l'appel.
  - *Cassant* : un résultat aujourd'hui valide change ; c'est un point d'arrêt pour l'utilisateur.
- **Corpus** : le motif tel que le corpus d'usages le rencontre (skill `consumer-usage`).
- Un titre de PR n'est donné que pour un constat à corriger.

## Sécurité

| # | Zone | Constat | Test qui le fige | Compat | Proposition | Titre de PR du correctif |
|---|---|---|---|---|---|---|
| R1 | `core.ts` | Un `"` n'est pas doublé dans un identifiant (`Table`, `Column`, clé de `Whereable`, `cols`, `parent()`, `columns`, `order.by`…) : la chaîne ferme le nom. Avec paramètres, un filtre renvoie toutes les lignes ; sans paramètres, une seconde requête s'exécute. | `` integration/injection › a `"` in a Whereable key widens the filter `` ; `` integration/injection › a `"` in a string identifier runs a second statement `` ; `unit/core › does not double an embedded double quote` | non cassant | corriger : doubler `"` comme `quote_ident` | Double embedded quotes in identifiers, so a name cannot close its quotes |
| R2 | `core.ts` | Une chaîne qui commence et finit par `"` est écrite brute, même un `"` seul : la seconde requête passe. | `integration/injection › a pre-quoted string identifier is raw and runs a second statement` ; `unit/core › anything that starts and ends with a double quote passes through raw` | non cassant si `"a"` et `"a"."b"` passent encore | corriger : n'accepter qu'un identifiant entre guillemets bien formé | Pass a string through as already quoted only if it is a well-formed quoted identifier |
| R3 | `core.ts` | Le type d'un cast `param(x, cast)` n'est pas échappé (`CAST($n AS "${cast}")`) : il peut lire une autre ligne. | `` integration/injection › a `"` in a param cast reads another expression `` ; `` unit/injection › the cast type is quoted without doubling `"` `` | non cassant | corriger : même échappement que R1 | Escape quotes in the type name of a param() cast |
| R4 | `shortcuts.ts` | Une chaîne dans `updateValues` d'`upsert` est compilée en identifiant (`ROW("x")`, avec la sortie de R1) ; un nombre lève « Alien object ». Le type accepte les deux. | `integration/shortcuts › updateValues with a plain string fails` ; `unit/injection › upsert updateValues keys, and string values compiled as identifiers` ; `types/core › updateValues with a plain value is accepted, the runtime refuses it` | cassant : une chaîne qui nomme une colonne la recopie aujourd'hui | corriger : un paramètre, comme le type le promet | Send plain updateValues in upsert as parameters, not identifiers |
| R5 | `shortcuts.ts`, `transaction.ts` | Des mots-clés typés en littéraux sont écrits en `raw` sans contrôle : `lock.for`, `lock.wait`, les options de `truncate`, le niveau d'isolation de `transaction()`. Sans paramètres, `lock.for` lance une seconde requête. | `integration/injection › lock.for is checked before any query` ; `unit/injection › truncate options are checked at run time` ; `unit/injection › the isolation level is checked before any query` | non cassant : le type refuse déjà | **corrigé**, PR #14 | Check lock, truncate and isolation level keywords at run time |
| R6 | `shortcuts.ts` | L'`aggregate` de `select()`, 5ᵉ argument public typé `string`, est écrit en `raw` : sans `where`, une seconde requête s'exécute. | `integration/injection › the aggregate of select() is raw and runs a second statement` | non cassant : un nom de fonction passe encore | **corrigé**, PR #17 | Accept only a function name as the aggregate of select() |
| R7 | `shortcuts.ts` | Les clés de `lateral`, l'`alias` et le nom de table de `select` sont écrits bruts dans `"lateral_…"` et `"sq_…"` : même sortie que R1. | `unit/injection › lateral keys are written raw into "lateral_<key>"` ; `unit/injection › alias, also written raw into "sq_<alias>"` ; `unit/injection › the table name, also written raw into "sq_<table>" by select` | non cassant | corriger : doubler `"`, après R1 | Double embedded quotes in lateral keys and aliases too |

## Perte de données

| # | Zone | Constat | Test qui le fige | Compat | Proposition | Titre de PR du correctif |
|---|---|---|---|---|---|---|
| R8 | `shortcuts.ts` | `upsert` de plusieurs lignes remplit une clé absente par `DEFAULT`, puis `SET col = EXCLUDED.col` écrase la valeur existante. Corpus : une quinzaine d'`upsert` de tableaux. | `integration/shortcuts › in several rows, a key missing from one row overwrites with DEFAULT on UPDATE` | cassant | corriger : erreur si les lignes n'ont pas les mêmes clés et qu'aucun `updateColumns` n'est donné ; Postgres ne distingue pas un `DEFAULT` inséré | Make upsert throw on rows with different keys unless updateColumns is given |
| R9 | `shortcuts.ts` | Une valeur `undefined` dans un `Updatable` met la colonne à `NULL` au lieu de la laisser. Corpus : des objets filtrés de leurs clés `undefined` avant un `update`. | `integration/shortcuts › an undefined value sets the column to NULL` ; `unit/shortcuts › an undefined value` | cassant | corriger : omettre la clé, comme `JSON.stringify` ; après R24 (plus aucune colonne) | Leave undefined values out of update(), rather than setting them to NULL |
| R10 | `transaction.ts` | Sur un client déjà dans un `BEGIN` brut, `transaction()` valide la transaction externe (même niveau) ou l'annule et perd son écriture (autre niveau, 25001). | `integration/transaction › on a client already in a raw BEGIN, at the same level, it commits the outer transaction` ; `integration/transaction › on a client already in a raw BEGIN, at another level, it rolls back the outer transaction` | cassant | documenter : node-postgres n'expose pas l'état de transaction ; seul un client de `transaction()` est reconnu | — |

## Résultat faux

| # | Zone | Constat | Test qui le fige | Compat | Proposition | Titre de PR du correctif |
|---|---|---|---|---|---|---|
| R11 | `shortcuts.ts` | Une valeur `undefined` dans un `Insertable` envoie `NULL`, pas `DEFAULT` : une colonne nullable perd son défaut, une `NOT NULL DEFAULT` échoue. | `integration/shortcuts › an undefined value inserts NULL, not the column DEFAULT` ; `unit/shortcuts › values: SQLFragment, Parameter with a cast, Default, undefined` | cassant | corriger : `DEFAULT`, comme pour une clé absente d'un `insert` de plusieurs lignes | Insert DEFAULT for an undefined value, as for a missing key |
| R12 | `conditions.ts` | `not()` ne met pas son fragment entre parenthèses : `` not(sql`a OR b`) `` se lit `(NOT a) OR b`. | `integration/conditions › not() does not parenthesise a fragment` | cassant | corriger : le correctif est d'une ligne | Fix not() so it parenthesises its condition |
| R13 | `core.ts` | Un `Parameter`, un `raw` ou `Default` en valeur de `Whereable`, ou dans `vals([…])` (donc `isIn`), devient un second paramètre : `'{"value":1}'`, `'Symbol(DEFAULT)'`. Le type accepte `Parameter`. Sur un texte, le filtre ne trouve rien, sans erreur. | `integration/core › a Parameter value fails` ; `integration/core › vals of an array fails on a Parameter or Default element` ; `types/core › a Parameter in a Whereable is accepted, the runtime wraps it twice` | cassant : sur un texte, le résultat vide change | corriger : compiler le `Parameter` tel quel ; refuser `Default` dans un filtre | Compile a Parameter in a Whereable or in vals() as a parameter, not as JSON |
| R14 | `shortcuts.ts` | `selectExactlyOne` ne voit jamais une seconde ligne (`LIMIT 1`) : « exactement une » veut dire « au moins une ». Corpus : des centaines d'appels. | `integration/shortcuts › selectExactlyOne does not check for a second row` | cassant | corriger : `LIMIT 2` et `NotExactlyOneError` ; le nom le promet, l'usage du corpus en fait un point d'arrêt à peser | Make selectExactlyOne throw when there is a second row |
| R15 | `shortcuts.ts` | `upsert` réécrit aussi la colonne de conflit : un email `citext` prend la nouvelle casse. | `integration/shortcuts › the conflict column itself is rewritten` | cassant | documenter : la retirer viderait `updateColumns` quand toutes les colonnes sont la cible, et `upsert` ne renverrait plus la ligne | — |
| R16 | `shortcuts.ts` | `sum`, `avg`, `min`, `max` passent le résultat à `Number()` : `0` sur un ensemble vide, des ms epoch pour une date, `NaN` pour un texte. | `integration/shortcuts › on an empty set, sum / avg / min / max return 0, not null` ; `integration/shortcuts › min / max of a date is a timestamp in ms, of a text NaN` | cassant : le type renvoyé change | opt-in (note 003 révisée) : `null` sur un ensemble vide et `min` / `max` typés par colonne, #67 | Make numeric aggregates honest about NULL and column types |
| R17 | `shortcuts.ts` | Un `int8` ou `numeric` au-delà de 2^53 est arrondi : les lignes par défaut (via `to_jsonb`), les agrégats toujours. `enableCustomJSONParsingForLargeNumbers` sauve les lignes seulement. | `integration/shortcuts › a full row comes through to_jsonb, int8 beyond 2^53 included` ; `integration/shortcuts › with enableCustomJSONParsingForLargeNumbers, an int8 beyond 2^53 is a string` ; `integration/shortcuts › an int8 or numeric result beyond 2^53 loses precision` | cassant | documenter : l'option existe pour les lignes ; les agrégats sont typés `number` | — |
| R18 | `core.ts` | `{ col: undefined }` (ou `null`) dans un `Whereable`, et `eq(null)`, compilent `"col" = $n` : aucune ligne. | `integration/core › a null or undefined value matches no row` ; `integration/conditions › eq(null) matches no row` | cassant pour `undefined` ; `null` et `eq(null)` sont déjà refusés par le type | documenter : `isNull` existe ; ignorer la clé élargirait un `deletes` à toute la table | — |
| R19 | `conditions.ts` | `isNotIn([2, null])` ne trouve aucune ligne. | `integration/conditions › isNotIn with a null in the list matches no row` | cassant | documenter : c'est la sémantique SQL de `NOT IN` | — |
| R20 | `conditions.ts` | Un `Date` sur une colonne `date` garde le jour local et perd l'heure ; `subtract(date)` donne des jours. | `integration/conditions › date: the local day of the Date, its time dropped` | cassant | documenter : c'est node-postgres et Postgres | — |
| R21 | `shortcuts.ts` | `withTies` sans `limit` est ignoré sans bruit ; sans `order`, Postgres le refuse. | `unit/shortcuts › limit, offset, withTies` ; `integration/shortcuts › withTies without order is a Postgres error` | cassant | documenter | — |
| R22 | `transaction.ts` | Un client de transaction transmis garde son niveau : `serializable(clientReadCommitted, …)` n'est pas vérifié à l'exécution. | `integration/transaction › passes a transaction client through: no nested transaction, whatever the level asked` | non cassant : le type refuse déjà | laisser : le type protège ; un contrôle demanderait la table des niveaux à l'exécution | — |

## SQL invalide ou erreur

| # | Zone | Constat | Test qui le fige | Compat | Proposition | Titre de PR du correctif |
|---|---|---|---|---|---|---|
| R23 | `conditions.ts` | `and()` et `or()` sans argument compilent `()` (42601). Corpus : un helper qui rend `TRUE` faute de fragment, des dizaines de gardes sur la longueur avant `and(...)`. | `unit/conditions › and() / or() without argument compile to ()` ; `integration/conditions › and() / or() without argument are a syntax error` | non cassant | corriger : `TRUE` et `FALSE` | Make and() and or() with no arguments compile to TRUE and FALSE |
| R24 | `shortcuts.ts` | `update(t, {}, …)` compile `SET () = ROW()` (42601). | `unit/shortcuts › no column at all` ; `integration/shortcuts › no column at all is a syntax error` | non cassant | corriger : une erreur qui dit quoi faire | Make update() with no columns throw a helpful error |
| R25 | `shortcuts.ts` | Trois options d'agrégat compilent du SQL invalide : sans `columns` (`sum(*)`, 42883), plusieurs `columns` (`count("id", "mood")`), un `lateral` passthru (`SELECT  AS result`). | `integration/shortcuts › sum, avg, min, max without columns fail` ; `integration/shortcuts › several columns fail` ; `integration/shortcuts › a passthru lateral is a syntax error` | non cassant | corriger : le type les refuse, l'exécution aussi | Refuse aggregate options that cannot compile |
| R26 | `transaction.ts` | Un `pg.native.Client` est classé `'pool'` : `transaction()` appelle `connect()` sur lui, qui échoue s'il est déjà connecté (« Client has already been connected »), puis `release()`, qui n'existe pas. | aucun : vu à la lecture, non testé (pg-native absent) | non cassant | corriger : `'client'` | Treat a native pg client as a client, not a pool, in transaction() |
| R27 | `core.ts` | Avec `castArrayParamsToJson`, un tableau devient `CAST($n AS "json")`, même avec `param(arr, 'int4[]')` : `=` et `@>` échouent sur une colonne tableau. | `unit/core › a JSON cast wins over a text cast when the config asks for it` ; `integration/core › castArrayParamsToJson breaks comparing an array column with an array value` ; `integration/conditions › castArrayParamsToJson breaks the array operators` | non cassant | corriger : un cast explicite l'emporte sur la config | Let an explicit param() cast win over castArrayParamsToJson |
| R28 | `core.ts` | `param(x, 'public.mood')` et `param(x, 'int[]')` mettent le nom entier entre guillemets : le type n'existe pas (42704). | `unit/core › with a text cast: CAST($n AS "type"), the type quoted as one identifier` ; `integration/core › a schema-qualified or array type cast fails` | non cassant | corriger : citer chaque partie, `[]` hors guillemets ; après R3 | Allow schema-qualified and array types in param() casts |
| R29 | `shortcuts.ts` | `distinct: true` avec un `order` sur une colonne échoue (42P10) : `DISTINCT` porte sur le JSON. | `integration/shortcuts › distinct: true with an order on a column fails` | non cassant | documenter | — |
| R30 | `shortcuts.ts` | Un `lock` sans `of` avec un `lateral` d'agrégat échoue (0A000) : `FOR UPDATE` atteint les sous-requêtes. | `` integration/shortcuts › a lock without `of` fails with an aggregate lateral `` | non cassant | documenter : `of` le limite à la table | — |
| R31 | `shortcuts.ts` | `insert(t, [])` forcé par `run(c, true)` échoue si la première colonne est `GENERATED ALWAYS` (428C9). | `integration/shortcuts › an empty array, forced, can still fail` | non cassant | laisser : forcer un no-op est un cas de niche | — |

## Type faux

| # | Zone | Constat | Test qui le fige | Compat | Proposition | Titre de PR du correctif |
|---|---|---|---|---|---|---|
| R32 | types | `upsert` accepte le `Constraint` d'une autre table ; Postgres le refuse à l'exécution. | `types/shortcuts › upsert accepts the constraint of another table` | non cassant | corriger | Refuse a constraint of another table in upsert |
| R33 | types | `add()` et `subtract()` refusent un `Parameter`, que l'exécution accepte ; or `add(1)` sur une date est ambigu (42725) sans cast. | `types/core › add() and subtract() refuse a Parameter, which the runtime accepts` ; `integration/conditions › add a number of days to a date needs a cast` | non cassant : le type s'élargit | corriger | Allow a Parameter in add() and subtract(), for date arithmetic |
| R34 | types | `arrayContains`, `arrayContainedIn`, `arrayOverlaps` sont typés sur l'élément : `{ scores: arrayContains([1]) }` est refusé. Corpus : les trois réécrites en fragments maison. | `types/core › array conditions are typed on the element, not on the column` | non cassant si le contournement `arrayContains<number[]>([[1]])` compile encore | corriger | Type the array conditions on the array column, not on its element |
| R35 | types | `columns: [...] as const` donne `never[]`. | `types/core › columns as a readonly tuple gives never[]` | cassant : le type renvoyé s'élargit | corriger | Accept a readonly array as the columns option |
| R36 | types | Un `` sql`${self} = 1` `` en ligne dans un `Whereable` de `select` est refusé : `Constraint` est inféré avant `T`. | `` types/core › an inline sql`${self} …` in a Whereable is refused `` | non cassant | documenter : `sql<db.SQL>` ou un fragment déclaré avant ; corriger touche l'inférence de tous les shortcuts | — |
| R37 | types | Un `` sql`…` `` non typé dans `lateral` rend sa clé `any`, sans erreur. | ``` types/core › an untyped sql`` lateral is `any` ``` | cassant : le refuser casserait ces appels | documenter : typer le fragment | — |
| R38 | types | `parent('col')` n'est pas vérifié contre la table parente. | `types/core › parent() is not checked against the parent table` | cassant | laisser : le type ne connaît pas la table parente (③, [#54](https://github.com/AlexandreDemartin/pgcast/issues/54)) | — |
| R39 | types | Un `lateral` passthru est refusé dès que `columns` ou `extras` est posé. | `types/core › a passthru lateral is refused after columns or extras` | non cassant | laisser : à l'exécution, `columns` serait ignoré ; le type protège | — |
| R40 | codegen | Un enum d'un autre schéma devient un type custom `any` (`products.status`, `public.mood[]` dans `extra`). | `` integration/codegen › types enums of another schema as custom types (`any` placeholder) `` ; `` types/schema › another schema (products.status, extra.status) is `any` `` | cassant : `any` devient une union | corriger | Type enums of other schemas as enums, not as custom types |
| R41 | codegen | Les index uniques sont joints par nom, tous schémas confondus : `public.transfers.UniqueIndex` contient l'index unique d'`extra.articles`. | `integration/codegen › matches unique indexes by name across schemas` | non cassant : Postgres refuse ce `ON CONSTRAINT` | corriger | Match unique indexes by table, not by name alone |
| R42 | codegen | Deux types custom de même nom transformé dans deux schémas partagent un placeholder ; le dernier écrit gagne. | aucun : vu à la lecture (PR #4), la fixture ne le montre pas de façon stable | non cassant : un avertissement | corriger : avertir ; renommer les placeholders casserait les fichiers édités | Warn when two custom types share a placeholder name |
| R43 | codegen | Un tableau à deux dimensions (`int[][]`) est typé à une dimension. | `types/schema › two dimensions (accounts.grid int[][]) are typed as one` | cassant | laisser : Postgres n'impose pas le nombre de dimensions | — |
| R44 | codegen | Une vue a un `Insertable` où chaque colonne est facultative et nullable. | `types/schema › a view (active_users) has an Insertable, every column optional and nullable` | cassant | documenter : Postgres rend nullables les colonnes d'une vue | — |
| R45 | codegen | Un composite (`users.home`) est un placeholder `any`. | `` types/schema › a composite (users.home) is an `any` placeholder `` | cassant | laisser : c'est le rôle des placeholders `zapatos/custom` | — |
| R46 | types | `src/db` ne compile que contre le schéma factice ; contre un schéma généré, le corps d'`upsert` donne TS7053 et TS2345. | `integration/codegen › src/db type-checks against the stub schema of src/typings, not against a generated one` | non cassant | laisser : un consommateur compile les déclarations, qui passent | — |

## Codegen

| # | Zone | Constat | Test qui le fige | Compat | Proposition | Titre de PR du correctif |
|---|---|---|---|---|---|---|
| R47 | codegen | La sortie ne se parse pas avec des noms difficiles : `export type traffic-light`, `namespace odd table`, `namespace class`, `'amber's'`, et `*/` dans un nom, un `DEFAULT` ou un commentaire. | `integration/codegen › edge: the output does not parse` | non cassant | corriger | Quote awkward names and escape comments so the generated schema always parses |
| R48 | codegen | Un `COMMENT ON COLUMN` sur plusieurs lignes casse le JSDoc : les lignes suivantes perdent ` * `. | `integration/codegen › keeps column comments of tables and materialized views only` | non cassant | corriger | Prefix every line of a multi-line column comment |
| R49 | codegen | Les commentaires de colonne sont perdus sur les tables partitionnées, les tables étrangères et les vues (`relkind = 'r'` seulement). | `integration/codegen › keeps column comments of tables and materialized views only` | non cassant : JSDoc seul | corriger | Keep column comments on views, foreign tables and partitioned tables |
| R50 | codegen | Les valeurs d'un enum sont triées par ordre alphabétique, pas par `enumsortorder`, jusque dans le tuple `every.<enum>`. | `integration/codegen › sorts enum values alphabetically, not in declaration order (enumsortorder)` | cassant : l'ordre du tuple change | corriger : l'ordre déclaré a un sens en Postgres (`<` sur un enum) | Keep enum values in their declared order |
| R51 | codegen | Une entrée d'`include` qui ne nomme aucune table est ignorée sans bruit. | `integration/codegen › include-exclude-lists` (snapshot `include-exclude-lists.d.ts`) | non cassant : un avertissement | corriger : avertir | Warn about an include entry that matches no table |
| R52 | codegen | Dans `columnOptions`, une entrée de table remplace en bloc l'entrée `'*'` de la colonne ; seuls les schémas préfixés prennent un préfixe, donc `'public.accounts'` ne trouve rien. | `integration/codegen › columnOptions` (snapshot `columnOptions.d.ts`) | cassant | documenter | — |
| R53 | codegen | `COMMENT ON` des tables, vues, schémas, enums et domaines est ignoré. | `integration/codegen › drops COMMENT ON of tables, views, schemas and types` | non cassant | laisser : c'est un ajout, pas un correctif (④, [#55](https://github.com/AlexandreDemartin/pgcast/issues/55)) | — |
| R54 | codegen | Les partitions (`events_2025`…) sortent comme des tables à côté de leur parent. | `integration/codegen › writes zapatos/schema.d.ts, one placeholder per custom type and custom/index.d.ts, as in test/generated` | cassant | laisser : Postgres permet d'écrire dans une partition | — |
| R55 | codegen | Toute colonne de vue matérialisée est nullable. | `integration/codegen › writes zapatos/schema.d.ts, one placeholder per custom type and custom/index.d.ts, as in test/generated` | cassant | laisser : Postgres ne garde pas `NOT NULL` sur une vue matérialisée | — |
| R56 | codegen | Sans aucune relation, le commentaire « `never` rather than `any` would be more accurate » précède des types déjà `never`. | `integration/codegen › exclude-star` (snapshot `exclude-star.d.ts`) | non cassant | laisser : ne se voit que sans aucune relation | — |
| R57 | codegen | L'objet `customTypes` de `tsForConfig()` suit l'ordre d'arrivée des requêtes. | aucun : vu à la lecture (PR #4) ; les fichiers écrits n'en dépendent pas | non cassant | laisser | — |

## Doc

| # | Zone | Constat | Test qui le fige | Compat | Proposition | Titre de PR du correctif |
|---|---|---|---|---|---|---|
| R58 | `core.ts` | Interpoler `null` lève un `TypeError` au lieu de l'erreur « Alien object » ; `parent()` sans colonne hors d'un `Whereable` écrit `"t".` avant de lever sur `undefined`. | `unit/core › null reaches the Whereable branch and throws a TypeError` ; `unit/core › parent() with no column and no current column` | non cassant : l'appel échoue déjà | corriger : une erreur qui dit quoi faire | Give a helpful error on interpolating null or a column-less parent() |
| R59 | `shortcuts.ts` | `selectOne` remplace l'option `limit`. | `unit/shortcuts › the limit option is overridden` | cassant | documenter | — |
| R60 | `core.ts` | `param(x, true)` n'agit que sur un tableau ou un objet simple : un scalaire n'a ni cast ni `JSON.stringify`. | `unit/core › with true, a scalar or a non-plain object is neither stringified nor cast` | cassant | documenter | — |
| R61 | `core.ts` | `queryListener` et `resultListener` sont appelés aussi pour un no-op. | `integration/core › queryListener and resultListener see every run, no-ops included` | cassant | documenter | — |
