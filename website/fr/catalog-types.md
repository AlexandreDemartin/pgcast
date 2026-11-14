---
english: fd13aa42d7db
---

# Le catalogue

Chaque type que pgcast vous donne est lu dans votre base ; aucun n’est écrit à la main. Cette page explique comment : ce que le générateur demande à Postgres, pourquoi chaque table donne cinq types plutôt qu’un, et comment le type du résultat d’une requête suit les options que vous lui donnez.
{.lede}

<AtAGlance>

- Le générateur lit le catalogue de votre base et écrit `zapatos/schema.d.ts` ; votre code n’est vérifié que par rapport à ce fichier.
- Chaque table apparaît cinq fois, une par contexte où passe une valeur : `Selectable`, `JSONSelectable`, `Whereable`, `Insertable`, `Updatable`.
- Le résultat d’un raccourci est du JSON que Postgres construit, et son type est déduit de l’appel, jamais déclaré.

</AtAGlance>

## Postgres se décrit lui-même {#postgres-describes-itself}

Une base Postgres connaît sa propre forme, et la garde dans son catalogue : les tables système de `pg_catalog`, et les vues standard d’`information_schema` construites dessus.

Quand vous lancez `npx pgcast`, le générateur pose à ces tables quelques questions pour chaque schéma, et écrit les réponses en TypeScript dans `zapatos/schema.d.ts`. Il ne se reconnecte plus ensuite : à partir de là, votre code n’est vérifié que par rapport à ce fichier.

<CatalogFlow />

| Il lit | Dans | Cela devient |
|---|---|---|
| chaque relation, sa nature, et si elle accepte un `INSERT` | `information_schema.tables`, `pg_matviews` | un namespace par table, vue, table distante ou vue matérialisée |
| le type de chaque colonne, ou son domaine et le type de base du domaine | `information_schema.columns` ; `pg_attribute` et `pg_type` pour une vue matérialisée | le type TypeScript de la colonne, une fois par contexte ([plus bas](#one-column-five-types)) |
| si la colonne peut être `NULL` | `is_nullable` ; `attnotnull` pour une vue matérialisée | `\| null`, et facultative dans `Insertable` |
| sa valeur par défaut, d’identité ou générée | `column_default`, `identity_generation`, `is_generated` | facultative dans `Insertable` ; une colonne `GENERATED ALWAYS` est omise d’`Insertable` et d’`Updatable` |
| son `COMMENT ON COLUMN` | `pg_description` | la JSDoc que votre éditeur affiche pour la colonne, avec son type Postgres et sa valeur par défaut |
| chaque enum et ses libellés | `pg_enum` | une union de chaînes, et le tuple `every.<name>` |
| chaque index unique | `pg_indexes`, `pg_namespace`, `pg_class`, `pg_index` | `UniqueIndex`, les noms qu’accepte [`constraint()`](/fr/insert#constraint) |

Pour voir les requêtes elles-mêmes, réglez [`debugListener`](/fr/generator#generate.debugListener). Un domaine, comme `seat_label`, et un type que le générateur ne sait pas traduire, comme `point`, reçoivent chacun un fichier à compléter dans `zapatos/custom/`, à vous de le remplir ([Types personnalisés](/fr/custom-types)).

Et ce que le catalogue ne voit pas, comme une colonne qu’un trigger remplit, vous le dites dans la configuration : [`columnOptions`](/fr/generator#generate.columnOptions) l’omet d’`Insertable` ou d’`Updatable`, ou la rend facultative dans `Insertable`.

### Ce que le générateur ne lit pas {#what-the-generator-doesn-t-read}

Le générateur lit les noms, les types, la nullabilité et les valeurs par défaut. Postgres garde aussi chaque clé étrangère et chaque contrainte `CHECK`, dans `pg_constraint`, mais Zapatos 6.6.1 n’a jamais lu cette table, ni le SQL à l’intérieur des vues et des fonctions ; pgcast pas encore non plus.

Ainsi `ratings.stars`, `CHECK (stars BETWEEN 1 AND 5)`, est un `number` ; un `seat_label` qui respecte `'^[A-Z][0-9]{1,2}$'` est une `string` ; et rien ne dit à TypeScript que `films.studio_id` pointe vers un studio.

Une vue est typée comme Postgres la décrit, et Postgres décrit chaque colonne d’une vue comme nullable, quoi qu’en disent les tables sous-jacentes, sauf si son type est un domaine `NOT NULL`.

Une vue de l’`id` et du `title` de `films` les type tous deux en `| null`, et reçoit un `Insertable` où chaque colonne est facultative, puisque Postgres peut écrire à travers elle. Une vue sur une jointure, à travers laquelle il ne peut pas écrire, reçoit un `Insertable` et un `Updatable` qui n’acceptent rien (`[key: string]: never`).

```sql
CREATE VIEW film_titles AS SELECT id, title FROM films;
```

```ts
// zapatos/schema.d.ts, its JSDoc left out
export namespace film_titles {
  export type Table = 'film_titles';
  export interface Selectable {
    id: number | null;
    title: string | null;
  }
  …
}
```

Une vue matérialisée ne garde aucun `NOT NULL`, pas même celui d’un domaine, donc ses colonnes sont nullables aussi.

Pour les vues, pgcast s’en tient à ce que Postgres déclare, comme Zapatos : une nullabilité que la base ne déclare pas serait une supposition, et une supposition est la seule chose qu’un type généré ne doit pas être. Certaines lacunes de ce que lit le générateur sont connues, et décrites ici telles qu’elles sont aujourd’hui :

- Les libellés d’un enum sortent dans l’ordre alphabétique : `crew_job` est `'cinematographer' | 'composer' | 'director' | 'editor' | 'writer'`, et non dans l’ordre de son `CREATE TYPE`, sauf si [`enumOrder`](/fr/generator#generate.enumOrder) vaut `"declared"`.
- Un enum d’un autre schéma devient un fichier à compléter de type `any`, ou prend les libellés de l’enum du même nom dans le schéma de la relation, sauf si [`typeEnumsAcrossSchemas`](/fr/generator#generate.typeEnumsAcrossSchemas) est activé.

::: info À venir
Lire davantage du catalogue, chaque fois en opt-in : les clés étrangères, pour des laterals qui connaissent leur jointure ([#54](https://github.com/AlexandreDemartin/pgcast/issues/54)) ; le `CHECK (VALUE = ANY (ARRAY[…]))` d’un domaine comme union de ses valeurs ([#55](https://github.com/AlexandreDemartin/pgcast/issues/55)) ; et, comme outil à part, les types de résultat du SQL écrit à la main ([#62](https://github.com/AlexandreDemartin/pgcast/issues/62)).
:::

## Une colonne, cinq types {#one-column-five-types}

Une valeur n’est pas la même chose partout où elle passe. Un `timestamptz` lu par un simple `SELECT` vous arrive comme `Date`, parce que `pg` l’analyse ; lu à travers du JSON, c’est une chaîne ; dans un filtre, ce peut être l’un ou l’autre, ou du SQL ; dans une nouvelle ligne, il peut être obligatoire, ou laissé à sa valeur par défaut.

Le générateur écrit donc chaque table cinq fois, une par contexte, chaque colonne typée pour ce contexte. Voici deux colonnes de `screenings`, tirées du schéma généré :

| Type | Ce qu’il décrit | `starts_at`, `timestamptz NOT NULL` | `subtitled`, un `boolean` nullable |
|---|---|---|---|
| `Selectable` | une ligne telle que `pg` la renvoie, depuis votre propre requête `sql` | `Date` | `boolean \| null` |
| `JSONSelectable` | une ligne telle que les raccourcis la renvoient | `TimestampTzString` | `boolean \| null` |
| `Whereable` | un filtre : chaque clé facultative | `TimestampTzString \| Date` | `boolean`, jamais `null` |
| `Insertable` | une nouvelle ligne | obligatoire : `TimestampTzString \| Date` | facultatif : `boolean`, `null` ou `DEFAULT` |
| `Updatable` | les changements d’une ligne : chaque clé facultative | `TimestampTzString \| Date` | `boolean`, `null` ou `DEFAULT` |

Partout où une valeur entre, elle peut aussi être un [`param()`](/fr/sql-template#param) ou un fragment [`sql`](/fr/sql-template#sql), et dans un filtre une colonne [`parent()`](/fr/sql-template#parent).

Un `Whereable` refuse `null` parce que `"subtitled" = NULL` n’est jamais vrai en SQL. Si on lui en donne un quand même (le type le laisse passer quand `strictNullChecks` est désactivé), le filtre compile en `"subtitled" = $1`<!-- probe: db.sql`${{ subtitled: null }}` -->, avec `null` comme `$1`, et ne trouve rien. [`conditions.isNull`](/fr/conditions#conditions.isNull) écrit le `IS NULL`<!-- probe: db.sql`${{ subtitled: db.conditions.isNull }}` --> que vous vouliez.

Le premier ne compile pas (TS2322, avec `strict` activé) ; le second est le filtre que vous vouliez :

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
db.select('screenings', { subtitled: null });
db.select('screenings', { subtitled: db.conditions.isNull });
```

Un domaine ou un type personnalisé fait exception : son fichier à compléter déclare un seul type, utilisé dans les cinq contextes. Cela convient à `seat_label`, une chaîne partout, mais pas à un domaine sur `int8`, `numeric`, `bytea` ou une date, dont le JSON diffère de ce que renvoie `pg` ([#194](https://github.com/AlexandreDemartin/pgcast/issues/194)).

La même ligne, demandée deux fois, montre les deux premiers côte à côte :

<<< ../examples/plain/catalog_types_contexts.ts{ts twoslash}

Dans une session dont le `TimeZone` est `UTC`, le premier est le `Date` `2030-03-01T19:30:00.000Z`, le second la chaîne `'2030-03-01T19:30:00+00:00'`. Dans la requête `sql`, `s.screenings.Selectable[]` est votre façon de dire ce que renvoie `SELECT *` ; le raccourci déduit le sien tout seul.

## Pourquoi les raccourcis renvoient du JSON {#why-the-shortcuts-return-json}

Chaque raccourci est une seule requête, et Postgres construit lui-même son résultat : chaque ligne comme une valeur JSON, avec `to_jsonb()` ou `jsonb_build_object()`, chaque `lateral` imbriqué dedans, et pour `select()` les lignes réunies en un tableau avec `jsonb_agg()`.

C’est ainsi que `select()` ramène des films avec leur distribution déjà en place, en un aller-retour, sans rien à assembler en JavaScript ensuite.

Le prix, c’est que chaque valeur voyage en JSON, et que JSON n’a ni dates, ni octets, et qu’une seule sorte de nombre. `JSONSelectable` dit ce qui arrive à la place :

- une date ou une heure, comme la chaîne ISO 8601 qu’écrit `to_jsonb()` ; un `timestamptz` avec le décalage de la session, `+00:00` en `UTC` et `+05:30` en `Asia/Kolkata` ;
- un `bytea`, comme sa chaîne hexadécimale (avec le `bytea_output` par défaut), `'\xdeadbeef'`, là où `pg` donne un `Buffer` ;
- un `int8` ou un `numeric`, comme nombre JSON, là où `pg` donne une chaîne. Un grand nombre perd en précision quand `JSON.parse()` le lit : l’`int8` `9007199254740993` arrive comme `9007199254740992`. Le générateur avertit quand un schéma a de telles colonnes, et [`customJSONParsingForLargeNumbers`](/fr/generator#generate.customJSONParsingForLargeNumbers) les type pour un parseur qui les garde entiers.

Zapatos renvoyait du JSON depuis chaque raccourci qui renvoie des lignes, même ceux qui auraient pu s’en passer, « <span lang="en">in the interests of consistency</span> », comme le dit sa doc : la ligne d’un raccourci est du même type que celle d’un autre.

Et il typait les chaînes plutôt que de les convertir dans votre dos : [`TimestampTzString`](/fr/runtime-config#TimestampTzString) et ses semblables vérifient la forme d’une chaîne, et [`toDate()`](/fr/runtime-config#toDate) en fait un `Date` quand vous le décidez, en précisant dans quel fuseau horaire lire une chaîne qui n’en porte pas ([Dates et heures](/fr/runtime-config#dates-and-times)).

## Comment le type du résultat suit la requête {#how-a-result-type-follows-the-query}

Le type du résultat d’un raccourci n’est jamais déclaré : TypeScript le déduit de l’appel.

- La table donne son `JSONSelectable`.
- `columns` ne garde que ces clés, comme le fait `returning` pour [`insert()` et les autres écritures](/fr/insert#insert-options).
- Chaque clé d’`extras` ajoute le type de sa colonne, ou de son fragment `sql`.
- Chaque clé de `lateral` ajoute le type du résultat de sa sous-requête, déduit de la même façon, un niveau plus bas. Un `lateral` donné comme [une seule sous-requête](/fr/lateral#keep-only-the-far-side) remplace plutôt la ligne par son résultat.

Le raccourci fixe ensuite la forme : un tableau pour `select()`, la ligne ou `undefined` pour `selectOne()`, la ligne pour `selectExactlyOne()`, un nombre pour `count()`. Survolez `films` pour voir ce qu’a donné cette requête :

<CastPanel example="catalog_types_result">

<<< ../examples/catalog_types_result.ts{ts twoslash}

</CastPanel>

Trois choses dans ce type méritent qu’on s’y arrête :

- **`studio` peut être `null`, pas `undefined`.** `selectOne()` peut ne rien trouver, et dans une requête imbriquée, rien, c’est le `null` de JSON : le type change donc l’`undefined` en `null`.
- **`hours` est un `number` parce que vous l’avez dit.** Le type d’un fragment `sql` est son second argument de type, ici `number`, et pgcast n’analyse pas votre SQL pour le vérifier ([Arguments de type](/fr/sql-template#type-arguments)). `year`, une colonne, prend son type du schéma.
- **`roles` est un `number`**, le type de `count()`, bien que Postgres compte en `int8` : comme Zapatos, pgcast suppose qu’aucun compte n’approche `Number.MAX_SAFE_INTEGER`.

Ici `studio` ne manque jamais, puisque `films.studio_id` est `NOT NULL REFERENCES studios` ; mais le générateur ne lit pas les clés étrangères, alors dites-le vous-même avec `selectExactlyOne()`, et `studio` perd son `| null`. La doc de Zapatos range ce point parmi ses limites, et [#54](https://github.com/AlexandreDemartin/pgcast/issues/54) prévoit de le lire dans le catalogue.

Tout cela demande `strictNullChecks`, ou `strict`. Sans cette option, `columns`, `extras`, `lateral` et `returning` laissent le type au `JSONSelectable` complet de la table, et `films[0].studio` ne compile pas ([Options de `select()`](/fr/select#options)).

## Ce que pgcast a gardé, et ce qu’il change {#what-pgcast-kept-and-what-it-changes}

Le générateur est celui de Zapatos 6.6.1, son canary de version toujours à 104 ([`SchemaVersionCanary`](/fr/runtime-config#SchemaVersionCanary)). Ses corrections changent `schema.d.ts` là où celui de 6.6.1 se trompait : l’`UniqueIndex` d’une table ne liste que ses propres index uniques, et chaque ligne d’un commentaire de colonne sur plusieurs lignes reçoit son `*` ([changelog](/fr/changelog)).

Les changements qu’apporte pgcast sont dans le runtime, pas dans les types générés. [`raw()`](/fr/sql-template#raw), [`cols()`](/fr/sql-template#cols) et [`vals()`](/fr/sql-template#vals) ne passent plus la vérification de types comme valeur d’un `Whereable`, d’un `Insertable` ou d’un `Updatable`, là où 6.6.1 les prenait pour un `Parameter`, un objet de même forme (`{ value }`).

Et une valeur `undefined` peut signifier une clé absente, avec [`undefinedMeansMissing`](/fr/runtime-config#Config.undefinedMeansMissing) ([Une valeur `undefined`](/fr/insert#undefined-values)). Les changements de la sortie elle-même viennent de la même façon, chacun comme une correction ou un opt-in à part : tant que [`typeEnumsAcrossSchemas`](/fr/generator#generate.typeEnumsAcrossSchemas) et [`enumOrder`](/fr/generator#generate.enumOrder) sont désactivés, le reste de `schema.d.ts` est celui de 6.6.1 ([Versions](/fr/versions)).

Ce que pgcast refuse, c’est une seconde source de vérité : une classe modèle, un schéma écrit en TypeScript, un type déclaré à côté de la table qu’il décrit. La base a le dernier mot, et le prix est une habitude : relancez le générateur après chaque migration, et laissez TypeScript vous signaler les requêtes qui ne collent plus ([Première requête](/fr/first-query#when-the-schema-changes)).

## Pour aller plus loin {#further-reading}

- Les entrées dont parle cette page : [options de `select()`](/fr/select#options), [`JSONOnlyColsForTable`](/fr/select#JSONOnlyColsForTable), [`ExtrasResult`](/fr/select#ExtrasResult), [`LateralResult`](/fr/select#LateralResult), [`RunResultForSQLFragment`](/fr/sql-template#RunResultForSQLFragment), les [types de valeurs](/fr/runtime-config#value-types).
- Le générateur, ses options et les fichiers qu’il écrit : [Générateur](/fr/generator).
- Compléter un fichier à compléter : [Types personnalisés](/fr/custom-types).
