---
english: 565e7230cb8e
---

# Pourquoi pgcast

Pourquoi pgcast fonctionne comme il le fait : l’idée qu’il garde de Zapatos, ce que le fork y ajoute, et ce qu’il ne fera jamais. Les étapes sont dans les [guides](/fr/guides), chaque option dans la [référence](/fr/reference).
{.lede}

## Juste votre base, avec la sûreté des types {#just-your-database-with-type-safety}

pgcast, c’est Zapatos qui continue. La doc de Zapatos s’ouvre sur son but :

> <span lang="en">Postgres and TypeScript are each, individually, fabulous. Zapatos aims to make them work beautifully together. No abstractions, no distractions: just your database, with type safety.</span>

Son plaidoyer vise les ORM. « <span lang="en">It is a truth universally acknowledged that ORMs aren’t very good</span> », écrit son auteur, et « <span lang="en">abstractions that obscure the underlying SQL, or that prioritise ease of switching to another database tomorrow over effective use of this database today, are a source of misery</span> ».

La vérification des types et l’autocomplétion de VS Code « <span lang="en">speed development, prevent bugs, and simplify refactoring</span> », mais « <span lang="en">talking to the database is a place where they really don’t just happen</span> ».

Zapatos fait donc trois choix, et pgcast garde les trois : les types viennent de la base, le SQL reste sous vos yeux, et rien n’arrive que vous n’ayez demandé.

## Des types moulés sur la base {#types-cast-from-the-database}

Postgres connaît déjà votre schéma : chaque colonne, son type, si elle peut être nulle, si elle a une valeur par défaut, le commentaire que vous lui avez donné. Le générateur interroge le catalogue (`pg_catalog` et `information_schema`) et écrit `zapatos/schema.d.ts`.

Ce fichier contient les types de chaque table, vue, vue matérialisée et table distante, une union de chaînes pour chaque enum, et un fichier à compléter pour chaque domaine ou type qu’il ne sait pas traduire seul ([Types personnalisés](/fr/custom-types)). Aucun type de ligne n’est écrit à la main, donc aucun ne peut contredire sa table.

D’où le nom. En Postgres, un cast (`::`) donne son type à une valeur ; en anglais, un *cast* est aussi un moule. Les types de pgcast sont moulés sur votre schéma, et les exemples de cette doc parlent, fort à propos, de la distribution d’un film, son *cast*.

Une colonne que la table n’a pas est refusée avant toute requête :

```ts twoslash
// @errors: 2353
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const films = await db.select('films', { relase_year: 1974 }).run(pool);
```

Les types sont aussi frais que le dernier passage du générateur. Relancez-le après chaque migration, et le compilateur vous signale chaque requête qui ne colle plus. Comment chaque type Postgres devient un type TypeScript, et pourquoi une ligne en JSON diffère d’une ligne venue de `pg` : [Le catalogue](/fr/catalog-types).

## Le SQL que vous lisez est le SQL qui s’exécute {#the-sql-you-read-is-the-sql-that-runs}

Chaque raccourci écrit une seule requête, et sa référence montre ce SQL. La doc de Zapatos promet « <span lang="en">everyday CRUD queries with no fuss and no surprises, fully and automatically typed</span> ». Ici, un studio avec ses films :

<CastPanel example="why_studio">

<<< ../examples/why_studio.ts{ts twoslash}

</CastPanel>

Le panneau montre ce que vous obtenez dans votre propre code : [`.compile()`](/fr/sql-template#compile) donne les mêmes `text` et `values`, et n’envoie rien. Chaque valeur est un paramètre, les clés JSON comprises ; chaque nom de table et de colonne est entre guillemets.

L’imbrication est l’œuvre de Postgres lui-même, `jsonb_agg`<!-- probe: examples/why_studio.ts --> dans un `LEFT JOIN LATERAL`<!-- probe: examples/why_studio.ts --> : le studio et ses films reviennent en une seule valeur JSON, en un aller-retour, sans lignes à recoudre en JavaScript.

TypeScript connaît la seule colonne demandée, les films en dessous, et `undefined` quand aucun studio n’a cet `id` : il faut pour cela `strict`, que [Première requête](/fr/first-query#set-up-the-project) active.

Quand un raccourci ne convient pas, le template [`sql`](/fr/sql-template#sql) est toujours là. Vous écrivez le SQL, il interpole les noms, les valeurs comme paramètres, et d’autres fragments, et vous typez le résultat avec les types générés. Les raccourcis sont bâtis dessus.

## Explicite, jamais caché {#explicit-never-hidden}

Il n’y a pas de modèles. Une requête renvoie des objets simples, typés : « just (fully-typed) POJOs », selon les mots de la doc de Zapatos. Aucune classe à étendre, aucune relation à déclarer, rien de chargé paresseusement derrière une propriété, et aucun état qu’un enregistrement ultérieur réécrirait.

Pas de connexion par défaut non plus : chaque `.run()` prend le pool ou le client sur lequel s’exécuter, car « <span lang="en">Zapatos is always explicit about what client or pool is running your query</span> ».

Une transaction ne commence que lorsque vous appelez [`transaction()`](/fr/transaction#transaction). Elle envoie `START TRANSACTION`<!-- probe: db.serializable(pool, async () => {}) --> au niveau d’isolation choisi, puis `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> ou `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw new Error(); }) -->, et relance votre callback après un échec de sérialisation ou un interblocage ([Nouvelles tentatives](/fr/retries)).

Il en va de même pour vos propres fonctions. La doc de Zapatos déconseille de donner le pool comme valeur par défaut à l’argument client d’une fonction : « <span lang="en">I find that way it’s too easy to accidentally issue queries outside of transactions</span> ».

Une fonction à vous prend donc son client sans valeur par défaut, et chaque appelant passe le pool ou le client de sa transaction. Celle qui ne fait qu’exécuter des requêtes prend un [`Queryable`](/fr/sql-template#Queryable).

Celle qui ouvre une transaction prend le pool ou le client de son niveau, `pg.Pool | db.TxnClientForSerializable` pour [`serializable()`](/fr/transaction#serializable). Un `Queryable` accepterait aussi le client d’une transaction de niveau inférieur, et la fonction s’exécuterait dedans, à ce niveau ([Réserver dans une transaction plus large](/fr/retries#book-inside-a-larger-transaction)).

## Ce qu’ajoute pgcast {#what-pgcast-adds}

pgcast part de Zapatos 6.6.1. Avant de le modifier, le fork a figé par des tests ce que fait 6.6.1, et cette [caractérisation](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md) a trouvé des dizaines de surprises, dont 7 touchant à la sécurité. Une découverte sur laquelle pgcast agit suit l’une de trois voies ([décision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md)) :

<div class="stack">

| Voie | Quand | Ce qui change pour vous | Exemple |
|---|---|---|---|
| Correction | une faille de sécurité ; ou Postgres ou le type refusait déjà l’appel ; ou le résultat contredit le nom, le type ou la doc de la fonction | l’appel fait ce qu’il dit, ou lève une erreur qui dit quoi faire, avant toute requête | [`update()`](/fr/insert#update) sans colonnes lève `nothing to update: an Updatable needs at least one column`<!-- message -->, là où Postgres refusait `SET () = ROW()` |
| Opt-in | le résultat est valide, et du code peut en dépendre | rien tant que vous n’activez pas l’option ; l’ancien chemin avertit une fois par processus | [`undefinedMeansMissing`](/fr/runtime-config#Config.undefinedMeansMissing) : une valeur `undefined` est une clé absente, pas `NULL` ; avertissement `PGCAST_DEP002` |
| Documentation | Postgres fonctionne ainsi, ou c’était voulu | rien : la doc le dit | [`isNotIn()`](/fr/conditions#conditions.isNotIn) avec un `NULL` dans sa liste ne correspond à aucune ligne, comme Postgres lit `NOT IN` |

</div>

Les corrections de sécurité sont venues d’abord, toutes en 6.6.2 ([Sécurité](/fr/security)) :

- aucun nom (une table, une colonne, une clé, un alias) ni aucun cast de `param()` ne peut fermer ses guillemets ;
- une valeur simple dans les `updateValues` de [`upsert()`](/fr/insert#upsert) est un paramètre ;
- les mots-clés d’un verrou, de `truncate()` ou d’un niveau d’isolation, et le nom d’un agrégat, sont vérifiés avant toute requête.

Les opt-ins qui avertissent, [`undefinedMeansMissing`](/fr/runtime-config#Config.undefinedMeansMissing), [`upsertRequiresSameKeys`](/fr/runtime-config#Config.upsertRequiresSameKeys), [`transactionRequiresCommit`](/fr/runtime-config#Config.transactionRequiresCommit) et [`aggregatesTypedByColumn`](/fr/runtime-config#Config.aggregatesTypedByColumn), ainsi que [`typeEnumsAcrossSchemas`](/fr/generator#generate.typeEnumsAcrossSchemas) et [`enumOrder`](/fr/generator#generate.enumOrder) du générateur, deviennent les valeurs par défaut en 7.0, et leurs anciens chemins disparaissent en 8.0.

[`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), qui n’avertit jamais, reste désactivé. Jusqu’à la 7.0, la 6.x remplace Zapatos 6.6.1 sans autre changement ([Versions](/fr/versions)).

Zapatos 6.6.1 n’avait pas de suite de tests à lui (les tests de son premier utilisateur exerçaient « <span lang="en">most of the code base at least a little</span> ») ; sa CI faisait le lint et le build. Sa feuille de route en jugeait une « <span lang="en">kind of indispensable</span> », une qui teste « <span lang="en">not just returned values but also inferred types</span> ».

Les tests de pgcast vérifient le SQL que compile chaque appel, l’exécutent sur Postgres 14, 16 et 18, vérifient les types, acceptés et refusés, et mesurent ce qu’ils coûtent au compilateur.

Cette doc est l’ajout le plus récent. Chaque exemple compile contre la bibliothèque au build : son SQL vient de son propre `.compile()`, son type de TypeScript, et un exemple qui ne colle plus fait échouer le build.

Ce qui reste, c’est tout ce que vous importez. Les modules s’appellent toujours `zapatos/db` et `zapatos/schema`, l’API est celle de Zapatos, et le comportement aussi, aux corrections près : installé sous l’alias `zapatos`, pgcast ne demande aucun changement de vos imports ([Venir de Zapatos](/fr/switching)).

::: info À venir
Le but est que Zapatos fasse le dernier kilomètre : les jointures par clé étrangère, les conditions qu’offre Postgres, les CTE, les fonctions et le SQL brut, chacun avec une forme typée, pour que du vrai code ne se rabatte jamais sur `db.raw`, un type de ligne écrit à la main ou un cast. Chacun arrive sous les mêmes règles, et la [feuille de route](https://github.com/AlexandreDemartin/pgcast#roadmap) donne leur ordre.
:::

## Ce que pgcast ne fera pas {#what-pgcast-will-not-do}

Certains changements sont refusés, quoi qu’ils apportent, parce que chacun retirerait quelque chose de ce qui précède :

| pgcast n’ajoutera pas | Parce que |
|---|---|
| Des modèles, des classes d’entités, des relations déclarées en TypeScript | un résultat, c’est « just (fully-typed) POJOs » ; les relations sont dans la base |
| Le chargement paresseux, une identity map, le suivi des modifications, un cache de requêtes | chacun est un état caché : une requête s’exécuterait, ou non, sans que vous le demandiez |
| Une chaîne de méthodes qui construit une requête (`.where().join()`) | elle cache le SQL ; un raccourci écrit une requête, et le template `sql` la vôtre |
| Un client implicite, par défaut ou global ; une transaction que vous n’avez pas ouverte | « <span lang="en">Zapatos is always explicit about what client or pool is running your query</span> » |
| Un pool de connexions, ou des migrations | `pg` rend le pool facile, et « Zapatos doesn’t handle schema migrations » : votre outil de migration s’en charge |
| Une couche pour changer de base de données | elle coûte « <span lang="en">effective use of this database today</span> » |
| Un type que la base n’énonce pas | un type deviné s’écarte du schéma |
| Une valeur collée dans le SQL | les valeurs sont des paramètres ; seul [`raw()`](/fr/sql-template#raw) écrit une chaîne telle quelle dans le SQL, et il renvoie une `DangerousRawString` |
| Du SQL qui dépend d’un état, ou change avec les valeurs, sans être documenté | vous ne pourriez plus lire la requête dans l’appel |
| De la complexité dans le cœur pour un cas de niche, ou un gain perdu dans la latence réseau | « <span lang="en">Small is beautiful</span> » : cela va dans un paquet séparé, ou derrière un opt-in |

## Pour aller plus loin {#further-reading}

- Les entrées dont parle cette page : [`select()`](/fr/select#select), [`selectOne()`](/fr/select#selectOne), le template [`sql`](/fr/sql-template#sql) et [`.compile()`](/fr/sql-template#compile), [`transaction()`](/fr/transaction#transaction), [`Config.undefinedMeansMissing`](/fr/runtime-config#Config.undefinedMeansMissing), [`Config.upsertRequiresSameKeys`](/fr/runtime-config#Config.upsertRequiresSameKeys), [`Config.transactionRequiresCommit`](/fr/runtime-config#Config.transactionRequiresCommit) et [`Config.selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow).
- Les guides : [Jointures](/fr/lateral), [Nouvelles tentatives](/fr/retries), [Venir de Zapatos](/fr/switching).
- La [doc](https://jawj.github.io/zapatos/) de Zapatos elle-même, pour 6.6.1 ; ce que pgcast change, dans le [changelog](/fr/changelog).
