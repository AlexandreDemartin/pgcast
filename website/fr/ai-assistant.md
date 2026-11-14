---
english: 56251afdb855
---

# Assistants IA

Donnez à un assistant qui écrit vos requêtes trois choses : cette doc, votre schéma généré et un court fichier de règles, pour qu’il les écrive à la manière de pgcast. Puis vérifiez son travail avec le vérificateur de types et `.compile()`. Cette page suppose les bases du [tutoriel](/fr/tutorial).
{.lede}

## Lui donner la doc {#give-it-the-docs}

Le site se publie lui-même pour les assistants, en deux fichiers à sa racine, en anglais, et sous `/fr/` pour la doc française :

```txt
https://pgcast.dev/llms.txt
https://pgcast.dev/llms-full.txt
```

- [`llms.txt`](/fr/llms.txt) : un index, chaque page avec son URL et son résumé. Pour un assistant qui va chercher les pages dont il a besoin.
- [`llms-full.txt`](/fr/llms-full.txt) : toutes les pages dans un seul fichier Markdown, chaque cast panel avec le SQL, les valeurs et le type qu’il montre. Pour un assistant qui lit tout un fichier d’un coup.

Collez une URL dans la conversation, ou laissez le fichier de règles ci-dessous la nommer.

## Lui donner votre schéma {#give-it-your-schema}

`npx pgcast` écrit `zapatos/schema.d.ts` dans votre [`outDir`](/fr/generator#generate.outDir) : `src/zapatos/schema.d.ts` dans le tutoriel. Il contient ce qu’un assistant devinerait sinon : les colonnes de chaque table, le type de chacune dans une ligne, un filtre, une insertion et une mise à jour ([Les fichiers qu’il écrit](/fr/generator#the-files-it-writes)), et sur chaque colonne un commentaire avec son type Postgres, si elle est `NOT NULL`, et sa valeur par défaut.

- Dites à l’assistant de le lire avant d’écrire une requête, et de ne jamais le modifier : la prochaine exécution le réécrit. Le fichier de règles ci-dessous fait les deux ; changez son chemin si votre `outDir` diffère.
- Un `COMMENT ON COLUMN` sur la colonne d’une table, dans une migration, arrive aussi dans ce commentaire ([`schemaJSDoc`](/fr/generator#generate.schemaJSDoc)) : c’est là qu’il faut dire à l’assistant ce que signifie une colonne. Celui d’une vue, d’une table distante ou d’une table partitionnée n’y arrive pas encore ([#47](https://github.com/AlexandreDemartin/pgcast/issues/47)).
- Après chaque migration, relancez `npx pgcast`, pour que l’assistant lise le schéma tel qu’il est.

## Ajouter le fichier de règles {#add-the-rules-file}

Copiez-le dans votre projet, et changez `src/zapatos/schema.d.ts` si votre `outDir` diffère. Chaque règle se termine par la page qui la justifie, que l’assistant peut lire :

```md
# Postgres with pgcast

This project queries Postgres with pgcast, installed under the `zapatos` alias.
The index of its docs, each page with its URL and summary:
https://pgcast.dev/llms.txt
For an assistant that reads one whole file, every page in one:
https://pgcast.dev/llms-full.txt

- The database is the source of the types. Before writing a query on a table,
  read its columns and their types in `src/zapatos/schema.d.ts`; never guess a
  column. Never edit that file: it is generated.
  https://pgcast.dev/generator#the-files-it-writes
- After a migration, run `npx pgcast` to generate the types again, then fix
  what no longer compiles.
  https://pgcast.dev/first-query#when-the-schema-changes
- Import the run-time code as `import * as db from 'zapatos/db'` and the types
  as `import type * as s from 'zapatos/schema'`, never from `pgcast`.
  https://pgcast.dev/install
- Prefer the shortcuts to hand-written SQL: `db.select()`, `db.selectOne()`,
  `db.count()` and the other aggregates, `db.insert()`, `db.upsert()`,
  `db.update()`, `db.deletes()`; filters from `db.conditions`; related rows
  through `lateral`.
  https://pgcast.dev/select
  https://pgcast.dev/insert
  https://pgcast.dev/conditions
  https://pgcast.dev/lateral
- Write what no shortcut covers in a `db.sql` template, typed with the table's
  names and its rows: `` db.sql<s.films.SQL, s.films.Selectable[]>`…` ``.
  https://pgcast.dev/raw-sql
- Never concatenate a value into SQL, and never pass one to `db.raw()`. A value
  goes in a shortcut's object, in a Whereable (`${{ studio_id }}`) or in
  `db.param()`, and Postgres gets it as a parameter, `$1`.
  https://pgcast.dev/raw-sql#pass-each-value-as-a-parameter
- An interpolated string is a table or column name. Never interpolate a string
  from outside the code (a request, a user, a file): map it to a name written
  in the code, and never cast it to make it compile.
  https://pgcast.dev/raw-sql#choose-sql-at-run-time-from-your-own-constants
- A shortcut's object and a Whereable take their keys as column names: build
  them from fields you name, never pass a request's body or query whole. An
  empty Whereable is `TRUE`: check that a filter has a key before
  `db.update()` or `db.deletes()`.
  https://pgcast.dev/raw-sql#pass-each-value-as-a-parameter
- Run each query on the pool or client you are given; inside a transaction, on
  its `txnClient`. Its callback may run again (40001, 40P01): keep side effects
  out of it.
  https://pgcast.dev/transaction#transaction
  https://pgcast.dev/retries#keep-side-effects-out-of-the-callback
- Read the SQL of a new query: `.compile()` in place of `.run()` gives
  `{ text, values }` and sends nothing.
  https://pgcast.dev/sql-template#compile
- Before calling a change done, run the type check, `npx tsc --noEmit`, and fix
  each error in the code, never with `any`, a type assertion (`as` a type;
  `as const` is fine), `@ts-ignore` or `@ts-expect-error`.
  https://pgcast.dev/ai-assistant#run-the-type-check
```

Placez-le là où votre assistant lit ses instructions :

| Sous forme de | Fichier | Au-dessus des règles |
|---|---|---|
| `AGENTS.md`, que lisent la plupart des assistants | `AGENTS.md` à la racine du dépôt, ou à la fin du vôtre | rien |
| une règle Cursor | `.cursor/rules/pgcast.mdc` | un front matter avec une `description` et `alwaysApply: false` |
| un skill Claude | `.claude/skills/pgcast/SKILL.md` | un front matter avec une `description` |

- Claude Code ne lit `AGENTS.md` que si le projet n’a ni `CLAUDE.md`, ni `.claude/CLAUDE.md`, ni `CLAUDE.local.md`. S’il en a un, il ne lit `AGENTS.md` que si ce fichier l’importe, avec une ligne `@AGENTS.md` ([la doc de Claude Code](https://code.claude.com/docs/en/memory#agents-md)).
- Pour les deux derniers, la `description` dit quand les règles s’appliquent : l’assistant la lit et charge les règles quand une tâche en a besoin. Une règle Cursor avec des `globs` serait au contraire jointe dès qu’un fichier correspondant est dans le contexte, quelle que soit sa `description` ([la doc de Cursor](https://cursor.com/docs/context/rules)).

::: code-group

```md [.cursor/rules/pgcast.mdc]
---
description: Querying Postgres with pgcast (zapatos/db). Use when writing or changing a database query.
alwaysApply: false
---
```

```md [.claude/skills/pgcast/SKILL.md]
---
description: Querying Postgres with pgcast (zapatos/db). Use when writing or changing a database query.
---
```

:::

## Vérifier son travail {#check-its-work}

### Lancer la vérification de types {#run-the-type-check}

```sh
npx tsc --noEmit
```

Ou le script de votre projet, avec `npm run`. Une colonne que l’assistant a inventée le fait échouer, tout comme une chaîne venue d’une requête HTTP utilisée comme nom :

```ts twoslash
// @errors: 2353 2345
import * as db from 'zapatos/db';
// ---cut---
declare const sort: string;  // from the request

db.select('films', { year: 1974 });
db.sql`SELECT * FROM ${'films'} ORDER BY ${sort}`;
```

Corrigez le code, pas le type : avec `as any`, ou `as s.films.Column`, les deux compilent, et les deux trient selon le nom qu’envoie la requête HTTP, quel qu’il soit. Faites plutôt correspondre la requête HTTP à des noms écrits dans le code ([SQL brut](/fr/raw-sql#choose-sql-at-run-time-from-your-own-constants)), et laissez un raccourci faire le reste, ici [`select()`](/fr/select#select) avec [`db.all`](/fr/sql-template#all) et [`order`](/fr/select#order-limit-offset-and-withties) :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
declare const sort: string;  // from the request

const by = sort === 'length' ? 'runtime_minutes' : 'release_year';
db.select('films', db.all, { order: { by, direction: 'ASC' } });
```

### Lire le SQL {#read-the-sql}

Appelez [`.compile()`](/fr/sql-template#compile) là où le code appelle `.run()`, et affichez le résultat : il donne `{ text, values }`, le SQL et ses valeurs. Ici, la réponse de l’assistant à « les trois films les plus longs du studio 1000 », avec [`columns`](/fr/select#columns), [`order` et `limit`](/fr/select#order-limit-offset-and-withties), et ce que Postgres exécute :

<CastPanel example="ai_assistant_longest">

<<< ../examples/ai_assistant_longest.ts{ts twoslash}

</CastPanel>

Avec `.compile()` à la place de `.run(pool)`, `console.log()` affiche le même SQL dans `text`, sur une ligne, et les mêmes valeurs dans `values` :

- Chaque valeur est un `$n` dans `text` et un élément de `values` : ici `1000` et `3`. Les noms de colonnes parmi les valeurs sont les clés de l’objet JSON sous lequel revient chaque ligne ([`select()`](/fr/select#select)).
- Chaque nom est entre guillemets doubles : `"films"`<!-- probe: examples/ai_assistant_longest.ts -->, `"studio_id"`<!-- probe: examples/ai_assistant_longest.ts -->.
- Une valeur écrite dans `text`, sans `$n` ni élément de `values` pour elle, a été collée dans le SQL : un `raw()` ou une concaténation. Demandez plutôt un paramètre.

`.compile()` n’envoie rien : vous pouvez donc l’appeler sans risque sur un `insert()` ou un `deletes()` aussi.

::: info À venir
`npx pgcast --check` dira si `schema.d.ts` correspond toujours à la base, sans l’écrire, une fois [#52](https://github.com/AlexandreDemartin/pgcast/issues/52) livrée : une vérification de plus à lancer avant de dire qu’un changement est fini.
:::

## Voir aussi {#see-also}

- [SQL brut](/fr/raw-sql) : les requêtes qu’aucun raccourci n’écrit, leurs noms et leurs valeurs.
- [Template SQL](/fr/sql-template#sql) : ce que donne chaque interpolation une fois compilée.
- [Première requête](/fr/first-query) : le générateur, les types qu’il écrit, et `.compile()`, pas à pas.
