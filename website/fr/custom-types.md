---
english: 91715467ffed
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

Un domaine a aussi son placeholder, qui contient le type `Selectable` de son type de base au lieu de `any` : le type que renvoie `pg`. Ce seul type sert les cinq interfaces, `JSONSelectable` compris. `seat_label` est un `TEXT` avec un `CHECK`, donc `src/zapatos/custom/PgSeat_label.d.ts` contient `string`, qui est juste pour chacune :

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
- Le placeholder ne suit pas la base. Recréez un domaine sur un autre type, et modifiez son fichier ; ou supprimez le fichier, et la génération suivante en écrit un neuf.
- Rien n’est supprimé : renommez ou supprimez un domaine, et son ancien placeholder reste jusqu’à ce que vous le supprimiez.
- Une colonne tableau est un type personnalisé à part entière : `point[]` reçoit `Pg_point.d.ts`, `any`, et `seat_label[]` reçoit `Pg_seat_label.d.ts`, `any` aussi.
- Deux domaines de même nom dans deux schémas partagent un seul placeholder ([#42](https://github.com/AlexandreDemartin/pgcast/issues/42)).

## Quand un placeholder ne compile pas {#when-a-placeholder-does-not-compile}

Le placeholder d’un domaine contient le nom TypeScript de son type de base, et importe ce dont ce nom a besoin : `zapatos/db` pour un type `db.*`, `zapatos/schema` pour un enum. Zapatos 6.6.1 et pgcast jusqu’à la 6.6.2 n’importaient `zapatos/db` que pour `db.JSONValue`, et le générateur ne réécrit jamais un placeholder. Si l’un de ces placeholders ne compile pas, ajoutez l’import, ou supprimez le fichier et relancez la génération ([#184](https://github.com/AlexandreDemartin/pgcast/issues/184)) :

| Type du placeholder | `tsc` dit | Ajoutez, dans `declare module` |
|---|---|---|
| `db.Int8String`, pour un domaine sur `bigint` ; de même pour `numeric`, `time` et les types range | TS2503, `Cannot find namespace 'db'.` | `import type * as db from 'zapatos/db';` |
| `crew_job`, pour `CREATE DOMAIN lead_job AS crew_job`, sur un enum | TS2304, `Cannot find name 'crew_job'.` | `import type { crew_job } from 'zapatos/schema';` |

- Un enum hors de [`unprefixedSchema`](/fr/generator#generate.unprefixedSchema) est dans l’espace de noms de son schéma : le placeholder importe cet espace de noms, `import type { archive } from 'zapatos/schema';`, et contient `archive.format`. Un placeholder écrit auparavant contient `format` : ajoutez cet import et remplacez `format` par `archive.format`, car `import type { format }` y donne TS2305.
- Un enum dont le nom contient une majuscule ou est l’un des types propres à TypeScript (`"Date"`, `string`) ne reçoit toujours aucun import, comme dans Zapatos 6.6.1 : ce nom peut être celui d’un type global, qui compile.
- Un domaine sur `genre` qu’utilise aussi une table du schéma `archive`, quand `archive` a son propre `genre`, ne reçoit pas d’import non plus, comme dans Zapatos 6.6.1. Sans [`typeEnumsAcrossSchemas`](/fr/generator#generate.typeEnumsAcrossSchemas), chaque table lit `genre` dans son propre schéma, et un seul placeholder ne peut pas importer les deux : importez celui sur lequel porte le domaine.

Pour `CREATE DOMAIN ticket_no AS bigint`, le placeholder contient `db.Int8String`, la chaîne que `pg` renvoie pour un `bigint`. Mais les raccourcis renvoient un `bigint` sous forme de nombre JSON : un `ticket_no` que renvoie [`select()`](/fr/select#select) est un `number` typé `db.Int8String`, donc `.padStart()` compile, puis lève une erreur ; et une ligne pour [`insert()`](/fr/insert#insert), typée `Insertable`, refuse `1` (TS2322). Typez-le comme les deux à la fois :

::: code-group

```ts [src/zapatos/custom/PgTicket_no.d.ts]
declare module 'zapatos/custom' {
  import type * as db from 'zapatos/db';
  export type PgTicket_no = number | db.Int8String;  // pg returns a string, the shortcuts a number
}
```

:::

- Un domaine sur `numeric`, `date`, `timestamp`, `timestamptz` ou `bytea` est dans le même cas : son placeholder contient ce que renvoie `pg`, pas ce que renvoient les raccourcis ([#194](https://github.com/AlexandreDemartin/pgcast/issues/194)).
- Au-delà de `Number.MAX_SAFE_INTEGER`, le nombre perd ses derniers chiffres, comme pour tout `bigint` : `9007199254740993` revient en `9007199254740992` ([`customJSONParsingForLargeNumbers`](/fr/generator#generate.customJSONParsingForLargeNumbers)).

## Voir aussi {#see-also}

- [Les fichiers qu’il écrit](/fr/generator#the-files-it-writes) : chaque fichier que le générateur écrit, et quand.
- [`customTypesTransform`](/fr/generator#generate.customTypesTransform) : les noms des placeholders.
- [Le catalogue](/fr/catalog-types) : pourquoi un type diffère entre `Selectable` et `JSONSelectable`.
