---
english: 2329b6c72cb1
---

# Générateur

Le générateur lit le catalogue de votre base et écrit les types de `zapatos/schema`. Cette page indique comment le lancer, en ligne de commande ou depuis du code, et chaque option de son fichier de configuration et de `generate()`.
{.lede}

## La CLI {#cli}

```sh
npx pgcast [--check] [config]
npx zapatos [--check] [config]
npx pgcast --help
```

Le même programme sous deux noms : `pgcast`, et `zapatos`, comme dans Zapatos 6.6.1. Il lit la config, puis lance [`generate()`](#generate) avec elle, ou, avec [`--check`](#check), compare ce qu’il écrirait à vos fichiers.

- Le fichier de configuration : lu dans le dossier où vous le lancez, s’il y est ; jamais dans un dossier parent. Sans fichier, la config est `{}`.
  - `zapatosconfig.json`, comme dans Zapatos 6.6.1.
  - `pgcastconfig.json`, à partir de la 6.7.0, lu en premier : si les deux sont là, seul `pgcastconfig.json` est lu, et la CLI le signale via [`warningListener`](#generate.warningListener) avant de générer.
- `config` : un argument facultatif, un objet JSON, fusionné par-dessus le fichier clé par clé : `npx pgcast '{"outDir": "./generated"}'` garde le `db` du fichier et remplace son `outDir`.
  - Une clé donnée ici remplace toute la valeur du fichier, donc `'{"db": {"application_name": "codegen"}}'` écarte le `connectionString` du fichier.
  - Les variables du fichier sont substituées avant la fusion : une variable qu’il nomme doit être définie même quand l’argument remplace sa clé, sinon la CLI s’arrête avec `Environment variable 'NAME' is not set`.
- Dans chaque chaîne des deux, à toute profondeur, les variables d’environnement sont substituées ([Variables d’environnement](#environment-variables)).
- À partir de la 6.8.0, un seul flag, `--check`, avant ou après `config`. À partir de la 6.12.0, `--help` ou `-h` à la place de `config` affiche l’aide, qui nomme les fichiers de configuration, `config`, les flags et cette page, et se termine avec le code 0, avant qu’elle lise la config.
- À partir de la 6.12.0, la CLI ignore un `--` isolé avant ou après `config` sans émettre de note. Par exemple, `pgcast -- --help` affiche l’aide.
- Si vous passez un flag inconnu commençant par `--` à la place de `config`, la CLI s’arrête avec le code 1 avant de lire la config. À partir de la 6.12.0, elle affiche sur stderr `Unknown flag --chek: the flags are --check, --help and -h` et l’aide. À partir de la 6.8.0, Node affichait `Unknown flag --chek: the only flag is --check, beside the JSON argument` et la trace de la pile d’appels. Zapatos 6.6.1 tentait de parser chacun de ces flags, y compris `-h`, comme l’argument JSON, ce qui échouait.
- Après `config`, la CLI ignore les flags inconnus qui commencent par `--`, ainsi que `--help`, comme dans Zapatos 6.6.1. Elle émet une [note](#generate.warningListener) pour chacun. Ainsi, `npx pgcast '{}' --chek` génère les fichiers malgré la faute de frappe.
- Parmi les autres arguments, le premier est `config` ; les suivants sont ignorés.
- Les chemins sont relatifs au dossier où vous le lancez : `outDir`, et donc le dossier `zapatos`.

::: code-group

```json [zapatosconfig.json]
{
  "db": { "connectionString": "{{DATABASE_URL}}" },
  "outDir": "./src",
  "schemas": { "public": { "include": "*", "exclude": ["seat_bookings"] } }
}
```

:::

Une config qu’elle ne peut pas lire l’arrête avant toute requête, avec le code 1, et Node affiche l’erreur et sa pile. L’erreur commence par ce qu’elle lisait :

- le fichier, par son nom : `If present, zapatosconfig.json must be a valid JSON file, and all referenced environment variables must exist:` (ou `pgcastconfig.json`)
- l’argument : `If present, the argument to Zapatos must be valid JSON, and all referenced environment variables must exist:`

Puis elle se termine par la cause :

| Cause | Fin |
|---|---|
| JSON invalide | le message de `JSON.parse`, qui dépend de l’entrée et de Node : sur Node 22, `Unexpected end of JSON input` pour un fichier vide, `No number after minus sign in JSON at position 1 (line 1 column 2)` pour `-x`, `Expected double-quoted property name in JSON at position 15 (line 1 column 16)` pour une virgule finale |
| une variable n’est pas définie | `Environment variable 'DATABASE_URL' is not set` |

Si la connexion ou une requête échoue, la CLI affiche `*** error <n> ***` et l’erreur sur la sortie standard, puis quitte avec le code 1, y compris avec `--check`. À partir de la 8.0.0, les deux commandes, `pgcast` et `zapatos`, le font elles-mêmes, alors qu’en 7.x elles fixaient [`rejectOnQueryError`](#generate.rejectOnQueryError) à `false`, quels que soient le fichier de configuration et l’argument JSON.

### Variables d’environnement {#environment-variables}

<code v-pre>{{NAME}}</code> dans une chaîne de la config est remplacé par `process.env.NAME`, avant tout le reste.

- N’importe où dans une chaîne, plusieurs par chaîne : <code v-pre>"postgresql://{{PGUSER}}@localhost/films"</code>.
- Les espaces entre les accolades sont autorisés : <code v-pre>{{ DATABASE_URL }}</code>.
- Dans les valeurs seulement, à toute profondeur d’objets et de tableaux ; jamais dans les clés : <code v-pre>"schemas": { "{{SCHEMA}}": … }</code> est un schéma nommé <code v-pre>{{SCHEMA}}</code>. Les nombres et les booléens passent tels quels.
- Une variable qui vaut la chaîne vide compte comme définie, et donne `""`.
- Seule la CLI fait cela, pour le fichier et pour son argument. [`generate()`](#generate) prend sa config telle quelle : lisez `process.env` vous-même.

### `--check` {#check}

```sh
npx pgcast --check
```

À partir de la 6.8.0. Il lit le catalogue comme le fait une exécution, construit les fichiers en mémoire, et les compare avec les vôtres. Il n’écrit rien, pas même un dossier : pour la CI, après vos migrations, ou avant de dire qu’un changement est fini.

| Code de sortie | Quand | Ce qu’il affiche |
|---|---|---|
| 0 | chaque fichier correspond | `The generated files in src/zapatos are up to date.` |
| 1 | un fichier diffère ou manque | une ligne par fichier, puis comment les écrire |

```txt
Out of date: src/zapatos/schema.d.ts
Missing: src/zapatos/custom/PgSeat_label.d.ts
Run the generator without --check to write them.
```

- `schema.d.ts` et, quand il y a un type personnalisé, `custom/index.d.ts`, que chaque exécution réécrit alors, sont comparés octet par octet. Un placeholder ne compte que s’il manque : il est à vous, à modifier vous-même ([Les fichiers qu’il écrit](/fr/generated-files#the-files-it-writes)).
- `outDir`, `outExt` et [`moduleNames`](#generate.moduleNames) nomment les fichiers, comme pour une exécution : `src/pgcast/schema.ts` avec `".ts"` et `"pgcast"`.
- Les notes d’une exécution viennent d’abord, via [`warningListener`](#generate.warningListener), sauf celles sur les placeholders qu’elle écrirait. Une requête qui échoue l’arrête avec le code 1, comme elle arrête une exécution.

### `check()` {#export-check}

`check()`, de `zapatos/generate`, lance la même vérification depuis le code, pour un script qui y construit sa config :

```ts
import { check, type Config } from 'zapatos/generate';

check(config: Config): Promise<boolean>
```

```ts twoslash
import { check } from 'zapatos/generate';
// ---cut---
const upToDate = await check({
  db: { connectionString: process.env.DATABASE_URL },
  outDir: './src',
});
if (!upToDate) process.exitCode = 1;
```

- Elle prend la config de [`generate()`](#generate), et se résout avec `true` quand chaque fichier correspond. Le code de sortie, c’est à vous de le fixer.
- Elle signale le résultat de la comparaison des fichiers uniquement via les écouteurs. [`warningListener`](#generate.warningListener) affiche une ligne par fichier différent ou manquant, avec `console.log` par défaut. Le message `The generated files in src/zapatos are up to date.` passe par [`progressListener`](#generate.progressListener). Seule la CLI affiche la dernière ligne, `Run the generator without --check to write them.`
- Si une requête échoue, la promesse est rejetée avec l’erreur d’origine.

## `generate()` {#generate}

```ts
import { generate, type Config } from 'zapatos/generate';

generate(config: Config): Promise<void>
```

Lit le catalogue de `config.db` et écrit les [fichiers](/fr/generated-files#the-files-it-writes) sous `config.outDir`. `config` prend les [options](#options) de `zapatosconfig.json`, et aussi des fonctions là où le JSON prend `true` ou un nom : les trois écouteurs et `customTypesTransform`.

```ts twoslash
import { generate } from 'zapatos/generate';
// ---cut---
await generate({
  db: { connectionString: process.env.DATABASE_URL },
  outDir: './src',
  progressListener: line => console.log(`[types] ${line}`),
  customTypesTransform: name => `Db_${name}`,
});
```

- Il ouvre son propre `pg.Pool` sur `config.db`, et le ferme avant de se résoudre.
- Il n’envoie que des `SELECT`, sur `information_schema` et `pg_catalog` : un pour les relations de chaque schéma, un pour ses enums, puis deux par relation, ses colonnes et ses index uniques, et un pour les enums de chaque autre schéma d’où vient le type d’une colonne (`pg_catalog` compris).
- Si la connexion ou une requête échoue, la promesse est rejetée avec l’erreur d’origine de `pg`, avant toute écriture ([`rejectOnQueryError`](#generate.rejectOnQueryError)).
- Sur les autres erreurs, la promesse est rejetée : une écriture qui échoue (`ENOTDIR: not a directory, mkdir 'afile/zapatos'` quand `outDir` est un fichier), une [règle](#generate.schemas) mal formée.
- À l’exécution, une clé qu’il ne connaît pas est ignorée : un ancien `srcMode`, un `outdir` mal orthographié. En TypeScript, un littéral objet qui en contient une ne compile pas (TS2353, ou TS2561 avec une suggestion pour un nom proche comme `outdir`).
- Une clé que la 8.0 a retirée, [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas), [`enumOrder`](#generate.enumOrder), [`uniqueIndexConstraintsOnly`](#generate.uniqueIndexConstraintsOnly), [`domainsTypedByContext`](#generate.domainsTypedByContext), [`rejectOnQueryError`](#generate.rejectOnQueryError) ou [`valuesTypedAsAliases`](#generate.valuesTypedAsAliases), ne compile pas non plus (TS2353). Donnée quand même, depuis une variable, un fichier de configuration ou l’argument JSON de la CLI, `finaliseConfig()` lève une erreur, la promesse de `generate()`, de `check()`, de `tsForConfig()` ou de `definitionForRelationInSchema()` est rejetée, et la CLI s’arrête, avant la première requête, sans écrire aucun fichier, sauf si sa valeur est celle que la 8.0 applique toujours, `null` ou `undefined`. Erreur : `typeEnumsAcrossSchemas was removed in 8.0, which always does what typeEnumsAcrossSchemas: true did; delete it from the generator's config: https://pgcast.dev/switching#from-8-0-typeEnumsAcrossSchemas`.
- `zapatos/generate` exporte aussi `Config` et les fonctions qui composent `generate()` (`tsForConfig()`, `definitionForRelationInSchema()` et d’autres). À partir de la 8.0.0, `definitionForRelationInSchema()` laisse vides ses tableaux `columnsTypedByEnumName`, `uniqueIndexesNotArbiters`, `domainsNotByContext` et `domainsUnderDomains` ; en 7.x, seuls `typeEnumsAcrossSchemas: false`, `uniqueIndexConstraintsOnly: false` et `domainsTypedByContext: false` les remplissaient. `tsTypeForPgType()` traduit un nom de type dans un contexte donné. Pour un tableau d’enums, elle donne donc un type tableau. `definitionForRelationInSchema()` applique `enumArraysTypedAsText` aux lignes brutes. Voir les [paramètres de sortie de cette fonction](/fr/switching#domain-and-parser-types).

## Les options {#options}

Toutes les options sont facultatives. Une option donnée remplace entièrement sa valeur par défaut : `schemas` sans `public` laisse `public` de côté.

Les réglages courants :

| Option | Par défaut | Ce qu’elle règle |
|---|---|---|
| [`db`](#generate.db) | aucune : les valeurs par défaut de `pg` | la connexion |
| [`outDir`](#generate.outDir) | `"."` | où va le dossier `zapatos` |
| [`outExt`](#generate.outExt) | `".d.ts"` | l’extension de chaque fichier écrit |
| [`schemas`](#generate.schemas) | `{ "public": { "include": "*", "exclude": [] } }` | les schémas, et les relations de chacun |
| [`unprefixedSchema`](#generate.unprefixedSchema) | `"public"` | le schéma dont les noms n’ont pas besoin de préfixe |
| [`columnOptions`](#generate.columnOptions) | `{}` | les colonnes retirées d’`Insertable` et d’`Updatable`, ou facultatives |
| [`customTypesTransform`](#generate.customTypesTransform) | `"PgMy_type"` | les noms des types personnalisés |
| [`schemaJSDoc`](#generate.schemaJSDoc) | `true` | un commentaire JSDoc sur chaque relation et chaque colonne |
| [`customJSONParsingForLargeNumbers`](#generate.customJSONParsingForLargeNumbers) | `false` | le type `JSONSelectable` de `bigint` et `numeric` |
| [`moduleNames`](#generate.moduleNames) | `"zapatos"` | les noms de modules que déclarent et importent les fichiers, et leur dossier |
| [`constraintNames`](#generate.constraintNames) | `false` | les noms figurant dans le type `Constraint` de chaque relation |
| [`domainsTypedAsUnions`](#generate.domainsTypedAsUnions) | `false` | le type d’un domaine sur `text` dont le `CHECK` liste les valeurs |
| [`valuesTypedAsAliases`](#generate.valuesTypedAsAliases) | retirée en 8.0, toujours `true` | la façon d’écrire le type de la valeur de chaque colonne dans `Whereable`, `Insertable` et `Updatable` |
| [`progressListener`](#generate.progressListener) | `false` | où chaque étape est signalée |
| [`warningListener`](#generate.warningListener) | `true` | où vont les avertissements |
| [`debugListener`](#generate.debugListener) | `false` | où vont chaque requête et son résultat |

Les options suivantes ont changé de valeur par défaut en 7.0.0. Chacune garde le comportement de la 6.x avec la valeur indiquée. Voir le [guide de migration](/fr/switching#regenerate-for-7-0).

| Option | Par défaut | Valeur 6.x | En 8.0 | Ce qu’elle règle |
|---|---|---|---|---|
| [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas) | `true` | `false` | retirée | le type d’un enum d’un autre schéma |
| [`enumOrder`](#generate.enumOrder) | `"declared"` | `"alphabetical"` | retirée | l’ordre des labels d’un enum |
| [`rejectOnQueryError`](#generate.rejectOnQueryError) | `true` | `false` | retirée | en cas d’échec d’une requête, rejet de la promesse ou arrêt du processus |
| [`uniqueIndexConstraintsOnly`](#generate.uniqueIndexConstraintsOnly) | `true` | `false` | retirée | les noms figurant dans l’`UniqueIndex` de chaque relation |
| [`domainsTypedByContext`](#generate.domainsTypedByContext) | `true` | `false` | retirée | le type des domaines imbriqués et des tableaux de domaines, ainsi que celui des domaines sur `bigint`, `numeric`, `bytea`, `money`, une date ou un tableau de ces types hors de `Selectable` |
| [`enumArraysTypedAsText`](#generate.enumArraysTypedAsText) | `true` | `false` | reste | le type `Selectable` d’un tableau d’un enum |
| [`intervalsTypedAsObjects`](#generate.intervalsTypedAsObjects) | `true` | `false` | reste | le type d’un `interval` dans `Selectable` et dans une écriture |

### `db` {#generate.db}

`pg.ClientConfig` : ce que vous donneriez à `new pg.Pool()`, un `connectionString` ou `host`, `user`, `database` et le reste. Sans lui, `pg` prend ses valeurs par défaut et les variables d’environnement `PGHOST`, `PGUSER`, `PGDATABASE`…

### `outDir` {#generate.outDir}

`string`, par défaut `"."`. Le dossier qui accueille le dossier `zapatos`, créé si besoin : `"./src"` écrit `src/zapatos/schema.d.ts`. Relatif au dossier courant. Avec [`moduleNames`](#generate.moduleNames) à `"pgcast"`, le dossier est `pgcast`.

### `outExt` {#generate.outExt}

`string`, par défaut `".d.ts"`. L’extension de chaque fichier écrit, placeholders compris : `".ts"` écrit `zapatos/schema.ts`, `zapatos/custom/PgPoint.ts`. Seuls les noms changent ; le contenu est le même texte `declare module`. Avec `".ts"`, le générateur ne cherche pas l’[ancienne arborescence](/fr/generated-files#the-old-layout-warning).

### `schemas` {#generate.schemas}

[`SchemaRules`](#SchemaRules), `{ [schema]: { include, exclude } }`, `include` et `exclude` valant chacun `"*"` ou un tableau de noms de relations. Les schémas à générer, et quelles relations de chacun : tables, vues, vues matérialisées et tables distantes.

Le type exige les deux clés : dans `generate()`, une règle sans l’une d’elles ne compile pas (TS2741). Dans le JSON, ou en JavaScript non typé, une clé omise ou mise à `null` prend la valeur de la règle par défaut, `"include": "*"` ou `"exclude": []`, et le générateur le signale via [`warningListener`](#generate.warningListener) ; Zapatos 6.6.1 s’arrêtait là où il lisait la clé manquante, avec `TypeError: Cannot read properties of undefined (reading 'indexOf')` ([#301](https://github.com/AlexandreDemartin/pgcast/issues/301)). Une chaîne autre que `"*"`, que le type refuse aussi (TS2322), est lue comme une liste d’un seul nom, `"films"` comme `["films"]`, et signalée de la même façon ; dans Zapatos 6.6.1, chaque relation dont le nom fait partie de la chaîne y correspondait aussi, `film` pour `"films"` ([#442](https://github.com/AlexandreDemartin/pgcast/issues/442)).

| Règle | Génère |
|---|---|
| `{ "include": "*", "exclude": [] }` | chaque relation du schéma |
| `{ "include": ["films", "studios"], "exclude": [] }` | `films` et `studios` |
| `{ "include": "*", "exclude": ["seat_bookings"] }` | tout sauf `seat_bookings` |
| `{ "include": ["films", "studios"], "exclude": ["studios"] }` | `films` : `exclude` l’emporte |
| `{ "include": "*", "exclude": "*" }` | aucune relation, mais toujours les enums du schéma |

- Les noms doivent correspondre exactement, casse comprise. Un nom d’`include` que le schéma n’a pas ne génère rien, et le générateur émet un avertissement via [`warningListener`](#generate.warningListener) ; un schéma que la base n’a pas donne un espace de noms vide, et un avertissement pour chaque nom que liste son `include`. Avec `"exclude": "*"`, rien n’est vérifié.
- Les relations sont celles que le rôle de la base peut voir : une table ou une vue sur laquelle il n’a aucun privilège est laissée de côté, comme si elle n’existait pas ; une vue matérialisée apparaît toujours.
- Les enums du schéma sont toujours générés, quoi que disent `include` et `exclude`.
- Les relations d’un schéma autre qu’[`unprefixedSchema`](#generate.unprefixedSchema) sont dans son espace de noms : `archive.screenings`, de type `Table` `'archive.screenings'`.
- Un schéma, une relation ou un enum dont TypeScript ne peut pas lire le nom à cet endroit (`"box office"`, `class`) reçoit un identifiant valide, `box_office` ou `class_` : chaque suite de caractères qu’un identifiant ne peut pas contenir devient `_`, un chiffre en tête reçoit un `_` devant lui, un mot réservé ou un opérateur de type (`keyof`) un `_` après lui, et `as` aussi pour un enum. Son type `Table` et les lookups `*ForTable` gardent son nom : `'box office'`. Deux noms qui n’en font plus qu’un sont signalés via [`warningListener`](#generate.warningListener), de même qu’une relation d’`unprefixedSchema` qui porte le nom de l’espace de noms d’un autre schéma. Le nom d’une colonne est mis entre guillemets.
- Un enum qui porte le nom d’un des types propres à TypeScript (`string`, `number`…) garde son nom, comme dans Zapatos 6.6.1 : `schema.d.ts` ne compile pas sans `skipLibCheck` (TS2457), et avec `skipLibCheck`, une colonne de l’enum `string` est typée `string`.

Avec un second schéma, `archive`, qui contient sa propre table `screenings` :

::: code-group

```json [zapatosconfig.json]
{
  "db": { "connectionString": "{{DATABASE_URL}}" },
  "schemas": {
    "public": { "include": "*", "exclude": [] },
    "archive": { "include": "*", "exclude": [] }
  }
}
```

:::

Une requête nomme sa table avec le schéma, et ses lignes sont des `s.archive.screenings.JSONSelectable[]` :

```ts
const past = await db.select('archive.screenings', { film_id: 1000 }).run(pool);
```

Son SQL est celui de [`select()`](/fr/select#select), avec le nom entre guillemets partie par partie : `to_jsonb("archive"."screenings".*)`, `FROM "archive"."screenings"`, et l’alias `"sq_archive.screenings"`.

### `unprefixedSchema` {#generate.unprefixedSchema}

`string | null`, par défaut `"public"`. Le schéma dont les relations sont nommées sans leur schéma : `films`, de type `Table` `'films'`, donc `db.select('films', …)` et `"films"` dans le SQL, que Postgres trouve via son `search_path`.

- `null` : chaque relation est préfixée, `public.films` son espace de noms et `'public.films'` son type `Table`. Une requête la nomme ainsi, `db.select('public.films', db.all)`, et le SQL aussi : `FROM "public"."films"`. `db.select('films', db.all)` ne compile plus.
- Mettez-le à `null` quand un schéma porte le nom d’une relation de `public` : un schéma `films` à côté de la table `films` crée deux espaces de noms `films`, que TypeScript fusionne, et `schema.d.ts` échoue avec TS2300, `Duplicate identifier 'Table'`.
- Un schéma absent de [`schemas`](#generate.schemas) est autorisé : chaque schéma est alors préfixé.

### `columnOptions` {#generate.columnOptions}

[`ColumnOptions`](#ColumnOptions), `{ [table]: { [column]: { insert?, update? } } }`. Change les types `Insertable` et `Updatable` d’une colonne, comme l’exigerait un trigger qui la remplit ; rien d’autre ne change, à l’exécution non plus.

::: code-group

```json [zapatosconfig.json]
{
  "columnOptions": {
    "*": { "booked_at": { "insert": "excluded", "update": "excluded" } },
    "films": { "tagline": { "insert": "excluded", "update": "excluded" } }
  }
}
```

:::

| Option | Effet sur le type |
|---|---|
| `"insert": "auto"`, `"update": "auto"` | aucun : ce que dit le catalogue, les valeurs par défaut |
| `"insert": "excluded"` | la clé quitte `Insertable` : `db.insert('films', { …, tagline: 'x' })` ne compile pas (TS2769) |
| `"insert": "optional"` | la clé est facultative dans `Insertable`, son type inchangé : `title?: db.InsertableValue<string>` |
| `"update": "excluded"` | la clé quitte `Updatable` : `db.update('seat_bookings', { booked_at: … }, …)` ne compile pas (TS2353) |

- La table est nommée comme la nomme son type `Table` : `films`, `archive.screenings`, et `public.films` quand [`unprefixedSchema`](#generate.unprefixedSchema) vaut `null`. `"films"` ne s’applique qu’à `public.films`.
- `"*"` désigne chaque table de chaque schéma. Il ne vaut que comme clé entière, jamais comme partie d’un nom, et pas pour les colonnes.
- L’entrée propre d’une table pour une colonne remplace l’entrée `"*"` de cette colonne, en bloc : avec `"*": { "booked_at": { "insert": "excluded", "update": "excluded" } }` et `"seat_bookings": { "booked_at": { "update": "excluded" } }`, `booked_at` revient dans `seat_bookings.Insertable`.
- Une table dont chaque colonne est exclue reçoit `[key: string]: never`, comme une vue où l’on ne peut pas écrire.
- Une autre valeur, ou une clé mal orthographiée, est ignorée : la colonne reste `auto`.

### `customTypesTransform` {#generate.customTypesTransform}

`"PgMy_type" | "my_type" | "PgMyType"`, ou dans `generate()` une fonction `(name: string) => string` ; par défaut `"PgMy_type"`. Le nom TypeScript de chaque type que le générateur vous laisse : un domaine, ou un type qu’il ne sait pas convertir, comme `point`. Chacun reçoit un [placeholder](/fr/generated-files#the-files-it-writes), et la colonne le type `c.<name>`.

| Valeur | `seat_label` | `point` | `point[]` |
|---|---|---|---|
| `"PgMy_type"` | `PgSeat_label` | `PgPoint` | `Pg_point` |
| `"my_type"` | `seat_label` | `point` | `_point` |
| `"PgMyType"` | `PgSeatLabel` | `PgPoint` | `Pg_Point` |
| `name => 'Db_' + name` | `Db_seat_label` | `Db_point` | `Db__point` |

- La fonction reçoit le nom du domaine, ou le nom que Postgres donne au type, `_point` pour un tableau de `point`.
- Un tableau d’un domaine ou d’un tel type est un type personnalisé à part entière.
- Les noms ne sont pas qualifiés par schéma : l’espace de noms `c` est commun à tous les schémas, donc un domaine `notes` dans `public` et un autre dans `archive` sont tous deux `PgNotes`, avec un seul placeholder pour les deux.
  - Le générateur le signale via [`warningListener`](#generate.warningListener), comme pour deux noms qu’une transformation réduit à un seul (`seat-label` et `seat_label`), et garde le nom, dont dépend un placeholder déjà modifié.
- Des noms qui ne diffèrent que par la casse, comme `PgSeat_label` et `PgSEAT_LABEL` pour les domaines `seat_label` et `"SEAT_LABEL"`, ont deux placeholders qui ne forment qu’un seul fichier sur un système de fichiers insensible à la casse, celui par défaut sur macOS et Windows : celui écrit en premier ne déclare que son propre nom, et les autres ne sont jamais déclarés. Le générateur le signale aussi, où qu’il tourne, et écrit les mêmes fichiers.
- Un nom dont le placeholder est `index.d.ts`, comme `index` pour un domaine `index` avec `"my_type"`, ou `Index` sur un système de fichiers insensible à la casse, partage son fichier avec [`custom/index.d.ts`](/fr/generated-files#the-files-it-writes), que le générateur écrit par-dessus à chaque exécution : ce nom n’est jamais déclaré. Le générateur le signale aussi, et écrit les mêmes fichiers.

### `schemaJSDoc` {#generate.schemaJSDoc}

`boolean`, par défaut `true`. Un commentaire JSDoc sur chaque relation (son nom et sa nature) et sur chaque colonne de chaque interface : son nom, son `COMMENT ON COLUMN` s’il en a un, son type Postgres, puis une dernière ligne sur la façon dont elle s’écrit. Votre éditeur l’affiche au survol :

```ts
/**
* **roles.billing**
*
* Position in the credits: 1 is top billing
* - `int4` in database
* - `NOT NULL`, no default
*/
billing: number;
```

- La ligne du type nomme un domaine avec son type de base : `` `seat_label` (base type: `text`) in database ``.
- La dernière ligne est `NOT NULL` ou `Nullable` et la valeur par défaut (`` default: `nextval(…)` ``, `no default`, ou `identity column` pour `GENERATED BY DEFAULT AS IDENTITY`) ; `Generated column` pour une colonne générée ou `GENERATED ALWAYS AS IDENTITY` ; `Materialized view column` pour une colonne d’une vue matérialisée.
- Dans un commentaire, un `DEFAULT` ou un nom entre guillemets sur plusieurs lignes, chaque ligne est précédée d’un `*`, que les sauts de ligne soient `\n`, `\r\n` ou `\r`.
- Chaque relation montre ses propres commentaires, quelle que soit sa nature : Postgres n’en copie aucun vers une partition, une table qui hérite ou une vue, donc une vue sur `roles` ne montre aucun commentaire sur `billing`.
- Un `*/` dans un commentaire, un nom, un type ou un `DEFAULT` est écrit `*\/`, pour ne pas terminer le JSDoc ; de même celui que forme un nom commençant par `/` avec le `**` qui le précède : `**\/reels**`.
- Une balise JSDoc dans un commentaire reste une balise : `@deprecated use lead` barre la colonne là où votre code la lit, et le survol donne `use lead` pour raison. TypeScript ouvre une balise à un `@` qui commence une ligne, ou qui suit une espace sans en être suivi, pas à celui de `casting@example.com` ni dans un lien en ligne `{@link …}`, `{@linkcode …}` ou `{@linkplain …}`, qui se poursuit sur la ligne suivante quand la sienne se termine par `{@link` ou par le nom du lien. À partir de la ligne qui porte la balise, le commentaire passe après les lignes générées, précédé d’une ligne `*`, pour que la balise ne les prenne pas pour son propre texte.
  - Le générateur ne le déplace que s’il est sûr de la balise : la première ligne où un `@` suit une `{` ou ne suit aucun caractère ASCII imprimable doit ouvrir la balise, à son premier caractère hors espaces et tabulations, ou après une espace ou une tabulation et avant un caractère ASCII imprimable, et tout ce qui commence par `{@link` avant la balise sur cette ligne doit être fermé et ne contenir ni guillemet, ni accent grave, ni `/`, ni `\`, ni séparateur de ligne (U+2028, U+2029). Sinon le commentaire reste avant les lignes générées, que la balise prend alors pour son propre texte.

`false` n’en écrit aucun, donc `schema.d.ts` est plus court.

### `customJSONParsingForLargeNumbers` {#generate.customJSONParsingForLargeNumbers}

`boolean`, par défaut `false`. Le type `JSONSelectable` d’une colonne `bigint` (`int8`) ou `numeric`, pour un projet qui parse le JSON avec [`enableCustomJSONParsingForLargeNumbers()`](/fr/value-types#enableCustomJSONParsingForLargeNumbers) :

| Colonne | `false` | `true` |
|---|---|---|
| `int8` | `number` | `(number \| db.Int8String)` |
| `numeric` | `number` | `(number \| db.NumericString)` |

- Les autres interfaces ne changent pas : `Selectable` est `db.Int8String` ou `db.NumericString` dans les deux cas.
- `true` fait aussi taire l’avertissement que donne une telle colonne : `Note: this database has bigint/int8 and/or numeric/decimal columns, for which JSON.parse may lose precision…`.

### `typeEnumsAcrossSchemas` {#generate.typeEnumsAcrossSchemas}

À partir de la 7.0.0, la valeur par défaut était `true`. À partir de la 8.0.0, la clé est retirée et le générateur se comporte toujours comme avec `true` ([migration vers la 8.0](/fr/switching#from-8-0-typeEnumsAcrossSchemas)) : il cherche l’enum dans son propre schéma et écrit ses labels. En 7.x, la valeur `false` conservait la recherche par nom dans le schéma de la relation, comme en 6.x.

```sql
CREATE SCHEMA archive;
CREATE TYPE archive.print_format AS ENUM ('nitrate', 'safety', 'digital');
CREATE TYPE archive.crew_job AS ENUM ('projectionist', 'archivist');  -- public has a crew_job too
CREATE TABLE prints (id int PRIMARY KEY, format archive.print_format NOT NULL, formats archive.print_format[], keeper archive.crew_job);
```

| Colonne de `prints` | 7.x avec `false` | 8.0 |
|---|---|---|
| `format` | `c.PgPrint_format`, un placeholder `any` | `('nitrate' \| 'safety' \| 'digital')` |
| `formats` (`Selectable`) | `c.Pg_print_format \| null`, un placeholder `any` | `string \| null` par défaut, le tableau de labels ci-dessous avec `enumArraysTypedAsText: false` |
| `formats` (`JSONSelectable`) | `c.Pg_print_format \| null`, un placeholder `any` | `('nitrate' \| 'safety' \| 'digital')[] \| null` |
| `keeper` | `crew_job \| null` : les labels de `public.crew_job` | `('projectionist' \| 'archivist') \| null` |

- Les labels sont écrits en toutes lettres, pas nommés : le schéma de l’enum n’a pas besoin d’être dans [`schemas`](#generate.schemas). Dans leur ordre de déclaration, comme pour chaque enum ([`enumOrder`](#generate.enumOrder)).
- Le générateur reconnaît les enums d’autres schémas par leur nom. Lorsqu’un enum porte le nom d’un type natif (`int4`), le générateur utilise ce type pour la colonne à la place des labels de l’enum. Si le nom de l’enum correspond à celui que Postgres donnerait normalement au type tableau d’un autre type (`_tag` pour `tag`), le générateur utilise les labels de l’enum pour typer les colonnes de ce type tableau.
- Un domaine sur un tel enum reste un type personnalisé, `c.<name>`. Si le nom du placeholder est propre à ce domaine, le générateur y écrit les labels sans import à la première génération, même quand une relation du schéma de l’enum utilise aussi ce domaine. Un placeholder existant n’est jamais écrasé.

### `enumOrder` {#generate.enumOrder}

À partir de la 7.0.0, la valeur par défaut était `"declared"`. À partir de la 8.0.0, la clé est retirée et le générateur se comporte toujours comme avec `"declared"` ([migration vers la 8.0](/fr/switching#from-8-0-enumOrder)) : les labels suivent l’ordre de déclaration de l’enum, celui que Postgres utilise pour `ORDER BY`, les comparaisons et `enum_range()`. En 7.x, la valeur `"alphabetical"` conservait le tri alphabétique de la 6.x.

```sql
CREATE TYPE crew_job AS ENUM ('director', 'writer', 'editor', 'cinematographer', 'composer');
```

| Type | 7.x avec `"alphabetical"` | 8.0 |
|---|---|---|
| `crew_job` | `'cinematographer' \| 'composer' \| 'director' \| 'editor' \| 'writer'` | `'director' \| 'writer' \| 'editor' \| 'cinematographer' \| 'composer'` |
| `every.crew_job` | `['cinematographer', 'composer', 'director', 'editor', 'writer']` | `['director', 'writer', 'editor', 'cinematographer', 'composer']` |

- Un label ajouté par `ALTER TYPE … ADD VALUE … BEFORE` ou `AFTER` prend sa place dans cet ordre, tel que le donne `enum_range()`.
- Pour TypeScript, seul `every.<name>` change : une union est le même type dans n’importe quel ordre. Les labels d’un enum d’un autre schéma suivent eux aussi cet ordre. Il en va de même dans un placeholder généré pour la première fois si son nom est propre au domaine.
- Donnée quand même, avec toute valeur autre que `"declared"`, `null` et `undefined`, la clé arrête le générateur avant la première requête, sans écrire aucun fichier : `enumOrder was removed in 8.0, which always does what enumOrder: "declared" did; delete it from the generator's config: https://pgcast.dev/switching#from-8-0-enumOrder`.

### `moduleNames` {#generate.moduleNames}

`"zapatos"` ou `"pgcast"`, par défaut `"zapatos"`. Les noms de modules que déclarent et importent les fichiers générés, et le dossier où ils vont. Il doit correspondre au dossier où pgcast est installé, sous `node_modules` : `"pgcast"` pour un projet qui l’installe sous son propre nom, `pgcast@npm:@pgcast/pgcast`, à partir de la 6.7.0 ([Installation](/fr/install#under-its-own-name)) ; `"zapatos"` pour un projet qui l’installe sous l’alias `zapatos`, comme un projet venu de Zapatos ([Venir de Zapatos](/fr/switching)).

| | `"zapatos"` | `"pgcast"` |
|---|---|---|
| Dossier | `zapatos/` | `pgcast/` |
| Déclare | `zapatos/schema`, `zapatos/custom` | `pgcast/schema`, `pgcast/custom`, et `zapatos/schema` |
| Importe | `zapatos/db` | `pgcast/db` |
| Commentaire du canary de version | `` update by running `npx zapatos` `` | `` update by running `npx pgcast` `` |
| Vos imports | `zapatos/db`, `zapatos/schema`, `zapatos/generate` | `pgcast/db`, `pgcast/schema`, `pgcast/generate` |

::: code-group

```json [pgcastconfig.json]
{
  "db": { "connectionString": "{{DATABASE_URL}}" },
  "outDir": "./src",
  "moduleNames": "pgcast"
}
```

```ts [films.ts]
import * as db from 'pgcast/db';
import type * as s from 'pgcast/schema';
```

:::

- `"zapatos"` écrit les mêmes fichiers que sans l’option : elle ne change rien tant qu’elle ne vaut pas `"pgcast"`.
- `"pgcast"` écrit les mêmes types, et termine `pgcast/schema.d.ts` par `declare module 'zapatos/schema' { export * from 'pgcast/schema'; }` : les propres déclarations de `pgcast/db` importent `zapatos/schema`. Sans cette ligne, chaque type serait `any`, et sans bruit sous `skipLibCheck`.
- Dans les fichiers générés, `zapatos` reste dans cette ligne et dans les en-têtes, qui créditent Zapatos. Le fichier de configuration peut être `pgcastconfig.json` ou `zapatosconfig.json` ([La CLI](#cli)) ; `npx pgcast` et `npx zapatos` lisent tous deux l’option.
- Une autre valeur arrête le générateur avant toute requête, et n’écrit rien : `moduleNames must be 'zapatos' (the default) or 'pgcast', not 'pgcats'`. En TypeScript, elle ne compile pas (TS2322, ou TS2820 avec une suggestion pour un nom proche comme `"pgcats"`).
- Le schéma de l’autre mode dans `outDir`, comme un dossier `zapatos/` resté d’avant le changement, est signalé via [`warningListener`](#generate.warningListener). Avec `"pgcast"`, un `zapatos/` périmé que `tsconfig.json` inclut déclare aussi `zapatos/schema`, que TypeScript fusionne : il laisse passer un nombre pour une colonne `text` sous `skipLibCheck`, et échoue avec TS2307 sans `skipLibCheck`. Avec `"zapatos"`, un `pgcast/` périmé n’assouplit rien, et son import de `pgcast/db` échoue avec TS2307 sans `skipLibCheck`. Supprimez le dossier périmé une fois que les placeholders que vous y avez modifiés sont déplacés dans l’autre, leur `declare module 'zapatos/custom'` renommé en `'pgcast/custom'`, ou l’inverse.

### `rejectOnQueryError` {#generate.rejectOnQueryError}

À partir de la 7.0.0, la valeur par défaut était `true`. À partir de la 8.0.0, la clé est retirée et le générateur se comporte toujours comme avec `true` ([migration vers la 8.0](/fr/switching#from-8-0-rejectOnQueryError)) : en cas d’échec de connexion ou de requête, la promesse de `generate()`, de `tsForConfig()` ou de [`check()`](#export-check) est rejetée avec l’erreur d’origine, avant toute écriture de fichier. Une erreur levée de façon synchrone par un écouteur rejette aussi la promesse de génération. Gérez vous-même les promesses que renvoient vos écouteurs. Les messages que les écouteurs ont déjà affichés restent visibles. En 7.x, la valeur `false` affichait `*** error <n> ***` et l’erreur sur la sortie standard, puis arrêtait le processus avec le code 1 avant que la promesse se résolve ou soit rejetée, comme le fait toujours [la CLI](#cli).

Si votre script doit se terminer en erreur en cas d’échec de la génération, relancez l’erreur ou fixez le code de sortie dans votre gestionnaire d’erreurs.

```ts twoslash
import { generate } from 'zapatos/generate';
// ---cut---
try {
  await generate({ db: { connectionString: process.env.DATABASE_URL }, outDir: './src' });
} catch (err) {
  console.error('types not regenerated:', err);  // ECONNREFUSED, or a pg DatabaseError
  process.exitCode = 1;
}
```

- Donnée quand même, avec toute valeur autre que `true`, `null` et `undefined`, la clé arrête le générateur avant la première requête, sans écrire aucun fichier : `rejectOnQueryError was removed in 8.0, which always does what rejectOnQueryError: true did; delete it from the generator's config: https://pgcast.dev/switching#from-8-0-rejectOnQueryError`. La CLI s’arrête de même si son fichier de configuration ou son argument JSON la contient, alors que la 7.x l’y ignorait.

### `uniqueIndexConstraintsOnly` {#generate.uniqueIndexConstraintsOnly}

À partir de la 7.0.0, la valeur par défaut était `true`. À partir de la 8.0.0, la clé est retirée et le générateur se comporte toujours comme avec `true` ([migration vers la 8.0](/fr/switching#from-8-0-uniqueIndexConstraintsOnly)) : pour chaque relation, `UniqueIndex` liste les contraintes `UNIQUE` et `PRIMARY KEY` non différables qui s’appuient sur un index valide autre qu’un index d’exclusion. En 7.x, la valeur `false` conservait la liste de la 6.x, celle de tous les index uniques de la relation.

Pour un nom tel que `screenings.id`, [`constraint()`](/fr/insert#constraint) produit l’identifiant qualifié `"screenings"."id"`, que Postgres refuse avec le code 42601. Écrivez une requête `sql` explicite avec `ON CONSTRAINT "screenings.id"`.

```sql
CREATE TABLE festival_entries (
  id int PRIMARY KEY,
  film_id int NOT NULL REFERENCES films,
  festival text NOT NULL,
  slot int,
  withdrawn boolean NOT NULL DEFAULT false,
  CONSTRAINT festival_entries_film_festival_key UNIQUE (film_id, festival),
  CONSTRAINT festival_entries_slot_key UNIQUE (festival, slot) DEFERRABLE
);
CREATE UNIQUE INDEX festival_entries_live_idx ON festival_entries (film_id) WHERE NOT withdrawn;
```

| Dans `UniqueIndex` | 7.x avec `false` | 8.0 | `ON CONFLICT ON CONSTRAINT … DO UPDATE` |
|---|---|---|---|
| `festival_entries_pkey` | oui | oui | accepté |
| `festival_entries_film_festival_key` | oui | oui | accepté |
| `festival_entries_slot_key`, `DEFERRABLE` | oui | non | 55000, `ON CONFLICT does not support deferrable unique constraints/exclusion constraints as arbiters` |
| `festival_entries_live_idx`, un index et pas une contrainte | oui | non | 42704, `constraint "festival_entries_live_idx" for table "festival_entries" does not exist` |

- La liste laisse aussi de côté les index uniques d’une vue matérialisée et, sur Postgres 18, ceux d’une clé `WITHOUT OVERLAPS`, que Postgres traite comme une contrainte d’exclusion. `DO NOTHING` accepte une clé non différable et, quand il y a une ligne à insérer, renvoie le code 55000 pour une clé différable. `DO UPDATE` renvoie 42809 dans les deux cas. Une contrainte `EXCLUDE` n’est dans aucune des deux listes, puisque son index n’est pas unique.
- Elle laisse aussi de côté une contrainte dont l’index n’est pas encore valide : celle d’une table partitionnée, ajoutée avec `ALTER TABLE ONLY`, tant que l’index de chaque partition n’est pas attaché ([Partitionnement](https://www.postgresql.org/docs/current/ddl-partitioning.html#DDL-PARTITIONING-DECLARATIVE-MAINTENANCE)). Entre-temps, Postgres répond 42P10, `there is no unique or exclusion constraint matching the ON CONFLICT specification` ; régénérez une fois ces index attachés.
- Pour une table partitionnée, le type union se fonde sur la contrainte de la table parente. Postgres vérifie l’index de la partition qui reçoit la ligne, où une clé différable peut encore entraîner l’erreur 55000. Une clé différable de la table parente est exclue même si les clés des partitions sont immédiates.
- Une relation qui n’en garde aucun reçoit `never`. `UniqueIndexForTable` et les types agrégés `UniqueIndex` suivent le même changement.
- Donnée quand même, avec toute valeur autre que `true`, `null` et `undefined`, la clé arrête le générateur avant la première requête, sans écrire aucun fichier : `uniqueIndexConstraintsOnly was removed in 8.0, which always does what uniqueIndexConstraintsOnly: true did; delete it from the generator's config: https://pgcast.dev/switching#from-8-0-uniqueIndexConstraintsOnly`.

### `constraintNames` {#generate.constraintNames}

À partir de la 7.1.0, réglez `constraintNames` sur `true` pour générer un type `Constraint` dans l’espace de noms de chaque relation. Ce type réunit les noms des clés primaires, des contraintes d’unicité, des clés étrangères, des contraintes de vérification, des contraintes d’exclusion et de tous les index uniques de la relation. Pour la table ci-dessus, `festival_entries.Constraint` contient `festival_entries_slot_key` et `festival_entries_live_idx`, que `UniqueIndex` laisse de côté.

Le type reprend les noms du catalogue, que Postgres applique ou non les contraintes. Un trigger ou une fonction peut signaler un nom absent du type. Si aucun nom du catalogue ne correspond à la relation, son type `Constraint` vaut `never`.

Comparez `err.constraint` aux noms du type `Constraint` de la relation désignée par `err.schema` et `err.table`. Chaque partition ou table qui hérite d’une autre table a ses propres noms, y compris ceux des contraintes de vérification héritées. Si une écriture enfreint une contrainte de la partition qui reçoit la ligne, Postgres indique cette partition. Si une clé étrangère empêche une suppression, Postgres indique la table qui contient la clé étrangère.

Le type exclut les contraintes `NOT NULL` des tables. En cas de violation, Postgres indique la colonne concernée. Les contraintes de vérification d’un domaine appartiennent au domaine. Si la contrainte `NOT NULL` d’un domaine est violée, Postgres indique le domaine dans `err.dataType`.

Si le générateur inclut une relation nommée `every` et que son schéma contient un enum nommé `Constraint` ou un domaine du même nom généré sous forme d’union, les deux objets déclarent `every.Constraint`. L’option s’applique à toute l’exécution. Pour la garder active, excluez cette relation ou renommez l’un des deux objets.

Le générateur exécute la requête supplémentaire au catalogue et déclare le type uniquement si `constraintNames` vaut `true` après fusion de la configuration (fichier, puis argument JSON). La valeur JSON `null` dans l’argument désactive l’option même si le fichier indique `true`.

### `domainsTypedByContext` {#generate.domainsTypedByContext}

À partir de la 7.0.0, la valeur par défaut était `true`. À partir de la 8.0.0, la clé est retirée et le générateur se comporte toujours comme avec `true` ([migration vers la 8.0](/fr/switching#from-8-0-domainsTypedByContext)). L’option concernait une colonne dont le domaine porte sur `int8`, `numeric`, `bytea`, `money`, `date`, `timestamp` ou `timestamptz`, ou sur un tableau de l’un d’eux. Ces types ont une représentation propre aux lignes de `pg`, au JSON des raccourcis et aux écritures ([Types de valeurs](/fr/value-types)). La colonne suit son type de base dans chaque contexte tant que son placeholder conserve le type généré. En 7.x, avec `false`, les cinq interfaces utilisaient le type du placeholder, comme dans Zapatos 6.6.1. Le placeholder généré contient le type que renvoie `pg`. Supposons qu’une réservation ait un numéro de billet :

```sql
CREATE DOMAIN ticket_no AS bigint;
ALTER TABLE seat_bookings ADD COLUMN ticket ticket_no;
```

Son placeholder, `PgTicket_no.d.ts`, contient `db.Int8String`. Avec le parser JSON par défaut, les raccourcis renvoient le numéro de billet sous forme de nombre, et Postgres accepte cette représentation :

| `seat_bookings.ticket` | 7.x avec `false` | 8.0 |
|---|---|---|
| `Selectable`, une ligne de `pg` | `PgTicket_no`, une chaîne | le même |
| `JSONSelectable`, une ligne des raccourcis | `PgTicket_no`, une chaîne | `number` |
| `Whereable`, `Insertable`, `Updatable` | `PgTicket_no`, une chaîne : `insert()` refuse `ticket: 1` (TS2769) | `number \| Int8String \| bigint` |

- Le générateur écrit [`DomainInContext`](/fr/value-types#DomainInContext) dans les quatre autres interfaces, `db.DomainInContext<c.PgTicket_no, db.Int8String, number>` dans `JSONSelectable` ; un éditeur affiche `number`.
- Les cinq interfaces utilisent le type du placeholder s’il diffère de celui que le générateur produirait avec les réglages actuels. Seule l’identité des types compte, même pour un fichier de la 6.x jamais modifié. Pour comparer les fichiers, suivez le [guide de migration](/fr/switching#domain-and-parser-types).
- Un placeholder écrit par Zapatos 6.6.1 sur `int8` ou `numeric` contient le même type sans son import, et le générateur ne le réécrit jamais : la colonne vaut `any`, donc `insert()` accepte `ticket: 'abc'`. Sur un tableau de l’un d’eux, il contient `db.Int8String[]` ou `db.NumericString[]`, qui vaut `any[]` : `insert()` accepte `nos: ['abc']` et refuse `nos: 'abc'` (TS2769). Dans le placeholder, `tsc` signale TS2503, et rien sous `skipLibCheck`. Ajoutez d’abord son import ([Quand un placeholder ne compile pas](/fr/custom-types#when-a-placeholder-does-not-compile)). Sur `date`, `timestamp`, `timestamptz`, `bytea` ou `money`, le placeholder de la 6.6.1 est celui qu’écrit le générateur.
- Quand deux domaines comme `public.ticket_no AS bigint` et `archive.ticket_no AS date` utilisent tous deux `PgTicket_no` ([`customTypesTransform`](#generate.customTypesTransform)), ils partagent le même type, comme le dit la note du générateur `custom types … are both named PgTicket_no` ([`warningListener`](#generate.warningListener)) : le générateur type selon le contexte les colonnes du domaine dont le placeholder contient le type, et utilise le type du placeholder pour les colonnes de l’autre domaine dans les cinq interfaces. Renommez l’un des deux dans la base.
- Chaque type de base prend ses propres types : `numeric` `number`, puis `number | NumericString` ; `date`, `timestamp` et `timestamptz` leur type chaîne, puis celui-ci ou un `Date` ; `bytea` `ByteArrayString`, puis celui-ci ou un `Buffer` ; `money` `string`, puis `number | string` ; un tableau, ceux de son élément, en tableau. Avec [`customJSONParsingForLargeNumbers`](#generate.customJSONParsingForLargeNumbers), `int8` et `numeric` sont `number | Int8String` et `number | NumericString` dans `JSONSelectable`.
- Inchangé : un domaine typé de la même façon dans chaque contexte, comme `seat_label`.
- Les types générés pour les tableaux ne tiennent pas compte de la [nullabilité des éléments](/fr/catalog-types#what-the-generator-doesn-t-read). La contrainte `NOT NULL` de la colonne s’applique au tableau. Même si les éléments ont pour type un domaine `NOT NULL`, une affectation au-delà de la fin, comme `a[3] = 3` sur `{1}`, enregistre `{1,NULL,3}`.
- Pour une colonne de type `numeric[]`, `Selectable` déclare `db.NumericString[]`. Il en va de même pour une colonne dont le domaine a `numeric[]` pour type de base, si le générateur la type selon le contexte à partir d’un nouveau placeholder. Le parser de tableaux par défaut de `pg` renvoie des nombres.

Un domaine sur un domaine, ou un tableau d’un domaine, reçoit un placeholder qui contient `any` : le générateur lit le domaine intérieur, ou le type du tableau, comme un type personnalisé. Le générateur le type dans les cinq interfaces par le type de base de son domaine le plus intérieur, tant que son placeholder contient `any` :

```sql
CREATE DOMAIN vip_ticket_no AS ticket_no;
ALTER TABLE seat_bookings ADD COLUMN vip_ticket vip_ticket_no, ADD COLUMN tickets ticket_no[];
```

| | `vip_ticket` | `tickets` |
|---|---|---|
| `Selectable`, une ligne de `pg` | `Int8String`, comme `pg` parse un `bigint` | `string`, le texte que renvoie `pg` : `'{1,2}'` |
| `JSONSelectable`, une ligne des raccourcis | `number` | `number[]` |
| `Whereable`, `Insertable`, `Updatable` | `number \| Int8String \| bigint` | `(number \| Int8String \| bigint)[]` |

- En 7.x, `false` rétablissait le type du placeholder, `any`, dans les cinq interfaces pour les deux colonnes.
- `pg` parse un domaine sur un domaine selon le type de base de son domaine le plus intérieur, mais renvoie un tableau d’un domaine sous forme de texte, faute de connaître le type de ce tableau : de même pour un domaine sur un tel tableau, directement ou à travers d’autres domaines. Un tableau d’un domaine sur un tableau reste `any`, de même qu’un domaine sur celui-ci, ou qu’un type de base que le générateur ne sait pas traduire, tel que `point`.
- Pour un domaine imbriqué ou un tableau de domaines dont le type de base est un enum, le générateur écrit le nom de cet enum s’il est défini dans le schéma de la relation, et ses labels s’il est défini ailleurs, jamais comme l’enum du même nom dans le schéma de la relation. Un domaine défini directement sur un enum d’un autre schéma garde son placeholder dans les cinq interfaces. Si le placeholder est généré pour la première fois et que son nom est propre au domaine, il contient les labels de cet enum.
- Un placeholder que vous modifiez garde son type dans les cinq interfaces, `unknown` compris. Si vous remplacez son type par `any`, le générateur le traite comme un placeholder laissé tel quel : écrivez `unknown` pour garder une telle colonne non typée.
- Donnée quand même, avec toute valeur autre que `true`, `null` et `undefined`, la clé arrête le générateur avant la première requête, sans écrire aucun fichier : `domainsTypedByContext was removed in 8.0, which always does what domainsTypedByContext: true did; delete it from the generator's config: https://pgcast.dev/switching#from-8-0-domainsTypedByContext`.

### `enumArraysTypedAsText` {#generate.enumArraysTypedAsText}

À partir de la 7.0.0, cette option booléenne vaut `true` par défaut. En JSON, `null` sélectionne aussi la valeur par défaut. Cette option règle le type `Selectable` d’une colonne de type tableau d’enums ou domaine sur ce tableau. Postgres attribue au type de ce tableau un OID propre à chaque base, et `pg` n’a pas de parser pour ce type. Une ligne renvoyée par `pg`, par exemple lors d’une requête [`sql`](/fr/sql-template), contient le texte du tableau. Le JSON des raccourcis contient le tableau lui-même. Supposons qu’un membre de l’équipe puisse occuper plusieurs postes et que ses postes précédents soient stockés dans un domaine sur ce tableau :

```sql
CREATE DOMAIN job_list AS crew_job[];
ALTER TABLE crew ADD COLUMN other_jobs crew_job[] NOT NULL DEFAULT '{}', ADD COLUMN past_jobs job_list;
```

| `crew.other_jobs` | `false` | `true` (par défaut) |
|---|---|---|
| `Selectable`, une ligne de `pg` | `crew_job[]`, bien que `pg` donne `'{writer,editor}'` | `string` |
| `JSONSelectable`, une ligne des raccourcis | `crew_job[]` : `['writer', 'editor']` | le même |
| `Whereable`, `Insertable`, `Updatable` | `crew_job[]` | le même |

- `false` : le tableau, sans note de migration, même au-delà de la 8.0. Choisissez cette valeur si vous parsez le tableau avec `pg.types.setTypeParser` en lui passant l’OID du type du tableau (`SELECT 'crew_job[]'::regtype::oid`) et le parser de `text[]`. Déclarez `const textArrayOid: number = 1009`, puis passez `pg.types.getTypeParser(textArrayOid)`.
- `true` : `string`, le texte que renvoie `pg`. Les écritures prennent toujours un tableau, donc le texte d’une ligne de `sql` ne se réécrit pas tel quel : `insert()` et `update()` le refusent (TS2769, TS2322), alors que Postgres l’accepterait.
- Un domaine sur un tel tableau, comme `crew.past_jobs`, prend `db.DomainInContext<c.PgJob_list, crew_job[], string>` dans `Selectable` ([`DomainInContext`](/fr/value-types#DomainInContext)) : `string` tant que le type du placeholder est identique à celui que le générateur produirait avec les réglages actuels, même si vous avez modifié le fichier. Si les types diffèrent, les cinq interfaces utilisent celui du placeholder.
- Un tableau d’un enum d’un autre schéma, typé par ses labels, est lui aussi un `string` dans `Selectable`. Un tableau d’un domaine sur un enum est [typé selon le contexte](#generate.domainsTypedByContext).

### `intervalsTypedAsObjects` {#generate.intervalsTypedAsObjects}

À partir de la 7.0.0, cette option booléenne vaut `true` par défaut. En JSON, `null` sélectionne aussi la valeur par défaut. Cette option règle le type d’une colonne de type `interval`, `interval[]` ou domaine sur l’un de ces types. Par défaut, le parser de `pg` renvoie un objet [`PostgresInterval`](/fr/value-types#PostgresInterval) dont les champs contiennent les composantes de l’intervalle. Le JSON des raccourcis en donne le texte. Supposons qu’une séance ait un entracte :

```sql
ALTER TABLE screenings ADD COLUMN intermission interval;
```

| `screenings.intermission`, `'15 minutes'` | `false` | `true` (par défaut) |
|---|---|---|
| `Selectable`, une ligne venant de `pg` | `string`, bien que `pg` renvoie `{ minutes: 15 }` | `PostgresInterval` |
| `JSONSelectable`, une ligne venant des raccourcis | `string` : `'00:15:00'` | la même chose |
| `Whereable`, `Insertable`, `Updatable` | `string` | `string \| PostgresInterval` |

- `false` reste disponible au-delà de la 8.0 pour les parsers personnalisés. Utilisez `pg.types.setTypeParser(1186, v => v)` pour obtenir le texte d’un intervalle. Pour obtenir un tableau d’intervalles sous forme de chaînes, déclarez `const intervalArrayOid: number = 1187` et `const textArrayOid: number = 1009`, puis appelez `pg.types.setTypeParser(intervalArrayOid, pg.types.getTypeParser(textArrayOid))`. Avec des OID littéraux, la compilation échoue (TS2345) à partir de TypeScript 5.9.
- `true` : un `PostgresInterval` dans `Selectable`, un tableau de `PostgresInterval` pour un `interval[]`. Une écriture en reprend un, puisque `pg` l’envoie via son `toPostgres()` ; `insert()` refuse toujours un simple objet comme `{ minutes: 15 }` (TS2769) : Postgres le refuse aussi à partir de sa version 17 (22007), et le stocke comme `00:00:15` jusqu’à la 16.
- `pg` ne lit que l’`IntervalStyle` par défaut, `postgres` : sous `iso_8601`, `sql_standard` ou `postgres_verbose`, son objet revient avec des parties manquantes, souvent `{}`, quoi que dise le type. Les raccourcis donnent le texte, dans ce style.
- Un domaine sur l’un d’eux suit la même règle : un nouveau placeholder contient `db.PostgresInterval`, et sa colonne est [typée selon le contexte](#generate.domainsTypedByContext), comme l’est un domaine sur `date`. Un domaine sur un tel domaine prend `PostgresInterval` dans `Selectable` ; un tableau d’un domaine y reste `string`, le texte que renvoie `pg`. Un placeholder écrit auparavant contient `string`, et le générateur ne le réécrit jamais.

### `domainsTypedAsUnions` {#generate.domainsTypedAsUnions}

`boolean`, par défaut `false` ; un opt-in, à partir de la 6.10.0. Un domaine sur `text` dont le `CHECK` liste les valeurs est typé par elles : le générateur déclare leur union dans le schéma du domaine, après ses enums, avec le tuple `every.<name>` dans l’ordre du `CHECK`, et un nouveau placeholder la nomme ([Un domaine de valeurs](/fr/custom-types#a-domain-of-values)). Disons qu’un film a une classification :

```sql
CREATE DOMAIN certificate AS text CHECK (VALUE IN ('U', 'PG', '12', '15', '18'));
ALTER TABLE films ADD COLUMN certificate certificate;
```

| `films.certificate` | `false` | `true` |
|---|---|---|
| `zapatos/schema` | rien | `certificate`, `'U' \| 'PG' \| '12' \| '15' \| '18'`, et `every.certificate` |
| un nouveau `PgCertificate.d.ts` | `string` | `certificate`, importé de `zapatos/schema` |
| les cinq interfaces | `c.PgCertificate` | la même chose : `insert()` refuse `certificate: '12A'` (TS2769) |

- Lu : un `CHECK` que Postgres stocke sous la forme `VALUE = ANY (ARRAY['U'::text, …])`, que donnent `VALUE IN ('U', 'PG')` comme `VALUE = ANY (ARRAY['U', 'PG'])`, ou `VALUE = 'U'::text`, que donne `VALUE IN ('U')` ; valide ; à côté d’un `NOT NULL` ou d’un autre `CHECK`, qui ne font que restreindre les valeurs. Une apostrophe, un antislash, un saut de ligne ou `''` est une valeur comme une autre ; une valeur écrite deux fois figure une seule fois dans l’union.
- Laissés de côté, leur placeholder comme avec `false` : `NULL` parmi les valeurs, qui laisse passer n’importe quelle valeur ; un domaine sur `varchar`, `char`, `citext` ou un autre domaine ; un `CHECK` ajouté `NOT VALID` ; `VALUE = 'U' OR VALUE = 'PG'` ; deux `CHECK` de cette forme ; sous Postgres 18 et les versions antérieures, avec `standard_conforming_strings` désactivé pour la base ou le rôle, une valeur qui contient un antislash, que Postgres écrit alors doublé ; un domaine d’un schéma que l’exécution ne génère pas ; un tableau du domaine.
- Un placeholder sur le disque est à vous, et le générateur ne le réécrit jamais : un placeholder écrit avant, ou modifié, continue de typer les colonnes, et une [note](#generate.warningListener) le nomme à chaque exécution tant que son texte n’est pas celui qu’écrirait l’exécution. Supprimez-le, et l’exécution suivante l’écrit en nommant l’union. [`--check`](#check) ne le compte que s’il manque, comme tout placeholder.
- Deux types de même nom partagent un placeholder ([#42](https://github.com/AlexandreDemartin/pgcast/issues/42)) : il ne nomme l’union que tant que le domaine est le seul type de l’exécution à prendre ce nom. Sinon, il contient le texte qu’il aurait avec `false`, le type de base du type de la colonne lue en dernier, par schéma, puis relation, puis colonne, qui peut ne pas être celui de ce domaine : `number`, pour un domaine sur `integer` de ce nom lu par une relation qui vient après celle de ce domaine. L’union est déclarée malgré tout.
- Avec [`customTypesTransform`](#generate.customTypesTransform) à `'my_type'`, ou à une fonction qui garde le nom, un placeholder de [`unprefixedSchema`](#generate.unprefixedSchema) prend le nom même de l’union, et la nomme sans import : `export type certificate = import('zapatos/schema').certificate;`.
- Avec [`schemaJSDoc`](#generate.schemaJSDoc), la JSDoc de l’union donne son nom, `Domain in database`, et son `COMMENT ON DOMAIN`.
- Le SQL des requêtes ne change pas. Avec `false`, la sortie non plus, et le générateur ne lit aucune contrainte de domaine. L’option reste désactivée pendant toute la série 7.x : un placeholder qui contient le type de base est la façon dont Zapatos type un domaine ([décision 008](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/008-domains-jsonb-validators.md)). La 8.0 ne garde que ce comportement ([décision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).

### `valuesTypedAsAliases` {#generate.valuesTypedAsAliases}

De la 7.2.0 à la fin de la série 7.x, un opt-in, `false` par défaut. À partir de la 8.0.0, la clé est retirée et le générateur se comporte toujours comme avec `true` ([migration vers la 8.0](/fr/switching#from-8-0-valuesTypedAsAliases)). La valeur de chaque colonne dans `Whereable`, `Insertable` et `Updatable` nomme un alias de `zapatos/db`, [`WhereableValue`](/fr/value-types#WhereableValue), [`InsertableValue`](/fr/value-types#InsertableValue) ou [`UpdatableValue`](/fr/value-types#UpdatableValue), là où la 7.x écrit par défaut son union en entier. Les types sont les mêmes : chaque appel qui compile compile encore, et chaque appel refusé l’est encore :

| `films` | Jusqu’à la 7.x, `false` | À partir de la 8.0.0 |
|---|---|---|
| `Whereable` | `release_year?: number \| db.Parameter<number> \| db.SQLFragment \| db.ParentColumn \| db.SQLFragment<any, …>;` | `release_year?: db.WhereableValue<number>;` |
| `Insertable` | `tagline?: string \| db.Parameter<string> \| null \| db.DefaultType \| db.SQLFragment<any>;` | `tagline?: db.InsertableValue<string, null \| db.DefaultType>;` |
| `Updatable` | `title?: string \| db.Parameter<string> \| db.SQLFragment \| db.SQLFragment<any, …>;` | `title?: db.UpdatableValue<string>;` |

- Le second argument de type est `null | db.DefaultType` pour une colonne nullable, `db.DefaultType` pour une colonne qui a une valeur par défaut, et absent sinon.
- Le fichier du schéma est plus petit, et `tsc` utilise moins de mémoire : sur 300 tables de 20 colonnes, 5,1 Mo au lieu de 7,0 Mo, et 293 Mo au lieu de 387 Mo avec `skipLibCheck: false`, 196 Mo au lieu de 280 Mo avec `skipLibCheck: true`.
- Le survol d’un éditeur et une erreur nomment l’alias avec TypeScript 5.9 : `Type 'string' is not assignable to type 'WhereableValue<number> | undefined'`. TypeScript 4.1 affiche l’union en entier.
- Les alias sont dans `zapatos/db` depuis la 7.2.0 : un schéma écrit par la 8.0 ne compile pas avec un `zapatos/db` plus ancien, sur chaque ligne de valeur (TS2694), et sous `skipLibCheck` ces valeurs sont `any`. Après un retour en arrière, régénérez.
- Le SQL des requêtes ne change pas ([décision 017](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/017-value-aliases.md), [décision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).
- Donnée quand même, avec toute valeur autre que `true`, `null` et `undefined`, la clé arrête le générateur avant la première requête, sans écrire aucun fichier : `valuesTypedAsAliases was removed in 8.0, which always does what valuesTypedAsAliases: true did; delete it from the generator's config: https://pgcast.dev/switching#from-8-0-valuesTypedAsAliases`.

### `progressListener` {#generate.progressListener}

`boolean`, ou dans `generate()` une fonction `(s: string) => void` ; par défaut `false`. `true` affiche chaque étape avec `console.log` ; une fonction reçoit chaque ligne. Depuis [`check()`](#export-check), une ligne : `The generated files in src/zapatos are up to date.`

```txt
(Re)creating schema folder: src/zapatos/schema.d.ts
Writing generated schema: src/zapatos/schema.d.ts
Custom type or domain declaration file already exists: src/zapatos/custom/PgPoint.d.ts
Custom type or domain declaration file already exists: src/zapatos/custom/PgSeat_label.d.ts
Writing custom types file: src/zapatos/custom/index.d.ts
```

### `warningListener` {#generate.warningListener}

`boolean`, ou dans `generate()` une fonction `(s: string) => void` ; par défaut `true`, avec `console.log`. `false` fait taire :

- `Writing new custom type or domain placeholder file: src/zapatos/custom/PgPoint.d.ts`, une fois par nouveau placeholder ;
- `Note: custom types "archive"."notes" and "public"."notes" are both named PgNotes in TypeScript, so they share one type and one placeholder file, src/zapatos/custom/PgNotes.d.ts. To type them apart, rename one of them in the database.`
  - une fois par exécution pour chaque nom que partagent deux types Postgres ([`customTypesTransform`](#generate.customTypesTransform)) ; quand leurs noms diffèrent, il ajoute qu’une fonction `customTypesTransform` peut les distinguer ;
- `Note: relations "public"."film notes" and "public"."film_notes" are both named film_notes in TypeScript, so their declarations clash. To type them apart, rename one of them in the database.`
  - une fois par exécution pour chaque nom TypeScript que prennent deux schémas, relations ou enums d’une même portée, et avec [`domainsTypedAsUnions`](#generate.domainsTypedAsUnions) les unions de domaines, à côté des enums : `domain "public"."odd_format" and enum "public"."odd format"` ;
- `Note: custom types "public"."SEAT_LABEL" (PgSEAT_LABEL) and "public"."seat_label" (PgSeat_label) have TypeScript names that differ only in case: on a case-insensitive file system, the default on macOS and Windows, PgSEAT_LABEL.d.ts and PgSeat_label.d.ts are one placeholder file in src/zapatos/custom, which declares only one of those names. To type them apart, rename one of them in the database, or give customTypesTransform a function that keeps their names apart.`
  - une fois par exécution pour des noms qui ne diffèrent que par la casse, quel que soit le système de fichiers, avant la note ci-dessus pour chacun de ces noms que partagent deux types Postgres ;
- `Note: custom type "public"."index" (index) has the placeholder file index.d.ts in src/zapatos/custom, the file of the custom types' index: the generator writes the index over it on every run, so index is never declared. To declare it, rename it in the database, or give customTypesTransform a function that names it otherwise.`
  - une fois par exécution pour les noms dont le placeholder est `custom/index.d.ts` : `index` et, sur un système de fichiers insensible à la casse, un nom qui n’en diffère que par la casse (`Index`, `INDEX`), après la note ci-dessus pour ces noms ;
- `Note: public.certificate is typed by the values of its CHECK as certificate in zapatos/schema (domainsTypedAsUnions), but its placeholder src/zapatos/custom/PgCertificate.d.ts, written before, still types its columns. To type them by the database, delete it: the next run writes it naming the union.`
  - une fois par exécution pour chaque placeholder sur le disque, avec [`domainsTypedAsUnions`](#generate.domainsTypedAsUnions), que l’exécution écrirait en nommant une union, tant que son texte diffère de celui qu’elle écrit, dans l’ordre des domaines, après les notes sur les noms partagés ; depuis [`check()`](#export-check) aussi ;
  - à sa place, pour un tel placeholder qui nomme déjà l’union, avec un import de son propre nom que `zapatos/schema` déclare aussi comme type, tel que la 6.10.0 l’écrivait avec [`customTypesTransform`](#generate.customTypesTransform) à `'my_type'` ([#661](https://github.com/AlexandreDemartin/pgcast/issues/661)) : `Note: rating.rating is typed by the values of its CHECK as rating.rating in zapatos/schema (domainsTypedAsUnions), and its placeholder src/zapatos/custom/rating.d.ts, written before, names it too, but imports rating from zapatos/schema, which also declares a type of that name, the placeholder's own: it fails to compile (TS2440). Delete it: the next run writes it naming the union with no import.` ;
- `Note: the include entry "Films" of schema "public" matches no relation there, so it generates nothing. Check its spelling and case, that the relation is in schema "public", and that the database role has a privilege on it: include names tables, views, materialised views and foreign tables.`
  - une fois par exécution pour chaque entrée d’une liste [`include`](#generate.schemas) que son schéma n’a pas ;
- `Note: the schemas rule of "public" has no exclude, so it takes "exclude": [], as the default rule does. Write the key in the rule to silence this note.`
  - après l’écriture, pour chaque règle de [`schemas`](#generate.schemas) qui omet `include` ou `exclude`, ou le met à `null` ; pour les deux, `has no include nor exclude, so it takes "include": "*" and "exclude": []` ;
- `Note: the schemas rule of "public" gives include as a string, "films", so it is read as the list ["films"]. Zapatos 6.6.1 also matched each relation whose name is part of the string. Write the list to silence this note.`
  - après l’écriture, pour chaque `include` ou `exclude` d’une règle de [`schemas`](#generate.schemas) donné sous forme de chaîne autre que `"*"` ;
- la note sur les colonnes `bigint` et `numeric`, une fois par processus ([`customJSONParsingForLargeNumbers`](#generate.customJSONParsingForLargeNumbers)) ;
- `Note: src/zapatos/schema.d.ts is here too, generated with moduleNames: 'zapatos'. It declares 'zapatos/schema', as src/pgcast/schema.d.ts does, and TypeScript merges the two: types can loosen, silently under skipLibCheck. Delete the folder src/zapatos, once any placeholder you edited there is moved to src/pgcast/custom.`
  - après l’écriture, avec [`moduleNames`](#generate.moduleNames) à `"pgcast"`, quand `outDir` contient un `zapatos/schema.d.ts` ; un dossier sans son `schema.d.ts` n’est pas signalé ;
- `Note: src/pgcast/schema.d.ts is here too, generated with moduleNames: 'pgcast'. Its import of 'pgcast/db' fails to compile without skipLibCheck. Delete the folder src/pgcast, once any placeholder you edited there is moved to src/zapatos/custom.`
  - de même, avec `"zapatos"` et un `pgcast/schema.d.ts` ;
- `Note: pgcastconfig.json and zapatosconfig.json are both here, and only pgcastconfig.json is read. Move any option you still need from zapatosconfig.json into pgcastconfig.json, then delete zapatosconfig.json.`
  - depuis [la CLI](#cli), avant de générer, quand le dossier où elle tourne contient les deux fichiers ;
- `Note: flag --chek ignored after the JSON argument: only --check may follow it.`
  - depuis [la CLI](#cli), avant de générer ou de vérifier, pour chaque argument placé après `config` et commençant par `--`, sauf s’il s’agit de `--` ou de `--check` ;
- l’[avertissement sur l’ancienne arborescence](/fr/generated-files#the-old-layout-warning) ;
- `Out of date: src/zapatos/schema.d.ts` et `Missing: src/zapatos/custom/PgSeat_label.d.ts`
  - depuis [`check()`](#export-check), pour chaque fichier qui diffère ou manque, après les notes d’une exécution.

### `debugListener` {#generate.debugListener}

`boolean`, ou dans `generate()` une fonction `(s: string) => void` ; par défaut `false`. Reçoit chaque requête que le générateur envoie, `>>> query <n> >>>`, son texte et ses valeurs, puis son résultat tel que `pg` le renvoie, en JSON, `<<< result <n> <<<`. Le texte est celui envoyé, lignes vides comprises, sans l’indentation du code de pgcast : avec ses valeurs, il s’exécute tel quel.

Les relations sont lues en parallèle : avec plusieurs, les résultats reviennent entremêlés, et le numéro d’une requête peut changer d’une exécution à l’autre, donc c’est `<n>` qui associe un résultat à sa requête.

Les index uniques de `tags`, avec `"schemas": { "public": { "include": ["tags"], "exclude": [] } }`, coupés après ses lignes :

```txt
>>> query 4 >>>
SELECT DISTINCT i.indexname
, idx.indisvalid AND NOT idx.indisexclusion AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    WHERE con.conindid = c.oid AND con.conrelid = idx.indrelid
    AND con.contype IN ('p', 'u') AND NOT con.condeferrable
  ) AS "isArbiter"
FROM pg_catalog.pg_indexes i
JOIN pg_catalog.pg_namespace n ON n.nspname = i.schemaname
JOIN pg_catalog.pg_class c ON c.relname = i.indexname AND c.relnamespace = n.oid
JOIN pg_catalog.pg_index idx ON idx.indexrelid = c.oid AND idx.indisunique
WHERE i.tablename = $1 AND i.schemaname = $2
ORDER BY i.indexname
+ ["tags","public"]

<<< result 4 <<<
{
  "command": "SELECT",
  "rowCount": 1,
  "oid": null,
  "rows": [
    {
      "indexname": "tags_pkey",
      "isArbiter": true
    }
  ],
  …
```

Le résultat est l’objet `Result` entier de `pg` : après `rows` viennent `fields`, les types de ses colonnes, et environ soixante-dix lignes consacrées aux parsers de types internes de `pg`, les mêmes pour chaque requête.

## Types {#types}

Les types de deux options, tirés de `zapatos/generate`, pour une fonction à vous qui les prend ou les renvoie.

### `SchemaRules` {#SchemaRules}

```ts
interface SchemaRules {
  [schema: string]: {
    include: '*' | string[];
    exclude: '*' | string[];
  };
}
```

À partir de la 6.9.0. Le type de [`schemas`](#generate.schemas) : par schéma, les relations à générer.

### `ColumnOptions` {#ColumnOptions}

```ts
interface ColumnOptions {
  [k: string]: {  // table name or "*"
    [k: string]: {  // column name
      insert?: 'auto' | 'excluded' | 'optional';
      update?: 'auto' | 'excluded';
    };
  };
}
```

À partir de la 6.9.0. Le type de [`columnOptions`](#generate.columnOptions) : par table, puis par colonne, comment `Insertable` et `Updatable` la typent.
