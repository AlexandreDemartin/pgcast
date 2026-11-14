---
english: 65b277c0e438
---

# Versions

Pourquoi les numéros de version de pgcast prolongent ceux de Zapatos, comment il décide si une correction peut changer ce que votre code reçoit, et ce que vous demande un avertissement `PGCAST_DEP00n`.
{.lede}

## Dans la continuité de 6.6.1 {#carrying-on-from-6-6-1}

pgcast commence là où Zapatos 6.6.1 s’est arrêté, donc sa première version est 6.6.2, pas 1.0. Un numéro qui continue dit exactement cela : c’est la version suivante de la bibliothèque que vous avez déjà.

Les modules s’appellent toujours `zapatos/db` et `zapatos/schema`, et le schéma généré garde le [canary](/fr/runtime-config#SchemaVersionCanary) de 6.6.1, donc un projet passe à pgcast en changeant sa dépendance, pas son code ([Venir de Zapatos](/fr/switching)).

Les numéros suivent [SemVer](https://semver.org/), lu du point de vue d’un projet en 6.6.1 :

- Un patch corrige : 6.6.2 ferme les failles de sécurité que la caractérisation de 6.6.1 par pgcast a trouvées.
- Une mineure ajoute : 6.7.0 apporte les opt-ins ci-dessous, avec des corrections et de nouvelles fonctionnalités.
- Seule une majeure peut changer un résultat sur lequel du code qui fonctionne peut compter, donc une plage comme `^6.6.2` n’en apporte jamais.

Zapatos cassait aussi des choses dans ses majeures, chaque fois d’un coup : 1.0 a renommé les types de transaction, 2.0 a fait du dernier argument d’`upsert()` un objet d’options, 6.0 a mis le schéma dans les noms des tables et des enums hors de `public`. Chacune était accompagnée de notes sur ce qu’il fallait réécrire.

pgcast étale plutôt une rupture sur deux majeures, et vous prévient avant la première.

## Quatre réponses à une surprise {#four-answers-to-a-surprise}

La caractérisation de Zapatos 6.6.1 a fait apparaître des dizaines de surprises ([le rapport](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md)) : du SQL que Postgres refuse, des résultats qui contredisent le nom d’une fonction, des trous dans l’échappement.

Environ la moitié ne peuvent pas être corrigées sans changer un résultat valide aujourd’hui ([son Summary](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md#summary) tient le compte), et la [décision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md) les trie selon une seule question : du code qui fonctionne pourrait-il dépendre de ce qu’elle fait aujourd’hui ? Le rapport en laisse quelques-unes telles quelles, chacune avec sa raison.

<div class="stack">

| Classe | Quand | Ce qui change pour vous | Exemple |
|---|---|---|---|
| Correction | Postgres ou le type le refusait déjà, ou cela contredit le nom de la fonction ; chaque faille de sécurité | tout de suite ; le changelog liste chaque résultat qui change | [`not()`](/fr/conditions#conditions.not) nie toute sa condition : `` not(sql`a OR b`) `` donnait `(NOT a OR b)`, que Postgres lit `(NOT a) OR b` |
| Opt-in | le résultat est valide, et du code peut en dépendre | rien tant que vous n’activez pas l’option ; l’ancien comportement avertit | une valeur `undefined` envoyée comme `NULL`, jusqu’à ce qu’[`undefinedMeansMissing`](/fr/runtime-config#Config.undefinedMeansMissing) en fasse une clé absente |
| Documenter | Postgres le fait, ou c’est voulu | rien ; la doc le dit | [`isNotIn()`](/fr/conditions#conditions.isNotIn) avec un `NULL` dans sa liste ne correspond à aucune ligne : c’est ainsi que Postgres lit `NOT IN` |
| Laisser | [le rapport](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md) donne la raison : le type protège, le cas est rare, ou une correction demanderait de deviner | rien | une colonne `int[][]` est typée `number[]` : Postgres n’impose pas les dimensions, et y stocke une, deux ou trois dimensions indifféremment |

</div>

Une correction peut tout de même casser un appel qui ne marchait que grâce au bug. Les corrections d’échappement de 6.6.2 en sont un exemple : un nom de colonne comme `id" AS "x` fermait ses guillemets et ajoutait un alias, et désigne maintenant une colonne qui n’existe pas. Le changelog liste chacun de ces appels, avec ce qu’il faut écrire à la place.

Un opt-in restera désactivé pour de bon. [`selectExactlyOne()`](/fr/select#selectExactlyOne) ne demande qu’une ligne à Postgres, donc il veut dire « au moins une », et la doc de Zapatos elle-même l’imbrique dans un `lateral`, où chercher une deuxième ligne dupliquerait la ligne parente.

Son option, [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), ne cherche une deuxième ligne que dans une requête exécutée seule, jamais dans une requête imbriquée dans une autre, n’avertit jamais, et ne devient jamais la valeur par défaut.

## Pourquoi un opt-in, pas une rupture {#why-an-opt-in-not-a-breaking-change}

Prenez un `update()` avec une valeur `undefined` :

<<< ../examples/plain/versions_undefined.ts{ts twoslash}

Zapatos 6.6.1 envoie `SET ("tagline") = ROW($1)`<!-- probe: db.update('films', { tagline: undefined }, { id: 1002 }) --> avec `null`, et le film perd son slogan. C’est peut-être un bug, une clé copiée d’un champ de formulaire jamais rempli ; c’est peut-être aussi la façon dont un projet vide une colonne.

pgcast ne peut pas savoir lequel, et votre compilateur non plus : si la 6.7 avait simplement omis la colonne, ce code compilerait toujours, s’exécuterait toujours, et cesserait sans bruit de vider les slogans.

La nouvelle lecture arrive donc comme une option, désactivée par défaut, et l’ancienne avertit quand elle s’exécute. Vous basculez quand vous êtes prêt, une option à la fois, avec vos tests pour montrer ce qui a bougé.

Le modèle est emprunté : le cycle de dépréciation de Node lui-même (documenté, puis un avertissement à l’exécution, puis supprimé dans une majeure), les future flags de React Router, et la famille `--strict` de TypeScript, une option par comportement plus sûr.

Le coût : quelques clés de plus dans [`Config`](/fr/runtime-config#Config), et deux chemins dans le code jusqu’à la 8.0. Chaque clé est facultative, donc une `Config` écrite pour Zapatos 6.6.1 compile toujours.

## Lire un avertissement {#reading-a-warning}

Appelez cet `update()` en 6.7 et Node affiche, une fois :

```txt
(node:4242) [PGCAST_DEP002] DeprecationWarning: An undefined value in insert(), update() or upsert() is sent as NULL. Set undefinedMeansMissing: true (db.setConfig) to treat it as a missing key instead (DEFAULT in insert(), left out of update() and upsert()); it will be the default in pgcast 7.0.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

Entre crochets figure le code, un par comportement déprécié du runtime, qu’on peut rechercher : [Opt-ins et avertissements](/fr/runtime-config#opt-ins-and-warnings) les liste, avec ce qui déclenche chacun. Ensuite, le message dit ce qui se passe encore, quelle option le change, et que la 7.0 en fera le comportement par défaut.

Rien d’autre ne change : la requête s’exécute comme en 6.6.1, sauf si Node tourne avec `--throw-deprecation`, qui arrête le processus ([Opt-ins et avertissements](/fr/runtime-config#opt-ins-and-warnings)).

L’avertissement arrive quand vous appelez le raccourci, avant `.run()`, et seulement si l’ancien comportement est vraiment utilisé : un `update()` sans `undefined` n’avertit jamais.

Il arrive une fois par processus pour chaque code, donc il vous dit que l’ancien chemin a été pris, pas où ni combien de fois. `node --trace-deprecation` ajoute la pile, jusqu’à la ligne qui a appelé `update()` ; pour le reste, activez l’option et laissez vos tests trouver ce qui change.

`PGCAST_DEP003` arrive plus tard : une fois que `transaction()` a envoyé `COMMIT` et que Postgres a répondu `ROLLBACK`, juste avant que la promesse se résolve.

Là où `undefined` voulait dire « vide-la », `null` le dit avec l’un ou l’autre réglage, et n’avertit jamais.

## 7.0 et 8.0 {#_7-0-and-8-0}

La 7.0 active par défaut les opt-ins que liste la décision 003 : `upsertRequiresSameKeys`, `undefinedMeansMissing`, `transactionRequiresCommit` et ceux qu’apporte encore la 6.7, sauf `selectExactlyOneChecksForSecondRow`, qui reste désactivé.

La décision 003 fait de cela toute la rupture de la 7.0, et les avertissements l’annoncent, donc un projet qui a activé chaque option, et ne voit ni avertissement `PGCAST_DEP` ni note du générateur, n’a rien à changer. Les anciens comportements disparaissent en 8.0.

Le générateur a ses propres opt-ins en 6.7 : [`typeEnumsAcrossSchemas`](/fr/generator#generate.typeEnumsAcrossSchemas), qui type un enum d’un autre schéma par ses libellés, et [`enumOrder`](/fr/generator#generate.enumOrder), qui garde les libellés d’un enum dans leur ordre de déclaration.

Leurs avertissements sont des notes via [`warningListener`](/fr/generator#generate.warningListener), pas un `DeprecationWarning`, et n’arrivent que si votre schéma contient quelque chose qu’ils changeraient, une fois par exécution : celui de `typeEnumsAcrossSchemas` nomme chaque colonne, celui d’`enumOrder` chaque enum.

::: info À venir
pgcast n’est pas encore sur npm. 6.6.2 est écrite ; 6.7.0, qui apporte les opt-ins, est en cours : [son jalon](https://github.com/AlexandreDemartin/pgcast/milestone/1).
:::

## Pour aller plus loin {#further-reading}

- Les entrées dont parle cette page : [`Config.upsertRequiresSameKeys`](/fr/runtime-config#Config.upsertRequiresSameKeys), [`Config.undefinedMeansMissing`](/fr/runtime-config#Config.undefinedMeansMissing), [`Config.transactionRequiresCommit`](/fr/runtime-config#Config.transactionRequiresCommit), [`Config.selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), [Opt-ins et avertissements](/fr/runtime-config#opt-ins-and-warnings), [`typeEnumsAcrossSchemas`](/fr/generator#generate.typeEnumsAcrossSchemas), [`enumOrder`](/fr/generator#generate.enumOrder), [Une valeur `undefined`](/fr/insert#undefined-values), [`conditions.not()`](/fr/conditions#conditions.not), [`conditions.isNotIn()`](/fr/conditions#conditions.isNotIn), [`selectExactlyOne()`](/fr/select#selectExactlyOne), [`SchemaVersionCanary`](/fr/runtime-config#SchemaVersionCanary).
- La décision derrière : la [décision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md), et chaque changement par version dans le [changelog](/fr/changelog).
