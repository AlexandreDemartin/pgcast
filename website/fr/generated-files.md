---
english: 6e1ee4bd61b3
---

# Fichiers générés

Les fichiers qu’écrit le générateur et ce que chacun contient, le canary qui vérifie leur format, et comment typer plusieurs bases.
{.lede}

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
- `schema.d.ts` déclare `schemaVersionCanary`, `version: 104`. Un `zapatos/db` qui attend une autre version ne compile pas à cet endroit : relancez la génération ([`SchemaVersionCanary`](#SchemaVersionCanary)).
- Chaque fichier est un `declare module` des noms `zapatos/*`, donc votre `tsconfig.json` doit l’inclure : `"include": ["src"]`, avec `outDir` à `"./src"`.
- Avec [`moduleNames`](/fr/generator#generate.moduleNames) à `"pgcast"`, l’arborescence est `src/pgcast/` et les noms `pgcast/*` ; le reste de cette section est identique.

### L’avertissement sur l’ancienne arborescence {#the-old-layout-warning}

Avant la 3.0, Zapatos copiait sa source dans la vôtre. Une fois les fichiers écrits, quand `outExt` n’est pas `".ts"`, le générateur cherche cette arborescence : `zapatos/schema.ts`, un dossier `zapatos/src`, ou un fichier sous `zapatos/custom` qui ne se termine pas par `.d.ts`. S’il en trouve une, il avertit, via [`warningListener`](/fr/generator#generate.warningListener), avec les étapes de la migration :

```txt
*** IMPORTANT: ZAPATOS NO LONGER COPIES ITS SOURCE TO YOUR SOURCE TREE ***
```

Repasser de `outExt: ".ts"` à `".d.ts"` déclenche donc aussi l’avertissement, jusqu’à ce que vous supprimiez les fichiers `.ts`.

Pourquoi les types ont cette forme, avec un `timestamptz` qui est un `Date` dans `Selectable` et une chaîne dans `JSONSelectable` : [Le catalogue](/fr/catalog-types).

## `SchemaVersionCanary` {#SchemaVersionCanary}

```ts
interface SchemaVersionCanary { version: 104 }
```

La version du format du schéma généré que lit ce `zapatos/db`. Le `zapatos/schema` généré déclare `interface schemaVersionCanary extends db.SchemaVersionCanary { version: 104 }`, donc un schéma écrit pour un autre format ne compile pas :

```txt
error TS2430: Interface 'schemaVersionCanary' incorrectly extends interface 'SchemaVersionCanary'.
  Types of property 'version' are incompatible.
```

- La version de pgcast est celle de Zapatos 6.6.1, `104`, donc le canary d’un schéma généré par Zapatos 6.6.1 passe.
- Régénérer le schéma fait disparaître l’erreur ([Générateur](/fr/generator)).

## Plusieurs bases {#several-databases}

Chaque `schema.d.ts` déclare `zapatos/schema`, le seul module où `zapatos/db` prend ses tables : une compilation type donc une seule base. Pour deux, donnez à chacune son propre projet TypeScript, et typez à la main ce que l’un passe à l’autre. Ici, la base de la doc, `films`, à côté d’une petite base `box_office` qui a sa propre table `films`, dont l’`id` est un `text`, et une table `takings`.

```txt
tsconfig.json
tsconfig.base.json
films/
├── pgcastconfig.json
├── tsconfig.json
└── src/
box_office/
├── pgcastconfig.json
├── tsconfig.json
└── src/
```

- `tsconfig.json` n’a aucun fichier : une référence vers chaque projet. `tsconfig.base.json` contient vos options habituelles.
- Chaque `src/` contient le dossier `zapatos/` de sa base et les requêtes sur cette base.

::: code-group

```json [tsconfig.json]
{ "files": [], "references": [{ "path": "films" }, { "path": "box_office" }] }
```

```json [films/tsconfig.json]
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "composite": true, "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

```json [films/pgcastconfig.json]
{ "db": { "connectionString": "{{FILMS_DATABASE_URL}}" }, "outDir": "./src" }
```

:::

```sh
(cd films && npx pgcast)
(cd box_office && npx pgcast)
npx tsc -b
```

- `box_office/` contient les deux mêmes fichiers, sa configuration nommant <code v-pre>{{BOX_OFFICE_DATABASE_URL}}</code>.
- La CLI lit la configuration du dossier où elle est lancée ([La CLI](/fr/generator#cli)) : lancez-la, et [`--check`](/fr/generator#check) en CI, dans le dossier de chaque projet. Ou depuis la racine, avec l’argument JSON : <code v-pre>npx pgcast '{"db": {"connectionString": "{{FILMS_DATABASE_URL}}"}, "outDir": "./films/src"}'</code>.
- Chaque projet inclut son propre `src`, donc son propre dossier `zapatos/` seulement. `tsc -b` les construit l’un après l’autre, avec TypeScript 5.9, et avec 4.1 sous `skipLibCheck` ([Sur un TypeScript plus ancien](/fr/install#on-an-older-typescript)). Un seul paquet et un seul `node_modules` suffisent.
- Le pool se choisit à `.run()`, comme toujours, et rien ne lie une table à un pool. Lancée sur le pool de `films`, la requête de `box_office` sur `takings` échoue, `42P01 relation "takings" does not exist` ; sa requête sur `films` s’exécute, et renvoie les lignes de la doc, avec un `id` de `1000` typé comme un `string`.

::: warning Entre projets
Une colonne lue dans les déclarations d’un autre projet peut être `any`, `unknown` ou le type d’une autre base, selon le lecteur et la version de TypeScript, et `skipLibCheck` en cache la raison : typez à la main ce qui passe de l’un à l’autre.
:::

### Les deux dans une même compilation {#both-in-one-compilation}

Un `tsconfig.json` racine qui inclut `films/src` et `box_office/src` déclare deux fois `zapatos/schema`.

- Dans les fichiers `.d.ts` : les erreurs TS6200, TS2717 et d’autres. Sous `skipLibCheck`, elles disparaissent, en silence.
- Le premier fichier l’emporte, et les requêtes sur l’autre base sont refusées : le `db.select('takings', …)` de `box_office`, TS2345 `Argument of type '"takings"' is not assignable to parameter of type 'Table'` ; les dossiers inversés, le `{ id }` et le `'studios'` de `films`.

### Les types d’un projet à l’autre {#types-across-projects}

Une app qui relie les deux, ou un autre paquet d’un monorepo, lit les déclarations émises par `films`. Sans type de votre part, elles nomment ses tables comme TypeScript les écrit : par une chaîne, `db.JSONOnlyColsForTable<"films", …>`, ou par le module, `import("zapatos/schema").takings.JSONSelectable`. Chacune est résolue dans la compilation du **lecteur** :

| Le lecteur | TypeScript 5.5 et plus récent | Avant 5.5 |
|---|---|---|
| Une app sans schéma propre | `any` : `const title: number = page.title` compile | le schéma qu’une déclaration fait entrer, sinon `any` : ici, `page.title` est le `films.title` de `box_office` |
| Un projet qui a son propre schéma | sa propre table de ce nom (`page.id` est un `string` dans `box_office`), `unknown` pour une table qu’il n’a pas, ou `any` | comme à partir de 5.5, jusqu’à ce qu’une déclaration fasse entrer le schéma de l’autre : alors les deux, [dans une même compilation](#both-in-one-compilation), et ses propres requêtes sont refusées |

- Une colonne mal orthographiée reste refusée, TS2551.
- Avant 5.5, une déclaration qui nomme une table par le module commence par `/// <reference path>` vers le `schema.d.ts` de son projet, qui entre dans la compilation du lecteur : ici, le `takings()` de `box_office` fait entrer celui de `box_office`, et 4.1, qui nomme chaque table par le module, fait entrer aussi celui de `films`. À partir de 5.5, cette ligne disparaît, et une table nommée par le module que le lecteur n’a pas est `any`.

Sans `skipLibCheck`, les erreurs dans les `.d.ts` du lecteur le signalent : TS2307 sur `zapatos/schema` sans schéma, TS2344 ou TS6200 avec un schéma. La solution est un type écrit en TypeScript ordinaire, jamais `s.films.JSONSelectable` :

```ts twoslash [films/src/queries.ts]
import * as db from 'zapatos/db';
import type { Pool } from 'pg';

export interface FilmPage {
  id: number;
  title: string;
  release_year: number;
  studio: { name: string };
}

export const filmPage = (pool: Pool, id: number): Promise<FilmPage> =>
  db.selectExactlyOne('films', { id }, {
    columns: ['id', 'title', 'release_year'],
    lateral: { studio: db.selectExactlyOne('studios', { id: db.parent('studio_id') }, { columns: ['name'] }) },
  }).run(pool);
```

- La compilation de `films` vérifie la requête par rapport à ce type : `title: number` y échoue, TS2322.
- Ses déclarations ne nomment aucune table, donc chaque lecteur lit `FilmPage` tel quel : `const title: number = page.title` échoue, TS2322, de 4.1 à 5.9.
- Donnez son type à chaque export qui passe d’un projet à l’autre : un seul laissé sans type ramène le tableau ci-dessus.

### Dans l’éditeur {#in-the-editor}

- Avec `references`, l’éditeur (tsserver 5.9) charge les sources d’un projet référencé plutôt que son `.d.ts`, sans le schéma de ce projet : `page` est `JSONOnlyColsForTable<string, string[]>`, et `page.titel`, que `tsc -b` refuse, passe. Il ne s’accorde pas avec `tsc -b`.
- Avec `"disableSourceOfProjectReferenceRedirect": true` dans les `compilerOptions` du lecteur, après un `tsc -b`, il lit le `.d.ts`, et s’accorde avec lui.
- Un type écrit à la main se lit de la même façon dans les deux cas : `page` est `FilmPage`.

### Hors périmètre {#several-databases-out-of-scope}

- Une requête sur plusieurs bases, par `dblink` ou une table distante : une requête, une base. Une table distante est générée avec les tables de la base qui la déclare.
- Un module par base : `zapatos/db` prend ses types dans `zapatos/schema` seul, et une copie de celui-ci par base a été étudiée puis écartée ([décision 011](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/011-several-databases.md)).
