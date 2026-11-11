---
name: zapatos-spirit
description: 'L’esprit de Zapatos et de George MacKerron, poussé plus loin : taille et périmètre d’une PR, titre, style du code, JSDoc, messages d’erreur, voix de la doc. USE FOR: découper une étape, nommer une PR, écrire du code ou de la doc dans src/, juger si George s’y retrouverait. DO NOT USE FOR: forme d’un helper (zero-abstraction).'
---

# L'esprit de Zapatos

Si George MacKerron ouvre pgcast, il doit retrouver son projet, en mieux. Sources : `docs/index.html` (sa doc) et `git log upstream/master` (son historique).

## Ses principes

- « No abstractions, no distractions: just your database, with type safety. »
- Des shortcuts « with no fuss and no surprises, fully and automatically typed ».
- Ses critères de contribution (`docs/index.html` § Fixes, feature and contributions) :
  - **« Correct, consistent, comprehensible »** : corriger, harmoniser, rendre lisible ;
  - **« Small is beautiful »** : pas de complexité pour un cas de niche ni pour un gain de performance noyé dans la latence réseau.
- Sa feuille de route (§ What's next) passe en premier : une vraie suite de tests, y compris sur les types inférés, puis des laterals typés grâce aux clés étrangères.
- **Ses limites, écrites par lui** (§ lateral, Limitations) : les jointures ne sont pas vérifiées (« REFERENCES relationships are not exploited ») ; `selectExactlyOne` s'écrit à la main quand la FK est `NOT NULL`, alors que ça « might be inferred for us ». Aller plus loin, c'est d'abord lever ces limites-là.
- « Zapatos is always explicit about what client or pool is running your query » : pas de client par défaut, « too easy to accidentally issue queries outside of transactions ».

## Ce que George n'aurait pas fait

Une PR qui fait l'un de ces gestes est refusée, quel que soit son gain :

- Un modèle, une classe d'entité, une relation déclarée en TypeScript (« just (fully-typed) POJOs »).
- Du chargement paresseux, une identity map, un suivi des modifications, un cache de requêtes.
- Une chaîne de méthodes qui construit une requête et cache son SQL (`.where().join()`).
- Un client implicite, par défaut ou global ; une transaction ouverte sans qu'on l'ait demandée.
- Gérer le pool de connexions ou les migrations (« Zapatos doesn't handle schema migrations »).
- Une abstraction pour changer de base demain au détriment de Postgres aujourd'hui (« a source of misery »).
- Un type deviné que la base ne dit pas ; une valeur concaténée au lieu d'un paramètre.
- Un SQL qui dépend de l'état ou qui change selon les valeurs sans être documenté.
- Compliquer le cœur pour un cas de niche ou un gain noyé dans la latence réseau (« Small is beautiful ») : ça va dans un paquet séparé, ou en opt-in.

## Taille et périmètre

Mesuré sur ses 212 commits qui touchent `src/` :

| | médiane | p75 | p90 |
|---|---|---|---|
| lignes changées dans `src/` | 14 | 42 | 84 |
| fichiers | 1 | — | 4 |

- **Une PR = un changement visible**, décrit en une phrase. Ne jamais mêler un correctif, une fonctionnalité et un refactor.
- **`src/` : ~100 lignes changées au plus par PR** (son p90). Au-delà, découper en PR indépendantes, chacune utile seule.
- **Tests à proportion** : une PR de tests seuls reste lisible d'une traite (~800 lignes écrites à la main, sans compter les snapshots générés). Au-delà, découper par sujet (types, injection, un module).
- Exemple de la bonne taille : « Add conditions with array operators », 4 lignes dans `conditions.ts`.
- Contre-exemple : PR #5, ~2 900 lignes en une PR ; à découper aujourd'hui en core, shortcuts, conditions et transaction.

## Découper comme George

George committait directement sur `master` : **un commit de George correspond à une PR de pgcast**. Son historique montre comment il découpait :

| Son geste | Exemple tiré de `git log upstream/master` | Dans pgcast |
|---|---|---|
| Une fonctionnalité grandit par marches : un cas, puis les autres, puis la généralisation | « Added returning option to insert shortcut » → « Added returning option to upsert » → « Returning (and now also extras) options for insert/upsert/update/deletes » | Une PR par marche, chacune utile seule. La première porte le cas le plus simple. |
| Runtime et codegen séparés (22 commits mixtes sur 154) | « Direct lateral subquery support » (`db`) ; « add support for schema generation for materialized views » (`gen`) | Une PR `src/generate`, puis une PR `src/db` qui s'en sert. Jamais les deux, sauf un changement de format qui les lie (canary). |
| La doc suit le code (5 commits mixtes sur 154) | « Updated docs for returning/extras and 2.0 » | La PR de code porte sa ligne de `CHANGELOG.md` et sa JSDoc ; le guide d'usage vient dans une PR « Document … » après la série. |
| Correction en avançant | « Direct lateral subquery support » puis « Fixed type inference for lateral direct subqueries » | Un défaut trouvé après fusion devient une petite PR « Fix … », jamais un gros correctif mêlé à la suite. |
| Dépendances à part | « Updated dependencies » | Une PR pour les mises à jour de dépendances, sans code. |
| Versions petites et fréquentes (94 commits de version) | « 6.4.1 », « 6.4.2 », un correctif chacune | Une version dès qu'un changement utile est fusionné. La publication reste un point d'arrêt. |
| Gros chantier exploratoire sur une branche | « Started work on multi schema support » → « Progress on multi-schema work » → « Multi-schema updates » | D'abord une note de décision, puis une série de petites PR. Jamais une PR géante. |
| La raison dans le titre quand elle n'est pas évidente | « … to count(*) rather than count(alias.*) for performance reasons » | Une raison courte en fin de titre, si elle aide. |

Exemple pour l'étape ③ (clés étrangères) :

1. « Generate foreign key metadata for each table » (`src/generate`, opt-in)
2. « Add related() for many-to-one lateral joins » (`src/db`)
3. « Add relatedMany() for one-to-many lateral joins » (`src/db`)
4. « Allow lateral results to be referenced in order and groupBy » (`src/db`)
5. « Document related() and relatedMany() » (docs)

## Titre d'une PR

- **Anglais courant, une majuscule au début, sans préfixe** (`test:`, `feat:`), avec un verbe qui dit l'effet pour l'utilisateur : `Add …`, `Allow …`, `Fix …`, `Make …`, `Stop …`, `Characterise …`.
- **Orthographe britannique**, comme George (`licence`, `characterise`, `parenthesise`, `favour`).
- Noms d'API tels quels, sans backticks : « Allow db.all as value of noNullUpdateColumns ».
- **Issue de l'étape en fin, toujours** : `(closes #n)`, comme George (« Stop generating .eslintrc.json (closes #184) ») ; le corps porte aussi `Closes #n`, qui ferme l'issue à la fusion. `(addresses #n)` pour une PR qui n'en fait qu'une partie.
- Exemples : « Fix not() so it parenthesises its condition (closes #30) », « Add related() and relatedMany() for lateral joins on foreign keys ».

## Commits

Même voix que les titres de PR ; ses sujets récents donnent le modèle.

- **Une ligne**, en anglais courant, une majuscule au début, sans préfixe ni point final : « Add conditions with array operators », « Stop generating .eslintrc.json (closes #184) ».
- **Impératif**, comme ses commits récents : `Add`, `Allow`, `Fix`, `Make`, `Stop`, `Ensure`, `Export`, `Characterise`.
- **Docs** : « Update docs for … » ; **dépendances** : « Update dependencies » ; **version** : le numéro seul (« 6.7.0 »).
- **Apprentissages** : « Record what #22 taught » ; **merge de master** : « Merge master into <branche> ».
- Plus de commit qui coche une case : la fusion de la PR ferme son issue.
- Pas de corps, sauf une raison qui ne tient pas dans la ligne ; la ligne `Co-Authored-By` demandée reste toujours.
- Ancien format (`test: …`, `fix: …`) : historique des PR #1 à #12, on ne le réécrit pas.

## Code dans `src/`

Reprendre ses motifs, sans les reformater ailleurs :

```ts
// src/db/shortcuts.ts
const
  returningSQL = SQLForColumnsOfTable(options?.returning, table),
  extrasSQL = SQLForExtras(options?.extras),
  query = sql`DELETE FROM ${table} WHERE ${where} RETURNING ${returningSQL}${extrasSQL} AS result`;
```

- Déclarations groupées dans un seul `const`, ternaires en cascade alignés à la verticale.
- Une interface `XSignatures` pour les surcharges, puis `export const x: XSignatures = function (…) {…}`.
- Repères de section `/* === insert === */`.
- Un commentaire explique la bizarrerie de Postgres et donne son lien (voir la note `ROW()` de `update`).
- Vocabulaire de Postgres pour les noms (`isDistinctFrom`, `arrayOverlaps`, `selectExactlyOne`). Un nom réservé se contourne simplement (`deletes`).
- Guillemets simples, points-virgules, 2 espaces.
- En-tête de fichier conservé ; un fichier neuf reprend la même forme, avec la ligne du fork.

## JSDoc et erreurs

- JSDoc : une première phrase à l'impératif (« Generate an `INSERT` query `SQLFragment`. »), puis un `@param` par paramètre, et pour pgcast le SQL produit.
- Le danger se signale haut et fort (`raw` : « 💥💥💣 **DANGEROUS** 💣💥💥 »).
- Une erreur dit quoi faire : « Did you use `self` (the global object) where you meant `db.self`…? », « hint: check `.query.compile()` on this Error ».

## Doc

- Première personne, chaleureuse et brève, un peu d'humour (« It is a truth universally acknowledged that ORMs aren't very good. »).
- Chaque fonctionnalité montre trois choses côte à côte : le TypeScript qu'on écrit, le SQL produit, le type obtenu.
- **Ses exemples, son monde** : `authors` (`"id"`, `"name"`, `"isLiving"`), `books` (`"authorId"`, `"title"`, `"createdAt"`), `tags` (`"tag"`, `"bookId"`) ; `employees` (`"managerId"`, avec `alias`) pour une auto-référence ; `photos` / `subjects` / `subjectPhotos` pour un many-to-many (lateral passthrough) ; `stores` pour `extras` (PostGIS) ; `nameCounts` pour `updateValues` ; `bankAccounts` et `doctors` / `shifts` pour les transactions. Colonnes en camelCase entre guillemets, comme dans sa doc. Un exemple neuf (JSDoc, doc, issue, PR) reprend ces tables ; jamais un extrait d'un projet réel.

## Plus loin, sans trahir

- Ce qu'il voulait, d'abord : tests et laterals typés par les FK.
- Ce qu'il n'avait pas : tests, types vérifiés, CI. On les ajoute sans changer la sensation d'usage.
- Une nouvelle API doit pouvoir passer pour la sienne : même vocabulaire, même forme, même SQL visible.

## Checklist

- [ ] Un seul changement visible, décrit en une phrase
- [ ] `src/` ≤ ~100 lignes, sinon découpé
- [ ] Titre en anglais courant, sans préfixe, orthographe britannique
- [ ] Code dans ses motifs ; JSDoc avec le SQL produit ; erreur qui dit quoi faire
- [ ] George accepterait la PR : correct, consistent, comprehensible, small
