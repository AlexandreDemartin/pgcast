---
english: 541741d10a30
description: "Pourquoi pgcast prolonge les versions de Zapatos, quand une correction peut changer ce que reçoit votre code, et ce que demande un avertissement PGCAST_DEP00n."
---

# Versions

Pourquoi les numéros de version de pgcast prolongent ceux de Zapatos, comment il décide si une correction peut changer ce que votre code reçoit, et ce que vous demande un avertissement `PGCAST_DEP00n`.
{.lede}

## Dans la continuité de 6.6.1 {#carrying-on-from-6-6-1}

pgcast commence là où Zapatos 6.6.1 s’est arrêté, donc sa première version est 6.6.2, pas 1.0. Un numéro qui continue dit exactement cela : c’est la version suivante de la bibliothèque que vous avez déjà.

Les modules s’appellent toujours `zapatos/db` et `zapatos/schema`, et le schéma généré garde le [canary](/fr/generated-files#SchemaVersionCanary) de 6.6.1, ce qui permet de [passer de Zapatos à pgcast 6.x](/fr/switching) en gardant les mêmes imports. Avant de passer à la 7.0, vérifiez les [changements de comportement et de types](/fr/switching#from-7-0).

Les numéros suivent [SemVer](https://semver.org/), lu du point de vue d’un projet en 6.6.1 :

- Une version corrective corrige : la 6.6.2 ferme les failles de sécurité que la caractérisation de 6.6.1 par pgcast a trouvées.
- Une mineure ajoute : la 6.7.0 apporte les opt-ins ci-dessous, avec des corrections et de nouvelles fonctionnalités.
- Seule une majeure peut changer un résultat sur lequel du code qui fonctionne peut compter, donc une plage comme `^6.6.2` n’en apporte jamais.

Chaque version, ses corrections de sécurité comprises : le [changelog](/fr/changelog) ; la dernière : [`@pgcast/pgcast` sur npm](https://www.npmjs.com/package/@pgcast/pgcast).

Zapatos cassait aussi des choses dans ses majeures, chaque fois d’un coup : 1.0 a renommé les types de transaction, 2.0 a fait du dernier argument d’`upsert()` un objet d’options, 6.0 a mis le schéma dans les noms des tables et des enums hors de `public`. Chacune était accompagnée de notes sur ce qu’il fallait réécrire.

Pour les opt-ins temporaires, la 6.x émet un avertissement, la 7.0 change la valeur par défaut et la 8.0 supprime l’ancien comportement. Le [guide de migration vers la 7.0](/fr/switching#from-7-0) couvre aussi les changements sans avertissement en 6.x.

## Quatre réponses à une surprise {#four-answers-to-a-surprise}

La caractérisation de Zapatos 6.6.1 a fait apparaître des dizaines de surprises ([le rapport](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md)) : du SQL que Postgres refuse, des résultats qui contredisent le nom d’une fonction, des trous dans l’échappement.

Environ la moitié ne peuvent pas être corrigées sans changer un résultat valide aujourd’hui ([son Summary](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md#summary) tient le compte), et la [décision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md) les trie selon une seule question : du code qui fonctionne pourrait-il dépendre de ce qu’elle fait aujourd’hui ? Le rapport en laisse quelques-unes telles quelles, chacune avec sa raison.

<div class="stack">

| Classe | Quand | Ce qui change pour vous | Exemple |
|---|---|---|---|
| Correction | Postgres ou le type le refusait déjà, ou cela contredit le nom de la fonction ; chaque faille de sécurité | tout de suite ; le changelog liste chaque résultat qui change | [`not()`](/fr/conditions#conditions.not) nie toute sa condition : `` not(sql`a OR b`) `` donnait `(NOT a OR b)`, que Postgres lit `(NOT a) OR b` |
| Opt-in | le résultat est valide, et du code peut en dépendre | rien tant que vous n’activez pas l’option ; l’ancien comportement avertit | une valeur `undefined` envoyée comme `NULL` en 6.x, jusqu’à ce qu’[`undefinedMeansMissing`](/fr/runtime-config#Config.undefinedMeansMissing) en fasse une clé absente |
| Documenter | Postgres le fait, c’est voulu, ou le type ne peut pas voir une valeur connue seulement à l’exécution | rien ; la doc le dit | [`isNotIn()`](/fr/conditions#conditions.isNotIn) avec un `NULL` dans sa liste ne correspond à aucune ligne : c’est ainsi que Postgres lit `NOT IN` |
| Laisser | [le rapport](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md) donne la raison : le type protège, le cas est rare, ou une correction demanderait de deviner | rien | une colonne `int[][]` est typée `number[]` : Postgres n’impose pas les dimensions, et y stocke une, deux ou trois dimensions indifféremment |

</div>

Une correction peut tout de même casser un appel qui ne marchait que grâce au bug. Les corrections d’échappement de 6.6.2 en sont un exemple : un nom de colonne comme `id" AS "x` fermait ses guillemets et ajoutait un alias, et désigne maintenant une colonne qui n’existe pas. Le changelog liste chacun de ces appels, avec ce qu’il faut écrire à la place.

Deux opt-ins restent désactivés pendant toute la série 7.x : `selectExactlyOneChecksForSecondRow`, ci-dessous, et [`domainsTypedAsUnions`](#_7-0-and-8-0), l’option du générateur, qui devient le seul comportement en 8.0. Exécutée seule, la requête [`selectExactlyOne()`](/fr/select#selectExactlyOne) vérifie qu’elle renvoie au moins une ligne. Une fois imbriquée, elle donne `null` en l’absence de ligne. Zapatos l’imbrique dans un `lateral`. Avec `withTies: true`, les lignes ex æquo peuvent alors dupliquer la ligne parente.

Son option, [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), entraîne le rejet de la promesse si la requête, exécutée seule, trouve une deuxième ligne. Elle n’émet aucun avertissement et reste désactivée pendant toute la série 7.x. La 8.0 la retire, et `selectExactlyOne()` ne demande plus que `LIMIT 1` : la clé réglée à `true` lève une erreur ([décision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).

## Pourquoi un opt-in, pas une rupture {#why-an-opt-in-not-a-breaking-change}

Prenez un `update()` avec une valeur `undefined` :

<<< ../examples/plain/versions_undefined.ts{ts twoslash}

Zapatos 6.6.1 envoie `SET ("tagline") = ROW($1)` avec `null`, et le film perd son accroche. C’est peut-être un bug, une clé copiée d’un champ de formulaire jamais rempli ; c’est peut-être aussi la façon dont un projet vide une colonne.

Avec les valeurs par défaut de la 7.0, `tagline: undefined` seul lève l’erreur `nothing to update`. La mise à jour ne s’exécute que si elle affecte une autre colonne. Elle conserve alors l’accroche.

En 6.x, la nouvelle interprétation d’`undefined` est proposée en option, désactivée par défaut. L’ancien comportement déclenche un avertissement. Quand vous êtes prêt, activez les options une par une et vérifiez ce qui change avec vos tests.

Le modèle est emprunté : le cycle de dépréciation de Node lui-même (documenté, puis un avertissement à l’exécution, puis supprimé dans une majeure), les future flags de React Router, et la famille `--strict` de TypeScript, une option par comportement plus sûr.

Le coût : quelques clés de plus dans [`Config`](/fr/runtime-config#Config), et deux chemins dans le code jusqu’à la 8.0. Chaque clé est facultative, donc une `Config` écrite pour Zapatos 6.6.1 compile toujours.

## Lire un avertissement {#reading-a-warning}

Avec les réglages par défaut de pgcast 6.7.0, si le callback de `transaction()` intercepte une erreur de requête et que Postgres répond au `COMMIT` par `ROLLBACK`, Node affiche cet avertissement une fois :

```txt
(node:4242) [PGCAST_DEP003] DeprecationWarning: transaction() resolved, but Postgres answered its COMMIT with ROLLBACK: a query failed and the callback caught the error, so nothing was saved. Set transactionRequiresCommit: true (db.setConfig) to reject instead; it will be the default in pgcast 7.0.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

Chaque comportement déprécié du runtime a son propre code, affiché entre crochets pour faciliter la recherche. La section [Lire les avertissements](/fr/switching#read-the-warnings) liste les avertissements de la 6.x et ce qui les déclenche. Le message décrit le comportement encore en vigueur, indique l’option qui le modifie et annonce que la 7.0 adoptera le nouveau comportement par défaut.

En 6.x, la promesse se résout comme en 6.6.1, même avec `--throw-deprecation`, puis Node arrête le processus quand il émet l’avertissement.

En 6.x, chaque code déclenche un avertissement par processus. `node --trace-deprecation` affiche la pile d’appels. Pour retrouver les autres appels, activez l’option et lancez vos tests.

Avec le comportement historique, `PGCAST_DEP004` signalait en 6.x deux cas : un résultat égal à `null` ou absent pour `sum()`, `avg()`, `min()` ou `max()`, et un minimum ou un maximum dont la valeur est d’un autre type que `number`. À partir de la 7.0, les agrégats sont typés par colonne par défaut.

Là où `undefined` voulait dire « vide-la », `null` le dit avec l’un ou l’autre réglage, et n’avertit jamais.

## 7.0 et 8.0 {#_7-0-and-8-0}

Tout au long de la série 7.x, `aggregatesTypedByColumn: false` dans `db.setConfig()` et dans `ConfigTypes` rétablit les résultats numériques de la 6.x sans avertissement. La 8.0 supprime la clé, et `ConfigTypes` avec elle ([migration vers la 8.0](/fr/switching#from-8-0-aggregatesTypedByColumn)). [Migrer les agrégats](/fr/switching#from-7-0).

La 7.0 active par défaut les opt-ins que liste la décision 003 : `upsertRequiresSameKeys`, `undefinedMeansMissing`, `transactionRequiresCommit`, `aggregatesTypedByColumn`, `transactionRequiresIdleClient`, `transactionRequiresSatisfyingLevel` et ceux du générateur (plus bas), sauf `selectExactlyOneChecksForSecondRow`, qui reste désactivé.

Activez toutes les corrections en 6.x, y compris le typage des agrégats dans `ConfigTypes`, pour vous préparer aux nouvelles valeurs par défaut. Même sans avertissement, compilez les [callbacks de transactions en lecture seule et les conditions sur tableaux](/fr/switching#from-7-0), puis vérifiez les [peer dependencies facultatives qui fournissent les types](/fr/install#requirements) après une installation neuve. Le [guide de migration](/fr/switching#regenerate-for-7-0) recense les onze anciens réglages qui restent utilisables sans avertissement en 7.x et disparaissent en 8.0, ainsi que les deux qui restent.

Pendant toute la 7.x, `undefinedMeansMissing: false` et `upsertRequiresSameKeys: false` rétablissent indépendamment les comportements d’écriture de la 6.x, sans avertissement. La 8.0 supprime ces deux anciens comportements ([migration vers la 8.0](/fr/switching#from-8-0)). Elle supprime aussi `rejectOnQueryError: false`. Deux anciennes valeurs restent, puisqu’elles disent comment votre `pg` parse : `enumArraysTypedAsText: false` et `intervalsTypedAsObjects: false` (plus bas).

En 7.x, `transactionRequiresCommit`, `transactionRequiresIdleClient` et `transactionRequiresSatisfyingLevel` valent aussi `true` par défaut. Passez une de ces options à `false` pour rétablir le [comportement correspondant en 6.x](/fr/switching#runtime-migration) sans avertissement. Ces trois réglages disparaissent en 8.0 ([migration vers la 8.0](/fr/switching#from-8-0)).

Le générateur a ses propres opt-ins en 6.7 : [`typeEnumsAcrossSchemas`](/fr/generator#generate.typeEnumsAcrossSchemas), qui utilise les labels d’un enum d’un autre schéma, sauf en cas de collision de noms, [`enumOrder`](/fr/generator#generate.enumOrder), qui garde les labels d’un enum dans leur ordre de déclaration, [`rejectOnQueryError`](/fr/generator#generate.rejectOnQueryError), qui rejette la promesse de `generate()` quand une requête échoue, plutôt que d’arrêter le processus, [`uniqueIndexConstraintsOnly`](/fr/generator#generate.uniqueIndexConstraintsOnly), qui filtre les cibles de conflit nommées selon l’index de la relation, [`domainsTypedByContext`](/fr/generator#generate.domainsTypedByContext), qui type un domaine sur `bigint`, `numeric`, `bytea`, `money` ou une date, ou sur un tableau de l’un d’eux, selon le contexte, comme l’est son type de base, et un domaine sur un domaine ou un tableau d’un domaine, `any` sans l’option, par le type de base de son domaine le plus intérieur, [`enumArraysTypedAsText`](/fr/generator#generate.enumArraysTypedAsText), qui donne aux tableaux d’enums dans `Selectable` le type texte que renvoie `pg`, et [`intervalsTypedAsObjects`](/fr/generator#generate.intervalsTypedAsObjects), qui type un `interval` dans `Selectable` comme `pg` le parse.

En 7.x, `typeEnumsAcrossSchemas: false` rétablit la recherche dans le schéma de la relation et `enumOrder: "alphabetical"` rétablit le tri alphabétique des labels dans les tuples. Vous pouvez régler ces options indépendamment. Les deux notes de migration disparaissent en 7.0, et la 8.0 retire les deux options ([migration vers la 8.0](/fr/switching#from-8-0-typeEnumsAcrossSchemas)). Voir [comment adapter les imports de placeholders d’enums d’autres schémas](/fr/switching#enum-types).

Sur une table partitionnée, la 7.x fonde `UniqueIndex` sur l’index de la table parente. En 7.x, [`uniqueIndexConstraintsOnly: false`](/fr/generator#generate.uniqueIndexConstraintsOnly) rétablissait sans avertissement la liste de tous les index uniques de la relation ; la 8.0 retire cette option. Voir [Cibles de conflit nommées en 7.0](/fr/switching#named-conflict-targets).

En 6.x, pour chacune des six options liées au schéma, l’avertissement prend la forme d’une note transmise via [`warningListener`](/fr/generator#generate.warningListener), distincte d’un `DeprecationWarning`. La note apparaît une fois par exécution, uniquement si l’option changerait le résultat pour votre schéma. Les notes nomment chaque colonne touchée par `typeEnumsAcrossSchemas`, `domainsTypedByContext`, `enumArraysTypedAsText` ou `intervalsTypedAsObjects`, chaque enum touché par `enumOrder` et chaque index unique touché par `uniqueIndexConstraintsOnly`.

Depuis la 7.0, les colonnes de type domaine sont typées selon le contexte. Dans les lignes brutes, les tableaux d’enums sont représentés par du texte et les intervalles par des objets. Les notes de migration de la 6.x disparaissent. Dans toute la série 7.x, `domainsTypedByContext: false` rétablissait le typage par le placeholder ; la 8.0 retire cette option. Dans les lignes brutes, pour un domaine portant directement sur un tableau d’enums, `enumArraysTypedAsText: false` suffit à rétablir le type du placeholder. Pour générer de nouveaux placeholders de type texte pour des domaines sur des intervalles, il faut `intervalsTypedAsObjects: false`. Les deux réglages liés aux parsers, `enumArraysTypedAsText: false` et `intervalsTypedAsObjects: false`, restent disponibles au-delà de la 8.0. Voir [Domaines, tableaux d’enums et intervalles en 7.0](/fr/switching#domain-and-parser-types).

De la 6.7 à la fin de la 6.x, si l’option `rejectOnQueryError` était omise ou valait `null` en JSON, `generate()` et `tsForConfig()` transmettaient `PGCAST_DEP006` à l’écouteur `warningListener` s’il était activé, avant d’arrêter le processus en cas d’échec de connexion ou de requête. À partir de la 7.0, si vous omettez l’option ou indiquez `null` en JSON, la promesse de chacune des deux fonctions est rejetée avec l’erreur d’origine, comme celle de [`check()`](/fr/generator#export-check). La note disparaît. En 7.x, `rejectOnQueryError: false` permettait de quitter immédiatement avec le code 1 en cas d’échec de connexion ou de requête, comme la CLI. À partir de la 8.0.0, l’option est retirée : la promesse de `generate()` est toujours rejetée, et la CLI affiche elle-même l’erreur et se termine avec le code 1 ([migration vers la 8.0](/fr/switching#from-8-0-rejectOnQueryError)).

[`domainsTypedAsUnions`](/fr/generator#generate.domainsTypedAsUnions), à partir de la 6.10, type un domaine sur `text` par les valeurs que liste son `CHECK`. Il n’a pas de note et reste désactivé en 7.0 : un placeholder qui contient le type de base du domaine est la façon dont Zapatos type un domaine, plus large que les valeurs mais pas faux, puisque Postgres refuse le reste. La 8.0 ne garde que ce comportement : l’union de chaque domaine de ce type est déclarée, et un nouveau placeholder la nomme, tandis qu’un placeholder déjà sur le disque garde son `string`.

[`valuesTypedAsAliases`](/fr/generator#generate.valuesTypedAsAliases) écrit le type de la valeur de chaque colonne dans `Whereable`, `Insertable` et `Updatable` comme un alias de `zapatos/db`, avec les mêmes types. L’option n’a pas de note, puisqu’il n’y a rien à migrer, et la 8.0 ne garde que ce comportement.

[`topLevelSelectAsRows`](/fr/runtime-config#Config.topLevelSelectAsRows), à partir de la 7.3.0, envoie un `select()` exécuté seul sous la forme d’une ligne par résultat, avec les mêmes valeurs. L’option n’émet jamais d’avertissement, et la 8.0 ne garde que ce comportement : le code qui exécute lui-même le texte de `.compile()` lit `rows.map(r => r.result)`.

[`shortcutsUseJson`](/fr/runtime-config#Config.shortcutsUseJson), à partir de la 7.3.0, construit le JSON de `select()` et de ses semblables, et celui du `RETURNING` des écritures, avec les fonctions `json`, pour les mêmes valeurs, sauf l’ordre des clés d’une ligne et le type d’un résultat imbriqué. L’option n’émet jamais d’avertissement, et la 8.0 supprime la clé et ne garde que `json` ([migration vers la 8.0](/fr/switching#from-8-0-shortcutsUseJson)).

En 8.0, chaque option ne garde qu’un comportement, le meilleur ([décision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).

## Pour aller plus loin {#further-reading}

- Les entrées dont parle cette page : [`Config.upsertRequiresSameKeys`](/fr/runtime-config#Config.upsertRequiresSameKeys), [`Config.undefinedMeansMissing`](/fr/runtime-config#Config.undefinedMeansMissing), [`Config.transactionRequiresCommit`](/fr/runtime-config#Config.transactionRequiresCommit), [`Config.transactionRequiresIdleClient`](/fr/runtime-config#Config.transactionRequiresIdleClient), [`Config.transactionRequiresSatisfyingLevel`](/fr/runtime-config#Config.transactionRequiresSatisfyingLevel), [`Config.selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), [`Config.aggregatesTypedByColumn`](/fr/runtime-config#Config.aggregatesTypedByColumn), [Opt-ins et avertissements](/fr/runtime-config#opt-ins-and-warnings), [`typeEnumsAcrossSchemas`](/fr/generator#generate.typeEnumsAcrossSchemas), [`enumOrder`](/fr/generator#generate.enumOrder), [`rejectOnQueryError`](/fr/generator#generate.rejectOnQueryError), [`uniqueIndexConstraintsOnly`](/fr/generator#generate.uniqueIndexConstraintsOnly), [`domainsTypedByContext`](/fr/generator#generate.domainsTypedByContext), [`enumArraysTypedAsText`](/fr/generator#generate.enumArraysTypedAsText), [`intervalsTypedAsObjects`](/fr/generator#generate.intervalsTypedAsObjects), [`domainsTypedAsUnions`](/fr/generator#generate.domainsTypedAsUnions), [`valuesTypedAsAliases`](/fr/generator#generate.valuesTypedAsAliases), [`Config.topLevelSelectAsRows`](/fr/runtime-config#Config.topLevelSelectAsRows), [Une valeur `undefined`](/fr/insert#undefined-values), [`conditions.not()`](/fr/conditions#conditions.not), [`conditions.isNotIn()`](/fr/conditions#conditions.isNotIn), [`selectExactlyOne()`](/fr/select#selectExactlyOne), [`SchemaVersionCanary`](/fr/generated-files#SchemaVersionCanary).
- La décision derrière : la [décision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md), et chaque changement par version dans le [changelog](/fr/changelog).
