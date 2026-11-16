---
english: bc3b14bc4960
---

# Générateur

Le générateur lit le catalogue de votre base et écrit les types de `zapatos/schema`. Cette page indique comment le lancer, en ligne de commande ou depuis du code, chaque option de son fichier de configuration et de `generate()`, et les fichiers qu’il écrit.
{.lede}

## La CLI {#cli}

```sh
npx pgcast [--check] [config]
npx zapatos [--check] [config]
```

Le même programme sous deux noms : `pgcast`, et `zapatos`, comme dans Zapatos 6.6.1. Il lit la config, puis lance [`generate()`](#generate) avec elle, ou, avec [`--check`](#check), compare ce qu’il écrirait à vos fichiers.

- Le fichier de configuration : lu dans le dossier où vous le lancez, s’il y est ; jamais dans un dossier parent. Sans fichier, la config est `{}`.
  - `zapatosconfig.json`, comme dans Zapatos 6.6.1.
  - `pgcastconfig.json`, à partir de la 6.7.0, lu en premier : si les deux sont là, seul `pgcastconfig.json` est lu, et la CLI le signale via [`warningListener`](#generate.warningListener) avant de générer.
- `config` : un argument facultatif, un objet JSON, fusionné par-dessus le fichier clé par clé : `npx pgcast '{"outDir": "./generated"}'` garde le `db` du fichier et remplace son `outDir`.
  - Une clé donnée ici remplace toute la valeur du fichier, donc `'{"db": {"application_name": "codegen"}}'` écarte le `connectionString` du fichier.
  - Les variables du fichier sont substituées avant la fusion : une variable qu’il nomme doit être définie même quand l’argument remplace sa clé, sinon la CLI s’arrête avec `Environment variable 'NAME' is not set`.
- Dans chaque chaîne des deux, à toute profondeur, les variables d’environnement sont substituées ([Variables d’environnement](#environment-variables)).
- Un seul flag, `--check`, avant ou après `config`. Tout autre argument qui commence par `--`, à la place de `config`, l’arrête avec le code 1 avant qu’elle lise la config, et Node affiche `Unknown flag --help: the only flag is --check, beside the JSON argument` et sa pile ; Zapatos 6.6.1 le lisait comme l’argument JSON, et échouait. Après `config`, un tel argument est ignoré, comme dans Zapatos 6.6.1, avec une [note](#generate.warningListener) : un `npx pgcast '{}' --chek` mal orthographié génère.
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
| JSON invalide | le message de `JSON.parse`, qui dépend de l’entrée et de Node : sur Node 22, `Unexpected end of JSON input` pour un fichier vide, `No number after minus sign in JSON at position 1 (line 1 column 2)` pour `-h`, `Expected double-quoted property name in JSON at position 15 (line 1 column 16)` pour une virgule finale |
| une variable n’est pas définie | `Environment variable 'DATABASE_URL' is not set` |

Une requête qui échoue, connexion comprise, l’arrête avec le code 1, après `*** error <n> ***` et l’erreur, comme dans Zapatos 6.6.1 : la CLI met [`rejectOnQueryError`](#generate.rejectOnQueryError) à `false` par-dessus le fichier et l’argument.

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

Il lit le catalogue comme le fait une exécution, construit les fichiers en mémoire, et les compare avec les vôtres. Il n’écrit rien, pas même un dossier : pour la CI, après vos migrations, ou avant de dire qu’un changement est fini.

| Code de sortie | Quand | Ce qu’il affiche |
|---|---|---|
| 0 | chaque fichier correspond | `The generated files in src/zapatos are up to date.` |
| 1 | un fichier diffère ou manque | une ligne par fichier, puis comment les écrire |

```txt
Out of date: src/zapatos/schema.d.ts
Missing: src/zapatos/custom/PgSeat_label.d.ts
Run the generator without --check to write them.
```

- `schema.d.ts` et, quand il y a un type personnalisé, `custom/index.d.ts`, que chaque exécution réécrit alors, sont comparés octet par octet. Un placeholder ne compte que s’il manque : il est à vous, à modifier vous-même ([Les fichiers qu’il écrit](#the-files-it-writes)).
- `outDir`, `outExt` et [`moduleNames`](#generate.moduleNames) nomment les fichiers, comme pour une exécution : `src/pgcast/schema.ts` avec `".ts"` et `"pgcast"`.
- Les notes d’une exécution viennent d’abord, via [`warningListener`](#generate.warningListener), sauf celles sur les placeholders qu’elle écrirait. Une requête qui échoue l’arrête avec le code 1, comme elle arrête une exécution.

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
- Elle n’affiche que par les écouteurs : une ligne par fichier qui diffère ou manque via [`warningListener`](#generate.warningListener), donc avec `console.log` par défaut ; `The generated files in src/zapatos are up to date.` via [`progressListener`](#generate.progressListener). Pas la dernière ligne de la CLI, `Run the generator without --check to write them.`
- Une requête qui échoue arrête le processus, comme elle arrête `generate()` ; avec [`rejectOnQueryError`](#generate.rejectOnQueryError), sa promesse est rejetée avec l’erreur.

## `generate()` {#generate}

```ts
import { generate, type Config } from 'zapatos/generate';

generate(config: Config): Promise<void>
```

Lit le catalogue de `config.db` et écrit les [fichiers](#the-files-it-writes) sous `config.outDir`. `config` prend les [options](#options) de `zapatosconfig.json`, et aussi des fonctions là où le JSON prend `true` ou un nom : les trois écouteurs et `customTypesTransform`.

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
- Une requête qui échoue, connexion comprise, affiche `*** error <n> ***` et l’erreur avec `console.log`, puis arrête le processus avec `process.exit(1)`, comme dans Zapatos 6.6.1. La promesse ne se résout jamais et n’est jamais rejetée : un `try`/`catch` autour ne s’exécute donc pas. Avec [`rejectOnQueryError`](#generate.rejectOnQueryError), elle est rejetée avec cette erreur.
- Sur les autres erreurs, la promesse est rejetée : une écriture qui échoue (`ENOTDIR: not a directory, mkdir 'afile/zapatos'` quand `outDir` est un fichier), une [règle](#generate.schemas) mal formée.
- À l’exécution, une clé qu’il ne connaît pas est ignorée : un ancien `srcMode`, un `outdir` mal orthographié. En TypeScript, un littéral objet qui en contient une ne compile pas (TS2353, ou TS2561 avec une suggestion pour un nom proche comme `outdir`).
- `zapatos/generate` exporte aussi `Config` et les fonctions qui composent `generate()` (`tsForConfig()`, `definitionForRelationInSchema()` et d’autres), non documentées ici.

## Les options {#options}

Toutes les options sont facultatives. Une option donnée remplace entièrement sa valeur par défaut : `schemas` sans `public` laisse `public` de côté.

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
| [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas) | `false` | le type d’un enum d’un autre schéma |
| [`enumOrder`](#generate.enumOrder) | `"alphabetical"` | l’ordre des labels d’un enum |
| [`moduleNames`](#generate.moduleNames) | `"zapatos"` | les noms de modules que déclarent et importent les fichiers, et leur dossier |
| [`rejectOnQueryError`](#generate.rejectOnQueryError) | aucune : arrêt, avec une note | si, quand une requête échoue, la promesse est rejetée ou le processus s’arrête |
| [`uniqueIndexConstraintsOnly`](#generate.uniqueIndexConstraintsOnly) | `false` | les noms de l’`UniqueIndex` de chaque relation |
| [`domainsTypedByContext`](#generate.domainsTypedByContext) | `false` | le type d’un domaine sur `bigint`, `numeric`, `bytea`, `money` ou une date, ou sur un tableau de l’un d’eux, hors de `Selectable`, et d’un domaine sur un domaine ou d’un tableau d’un domaine |
| [`enumArraysTypedAsText`](#generate.enumArraysTypedAsText) | aucune : un tableau, avec une note | le type `Selectable` d’un tableau d’un enum |
| [`intervalsTypedAsObjects`](#generate.intervalsTypedAsObjects) | aucune : le texte, avec une note | le type d’un `interval` dans `Selectable` et dans une écriture |
| [`progressListener`](#generate.progressListener) | `false` | où chaque étape est signalée |
| [`warningListener`](#generate.warningListener) | `true` | où vont les avertissements |
| [`debugListener`](#generate.debugListener) | `false` | où vont chaque requête et son résultat |

### `db` {#generate.db}

`pg.ClientConfig` : ce que vous donneriez à `new pg.Pool()`, un `connectionString` ou `host`, `user`, `database` et le reste. Sans lui, `pg` prend ses valeurs par défaut et les variables d’environnement `PGHOST`, `PGUSER`, `PGDATABASE`…

### `outDir` {#generate.outDir}

`string`, par défaut `"."`. Le dossier qui accueille le dossier `zapatos`, créé si besoin : `"./src"` écrit `src/zapatos/schema.d.ts`. Relatif au dossier courant. Avec [`moduleNames`](#generate.moduleNames) à `"pgcast"`, le dossier est `pgcast`.

### `outExt` {#generate.outExt}

`string`, par défaut `".d.ts"`. L’extension de chaque fichier écrit, placeholders compris : `".ts"` écrit `zapatos/schema.ts`, `zapatos/custom/PgPoint.ts`. Seuls les noms changent ; le contenu est le même texte `declare module`. Avec `".ts"`, le générateur ne cherche pas l’[ancienne arborescence](#the-old-layout-warning).

### `schemas` {#generate.schemas}

`{ [schema]: { include, exclude } }`, `include` et `exclude` valant chacun `"*"` ou un tableau de noms de relations. Les schémas à générer, et quelles relations de chacun : tables, vues, vues matérialisées et tables distantes.

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

`{ [table]: { [column]: { insert?, update? } } }`. Change les types `Insertable` et `Updatable` d’une colonne, comme l’exigerait un trigger qui la remplit ; rien d’autre ne change, à l’exécution non plus.

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
| `"insert": "optional"` | la clé est facultative dans `Insertable`, son type inchangé : `title?: string \| db.Parameter<string> \| db.SQLFragment` |
| `"update": "excluded"` | la clé quitte `Updatable` : `db.update('seat_bookings', { booked_at: … }, …)` ne compile pas (TS2353) |

- La table est nommée comme la nomme son type `Table` : `films`, `archive.screenings`, et `public.films` quand [`unprefixedSchema`](#generate.unprefixedSchema) vaut `null`. `"films"` ne s’applique qu’à `public.films`.
- `"*"` désigne chaque table de chaque schéma. Il ne vaut que comme clé entière, jamais comme partie d’un nom, et pas pour les colonnes.
- L’entrée propre d’une table pour une colonne remplace l’entrée `"*"` de cette colonne, en bloc : avec `"*": { "booked_at": { "insert": "excluded", "update": "excluded" } }` et `"seat_bookings": { "booked_at": { "update": "excluded" } }`, `booked_at` revient dans `seat_bookings.Insertable`.
- Une table dont chaque colonne est exclue reçoit `[key: string]: never`, comme une vue où l’on ne peut pas écrire.
- Une autre valeur, ou une clé mal orthographiée, est ignorée : la colonne reste `auto`.

### `customTypesTransform` {#generate.customTypesTransform}

`"PgMy_type" | "my_type" | "PgMyType"`, ou dans `generate()` une fonction `(name: string) => string` ; par défaut `"PgMy_type"`. Le nom TypeScript de chaque type que le générateur vous laisse : un domaine, ou un type qu’il ne sait pas convertir, comme `point`. Chacun reçoit un [placeholder](#the-files-it-writes), et la colonne le type `c.<name>`.

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
- Un nom dont le placeholder est `index.d.ts`, comme `index` pour un domaine `index` avec `"my_type"`, ou `Index` sur un système de fichiers insensible à la casse, partage son fichier avec [`custom/index.d.ts`](#the-files-it-writes), que le générateur écrit par-dessus à chaque exécution : ce nom n’est jamais déclaré. Le générateur le signale aussi, et écrit les mêmes fichiers.

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

`boolean`, par défaut `false`. Le type `JSONSelectable` d’une colonne `bigint` (`int8`) ou `numeric`, pour un projet qui parse le JSON avec [`enableCustomJSONParsingForLargeNumbers()`](/fr/runtime-config#enableCustomJSONParsingForLargeNumbers) :

| Colonne | `false` | `true` |
|---|---|---|
| `int8` | `number` | `(number \| db.Int8String)` |
| `numeric` | `number` | `(number \| db.NumericString)` |

- Les autres interfaces ne changent pas : `Selectable` est `db.Int8String` ou `db.NumericString` dans les deux cas.
- `true` fait aussi taire l’avertissement que donne une telle colonne : `Note: this database has bigint/int8 and/or numeric/decimal columns, for which JSON.parse may lose precision…`.

### `typeEnumsAcrossSchemas` {#generate.typeEnumsAcrossSchemas}

`boolean`, par défaut `false` ; un opt-in, `true` par défaut à partir de la 7.0 ([Versions](/fr/versions)). Le type d’une colonne dont le type est un enum d’un autre schéma. `false`, comme dans Zapatos 6.6.1, cherche l’enum par son nom dans le schéma de la relation de la colonne ; `true` le cherche dans son propre schéma, et écrit ses labels :

```sql
CREATE SCHEMA archive;
CREATE TYPE archive.print_format AS ENUM ('nitrate', 'safety', 'digital');
CREATE TYPE archive.crew_job AS ENUM ('projectionist', 'archivist');  -- public has a crew_job too
CREATE TABLE prints (id int PRIMARY KEY, format archive.print_format NOT NULL, formats archive.print_format[], keeper archive.crew_job);
```

| Colonne de `prints` | `false` | `true` |
|---|---|---|
| `format` | `c.PgPrint_format`, un placeholder `any` | `('digital' \| 'nitrate' \| 'safety')` |
| `formats` | `c.Pg_print_format \| null`, un placeholder `any` | `('digital' \| 'nitrate' \| 'safety')[] \| null` |
| `keeper` | `crew_job \| null` : les labels de `public.crew_job` | `('archivist' \| 'projectionist') \| null` |

- Les labels sont écrits en toutes lettres, pas nommés : le schéma de l’enum n’a pas besoin d’être dans [`schemas`](#generate.schemas). Dans l’ordre d’[`enumOrder`](#generate.enumOrder), comme pour chaque enum.
- Un domaine sur un tel enum reste un type personnalisé, `c.<name>` ; son nouveau placeholder reçoit les labels plutôt que `any`, sans import, même quand une relation du schéma de l’enum utilise aussi ce domaine. Un placeholder existant n’est jamais écrasé.
- `false` signale, via [`warningListener`](#generate.warningListener), les colonnes que `true` changerait, chacune avec son type : pour un domaine, son type sous-jacent.

### `enumOrder` {#generate.enumOrder}

`"alphabetical"` ou `"declared"`, par défaut `"alphabetical"` ; un opt-in, `"declared"` par défaut à partir de la 7.0 ([Versions](/fr/versions)). L’ordre des labels d’un enum. `"alphabetical"`, comme dans Zapatos 6.6.1, les trie ; `"declared"` garde l’ordre dans lequel l’enum les déclare, celui par lequel Postgres trie et compare ses valeurs (`ORDER BY`, `<`, `enum_range()`) :

```sql
CREATE TYPE crew_job AS ENUM ('director', 'writer', 'editor', 'cinematographer', 'composer');
```

| Type | `"alphabetical"` | `"declared"` |
|---|---|---|
| `crew_job` | `'cinematographer' \| 'composer' \| 'director' \| 'editor' \| 'writer'` | `'director' \| 'writer' \| 'editor' \| 'cinematographer' \| 'composer'` |
| `every.crew_job` | `['cinematographer', 'composer', 'director', 'editor', 'writer']` | `['director', 'writer', 'editor', 'cinematographer', 'composer']` |

- Un label ajouté par `ALTER TYPE … ADD VALUE … BEFORE` ou `AFTER` prend sa place dans cet ordre, tel que le donne `enum_range()`.
- Pour TypeScript, seul `every.<name>` change : une union est le même type dans n’importe quel ordre. Avec [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas), les labels écrits pour un enum d’un autre schéma, et le nouveau placeholder d’un domaine sur l’un d’eux, prennent le même ordre.
- Une autre valeur arrête le générateur avant toute requête, et n’écrit rien : `enumOrder must be 'alphabetical' (the default) or 'declared', not 'declard'`. En TypeScript, elle ne compile pas (TS2322, ou TS2820 avec une suggestion pour un nom proche comme `"declard"`).
- `"alphabetical"` signale, via [`warningListener`](#generate.warningListener), chaque enum généré dont l’ordre déclaré n’est pas alphabétique.

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

`boolean`, ou omis ; un opt-in. Ce que fait une requête qui échoue : une connexion refusée, un mauvais mot de passe, une requête que Postgres refuse.

- Omis, ou `null` : comme dans Zapatos 6.6.1, le générateur affiche `*** error <n> ***` et l’erreur avec `console.log`, puis arrête le processus avec `process.exit(1)` ; entre les deux, il signale l’option via [`warningListener`](#generate.warningListener). À partir de la 7.0, l’option omise vaut `true` ([Versions](/fr/versions)).
- `false` : le même arrêt, sans note. Cette valeur reste en 7.0 et en 8.0 : l’arrêt est le propre chemin de [la CLI](#cli), qui met `false` par-dessus son fichier de configuration et son argument.
- `true` : la promesse de `generate()` est rejetée avec cette erreur, telle que `pg` la donne, et rien n’est affiché :

```ts twoslash
import { generate } from 'zapatos/generate';
// ---cut---
try {
  await generate({ db: { connectionString: process.env.DATABASE_URL }, outDir: './src', rejectOnQueryError: true });
} catch (err) {
  console.error('types not regenerated:', err);  // ECONNREFUSED, or a pg DatabaseError
}
```

- La promesse est rejetée avant toute écriture : les fichiers de la dernière exécution restent tels quels.
- Un `warningListener` qui lève une erreur en recevant la note n’empêche pas l’arrêt.

### `uniqueIndexConstraintsOnly` {#generate.uniqueIndexConstraintsOnly}

`boolean`, par défaut `false` ; un opt-in, `true` par défaut à partir de la 7.0 ([Versions](/fr/versions)). Les noms de l’`UniqueIndex` de chaque relation, ceux qu’accepte [`constraint()`](/fr/insert#constraint). `false`, comme dans Zapatos 6.6.1, liste chaque index unique ; `true` ne liste que l’index de chaque contrainte `UNIQUE` ou `PRIMARY KEY` qui n’est pas `DEFERRABLE`, les noms que Postgres accepte dans `ON CONFLICT ON CONSTRAINT` :

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

| Dans `UniqueIndex` | `false` | `true` | `ON CONFLICT ON CONSTRAINT … DO UPDATE` |
|---|---|---|---|
| `festival_entries_pkey` | oui | oui | accepté |
| `festival_entries_film_festival_key` | oui | oui | accepté |
| `festival_entries_slot_key`, `DEFERRABLE` | oui | non | 55000, `ON CONFLICT does not support deferrable unique constraints/exclusion constraints as arbiters` |
| `festival_entries_live_idx`, un index et pas une contrainte | oui | non | 42704, `constraint "festival_entries_live_idx" for table "festival_entries" does not exist` |

- `true` laisse aussi de côté les index uniques d’une vue matérialisée et, sur Postgres 18, ceux d’une clé `WITHOUT OVERLAPS`, que Postgres traite comme une contrainte d’exclusion : 42809 avec `DO UPDATE`. Une contrainte `EXCLUDE` n’est dans aucune des deux listes, puisque son index n’est pas unique.
- `true` laisse aussi de côté une contrainte dont l’index n’est pas encore valide : celle d’une table partitionnée, ajoutée avec `ALTER TABLE ONLY`, tant que l’index de chaque partition n’est pas attaché ([Partitionnement](https://www.postgresql.org/docs/current/ddl-partitioning.html#DDL-PARTITIONING-DECLARATIVE-MAINTENANCE)). Entre-temps, Postgres répond 42P10, `there is no unique or exclusion constraint matching the ON CONFLICT specification` ; régénérez une fois ces index attachés.
- Une relation qui n’en garde aucun reçoit `never`. `UniqueIndexForTable` et les types agrégés `UniqueIndex` suivent le même changement.
- `false` signale, via [`warningListener`](#generate.warningListener), chaque index unique que `true` laisserait de côté.

### `domainsTypedByContext` {#generate.domainsTypedByContext}

`boolean`, par défaut `false` ; un opt-in, `true` par défaut à partir de la 7.0 ([Versions](/fr/versions)). Le type d’une colonne dont le domaine porte sur `int8`, `numeric`, `bytea`, `money`, `date`, `timestamp` ou `timestamptz`, ou sur un tableau de l’un d’eux : des types que `pg`, le JSON des raccourcis et une écriture donnent chacun à leur façon ([Types de valeurs](/fr/runtime-config#value-types)). `false`, comme dans Zapatos 6.6.1, la type par son placeholder dans les cinq interfaces, qui, tel que généré, contient ce que renvoie `pg` ; `true` la type selon le contexte, comme l’est son type de base, tant que son placeholder contient ce que le générateur y a écrit pour elle. Supposons qu’une réservation ait un numéro de billet :

```sql
CREATE DOMAIN ticket_no AS bigint;
ALTER TABLE seat_bookings ADD COLUMN ticket ticket_no;
```

Son placeholder, `PgTicket_no.d.ts`, contient `db.Int8String`. Les raccourcis renvoient le billet sous forme de nombre JSON, et Postgres l’accepte sous forme de nombre :

| `seat_bookings.ticket` | `false` | `true` |
|---|---|---|
| `Selectable`, une ligne de `pg` | `PgTicket_no`, une chaîne | le même |
| `JSONSelectable`, une ligne des raccourcis | `PgTicket_no`, une chaîne | `number` |
| `Whereable`, `Insertable`, `Updatable` | `PgTicket_no`, une chaîne : `insert()` refuse `ticket: 1` (TS2769) | `number \| Int8String \| bigint` |

- `true` écrit [`DomainInContext`](/fr/runtime-config#DomainInContext) dans les quatre autres interfaces, `db.DomainInContext<c.PgTicket_no, db.Int8String, number>` dans `JSONSelectable` ; un éditeur affiche `number`.
- Un placeholder que vous modifiez, vers tout autre type, type la colonne dans les cinq interfaces, comme avec `false` : `number | db.Int8String`, un type « branded », `any` ou `any[]`. Seul un placeholder qui vaut exactement le type écrit par le générateur est typé selon le contexte. L’option ne change jamais un placeholder, donc l’activer ou la désactiver n’oblige à en modifier aucun.
- Un placeholder écrit par Zapatos 6.6.1 sur `int8` ou `numeric` contient le même type sans son import, et le générateur ne le réécrit jamais : la colonne vaut `any`, avec `false` comme avec `true`, donc `insert()` accepte `ticket: 'abc'`. Sur un tableau de l’un d’eux, il contient `db.Int8String[]` ou `db.NumericString[]`, qui vaut `any[]`, avec `false` comme avec `true` là aussi : `insert()` accepte `nos: ['abc']` et refuse `nos: 'abc'` (TS2769). Dans le placeholder, `tsc` signale TS2503, et rien sous `skipLibCheck`. Ajoutez d’abord son import ([Quand un placeholder ne compile pas](/fr/custom-types#when-a-placeholder-does-not-compile)). Sur `date`, `timestamp`, `timestamptz`, `bytea` ou `money`, le placeholder de la 6.6.1 est celui qu’écrit le générateur.
- Deux domaines qui partagent un placeholder, comme `public.ticket_no AS bigint` et `archive.ticket_no AS date`, tous deux `PgTicket_no` ([`customTypesTransform`](#generate.customTypesTransform)), partagent son type unique, comme le dit la note du générateur `custom types … are both named PgTicket_no` ([`warningListener`](#generate.warningListener)) : `true` type selon le contexte les colonnes du domaine dont le placeholder contient le type, et laisse celles de l’autre typées par le placeholder dans les cinq interfaces, bien que la note de `false` les nomme aussi. Renommez l’un des deux dans la base.
- Chaque type de base prend ses propres types : `numeric` `number`, puis `number | NumericString` ; `date`, `timestamp` et `timestamptz` leur type chaîne, puis celui-ci ou un `Date` ; `bytea` `ByteArrayString`, puis celui-ci ou un `Buffer` ; `money` `string`, puis `number | string` ; un tableau, ceux de son élément, en tableau. Avec [`customJSONParsingForLargeNumbers`](#generate.customJSONParsingForLargeNumbers), `int8` et `numeric` sont `number | Int8String` et `number | NumericString` dans `JSONSelectable`.
- Inchangé : un domaine typé de la même façon dans chaque contexte, comme `seat_label`.
- `false` signale, via [`warningListener`](#generate.warningListener), chaque colonne d’un domaine sur l’un de ces types, que `true` type selon le contexte tant que son placeholder contient ce que le générateur y a écrit pour elle.

Un domaine sur un domaine, ou un tableau d’un domaine, reçoit un placeholder qui contient `any` : le générateur lit le domaine intérieur, ou le type du tableau, comme un type personnalisé. `true` le type dans les cinq interfaces par le type de base de son domaine le plus intérieur, tant que son placeholder contient `any` :

```sql
CREATE DOMAIN vip_ticket_no AS ticket_no;
ALTER TABLE seat_bookings ADD COLUMN vip_ticket vip_ticket_no, ADD COLUMN tickets ticket_no[];
```

| `true` | `vip_ticket` | `tickets` |
|---|---|---|
| `Selectable`, une ligne de `pg` | `Int8String`, comme `pg` parse un `bigint` | `string`, le texte que renvoie `pg` : `'{1,2}'` |
| `JSONSelectable`, une ligne des raccourcis | `number` | `number[]` |
| `Whereable`, `Insertable`, `Updatable` | `number \| Int8String \| bigint` | `(number \| Int8String \| bigint)[]` |

- `false` les type tous deux par leur placeholder, `any`, dans les cinq interfaces, comme Zapatos 6.6.1.
- `pg` parse un domaine sur un domaine selon le type de base de son domaine le plus intérieur, mais renvoie un tableau d’un domaine sous forme de texte, faute de connaître le type de ce tableau : de même pour un domaine sur un tel tableau, directement ou à travers d’autres domaines. Un tableau d’un domaine sur un tableau reste `any`, de même qu’un domaine sur celui-ci, ou qu’un type de base que le générateur ne sait pas traduire, tel que `point`.
- Un enum sous un domaine sur un domaine, ou sous un tableau d’un domaine, s’écrit par son nom quand il appartient au schéma de la relation, et par ses labels quand il appartient à un autre, avec ou sans [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas) : jamais comme l’enum du même nom dans le schéma de la relation. Un simple domaine sur un enum d’un autre schéma garde son placeholder dans les cinq interfaces, et un nouveau placeholder suit `typeEnumsAcrossSchemas` : les labels de l’enum avec l’option ; sans elle, l’enum du même nom dans le schéma de la relation, ou `any` si ce schéma n’en a pas.
- Un placeholder que vous modifiez garde son type dans les cinq, `unknown` compris. Un placeholder modifié vers `any` compte comme laissé tel que généré : écrivez `unknown`, ou laissez l’option désactivée, pour garder une telle colonne non typée.
- `false` signale, via [`warningListener`](#generate.warningListener), chacune de ces colonnes, dans une note à part.

### `enumArraysTypedAsText` {#generate.enumArraysTypedAsText}

`boolean`, ou omis ; un opt-in. Le type `Selectable` d’une colonne dont le type est un tableau d’un enum, ou un domaine sur un tel tableau. Postgres donne au type d’un tel tableau un numéro propre à chaque base, donc `pg` n’a pas de parser pour lui : une ligne de `pg`, comme celle d’une requête [`sql`](/fr/sql-template), contient le texte du tableau, tandis que le JSON des raccourcis contient le tableau. Supposons qu’un membre de l’équipe puisse occuper d’autres postes, et garde ceux qu’il a déjà occupés dans un domaine sur le tableau :

```sql
CREATE DOMAIN job_list AS crew_job[];
ALTER TABLE crew ADD COLUMN other_jobs crew_job[] NOT NULL DEFAULT '{}', ADD COLUMN past_jobs job_list;
```

| `crew.other_jobs` | omis, ou `false` | `true` |
|---|---|---|
| `Selectable`, une ligne de `pg` | `crew_job[]`, bien que `pg` donne `'{writer,editor}'` | `string` |
| `JSONSelectable`, une ligne des raccourcis | `crew_job[]` : `['writer', 'editor']` | le même |
| `Whereable`, `Insertable`, `Updatable` | `crew_job[]` | le même |

- Omis, ou `null` : le tableau, comme dans Zapatos 6.6.1, et le générateur signale via [`warningListener`](#generate.warningListener) chaque colonne que `true` changerait. À partir de la 7.0, l’option omise vaut `true` ([Versions](/fr/versions)).
- `false` : le tableau, sans note, en 7.0 et après : le bon type pour un projet qui le parse avec `pg.types.setTypeParser`, en lui donnant l’OID du type du tableau (`SELECT 'crew_job[]'::regtype::oid`) et le parser de `text[]`, `pg.types.getTypeParser(1009)`.
- `true` : `string`, le texte que renvoie `pg`. Les écritures prennent toujours un tableau, donc le texte d’une ligne de `sql` ne se réécrit pas tel quel : `insert()` et `update()` le refusent (TS2769, TS2322), alors que Postgres l’accepterait.
- Un domaine sur un tel tableau, comme `crew.past_jobs`, prend `db.DomainInContext<c.PgJob_list, crew_job[], string>` dans `Selectable` ([`DomainInContext`](/fr/runtime-config#DomainInContext)) : `string` tant que son placeholder contient ce que le générateur y a écrit, et un placeholder que vous modifiez garde son type. Ses autres interfaces et son placeholder ne changent pas.
- Un tableau d’un enum d’un autre schéma, typé par ses labels avec [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas), ou sinon comme l’enum du même nom dans le schéma de la relation, est lui aussi un `string` dans `Selectable`. Sans l’un ni l’autre, c’est un placeholder `any`, et il le reste. Un tableau d’un domaine sur un enum relève de [`domainsTypedByContext`](#generate.domainsTypedByContext).

### `intervalsTypedAsObjects` {#generate.intervalsTypedAsObjects}

`boolean`, ou omis ; un opt-in. Le type d’une colonne `interval`, d’un `interval[]`, et d’un domaine sur l’un ou l’autre. Le parser de types par défaut de `pg` renvoie un `interval` sous forme d’objet de ses parties, un [`PostgresInterval`](/fr/runtime-config#PostgresInterval) ; le JSON des raccourcis en donne le texte. Disons qu’une séance a un entracte :

```sql
ALTER TABLE screenings ADD COLUMN intermission interval;
```

| `screenings.intermission`, `'15 minutes'` | omis, ou `false` | `true` |
|---|---|---|
| `Selectable`, une ligne venant de `pg` | `string`, bien que `pg` renvoie `{ minutes: 15 }` | `PostgresInterval` |
| `JSONSelectable`, une ligne venant des raccourcis | `string` : `'00:15:00'` | la même chose |
| `Whereable`, `Insertable`, `Updatable` | `string` | `string \| PostgresInterval` |

- Omis, ou `null` : comme dans Zapatos 6.6.1, le texte dans les cinq interfaces, et une note via [`warningListener`](#generate.warningListener) nomme chaque colonne que `true` changerait. À partir de la 7.0, l’option omise vaut `true` ([Versions](/fr/versions)).
- `false` : le texte, sans note. Cette valeur reste en 7.0 et en 8.0, pour un parser de types à vous qui renvoie le texte : `pg.types.setTypeParser(1186, v => v)` pour `interval`, et `1187` aussi pour `interval[]`, dont `pg` garde sinon son propre parser.
- `true` : un `PostgresInterval` dans `Selectable`, un tableau de `PostgresInterval` pour un `interval[]`. Une écriture en reprend un, puisque `pg` l’envoie via son `toPostgres()` ; `insert()` refuse toujours un simple objet comme `{ minutes: 15 }` (TS2769) : Postgres le refuse aussi à partir de sa version 17 (22007), et le stocke comme `00:00:15` jusqu’à la 16.
- `pg` ne lit que l’`IntervalStyle` par défaut, `postgres` : sous `iso_8601`, `sql_standard` ou `postgres_verbose`, son objet revient avec des parties manquantes, souvent `{}`, quoi que dise le type. Les raccourcis donnent le texte, dans ce style.
- Un domaine sur l’un d’eux suit la même règle : un nouveau placeholder contient `db.PostgresInterval`, et avec [`domainsTypedByContext`](#generate.domainsTypedByContext) sa colonne est typée selon le contexte, comme l’est un domaine sur `date`. Un domaine sur un tel domaine prend `PostgresInterval` dans `Selectable` avec `domainsTypedByContext` ; un tableau d’un domaine y reste `string`, le texte que renvoie `pg`. Un placeholder écrit auparavant contient `string`, et le générateur ne le réécrit jamais.

### `progressListener` {#generate.progressListener}

`boolean`, ou dans `generate()` une fonction `(s: string) => void` ; par défaut `false`. `true` affiche chaque étape avec `console.log` ; une fonction reçoit chaque ligne. Depuis [`check()`](#check), une ligne : `The generated files in src/zapatos are up to date.`

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
  - une fois par exécution pour chaque nom TypeScript que prennent deux schémas, relations ou enums d’une même portée ;
- `Note: custom types "public"."SEAT_LABEL" (PgSEAT_LABEL) and "public"."seat_label" (PgSeat_label) have TypeScript names that differ only in case: on a case-insensitive file system, the default on macOS and Windows, PgSEAT_LABEL.d.ts and PgSeat_label.d.ts are one placeholder file in src/zapatos/custom, which declares only one of those names. To type them apart, rename one of them in the database, or give customTypesTransform a function that keeps their names apart.`
  - une fois par exécution pour des noms qui ne diffèrent que par la casse, quel que soit le système de fichiers, avant la note ci-dessus pour chacun de ces noms que partagent deux types Postgres ;
- `Note: custom type "public"."index" (index) has the placeholder file index.d.ts in src/zapatos/custom, the file of the custom types' index: the generator writes the index over it on every run, so index is never declared. To declare it, rename it in the database, or give customTypesTransform a function that names it otherwise.`
  - une fois par exécution pour les noms dont le placeholder est `custom/index.d.ts` : `index` et, sur un système de fichiers insensible à la casse, un nom qui n’en diffère que par la casse (`Index`, `INDEX`), après la note ci-dessus pour ces noms ;
- `Note: the include entry "Films" of schema "public" matches no relation there, so it generates nothing. Check its spelling and case, that the relation is in schema "public", and that the database role has a privilege on it: include names tables, views, materialised views and foreign tables.`
  - une fois par exécution pour chaque entrée d’une liste [`include`](#generate.schemas) que son schéma n’a pas ;
- `Note: the schemas rule of "public" has no exclude, so it takes "exclude": [], as the default rule does. Write the key in the rule to silence this note.`
  - après l’écriture, pour chaque règle de [`schemas`](#generate.schemas) qui omet `include` ou `exclude`, ou le met à `null` ; pour les deux, `has no include nor exclude, so it takes "include": "*" and "exclude": []` ;
- `Note: the schemas rule of "public" gives include as a string, "films", so it is read as the list ["films"]. Zapatos 6.6.1 also matched each relation whose name is part of the string. Write the list to silence this note.`
  - après l’écriture, pour chaque `include` ou `exclude` d’une règle de [`schemas`](#generate.schemas) donné sous forme de chaîne autre que `"*"` ;
- la note sur les colonnes `bigint` et `numeric`, une fois par processus ([`customJSONParsingForLargeNumbers`](#generate.customJSONParsingForLargeNumbers)) ;
- `` Note: public.prints.format (archive.print_format), public.prints.formats (archive.print_format[]) and public.prints.keeper (archive.crew_job) have a type of another schema, which is looked up by name in the schema of their relation: an enum becomes an `any` custom type, or the enum of the same name there. Set typeEnumsAcrossSchemas: true to look it up in its own schema; it will be the default in pgcast 7.0. ``
  - une fois par exécution, sans [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas), quand une colonne qu’il changerait est générée ;
- `` Note: every.crew_job lists the labels of enum public.crew_job in alphabetical order, not in their declared order, by which Postgres sorts and compares them. Set enumOrder: 'declared' to keep that order; it will be the default in pgcast 7.0. ``
  - une fois par exécution, avec [`enumOrder`](#generate.enumOrder) à `"alphabetical"`, quand un schéma de [`schemas`](#generate.schemas) a un enum dont l’ordre déclaré n’est pas alphabétique ; s’il y en a plusieurs, sous la forme `every.<name> lists the labels of enums archive.print_format and public.crew_job` ;
- `Note: UniqueIndex lists public.festival_entries.festival_entries_live_idx and public.festival_entries.festival_entries_slot_key, unique indexes of no UNIQUE or PRIMARY KEY constraint, of a DEFERRABLE or WITHOUT OVERLAPS one, or not yet valid: db.constraint() takes them, and Postgres refuses them in ON CONFLICT ON CONSTRAINT ... DO UPDATE, and in ... DO NOTHING except a WITHOUT OVERLAPS key. Set uniqueIndexConstraintsOnly: true to leave them out; it will be the default in pgcast 7.0.`
  - une fois par exécution, sans [`uniqueIndexConstraintsOnly`](#generate.uniqueIndexConstraintsOnly), quand une relation générée a un index unique que l’option laisserait de côté ; s’il n’y en a qu’un, sous la forme `lists public.festival_entries.festival_entries_live_idx, a unique index of no UNIQUE or PRIMARY KEY constraint` ;
- `Note: public.seat_bookings.ticket (public.ticket_no) has a domain over a type typed by context, such as int8 or date: as generated, its placeholder types it in all five interfaces as pg returns it, though a write takes more and, except for money, the shortcuts' JSON gives another type. Set domainsTypedByContext: true to type it by context while its placeholder holds what the generator wrote for it; it will be the default in pgcast 7.0.`
  - une fois par exécution, sans [`domainsTypedByContext`](#generate.domainsTypedByContext), quand une colonne générée a un tel domaine ; s’il y en a plusieurs, sous la forme `public.screenings.premiere (public.premiere_day) and public.seat_bookings.ticket (public.ticket_no) have domains over a type typed by context` ;
- `` Note: public.seat_bookings.tickets (public.ticket_no[]) and public.seat_bookings.vip_ticket (public.vip_ticket_no) have domains over a domain, or arrays of a domain: as generated, their placeholders type them as `any`. Set domainsTypedByContext: true to type them by the base type of the innermost domain while their placeholders hold `any`; it will be the default in pgcast 7.0. ``
  - une fois par exécution, sans [`domainsTypedByContext`](#generate.domainsTypedByContext), quand une colonne générée a un tel type, sur un type de base que le générateur sait traduire ; s’il n’y en a qu’une, sous la forme `public.seat_bookings.vip_ticket (public.vip_ticket_no) has a domain over a domain, or an array of a domain` ;
- `Note: public.crew.other_jobs (public.crew_job[]) is an array of an enum, which pg returns as its text, such as '{a,b}', though Selectable types it as an array. Set enumArraysTypedAsText: true to type it as a string there, or false to keep the array if pg.types.setTypeParser parses it; true will be the default in pgcast 7.0.`
  - une fois par exécution, avec [`enumArraysTypedAsText`](#generate.enumArraysTypedAsText) omis, quand une colonne générée a un tel type ; s’il y en a plusieurs, sous la forme `public.crew.other_jobs (public.crew_job[]) and public.crew.past_jobs (public.job_list) are arrays of an enum` ;
- `Note: public.screenings.intermission (interval) is of interval or of a type that wraps it in arrays or domains: as generated, it is typed as its text, though pg's default type parser returns an interval from a query of your own as an object, a PostgresInterval. Set intervalsTypedAsObjects: true to type it as pg parses it; it will be the default in pgcast 7.0. Set it to false to keep the text, if a type parser of yours returns it.`
  - une fois par exécution, avec [`intervalsTypedAsObjects`](#generate.intervalsTypedAsObjects) omis, quand une colonne générée est de type `interval` ou `interval[]` ou d’un domaine sur l’un ou l’autre, et, avec `domainsTypedByContext`, aussi de tout type qui enveloppe `interval` dans des domaines et au plus un tableau, comme un domaine sur un tel domaine ou un tableau d’un domaine sur `interval` ; s’il y en a plusieurs, sous la forme `… and public.screenings.intermission (interval) are of interval` ;
- `Note: src/zapatos/schema.d.ts is here too, generated with moduleNames: 'zapatos'. It declares 'zapatos/schema', as src/pgcast/schema.d.ts does, and TypeScript merges the two: types can loosen, silently under skipLibCheck. Delete the folder src/zapatos, once any placeholder you edited there is moved to src/pgcast/custom.`
  - après l’écriture, avec [`moduleNames`](#generate.moduleNames) à `"pgcast"`, quand `outDir` contient un `zapatos/schema.d.ts` ; un dossier sans son `schema.d.ts` n’est pas signalé ;
- `Note: src/pgcast/schema.d.ts is here too, generated with moduleNames: 'pgcast'. Its import of 'pgcast/db' fails to compile without skipLibCheck. Delete the folder src/pgcast, once any placeholder you edited there is moved to src/zapatos/custom.`
  - de même, avec `"zapatos"` et un `pgcast/schema.d.ts` ;
- `Note: pgcastconfig.json and zapatosconfig.json are both here, and only pgcastconfig.json is read. Move any option you still need from zapatosconfig.json into pgcastconfig.json, then delete zapatosconfig.json.`
  - depuis [la CLI](#cli), avant de générer, quand le dossier où elle tourne contient les deux fichiers ;
- `Note: unknown flag --chek ignored: the only flag is --check, before or after the JSON argument.`
  - depuis [la CLI](#cli), avant de générer ou de vérifier, pour chaque argument après `config` qui commence par `--` et n’est pas `--check` ;
- `Note: a query failed, so generate() ends the process with process.exit(1), and its promise never settles (PGCAST_DEP006). Set rejectOnQueryError: true to reject with the error instead; it will be the default in pgcast 7.0.`
  - sans [`rejectOnQueryError`](#generate.rejectOnQueryError), quand une requête échoue, après l’erreur et juste avant l’arrêt ;
- l’[avertissement sur l’ancienne arborescence](#the-old-layout-warning) ;
- `Out of date: src/zapatos/schema.d.ts` et `Missing: src/zapatos/custom/PgSeat_label.d.ts`
  - depuis [`check()`](#check), pour chaque fichier qui diffère ou manque, après les notes d’une exécution.

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

## Les fichiers qu’il écrit {#the-files-it-writes}

```txt
src/zapatos/
├── schema.d.ts            written again on each run
└── custom/
    ├── index.d.ts         written again on each run
    ├── PgPoint.d.ts       written once, if it is not there
    └── PgSeat_label.d.ts  written once, if it is not there
```

<div class="stack">

| Fichier | Écrit | Contient |
|---|---|---|
| `schema.d.ts` | à chaque exécution | `declare module 'zapatos/schema'` : un espace de noms par relation, son `Table`, `Selectable`, `JSONSelectable`, `Whereable`, `Insertable`, `Updatable`, `UniqueIndex`, `Column`, `OnlyCols`, `SQLExpression` et `SQL` ; chaque enum, et son tuple `every.<name>` ; `Schema` et le tuple `AllSchemas` ; par schéma et sur l’ensemble, les unions (`Table`, `Selectable`…) et les tuples `AllBaseTables`, `AllForeignTables`, `AllViews`, `AllMaterializedViews` et `AllTablesAndViews` ; les lookups `*ForTable<T>` ; le canary de version |
| `custom/index.d.ts` | à chaque exécution, quand il y a un type personnalisé | un `declare module 'zapatos/custom'` vide |
| `custom/<Name>.d.ts` | une fois : jamais écrasé | un placeholder, `export type PgSeat_label = string;`, à modifier vous-même |

</div>

- Un placeholder contient le type `Selectable` du type de base du domaine : `string` pour `seat_label`, un `text` ; `Date` pour un domaine `date` ; `db.JSONValue` pour un domaine `json` ou `jsonb`, avec son `import type * as db from 'zapatos/db'`. Un type que le générateur ne sait pas convertir (`point`) reçoit `any`. Pour le compléter : [Types personnalisés](/fr/custom-types).
- Un type de base converti en un autre type `db.*` (`int8`, `numeric`, `time`, les types range…) reçoit le même import : `export type PgTicket_no = db.Int8String;` vient avec `import type * as db from 'zapatos/db';`. Un domaine sur un enum l’importe : `import type { genre } from 'zapatos/schema';` au-dessus de `export type PgGenre_d = genre;`. Zapatos 6.6.1 n’importait `db` que pour `db.JSONValue`, donc ses placeholders sur ces types ne compilaient pas ([#184](https://github.com/AlexandreDemartin/pgcast/issues/184)) : [Quand un placeholder ne compile pas](/fr/custom-types#when-a-placeholder-does-not-compile).
- Rien n’est supprimé : un placeholder dont le type a disparu reste, et `custom/` aussi une fois qu’il ne reste plus de type personnalisé.
- `schema.d.ts` déclare `schemaVersionCanary`, `version: 104`. Un `zapatos/db` qui attend une autre version ne compile pas à cet endroit : relancez la génération ([`SchemaVersionCanary`](/fr/runtime-config#SchemaVersionCanary)).
- Chaque fichier est un `declare module` des noms `zapatos/*`, donc votre `tsconfig.json` doit l’inclure : `"include": ["src"]`, avec `outDir` à `"./src"`.
- Avec [`moduleNames`](#generate.moduleNames) à `"pgcast"`, l’arborescence est `src/pgcast/` et les noms `pgcast/*` ; le reste de cette section est identique.

### L’avertissement sur l’ancienne arborescence {#the-old-layout-warning}

Avant la 3.0, Zapatos copiait sa source dans la vôtre. Une fois les fichiers écrits, quand `outExt` n’est pas `".ts"`, le générateur cherche cette arborescence : `zapatos/schema.ts`, un dossier `zapatos/src`, ou un fichier sous `zapatos/custom` qui ne se termine pas par `.d.ts`. S’il en trouve une, il avertit, via [`warningListener`](#generate.warningListener), avec les étapes de la migration :

```txt
*** IMPORTANT: ZAPATOS NO LONGER COPIES ITS SOURCE TO YOUR SOURCE TREE ***
```

Repasser de `outExt: ".ts"` à `".d.ts"` déclenche donc aussi l’avertissement, jusqu’à ce que vous supprimiez les fichiers `.ts`.

Pourquoi les types ont cette forme, avec un `timestamptz` qui est un `Date` dans `Selectable` et une chaîne dans `JSONSelectable` : [Le catalogue](/fr/catalog-types).
