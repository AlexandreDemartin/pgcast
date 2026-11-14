---
english: 521a94ef75bb
---

# Générateur

Le générateur lit le catalogue de votre base et écrit les types de `zapatos/schema`. Cette page indique comment le lancer, en ligne de commande ou depuis du code, chaque option de `zapatosconfig.json` et de `generate()`, et les fichiers qu’il écrit.
{.lede}

## La CLI {#cli}

```sh
npx pgcast [config]
npx zapatos [config]
```

Le même programme sous deux noms : `pgcast`, et `zapatos`, comme dans Zapatos 6.6.1. Il lit la config, puis lance [`generate()`](#generate) avec elle.

- `zapatosconfig.json` : lu dans le dossier où vous le lancez, s’il y est ; jamais dans un dossier parent. Sans lui, la config est `{}`.
- `config` : un argument facultatif, un objet JSON, fusionné par-dessus le fichier clé par clé : `npx pgcast '{"outDir": "./generated"}'` garde le `db` du fichier et remplace son `outDir`.
  - Une clé donnée ici remplace toute la valeur du fichier, donc `'{"db": {"application_name": "codegen"}}'` écarte le `connectionString` du fichier.
  - Les variables du fichier sont substituées avant la fusion : une variable qu’il nomme doit être définie même quand l’argument remplace sa clé, sinon la CLI s’arrête avec `Environment variable 'NAME' is not set`.
- Dans chaque chaîne des deux, à toute profondeur, les variables d’environnement sont substituées ([Variables d’environnement](#environment-variables)).
- Il n’y a pas de flags : `--help` est lu comme l’argument JSON, et échoue. Tout argument après le premier est ignoré.
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

- le fichier : `If present, zapatosconfig.json must be a valid JSON file, and all referenced environment variables must exist:`
- l’argument : `If present, the argument to Zapatos must be valid JSON, and all referenced environment variables must exist:`

Puis elle se termine par la cause :

| Cause | Fin |
|---|---|
| JSON invalide | le message de `JSON.parse`, qui dépend de l’entrée et de Node : sur Node 22, `Unexpected end of JSON input` pour un fichier vide, `No number after minus sign in JSON at position 1 (line 1 column 2)` pour `--help`, `Expected double-quoted property name in JSON at position 15 (line 1 column 16)` pour une virgule finale |
| une variable n’est pas définie | `Environment variable 'DATABASE_URL' is not set` |

Une requête qui échoue, connexion comprise, l’arrête aussi avec le code 1, comme le dit [`generate()`](#generate).

### Variables d’environnement {#environment-variables}

<code v-pre>{{NAME}}</code> dans une chaîne de la config est remplacé par `process.env.NAME`, avant tout le reste.

- N’importe où dans une chaîne, plusieurs par chaîne : <code v-pre>"postgresql://{{PGUSER}}@localhost/films"</code>.
- Les espaces entre les accolades sont autorisés : <code v-pre>{{ DATABASE_URL }}</code>.
- Dans les valeurs seulement, à toute profondeur d’objets et de tableaux ; jamais dans les clés : <code v-pre>"schemas": { "{{SCHEMA}}": … }</code> est un schéma nommé <code v-pre>{{SCHEMA}}</code>. Les nombres et les booléens passent tels quels.
- Une variable qui vaut la chaîne vide compte comme définie, et donne `""`.
- Seule la CLI fait cela, pour le fichier et pour son argument. [`generate()`](#generate) prend sa config telle quelle : lisez `process.env` vous-même.

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
- Une requête qui échoue, connexion comprise, affiche `*** error <n> ***` et l’erreur avec `console.log`, puis arrête le processus avec `process.exit(1)`, comme dans Zapatos 6.6.1 ([#183](https://github.com/AlexandreDemartin/pgcast/issues/183)). Quand une requête échoue, la promesse ne se résout jamais et n’est jamais rejetée : un `try`/`catch` autour ne s’exécute donc pas.
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
| [`enumOrder`](#generate.enumOrder) | `"alphabetical"` | l’ordre des libellés d’un enum |
| [`progressListener`](#generate.progressListener) | `false` | où chaque étape est signalée |
| [`warningListener`](#generate.warningListener) | `true` | où vont les avertissements |
| [`debugListener`](#generate.debugListener) | `false` | où vont chaque requête et son résultat |

### `db` {#generate.db}

`pg.ClientConfig` : ce que vous donneriez à `new pg.Pool()`, un `connectionString` ou `host`, `user`, `database` et le reste. Sans lui, `pg` prend ses valeurs par défaut et les variables d’environnement `PGHOST`, `PGUSER`, `PGDATABASE`…

### `outDir` {#generate.outDir}

`string`, par défaut `"."`. Le dossier qui accueille le dossier `zapatos`, créé si besoin : `"./src"` écrit `src/zapatos/schema.d.ts`. Relatif au dossier courant.

### `outExt` {#generate.outExt}

`string`, par défaut `".d.ts"`. L’extension de chaque fichier écrit, fichiers à compléter compris : `".ts"` écrit `zapatos/schema.ts`, `zapatos/custom/PgPoint.ts`. Seuls les noms changent ; le contenu est le même texte `declare module`. Avec `".ts"`, le générateur ne cherche pas l’[ancienne arborescence](#the-old-layout-warning).

### `schemas` {#generate.schemas}

`{ [schema]: { include, exclude } }`, `include` et `exclude` valant chacun `"*"` ou un tableau de noms de relations. Les schémas à générer, et quelles relations de chacun : tables, vues, vues matérialisées et tables distantes.

Les deux clés sont obligatoires. Dans `generate()`, une règle sans l’une d’elles ne compile pas (TS2741) ; dans le JSON, la CLI s’arrête avec `TypeError: Cannot read properties of undefined (reading 'indexOf')` ([#301](https://github.com/AlexandreDemartin/pgcast/issues/301)).

| Règle | Génère |
|---|---|
| `{ "include": "*", "exclude": [] }` | chaque relation du schéma |
| `{ "include": ["films", "studios"], "exclude": [] }` | `films` et `studios` |
| `{ "include": "*", "exclude": ["seat_bookings"] }` | tout sauf `seat_bookings` |
| `{ "include": ["films", "studios"], "exclude": ["studios"] }` | `films` : `exclude` l’emporte |
| `{ "include": "*", "exclude": "*" }` | aucune relation, mais toujours les enums du schéma |

- Les noms doivent correspondre exactement, casse comprise. Un nom d’`include` que le schéma n’a pas ne génère rien, et le générateur émet un avertissement via [`warningListener`](#generate.warningListener) ; un schéma que la base n’a pas donne un namespace vide, et un avertissement pour chaque nom que liste son `include`. Avec `"exclude": "*"`, rien n’est vérifié.
- Les relations sont celles que le rôle de la base peut voir : une table ou une vue sur laquelle il n’a aucun privilège est laissée de côté, comme si elle n’existait pas ; une vue matérialisée apparaît toujours.
- Les enums du schéma sont toujours générés, quoi que disent `include` et `exclude`.
- Les relations d’un schéma autre qu’[`unprefixedSchema`](#generate.unprefixedSchema) sont dans son namespace : `archive.screenings`, de type `Table` `'archive.screenings'`.
- Un schéma, une relation ou un enum dont le nom n’est pas un identifiant TypeScript (`"box office"`) est écrit tel quel, et `schema.d.ts` ne compile pas (TS1005) ([#48](https://github.com/AlexandreDemartin/pgcast/issues/48)). Le nom d’une colonne, lui, est mis entre guillemets, et fonctionne.

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

- `null` : chaque relation est préfixée, `public.films` son namespace et `'public.films'` son type `Table`. Une requête la nomme ainsi, `db.select('public.films', db.all)`, et le SQL aussi : `FROM "public"."films"`. `db.select('films', db.all)` ne compile plus.
- Mettez-le à `null` quand un schéma porte le nom d’une relation de `public` : un schéma `films` à côté de la table `films` crée deux namespaces `films`, que TypeScript fusionne, et `schema.d.ts` échoue avec TS2300, `Duplicate identifier 'Table'`.
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

`"PgMy_type" | "my_type" | "PgMyType"`, ou dans `generate()` une fonction `(name: string) => string` ; par défaut `"PgMy_type"`. Le nom TypeScript de chaque type que le générateur vous laisse : un domaine, ou un type qu’il ne sait pas convertir, comme `point`. Chacun reçoit un [fichier à compléter](#the-files-it-writes), et la colonne le type `c.<name>`.

| Valeur | `seat_label` | `point` | `point[]` |
|---|---|---|---|
| `"PgMy_type"` | `PgSeat_label` | `PgPoint` | `Pg_point` |
| `"my_type"` | `seat_label` | `point` | `_point` |
| `"PgMyType"` | `PgSeatLabel` | `PgPoint` | `Pg_Point` |
| `name => 'Db_' + name` | `Db_seat_label` | `Db_point` | `Db__point` |

- La fonction reçoit le nom du domaine, ou le nom que Postgres donne au type, `_point` pour un tableau de `point`.
- Un tableau d’un domaine ou d’un tel type est un type personnalisé à part entière.
- Les noms ne sont pas qualifiés par schéma : le namespace `c` est commun à tous les schémas, donc un domaine `notes` dans `public` et un autre dans `archive` sont tous deux `PgNotes`, avec un seul fichier à compléter pour les deux.
  - Le générateur le signale via [`warningListener`](#generate.warningListener), comme pour deux noms qu’une transformation réduit à un seul (`seat-label` et `seat_label`), et garde le nom, dont dépend un fichier à compléter déjà modifié.

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
- Dans un commentaire sur plusieurs lignes, chaque ligne est précédée d’un `*`, que les sauts de ligne soient `\n`, `\r\n` ou `\r`.
- Chaque relation montre ses propres commentaires, quelle que soit sa nature : Postgres n’en copie aucun vers une partition, une table qui hérite ou une vue, donc une vue sur `roles` ne montre aucun commentaire sur `billing`.
- Sur une table ou une vue matérialisée, un commentaire contenant `*/` termine là le JSDoc, donc `schema.d.ts` ne compile généralement pas (TS1131), jusqu’à ce que [#48](https://github.com/AlexandreDemartin/pgcast/issues/48) l’échappe. Ses lignes après la première sont écrites comme Zapatos 6.6.1 les écrit, sans `*`, donc un commentaire qui compile sous 6.6.1, en ouvrant un commentaire après son `*/`, compile toujours. Sur une vue, une table distante ou une table partitionnée, dont Zapatos 6.6.1 n’écrivait jamais les commentaires de colonnes, un tel commentaire est laissé de côté ([#48](https://github.com/AlexandreDemartin/pgcast/issues/48)).
- Un commentaire, ou l’une de ses lignes, qui commence par une balise JSDoc (`@deprecated use lead`) devient cette balise au survol, sur toute relation, et avale les lignes générées qui la suivent ([#309](https://github.com/AlexandreDemartin/pgcast/issues/309)).

`false` n’en écrit aucun, donc `schema.d.ts` est plus court.

### `customJSONParsingForLargeNumbers` {#generate.customJSONParsingForLargeNumbers}

`boolean`, par défaut `false`. Le type `JSONSelectable` d’une colonne `bigint` (`int8`) ou `numeric`, pour un projet qui analyse le JSON avec [`enableCustomJSONParsingForLargeNumbers()`](/fr/runtime-config#enableCustomJSONParsingForLargeNumbers) :

| Colonne | `false` | `true` |
|---|---|---|
| `int8` | `number` | `(number \| db.Int8String)` |
| `numeric` | `number` | `(number \| db.NumericString)` |

- Les autres interfaces ne changent pas : `Selectable` est `db.Int8String` ou `db.NumericString` dans les deux cas.
- `true` fait aussi taire l’avertissement que donne une telle colonne : `Note: this database has bigint/int8 and/or numeric/decimal columns, for which JSON.parse may lose precision…`.

### `typeEnumsAcrossSchemas` {#generate.typeEnumsAcrossSchemas}

`boolean`, par défaut `false` ; un opt-in, `true` par défaut à partir de la 7.0 ([Versions](/fr/versions)). Le type d’une colonne dont le type est un enum d’un autre schéma. `false`, comme dans Zapatos 6.6.1, cherche l’enum par son nom dans le schéma de la relation de la colonne ; `true` le cherche dans son propre schéma, et écrit ses libellés :

```sql
CREATE SCHEMA archive;
CREATE TYPE archive.print_format AS ENUM ('nitrate', 'safety', 'digital');
CREATE TYPE archive.crew_job AS ENUM ('projectionist', 'archivist');  -- public has a crew_job too
CREATE TABLE prints (id int PRIMARY KEY, format archive.print_format NOT NULL, formats archive.print_format[], keeper archive.crew_job);
```

| Colonne de `prints` | `false` | `true` |
|---|---|---|
| `format` | `c.PgPrint_format`, un fichier à compléter `any` | `('digital' \| 'nitrate' \| 'safety')` |
| `formats` | `c.Pg_print_format \| null`, un fichier à compléter `any` | `('digital' \| 'nitrate' \| 'safety')[] \| null` |
| `keeper` | `crew_job \| null` : les libellés de `public.crew_job` | `('archivist' \| 'projectionist') \| null` |

- Les libellés sont écrits en toutes lettres, pas nommés : le schéma de l’enum n’a pas besoin d’être dans [`schemas`](#generate.schemas). Dans l’ordre d’[`enumOrder`](#generate.enumOrder), comme pour chaque enum.
- Un domaine sur un tel enum reste un type personnalisé, `c.<name>` ; son nouveau fichier à compléter reçoit les libellés plutôt que `any`. Un fichier à compléter existant n’est jamais écrasé.
- `false` signale, via [`warningListener`](#generate.warningListener), les colonnes que `true` changerait, chacune avec son type : pour un domaine, son type sous-jacent.

### `enumOrder` {#generate.enumOrder}

`"alphabetical"` ou `"declared"`, par défaut `"alphabetical"` ; un opt-in, `"declared"` par défaut à partir de la 7.0 ([Versions](/fr/versions)). L’ordre des libellés d’un enum. `"alphabetical"`, comme dans Zapatos 6.6.1, les trie ; `"declared"` garde l’ordre dans lequel l’enum les déclare, celui par lequel Postgres trie et compare ses valeurs (`ORDER BY`, `<`, `enum_range()`) :

```sql
CREATE TYPE crew_job AS ENUM ('director', 'writer', 'editor', 'cinematographer', 'composer');
```

| Type | `"alphabetical"` | `"declared"` |
|---|---|---|
| `crew_job` | `'cinematographer' \| 'composer' \| 'director' \| 'editor' \| 'writer'` | `'director' \| 'writer' \| 'editor' \| 'cinematographer' \| 'composer'` |
| `every.crew_job` | `['cinematographer', 'composer', 'director', 'editor', 'writer']` | `['director', 'writer', 'editor', 'cinematographer', 'composer']` |

- Un libellé ajouté par `ALTER TYPE … ADD VALUE … BEFORE` ou `AFTER` prend sa place dans cet ordre, tel que le donne `enum_range()`.
- Pour TypeScript, seul `every.<name>` change : une union est le même type dans n’importe quel ordre. Avec [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas), les libellés écrits pour un enum d’un autre schéma, et le nouveau fichier à compléter d’un domaine sur l’un d’eux, prennent le même ordre.
- Une autre valeur arrête le générateur avant toute requête, et n’écrit rien : `enumOrder must be 'alphabetical' (the default) or 'declared', not 'declard'`. En TypeScript, elle ne compile pas (TS2322, ou TS2820 avec une suggestion pour une faute proche comme `"declard"`).
- `"alphabetical"` signale, via [`warningListener`](#generate.warningListener), chaque enum généré dont l’ordre déclaré n’est pas alphabétique.

### `progressListener` {#generate.progressListener}

`boolean`, ou dans `generate()` une fonction `(s: string) => void` ; par défaut `false`. `true` affiche chaque étape avec `console.log` ; une fonction reçoit chaque ligne.

```txt
(Re)creating schema folder: src/zapatos/schema.d.ts
Writing generated schema: src/zapatos/schema.d.ts
Custom type or domain declaration file already exists: src/zapatos/custom/PgPoint.d.ts
Custom type or domain declaration file already exists: src/zapatos/custom/PgSeat_label.d.ts
Writing custom types file: src/zapatos/custom/index.d.ts
```

### `warningListener` {#generate.warningListener}

`boolean`, ou dans `generate()` une fonction `(s: string) => void` ; par défaut `true`, avec `console.log`. `false` fait taire :

- `Writing new custom type or domain placeholder file: src/zapatos/custom/PgPoint.d.ts`, une fois par nouveau fichier à compléter ;
- `Note: custom types "archive"."notes" and "public"."notes" are both named PgNotes in TypeScript, so they share one type and one placeholder file, src/zapatos/custom/PgNotes.d.ts. To type them apart, rename one of them in the database.`
  - une fois par exécution pour chaque nom que partagent deux types Postgres ([`customTypesTransform`](#generate.customTypesTransform)) ; quand leurs noms diffèrent, il ajoute qu’une fonction `customTypesTransform` peut les distinguer ;
- `Note: the include entry "Films" of schema "public" matches no relation there, so it generates nothing. Check its spelling and case, that the relation is in schema "public", and that the database role has a privilege on it: include names tables, views, materialised views and foreign tables.`
  - une fois par exécution pour chaque entrée d’une liste [`include`](#generate.schemas) que son schéma n’a pas ;
- la note sur les colonnes `bigint` et `numeric`, une fois par processus ([`customJSONParsingForLargeNumbers`](#generate.customJSONParsingForLargeNumbers)) ;
- `` Note: public.prints.format (archive.print_format), public.prints.formats (archive.print_format[]) and public.prints.keeper (archive.crew_job) have a type of another schema, which is looked up by name in the schema of their relation: an enum becomes an `any` custom type, or the enum of the same name there. Set typeEnumsAcrossSchemas: true to look it up in its own schema; it will be the default in pgcast 7.0. ``
  - une fois par exécution, sans [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas), quand une colonne qu’il changerait est générée ;
- `` Note: every.crew_job lists the labels of enum public.crew_job in alphabetical order, not in their declared order, by which Postgres sorts and compares them. Set enumOrder: 'declared' to keep that order; it will be the default in pgcast 7.0. ``
  - une fois par exécution, avec [`enumOrder`](#generate.enumOrder) à `"alphabetical"`, quand un schéma de [`schemas`](#generate.schemas) a un enum dont l’ordre déclaré n’est pas alphabétique ; s’il y en a plusieurs, sous la forme `every.<name> lists the labels of enums archive.print_format and public.crew_job` ;
- l’[avertissement sur l’ancienne arborescence](#the-old-layout-warning).

### `debugListener` {#generate.debugListener}

`boolean`, ou dans `generate()` une fonction `(s: string) => void` ; par défaut `false`. Reçoit chaque requête que le générateur envoie, `>>> query <n> >>>`, son texte et ses valeurs, puis son résultat tel que `pg` le renvoie, en JSON, `<<< result <n> <<<`.

Les relations sont lues en parallèle : avec plusieurs, les résultats reviennent entremêlés, et le numéro d’une requête peut changer d’une exécution à l’autre, donc c’est `<n>` qui associe un résultat à sa requête.

Les index uniques de `tags`, avec `"schemas": { "public": { "include": ["tags"], "exclude": [] } }`, coupés après ses lignes :

```txt
>>> query 3 >>>
SELECT DISTINCT i.indexname
FROM pg_catalog.pg_indexes i
JOIN pg_catalog.pg_class c ON c.relname = i.indexname
JOIN pg_catalog.pg_index idx ON idx.indexrelid = c.oid AND idx.indisunique
WHERE i.tablename = $1 AND i.schemaname = $2
ORDER BY i.indexname
+ ["tags","public"]

<<< result 3 <<<
{
  "command": "SELECT",
  "rowCount": 1,
  "oid": null,
  "rows": [
    {
      "indexname": "tags_pkey"
    }
  ],
  …
```

Le résultat est l’objet `Result` entier de `pg` : après `rows` viennent `fields`, les types de ses colonnes, et environ soixante-dix lignes consacrées aux analyseurs de types internes de `pg`, les mêmes pour chaque requête.

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
| `schema.d.ts` | à chaque exécution | `declare module 'zapatos/schema'` : un namespace par relation, son `Table`, `Selectable`, `JSONSelectable`, `Whereable`, `Insertable`, `Updatable`, `UniqueIndex`, `Column`, `OnlyCols`, `SQLExpression` et `SQL` ; chaque enum, et son tuple `every.<name>` ; `Schema` et le tuple `AllSchemas` ; par schéma et sur l’ensemble, les unions (`Table`, `Selectable`…) et les tuples `AllBaseTables`, `AllForeignTables`, `AllViews`, `AllMaterializedViews` et `AllTablesAndViews` ; les correspondances `*ForTable<T>` ; le canary de version |
| `custom/index.d.ts` | à chaque exécution, quand il y a un type personnalisé | un `declare module 'zapatos/custom'` vide |
| `custom/<Name>.d.ts` | une fois : jamais écrasé | un fichier à compléter, `export type PgSeat_label = string;`, à modifier vous-même |

</div>

- Un fichier à compléter contient le type `Selectable` du type de base du domaine : `string` pour `seat_label`, un `text` ; `Date` pour un domaine `date` ; `db.JSONValue` pour un domaine `json` ou `jsonb`, avec son `import type * as db from 'zapatos/db'`. Un type que le générateur ne sait pas convertir (`point`) reçoit `any`. Pour le compléter : [Types personnalisés](/fr/custom-types).
- Un type de base converti en un autre type `db.*` (`int8`, `numeric`, `time`, les types range…) donne un fichier à compléter qui ne compile pas tant que vous ne l’avez pas modifié : `export type PgTicket_no = db.Int8String;` vient sans import, et `tsc` échoue avec TS2503, `Cannot find namespace 'db'` ([#184](https://github.com/AlexandreDemartin/pgcast/issues/184)). Ajoutez `import type * as db from 'zapatos/db';` au-dessus.
- Même chose pour un domaine sur un enum : `export type PgGenre_d = genre;` échoue avec TS2304 tant que vous n’ajoutez pas `import type { genre } from 'zapatos/schema';`.
- Rien n’est supprimé : un fichier à compléter dont le type a disparu reste, et `custom/` aussi une fois qu’il ne reste plus de type personnalisé.
- `schema.d.ts` déclare `schemaVersionCanary`, `version: 104`. Un `zapatos/db` qui attend une autre version ne compile pas à cet endroit : relancez la génération ([`SchemaVersionCanary`](/fr/runtime-config#SchemaVersionCanary)).
- Chaque fichier est un `declare module` des noms `zapatos/*`, donc votre `tsconfig.json` doit l’inclure : `"include": ["src"]`, avec `outDir` à `"./src"`.

### L’avertissement sur l’ancienne arborescence {#the-old-layout-warning}

Avant la 3.0, Zapatos copiait sa source dans la vôtre. Une fois les fichiers écrits, quand `outExt` n’est pas `".ts"`, le générateur cherche cette arborescence : `zapatos/schema.ts`, un dossier `zapatos/src`, ou un fichier sous `zapatos/custom` qui ne se termine pas par `.d.ts`. S’il en trouve une, il avertit, via [`warningListener`](#generate.warningListener), avec les étapes de la migration :

```txt
*** IMPORTANT: ZAPATOS NO LONGER COPIES ITS SOURCE TO YOUR SOURCE TREE ***
```

Repasser de `outExt: ".ts"` à `".d.ts"` déclenche donc aussi l’avertissement, jusqu’à ce que vous supprimiez les fichiers `.ts`.

Pourquoi les types ont cette forme, avec un `timestamptz` qui est un `Date` dans `Selectable` et une chaîne dans `JSONSelectable` : [Le catalogue](/fr/catalog-types).
