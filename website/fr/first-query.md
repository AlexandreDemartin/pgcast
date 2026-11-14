---
english: 89707293e31e
---

# Première requête

À la fin de cette page, vous aurez généré les types d’une base de données, demandé des films à cette base et ajouté un film, avec sous les yeux le SQL et le type de chaque requête. On part de là où s’arrête [Installation](/fr/install) : pgcast et `pg` dans votre projet.
{.lede}

## Avant de commencer {#before-you-start}

- pgcast installé sous l’alias `zapatos`, avec `pg` et `@types/pg` : [Installation](/fr/install).
- TypeScript 5.7 ou plus récent dans votre projet : `npm install --save-dev typescript`.
- Node 22.18 ou plus récent, qui exécute un fichier TypeScript tel quel, en retirant ses types.
- Une base Postgres vide à laquelle vous pouvez vous connecter, sa chaîne de connexion dans la variable d’environnement `DATABASE_URL`, et `psql`, le client en ligne de commande de Postgres.
- Les films de cette doc dans cette base : [`schema.sql`](https://github.com/AlexandreDemartin/pgcast/blob/master/website/schema.sql) contient `studios`, leurs `films`, les `actors` et les `roles` qu’ils jouent, et quelques autres tables, avec des lignes à interroger. Téléchargez-le et chargez-le :

```sh
curl -O https://raw.githubusercontent.com/AlexandreDemartin/pgcast/master/website/schema.sql
psql "$DATABASE_URL" -f schema.sql
```

Chaque exemple ci-dessous tourne sur ce schéma. Votre propre base convient aussi : remplacez les noms de tables et de colonnes au fur et à mesure.

## 1. Préparer le projet {#set-up-the-project}

Les exemples utilisent `import` et un top-level `await`, votre projet est donc un module ES :

```sh
npm pkg set type=module
```

Puis un `tsconfig.json` qui les compile comme Node les exécute :

::: code-group

```json [tsconfig.json]
{
  "compilerOptions": {
    "module": "nodenext",
    "target": "es2022",
    "strict": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

:::

- `"module": "nodenext"` fait compiler `import pg from 'pg'` et le top-level `await`, comme dans un projet `"type": "module"`.
- `strict` active `strictNullChecks`, dont les types générés ont besoin. Sans lui, une requête qui nomme ses `columns` (comme plus bas) reçoit le type de toutes les colonnes, et une ligne absente cesse d’apparaître comme `undefined`.
- `noEmit` : `tsc` ne fait que vérifier votre code ; Node exécute lui-même le fichier `.ts`.
- Le générateur écrit des fichiers `.d.ts` ordinaires dans votre arborescence source, et `zapatos/schema` est déclaré dans l’un d’eux : ils doivent donc faire partie de votre compilation. Avec `"include": ["src"]` et l’`outDir` ci-dessous, c’est le cas.

## 2. Configurer le générateur {#configure-the-generator}

Ajoutez `zapatosconfig.json` à la racine de votre projet, là où vous lancerez le générateur :

::: code-group

```json [zapatosconfig.json]
{
  "db": { "connectionString": "{{DATABASE_URL}}" },
  "outDir": "./src"
}
```

:::

- `db` prend ce que vous donneriez à `new pg.Pool()`.
- `outDir` indique où placer le dossier `zapatos` ; sans lui, c’est le dossier où vous lancez le générateur.
- <code v-pre>{{DATABASE_URL}}</code> est lu dans l’environnement, si bien que la chaîne de connexion reste hors de votre dépôt. Si la variable n’est pas définie, le générateur s’arrête avec `Error: If present, zapatosconfig.json must be a valid JSON file, and all referenced environment variables must exist: Environment variable 'DATABASE_URL' is not set`.

Toutes les autres options, des schémas à inclure aux réglages par colonne, sont dans [Générateur](/fr/generator).

## 3. Générer les types {#generate-the-types}

Lancez le générateur. Il est installé sous deux noms, `pgcast` et `zapatos` :

```sh
npx pgcast
```

Il affiche une ligne pour chaque placeholder qu’il écrit, ici pour les deux types du schéma de la doc que Postgres ne sait pas, à lui seul, décrire à TypeScript :

```txt
Writing new custom type or domain placeholder file: src/zapatos/custom/PgPoint.d.ts
Writing new custom type or domain placeholder file: src/zapatos/custom/PgSeat_label.d.ts
```

Et vous avez :

```txt
src/zapatos/
├── schema.d.ts            every table, written again on each run: don't edit it
└── custom/
    ├── index.d.ts         written again on each run too
    ├── PgPoint.d.ts       cinemas.location, a POINT: any, until you say otherwise
    └── PgSeat_label.d.ts  seat_bookings.seat, the seat_label domain: string
```

Les placeholders de `custom/` sont à vous : le générateur écrit chacun d’eux une seule fois et ne l’écrase jamais, alors que `index.d.ts` est réécrit à chaque exécution. Dans `schema.d.ts`, chaque table est un espace de noms de types, et les raccourcis choisissent le bon pour vous :

| Type | Ce qu’il décrit | Utilisé par |
|---|---|---|
| `films.Selectable` | une ligne, telle que `pg` la renvoie | vos propres requêtes `sql` |
| `films.JSONSelectable` | une ligne revenue en JSON : ici la même, mais un `timestamptz`, par exemple, arrive en chaîne et non en `Date` ([pourquoi](/fr/catalog-types)) | les résultats de `select()`, `insert()` et des autres raccourcis |
| `films.Whereable` | un filtre : n’importe quelles colonnes, chacune avec une valeur | le `where` de `select()`, `selectOne()`, `update()`, `deletes()` |
| `films.Insertable` | une nouvelle ligne : les colonnes `NOT NULL` sans valeur par défaut requises, les autres facultatives | `insert()`, `upsert()` |
| `films.Updatable` | des modifications d’une ligne : toutes les colonnes facultatives | `update()`, `upsert()` |

## 4. Se connecter {#connect}

Le runtime n’ouvre jamais de connexion de lui-même : chaque requête tourne sur le pool ou le client que vous lui donnez. Importez le runtime et créez un pool :

::: code-group

```ts twoslash [src/films.ts]
import * as db from 'zapatos/db';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  allowExitOnIdle: true,  // so the script ends once its queries are done
});
```

:::

Les exemples ci-dessous continuent dans ce fichier. Leur top-level `await` a besoin d’ESM : c’est le `"type": "module"` plus haut. Après chaque étape, exécutez-le :

```sh
node src/films.ts
```

Et vérifiez ses types avec `npx tsc`, comme le fait votre éditeur pendant la saisie.

## 5. Demander un film {#ask-for-one-film}

Demandez un film par son titre avec `selectOne()`, puis exécutez-le sur le pool avec `.run()` :

<CastPanel example="first-query">

<<< ../examples/first-query.ts{ts twoslash}

</CastPanel>

Le titre est parti à Postgres en paramètre, `("title" = $1)`<!-- probe: examples/first-query.ts -->, jamais collé dans le SQL. La ligne revient en JSON (`to_jsonb`<!-- probe: examples/first-query.ts -->), son type est donc `films.JSONSelectable`, et `undefined` si aucun film n’a ce titre. TypeScript ne vous laisse pas l’oublier :

```ts twoslash
// @errors: 18048
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
const film = await db.selectOne('films', { title: 'The Salt Orchard' }).run(pool);
// ---cut---
console.log(film.release_year);
```

Testez plutôt ce cas, et le type s’affine à celui de la ligne (survolez `film` pour le voir). Exécutez le fichier, et il affiche `1974` :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
const film = await db.selectOne('films', { title: 'The Salt Orchard' }).run(pool);
// ---cut---
if (film) console.log(film.release_year);  // 1974
```

Pour voir le SQL dans votre propre code, appelez `.compile()` là où vous appelleriez `.run()` : il donne le `text` (sur une ligne) et les `values` que montre le cast panel, et n’envoie rien. Ajoutez cette ligne au fichier :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
console.log(db.selectOne('films', { title: 'The Salt Orchard' }).compile());
```

Exécutez-le, et après `1974` il affiche :

```txt
{
  text: 'SELECT to_jsonb("films".*) AS result FROM "films" WHERE ("title" = $1) LIMIT $2',
  values: [ 'The Salt Orchard', 1 ]
}
```

## 6. En demander plusieurs, et seulement ce qu’il faut {#ask-for-several-and-only-what-you-need}

`select()` donne toutes les lignes qui correspondent, dans un tableau. Demandez les films d’un studio, du plus ancien au plus récent, et nommez les deux colonnes voulues :

<CastPanel example="first-query-columns">

<<< ../examples/first-query-columns.ts{ts twoslash}

</CastPanel>

Chaque nom de colonne apparaît deux fois dans `jsonb_build_object($1::text, "title", …)`<!-- probe: examples/first-query-columns.ts --> : comme valeur, `$1`, la clé de l’objet JSON, et entre guillemets, `"title"`, la colonne qu’il lit.

Le type suit la requête : deux colonnes demandées, deux dans le type. Omettez `columns` et vous recevez toutes les colonnes, `films.JSONSelectable[]`. Affichez-les :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
const films = await db.select('films', { studio_id: 1000 }, {
  columns: ['title', 'release_year'],
  order: { by: 'release_year', direction: 'ASC' },
}).run(pool);
// ---cut---
console.log(films);
```

Exécutez de nouveau le fichier, et après l’année et le SQL il affiche :

```txt
[
  { title: 'The Salt Orchard', release_year: 1974 },
  { title: "The Cartographer's Silence", release_year: 2008 }
]
```

Si aucun film ne correspond, le tableau est vide : `select()` ne donne jamais `undefined`.

## 7. Ajouter un film {#add-a-film}

`insert()` prend un `films.Insertable` et renvoie la ligne telle que Postgres l’a stockée. Typez d’abord la ligne, avec les types du schéma. Ajoutez cet import en haut du fichier, avec les deux autres :

```ts twoslash
import type * as s from 'zapatos/schema';
```

Puis la ligne et la requête :

<CastPanel example="first-query-insert">

<<< ../examples/first-query-insert.ts{ts twoslash}

</CastPanel>

`newFilm` est un `films.JSONSelectable`, le type de ligne qu’a donné `selectOne()`.

Le `films.Insertable` de la ligne exige les colonnes `NOT NULL` sans valeur par défaut et laisse les autres facultatives ; typée à part, la ligne reçoit des erreurs qui nomment la colonne fautive. Affichez le nouveau film :

```ts twoslash
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;
declare const row: s.films.Insertable;
const newFilm = await db.insert('films', row).run(pool);
// ---cut---
console.log(newFilm);
```

Exécutez le fichier, et il affiche la nouvelle ligne :

```txt
{
  id: 1,
  title: 'The Night Ferry to Orkesund',
  genres: [],
  tagline: null,
  studio_id: 1002,
  release_year: 2024,
  runtime_minutes: 117
}
```

Les colonnes que vous avez omises ont pris leur valeur par défaut : le nouvel `id` depuis sa séquence, `genres` à `[]`, `tagline` à `null`. Sur un schéma de la doc fraîchement chargé, le premier film que vous ajoutez reçoit l’`id` 1, car les films chargés par le seed commencent à 1000 ; chaque exécution suivante l’ajoute de nouveau, avec l’`id` suivant.

Une colonne `NOT NULL` sans valeur par défaut ne peut pas être omise. Oubliez la durée, et TypeScript le signale avant que Postgres ne le puisse :

```ts twoslash
// @errors: 2741
import type * as s from 'zapatos/schema';
// ---cut---
const row: s.films.Insertable = {
  studio_id: 1002,
  title: 'The Night Ferry to Orkesund',
  release_year: 2024,
};
```

::: tip Opt-in
Omettez une clé pour obtenir la valeur par défaut de sa colonne. Une clé à `undefined` est envoyée comme `NULL`, comme dans Zapatos 6.6.1, et pgcast émet un avertissement, une seule fois (`PGCAST_DEP002`). Avec `db.setConfig({ undefinedMeansMissing: true })`, elle compte comme omise ; ce sera le comportement par défaut à partir de la 7.0 ([Versions](/fr/versions)).
:::

<!-- joined: src/films.ts -->

Avec la durée remise dans la ligne, voici votre fichier complet, les étapes de cette page dans l’ordre :

::: code-group

```ts twoslash [src/films.ts]
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  allowExitOnIdle: true,  // so the script ends once its queries are done
});

const film = await db.selectOne('films', {
  title: 'The Salt Orchard',
}).run(pool);
if (film) console.log(film.release_year);  // 1974
console.log(db.selectOne('films', { title: 'The Salt Orchard' }).compile());

const films = await db.select('films', { studio_id: 1000 }, {
  columns: ['title', 'release_year'],
  order: { by: 'release_year', direction: 'ASC' },
}).run(pool);
console.log(films);

const row: s.films.Insertable = {
  studio_id: 1002,
  title: 'The Night Ferry to Orkesund',
  release_year: 2024,
  runtime_minutes: 117,
};
const newFilm = await db.insert('films', row).run(pool);
console.log(newFilm);
```

:::

## 8. Quand le schéma change {#when-the-schema-changes}

Relancez `npx pgcast` après chaque migration. `schema.d.ts` est entièrement réécrit, et TypeScript y confronte chaque requête. Essayez : renommez une colonne, régénérez, et vérifiez le fichier :

```sh
psql "$DATABASE_URL" -c 'ALTER TABLE films RENAME runtime_minutes TO minutes'
npx pgcast
npx tsc
```

La ligne nomme `runtime_minutes`, que `films.Insertable` n’a plus, elle ne compile donc plus :

```txt
src/films.ts:26:3 - error TS2353: Object literal may only specify known properties, and 'runtime_minutes' does not exist in type 'Insertable'.

26   runtime_minutes: 117,
     ~~~~~~~~~~~~~~~


Found 1 error in src/films.ts:26
```

Toute requête qui nomme la colonne cesse aussi de compiler, jusqu’à ce que vous écriviez `minutes` à la place. Ici, rendez-lui son nom, pour que le reste de cette doc fonctionne tel qu’il est écrit :

```sh
psql "$DATABASE_URL" -c 'ALTER TABLE films RENAME minutes TO runtime_minutes'
npx pgcast
npx tsc
```

Cette fois, `tsc` n’affiche rien : chaque requête correspond de nouveau au schéma.

Après une mise à jour de pgcast, une erreur de type sur `schemaVersionCanary` dans `schema.d.ts` veut dire la même chose : le format généré a changé, relancez donc le générateur.

## Ce que vous avez appris {#what-you-ve-learnt}

- Pointer le générateur vers une base de données, et trouver ses types dans `zapatos/schema`.
- Demander une ligne avec `selectOne()`, plusieurs avec `select()`, et seulement certaines colonnes avec `columns`.
- Ajouter une ligne avec `insert()`, et la récupérer telle que Postgres l’a stockée.
- Lire le SQL qu’exécute une requête avec `.compile()`, et son type sous votre curseur.
- Régénérer après une migration, et laisser TypeScript trouver les requêtes qui ne correspondent plus.

Ensuite : une tâche à vous dans les [guides pratiques](/fr/guides), chaque option dans la [référence](/fr/reference), et le pourquoi de son fonctionnement dans les [explications](/fr/explanation).
