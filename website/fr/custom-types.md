---
english: a729e0b05410
description: "Un type que le générateur ne sait pas traduire, comme point, et chaque domaine vous arrivent en placeholder dans zapatos/custom, que vous remplissez vous-même."
---

# Types personnalisés

Un type que le générateur ne sait pas traduire en TypeScript, comme `point`, et chaque domaine vous arrivent sous forme d’un placeholder dans `zapatos/custom`, que vous remplissez vous-même. Ici, nous remplissons `cinemas.location`, un `POINT`, et trouvons avec lui le cinéma le plus proche, puis nous typons le domaine `seat_label`, gardons les deux d’une génération à l’autre, et corrigeons un placeholder qui ne compile pas.
{.lede}

## Trouver le placeholder {#find-the-placeholder}

La première fois que le générateur rencontre un tel type, il écrit pour lui un placeholder, et le signale :

```txt
Writing new custom type or domain placeholder file: src/zapatos/custom/PgPoint.d.ts
```

Ce fichier lui donne `any` :

::: code-group

```ts [src/zapatos/custom/PgPoint.d.ts]
declare module 'zapatos/custom' {
  export type PgPoint = any;  // replace with your custom type or interface as desired
}
```

:::

Dans `schema.d.ts`, la colonne prend ce type dans les cinq interfaces : `location: c.PgPoint`, dans `cinemas.Selectable` et `JSONSelectable` comme dans `Whereable`, `Insertable` et `Updatable`. Tant qu’il vaut `any`, TypeScript ne vérifie rien : `location: { x: 1.5, y: 2.5 }` compile, et Postgres le refuse avec 22P02, `invalid input syntax for type point: "{"x":1.5,"y":2.5}"`.

Le nom du fichier, `PgPoint`, vient de [`customTypesTransform`](/fr/generator#generate.customTypesTransform).

## Le remplir {#fill-it-in}

Les raccourcis renvoient chaque ligne en JSON, qui écrit un point comme Postgres l’affiche : `"(0.4,1.2)"`. Postgres accepte aussi cette chaîne en retour, comme valeur. Dans `src/zapatos/custom/PgPoint.d.ts`, remplacez donc `any` par cette forme, un type template literal :

::: code-group

<<< ../zapatos/custom/PgPoint.d.ts#module{ts} [src/zapatos/custom/PgPoint.d.ts]

:::

Gardez la modification dans `declare module 'zapatos/custom'` : le fichier est la déclaration du module. La position d’un cinéma est maintenant vérifiée pendant que vous l’écrivez :

<CastPanel example="custom_types_insert">

<<< ../examples/custom_types_insert.ts{ts twoslash}

</CastPanel>

Et l’objet que Postgres refusait ne compile plus, ici dans une ligne typée `s.cinemas.Insertable` :

```ts twoslash
// @errors: 2353
import type * as s from 'zapatos/schema';
// ---cut---
const cinema: s.cinemas.Insertable = { name: 'The Harbour Lights', location: { x: 1.5, y: 2.5 } };
```

À partir de deux nombres, construisez le point en SQL, chaque nombre en [paramètre](/fr/sql-template#param) : cela envoie `VALUES (point($1, $2), $3)`<!-- probe: db.insert('cinemas', { name: 'The Harbour Lights', location: db.sql`point(${db.param(1.5)}, ${db.param(2.5)})` }) -->, car une valeur d’un `Insertable` peut être n’importe quel fragment [`sql`](/fr/sql-template#sql).

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
declare const x: number, y: number;
// ---cut---
await db.insert('cinemas', {
  name: 'The Harbour Lights',
  location: db.sql`point(${db.param(x)}, ${db.param(y)})`,
}).run(pool);
```

Postgres accepte aussi `'1.5,2.5'`, que le type refuse. Le type vérifie les parenthèses et la virgule, et laisse passer les espaces : `'(1.5, 2.5)'` compile, et Postgres l’accepte.

Un seul type sert les cinq interfaces. Mais votre propre requête typée `s.cinemas.Selectable` reçoit ses lignes de `pg`, qui parse un point en `{ x: 0.4, y: 1.2 }`, quoi que dise le type. Sélectionnez-y le point sous forme de texte, et les lignes correspondent au type :

<CastPanel example="custom_types_text">

<<< ../examples/custom_types_text.ts{ts twoslash}

</CastPanel>

La `location` de The Lantern vaut alors `"(0.4,1.2)"`, comme les raccourcis la donnent. Ou typez vous-même le résultat de cette requête ([`sql`](/fr/sql-template#sql)).

## Trouver le cinéma le plus proche {#find-the-nearest-cinema}

`<->` est la distance de Postgres entre deux points, ici en kilomètres. Triez par cette distance, et [`selectOne()`](/fr/select#selectOne) donne le cinéma le plus proche :

<CastPanel example="custom_types_nearest">

<<< ../examples/custom_types_nearest.ts{ts twoslash}

</CastPanel>

- The Lantern revient, avec pour `location` la chaîne `"(0.4,1.2)"`, typée `PgPoint`.
- Pour avoir aussi la distance, ajoutez le même fragment à [`extras`](/fr/select#extras) : `` km: db.sql<s.cinemas.SQL, number>`…` ``.
- L’index GiST sur `location` sert à ce tri : sur 20 000 cinémas, `EXPLAIN` montre `Index Scan using cinemas_location_idx` et `Order By: (location <-> '(0.5,1)'::point)`, sans étape de tri.

Pour trouver les cinémas situés à un point donné, comparez avec `~=`, le « identique à » de Postgres pour les points, dans un fragment passé comme `where` :

<CastPanel example="custom_types_same_as">

<<< ../examples/custom_types_same_as.ts{ts twoslash}

</CastPanel>

Cela donne The Lantern. Un Whereable `{ location: '(0.4,1.2)' }` compile mais échoue dans Postgres avec 42883, `operator does not exist: point = unknown` : un point n’a pas de `=`.

Pour nommer le type dans votre propre code, importez `zapatos/custom` comme vous importez `zapatos/schema` :

```ts twoslash
import type * as c from 'zapatos/custom';

const here: c.PgPoint = '(0.5,1)';
```

## Typer un domaine {#type-a-domain}

Un domaine a aussi son placeholder, qui contient le type `Selectable` de son type de base au lieu de `any` : le type que renvoie `pg`, ou l’union de ses valeurs ([plus bas](#a-domain-of-values)). Ce seul type sert les cinq interfaces, `JSONSelectable` compris, sauf si le domaine porte sur un type typé selon le contexte et que [`domainsTypedByContext`](/fr/generator#generate.domainsTypedByContext) est activé ([plus bas](#when-a-placeholder-does-not-compile)). Un domaine sur un autre domaine, ou un tableau d’un domaine, reçoit `any`, que cette option type par le type de base de son domaine le plus intérieur. `seat_label` est un `TEXT` avec un `CHECK`, donc `src/zapatos/custom/PgSeat_label.d.ts` contient `string`, qui est juste pour chacune :

::: code-group

<<< ../zapatos/custom/PgSeat_label.d.ts#module{ts} [src/zapatos/custom/PgSeat_label.d.ts]

:::

Et `seat_bookings.seat` est de type `c.PgSeat_label`. Le `CHECK` reste dans Postgres : TypeScript laisse passer `seat: 'f7'`, et Postgres le refuse avec 23514, `value for domain seat_label violates check constraint "seat_label_check"`. Interceptez-le avec [`isDatabaseError()`](/fr/transaction#isDatabaseError).

Un type template literal peut reprendre une partie du `CHECK`, une majuscule puis un nombre :

::: code-group

```ts [src/zapatos/custom/PgSeat_label.d.ts]
declare module 'zapatos/custom' {
  type PgSeat_labelRow = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I'
    | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R'
    | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';
  export type PgSeat_label = `${PgSeat_labelRow}${number}`;  // a row, then a number: F7
}
```

```ts [src/seats.ts]
import * as db from 'zapatos/db';
import type * as c from 'zapatos/custom';
import type pg from 'pg';

function isSeatLabel(seat: string): seat is c.PgSeat_label {
  return /^[A-Z][0-9]{1,2}$/.test(seat);  // the domain's CHECK
}

export async function bookSeat(pool: pg.Pool, screening_id: number, seat: string, customer: string) {
  if (!isSeatLabel(seat)) throw new Error(`There is no seat ${seat}`);
  return db.insert('seat_bookings', { screening_id, seat, customer }).run(pool);
}
```

:::

- `seat: 'f7'` ne compile alors plus, TS2322 dans une ligne typée `s.seat_bookings.Insertable` ; `'Z100'` compile toujours, et Postgres le refuse toujours.
- Chaque type de `declare module 'zapatos/custom'` est exporté, `PgSeat_labelRow` aussi : un type auxiliaire nommé `Row` entrerait en conflit avec celui d’un autre placeholder (TS2300).
- Une `string` venue d’un formulaire ne convient plus (TS2322 dans une ligne typée, TS2769 dans l’appel) : vérifiez-la d’abord, avec le motif du `CHECK`, dans un type guard, comme le fait `src/seats.ts`.
- Cette doc garde `PgSeat_label` tel que généré, `string`.

### Un domaine de valeurs {#a-domain-of-values}

Un domaine sur `text` dont le `CHECK` liste les valeurs peut être typé par elles. Disons qu’un film a une classification :

```sql
CREATE DOMAIN certificate AS text CHECK (VALUE IN ('U', 'PG', '12', '15', '18'));
COMMENT ON DOMAIN certificate IS 'Who may see the film';
ALTER TABLE films ADD COLUMN certificate certificate;
```

Activez [`domainsTypedAsUnions`](/fr/generator#generate.domainsTypedAsUnions), et le générateur lit les valeurs à chaque génération, déclare leur union dans `zapatos/schema` comme il déclare les labels d’un enum, et écrit le placeholder qui la nomme :

::: code-group

```ts [src/zapatos/schema.d.ts]
/**
 * **certificate**
 * - Domain in database
 *
 * Who may see the film
 */
export type certificate = 'U' | 'PG' | '12' | '15' | '18';
export namespace every {
  export type certificate = ['U', 'PG', '12', '15', '18'];
}
```

```ts [src/zapatos/custom/PgCertificate.d.ts]
declare module 'zapatos/custom' {
  import type { certificate } from 'zapatos/schema';
  export type PgCertificate = certificate;  // replace with your custom type or interface as desired
}
```

:::

`films.certificate` reste `c.PgCertificate` dans les cinq interfaces, désormais `'U' | 'PG' | '12' | '15' | '18'`. Une classification que le `CHECK` refuse ne compile plus, là où Postgres la refusait à l’exécution, avec 23514, `value for domain certificate violates check constraint "certificate_check"` :

```ts
await db.insert('films', {
  studio_id: 1, title: 'The Lantern', release_year: 2024, runtime_minutes: 98,
  certificate: '12A',  // TS2769; TS2322 in a row typed s.films.Insertable
}).run(pool);
```

- Le SQL ne change pas : `'12'` part toujours en paramètre, et Postgres le vérifie toujours.
- Ajoutez une valeur au `CHECK`, lancez le générateur, et l’union la contient : le placeholder ne fait que la nommer.
- Un placeholder déjà sur le disque, écrit avant l’option ou modifié, continue de typer la colonne : le générateur ne le réécrit jamais, et le signale à chaque génération. Supprimez-le, et la génération suivante l’écrit en nommant l’union. Un type plus étroit ou « branded » reste à vous de l’y écrire : `certificate & { readonly __brand: 'Certificate' }`.
- Ce qu’il lit, et ce qu’il laisse de côté, comme `varchar`, `NULL` parmi les valeurs ou un `CHECK` ajouté `NOT VALID` : [`domainsTypedAsUnions`](/fr/generator#generate.domainsTypedAsUnions).

### Un domaine `jsonb` {#a-jsonb-domain}

Un domaine est aussi le moyen de donner une forme à une colonne `jsonb`. Supposons qu’un cinéma ait une colonne `screen`, d’un domaine sur `jsonb` :

```sql
CREATE DOMAIN projection AS jsonb;
ALTER TABLE cinemas ADD COLUMN screen projection;
```

Le générateur écrit `PgProjection.d.ts` avec `db.JSONValue` et l’import dont il a besoin. Remplacez le type par une interface :

::: code-group

```ts [src/zapatos/custom/PgProjection.d.ts]
declare module 'zapatos/custom' {
  export interface PgProjection {
    format: '35mm' | '70mm' | 'digital';
    seats: number;
  }
}
```

:::

Une ligne typée `s.cinemas.Insertable` avec `screen: { format: 'VHS', seats: 120 }` ne compile alors plus (TS2322), et le `screen.format` d’un cinéma est typé `'35mm' | '70mm' | 'digital'`. Postgres n’en vérifie rien, et stocke cette valeur malgré tout : le type est votre promesse sur ce que contient la colonne.

## Le garder d’une génération à l’autre {#keep-it-across-runs}

Le générateur écrit un placeholder une seule fois, quand il manque, et ne l’écrase jamais. Avec [`progressListener`](/fr/generator#generate.progressListener), les générations suivantes affichent :

```txt
Custom type or domain declaration file already exists: src/zapatos/custom/PgPoint.d.ts
Custom type or domain declaration file already exists: src/zapatos/custom/PgSeat_label.d.ts
```

- Versionnez `zapatos/custom/` avec votre code : les fichiers que vous avez complétés sont à vous.
- Le placeholder ne suit pas la base, sauf s’il nomme une [union de valeurs](#a-domain-of-values). Recréez un domaine sur un autre type, et modifiez son fichier ; ou supprimez le fichier, et la génération suivante en écrit un neuf.
- Rien n’est supprimé : renommez ou supprimez un domaine, et son ancien placeholder reste jusqu’à ce que vous le supprimiez.
- Une colonne tableau est un type personnalisé à part entière : `point[]` reçoit `Pg_point.d.ts`, `any`, et `seat_label[]` reçoit `Pg_seat_label.d.ts`, `any` aussi.
- Deux domaines de même nom dans deux schémas partagent un seul placeholder ([#42](https://github.com/AlexandreDemartin/pgcast/issues/42)). Le type de la colonne lue en dernier, par schéma, puis relation, puis colonne, le détient, toujours le même d’une exécution à l’autre, et écrit ce qu’il écrirait seul. Dans une relation, c’est la colonne que Zapatos 6.6.1 lisait en dernier ; d’une relation à l’autre, celle de 6.6.1 pouvait changer d’une exécution à l’autre, et la 6.6.1 pouvait écrire le nom d’un enum sans import, ce qui ne compile pas ([#661](https://github.com/AlexandreDemartin/pgcast/issues/661)).

## Quand un placeholder ne compile pas {#when-a-placeholder-does-not-compile}

Le placeholder d’un domaine contient le nom TypeScript de son type de base, et importe ce dont ce nom a besoin : `zapatos/db` pour un type `db.*`, `zapatos/schema` pour un enum. Zapatos 6.6.1 et pgcast jusqu’à la 6.6.2 n’importaient `zapatos/db` que pour `db.JSONValue`, et le générateur ne réécrit jamais un placeholder. Si l’un de ces placeholders ne compile pas, ajoutez l’import, ou supprimez le fichier et relancez la génération ([#184](https://github.com/AlexandreDemartin/pgcast/issues/184)) :

| Type du placeholder | `tsc` dit | Ajoutez, dans `declare module` |
|---|---|---|
| `db.Int8String`, pour un domaine sur `bigint` ; de même pour `numeric`, `time` et les types range | TS2503, `Cannot find namespace 'db'.` | `import type * as db from 'zapatos/db';` |
| `crew_job`, pour `CREATE DOMAIN lead_job AS crew_job`, sur un enum | TS2304, `Cannot find name 'crew_job'.` | `import type { crew_job } from 'zapatos/schema';` |

- Un enum hors de [`unprefixedSchema`](/fr/generator#generate.unprefixedSchema) est dans l’espace de noms de son schéma : le placeholder importe cet espace de noms, `import type { archive } from 'zapatos/schema';`, et contient `archive.format`. Un placeholder écrit auparavant contient `format` : ajoutez cet import et remplacez `format` par `archive.format`, car `import type { format }` y donne TS2305.
- Un enum dont le nom contient une majuscule ou est l’un des types propres à TypeScript (`"Date"`, `string`) ne reçoit toujours aucun import, comme dans Zapatos 6.6.1 : ce nom peut être celui d’un type global, qui compile.
- Un placeholder qui prend le nom même de son enum ne peut pas l’importer sous ce nom : avec [`customTypesTransform`](/fr/generator#generate.customTypesTransform) à `'my_type'`, ou à une fonction qui garde le nom, `genre`, le placeholder d’une colonne de `films` du domaine `catalogue.genre` sur l’enum `genre`, le nomme sans import, `export type genre = import('zapatos/schema').genre;`. Zapatos 6.6.1 écrivait `genre`, TS2456 (`Type alias 'genre' circularly references itself.`), et pgcast de la 6.7.0 à la 6.9.0 l’importait en plus, TS2440 (`Import declaration conflicts with local declaration of 'genre'.`) : écrivez ce type dans un placeholder écrit auparavant, ou supprimez-le et relancez la génération ([#649](https://github.com/AlexandreDemartin/pgcast/issues/649)).
- Avec [`customTypesTransform`](/fr/generator#generate.customTypesTransform) à `'my_type'`, ou à une fonction qui garde le nom, un placeholder qui prend le nom du schéma de son domaine, `tone` pour un domaine `tone.tone` sur l’enum `tone.mood`, importe l’espace de noms de ce schéma, `import type { tone }`. Quand `zapatos/schema` déclare aussi un type nommé `tone`, un enum ou une union d’[`unprefixedSchema`](/fr/generator#generate.unprefixedSchema), ou l’un des siens, comme `Table` ou `Selectable`, cet import l’apporte en plus, TS2440 (`Import declaration conflicts with local declaration of 'tone'.`) : le placeholder nomme alors le type sans import, `export type tone = import('zapatos/schema').tone.mood;`. pgcast de la 6.7.0 à la 6.10.0 écrivait l’import : écrivez ce type dans un placeholder écrit auparavant, ou supprimez-le et relancez la génération ([#661](https://github.com/AlexandreDemartin/pgcast/issues/661)).
- Depuis la 7.0, si une table utilise un domaine qui repose sur un enum d’un autre schéma, le générateur écrit les labels de l’enum dans le placeholder de ce domaine à sa première génération, pourvu qu’aucun autre type ne porte le même nom de placeholder. Avec [`typeEnumsAcrossSchemas: false`](/fr/generator#generate.typeEnumsAcrossSchemas), chaque table cherche l’enum dans son propre schéma. Si deux tables trouvent des enums différents, importez celui sur lequel repose le domaine. Si une table ne trouve aucun enum de ce nom, le placeholder reçoit `any`, sauf si [un autre type partage ce placeholder](https://github.com/AlexandreDemartin/pgcast/issues/42). Zapatos 6.6.1 écrivait le nom de l’enum ou `any` selon [la table lue en dernier](https://github.com/AlexandreDemartin/pgcast/issues/455). Pour mettre à jour un placeholder existant, suivez le [guide de migration](/fr/switching).

Pour `CREATE DOMAIN ticket_no AS bigint`, le placeholder contient `db.Int8String`, la chaîne que `pg` renvoie pour un `bigint`. Mais les raccourcis renvoient un `bigint` sous forme de nombre JSON : un `ticket_no` que renvoie [`select()`](/fr/select#select) est un `number` typé `db.Int8String`, donc `.padStart()` compile, puis lève une erreur ; et une ligne pour [`insert()`](/fr/insert#insert), typée `Insertable`, refuse `1` (TS2322).

Activez [`domainsTypedByContext`](/fr/generator#generate.domainsTypedByContext), et un placeholder laissé tel que généré type plutôt la colonne selon le contexte : un `number` renvoyé par les raccourcis, `number | Int8String | bigint` dans une écriture, et la chaîne que renvoie `pg` dans un `Selectable`. Sans l’option, typez-le comme les deux à la fois :

::: code-group

```ts [src/zapatos/custom/PgTicket_no.d.ts]
declare module 'zapatos/custom' {
  import type * as db from 'zapatos/db';
  export type PgTicket_no = number | db.Int8String;  // pg returns a string, the shortcuts a number
}
```

:::

- Un domaine sur `numeric`, `date`, `timestamp`, `timestamptz`, `bytea` ou `money` est dans le même cas : son placeholder contient ce que renvoie `pg`, moins que ce qu’accepte une écriture et, sauf pour `money`, autre chose que ce que renvoient les raccourcis, et l’option le type aussi selon le contexte.
- Un placeholder modifié, comme celui-ci, garde son type dans les cinq interfaces, même avec l’option.
- Au-delà de `Number.MAX_SAFE_INTEGER`, le nombre perd ses derniers chiffres, comme pour tout `bigint` : `9007199254740993` revient en `9007199254740992` ([`customJSONParsingForLargeNumbers`](/fr/generator#generate.customJSONParsingForLargeNumbers)).

## Voir aussi {#see-also}

- [Les fichiers qu’il écrit](/fr/generator#the-files-it-writes) : chaque fichier que le générateur écrit, et quand.
- [`customTypesTransform`](/fr/generator#generate.customTypesTransform) : les noms des placeholders.
- [Le catalogue](/fr/catalog-types) : pourquoi un type diffère entre `Selectable` et `JSONSelectable`.
