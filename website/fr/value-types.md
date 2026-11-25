---
english: c7c78b919a20
---

# Types de valeurs

Les types que le schéma généré donne aux valeurs que JSON ou `pg` rendent sous forme de chaînes, et les fonctions qui les convertissent.
{.lede}

`pg` et JSON donnent certaines valeurs Postgres sous forme de chaînes. Le schéma généré les type avec les types template literal ci-dessous, selon l’endroit où se trouve la valeur ([Le catalogue](/fr/catalog-types)) :

| Type Postgres | `Selectable` | `JSONSelectable` | `Insertable`, `Updatable`, `Whereable` |
|---|---|---|---|
| `int8` | [`Int8String`](#Int8String) | `number` | `number \| Int8String \| bigint` |
| `numeric` | [`NumericString`](#NumericString) | `number` | `number \| NumericString` |
| `bytea` | `Buffer` | [`ByteArrayString`](#ByteArrayString) | `ByteArrayString \| Buffer` |
| `date` | `Date` | [`DateString`](#DateString) | `DateString \| Date` |
| `timestamp` | `Date` | [`TimestampString`](#TimestampString) | `TimestampString \| Date` |
| `timestamptz` | `Date` | [`TimestampTzString`](#TimestampTzString) | `TimestampTzString \| Date` |
| `time` | [`TimeString`](#TimeString) | `TimeString` | `TimeString` |
| `timetz` | [`TimeTzString`](#TimeTzString) | `TimeTzString` | `TimeTzString` |
| `int4range`, `int8range`, `numrange` | [`NumberRangeString`](#NumberRangeString) | `NumberRangeString` | `NumberRangeString` |
| `tsrange`, `tstzrange`, `daterange` | [`DateRangeString`](#DateRangeString) | `DateRangeString` | `DateRangeString` |
| `json`, `jsonb` | [`JSONValue`](#JSONValue) | `JSONValue` | `JSONValue` |

- Dans un `Selectable`, `int8[]` donne `Int8String[]`. Dans une ligne brute, un [tableau d’enums](/fr/generator#generate.enumArraysTypedAsText) est représenté par du texte par défaut.
- Avec l’option [`customJSONParsingForLargeNumbers`](/fr/generator#generate.customJSONParsingForLargeNumbers) du générateur, `int8` et `numeric` sont `number | Int8String` et `number | NumericString` dans un `JSONSelectable` ([`enableCustomJSONParsingForLargeNumbers()`](#enableCustomJSONParsingForLargeNumbers)).
- Les raccourcis renvoient des `JSONSelectable`. Un `Selectable` est ce que `pg` renvoie pour un simple `SELECT` de la ligne.
- Un domaine suit son type de base dans chaque contexte tant que son placeholder conserve le type généré ([`DomainInContext`](#DomainInContext)). En 7.x, avec [`domainsTypedByContext: false`](/fr/generator#generate.domainsTypedByContext), le type venait du placeholder ; la 8.0 retire cette option. Dans les lignes brutes, pour un [domaine portant directement sur un tableau d’enums](/fr/switching#domain-and-parser-types), `enumArraysTypedAsText: false` rétablit le type du placeholder. Pour un domaine sur un intervalle, `intervalsTypedAsObjects` détermine le type d’un nouveau placeholder.
- Un `interval` donne un [`PostgresInterval`](#PostgresInterval) dans `Selectable`, une `string` en JSON et `string | PostgresInterval` dans une écriture. Avec [`intervalsTypedAsObjects: false`](/fr/generator#generate.intervalsTypedAsObjects), les cinq interfaces utilisent `string`.

Chaque type vérifie la forme d’une chaîne, pas sa valeur : `'2030-13-45'` est un `DateString`.

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
const opening: db.DateString = '2030-03-01';
const premiere: db.TimestampTzString = '2030-03-01T19:30:00';
```

## `DomainInContext` {#DomainInContext}

```ts
type DomainInContext<Custom, Generated, InContext> =
  (<T>() => T extends Custom ? 1 : 2) extends (<T>() => T extends Generated ? 1 : 2) ? InContext : Custom
```

Le générateur utilise ce type pour les colonnes d’un domaine [typé selon le contexte](/fr/generator#generate.domainsTypedByContext) dans `JSONSelectable`, `Whereable`, `Insertable` et `Updatable`, ainsi que dans `Selectable` pour un domaine imbriqué ou un tableau de domaines. Tant que le placeholder `Custom` correspond exactement à `Generated`, le type qu’y a écrit le générateur, le résultat est `InContext`, le type de base du domaine dans ce contexte. Sinon, le résultat est `Custom`, dans tous les contextes.

- `DomainInContext<db.Int8String, db.Int8String, number>` est `number` : un placeholder laissé tel que généré.
- `DomainInContext<number | db.Int8String, db.Int8String, number>` est `number | db.Int8String` : un placeholder modifié garde son type, dans chaque contexte.
- Un `any` reste `any`, et un `any[]` reste `any[]`, comme un placeholder écrit par Zapatos 6.6.1 sur `int8[]` sans import. Un placeholder modifié vers le même type, `` `${number}` `` pour `db.Int8String`, compte comme laissé tel que généré.
- `DomainInContext<any, any, number>` est `number` : un domaine sur un domaine, dont le générateur a écrit `any` dans le placeholder. Modifié vers `unknown`, il reste `unknown`.

## `WhereableValue` {#WhereableValue}

```ts
type WhereableValue<T> =
  T | Parameter<T> | SQLFragment | ParentColumn | SQLFragment<any, T | Parameter<T> | SQLFragment | ParentColumn>
```

À partir de la 7.2.0. La valeur que prend un `Whereable` pour une colonne de type `T`, que l’option [`valuesTypedAsAliases`](/fr/generator#generate.valuesTypedAsAliases) du générateur écrit à la place de cette union : `db.WhereableValue<number>` pour `films.release_year`.

## `InsertableValue` {#InsertableValue}

```ts
type InsertableValue<T, Extra = never> = T | Parameter<T> | Extra | SQLFragment<any>
```

À partir de la 7.2.0. La valeur que prend un `Insertable` pour une colonne de type `T`, écrite aussi par `valuesTypedAsAliases`. `Extra` vaut `null | DefaultType` pour une colonne nullable, `DefaultType` pour une colonne qui a une valeur par défaut : `db.InsertableValue<string, null | db.DefaultType>` pour `films.tagline`.

## `UpdatableValue` {#UpdatableValue}

```ts
type UpdatableValue<T, Extra = never> =
  T | Parameter<T> | Extra | SQLFragment | SQLFragment<any, T | Parameter<T> | Extra | SQLFragment>
```

À partir de la 7.2.0. La valeur que prend un `Updatable` pour une colonne de type `T`, avec `Extra` comme dans `InsertableValue` : `db.UpdatableValue<string>` pour `films.title`.

## `PostgresInterval` {#PostgresInterval}

```ts
interface PostgresInterval {
  years?: number; months?: number; days?: number; hours?: number;
  minutes?: number; seconds?: number; milliseconds?: number;
  toPostgres(): string;
  toISO(): string;
}
```

Un `interval` tel que le renvoie le parser de types par défaut de `pg`, qu’écrit dans `Selectable` l’option [`intervalsTypedAsObjects`](/fr/generator#generate.intervalsTypedAsObjects) du générateur : chaque partie non nulle, `{ minutes: 15 }` pour `'00:15:00'`, et `{}` pour un `interval` nul. `toPostgres()` donne le texte que `pg` envoie dans une écriture, `'15 minutes'` ; `toISO()`, sa forme ISO 8601, `'P0Y0M0DT0H15M0S'`.

- C’est la forme du `PostgresInterval` de `postgres-interval`, que `pg` 7 et 8 apportent via `pg-types`, écrite en toutes lettres : pgcast ne dépend pas de ce paquet.
- Un simple objet n’en est pas un : sans `toPostgres()`, `pg` l’envoie en JSON. Postgres le refuse à partir de sa version 17 (22007) ; jusqu’à la 16, il stocke autre chose : `00:00:15` pour `{ minutes: 15 }`.

## JSON {#json}

### `JSONValue` {#JSONValue}

```ts
type JSONValue = null | boolean | number | string | JSONObject | JSONArray
```

Une valeur que JSON peut contenir : le type d’une colonne `json` ou `jsonb`. `undefined`, un `Date` et une fonction n’en sont pas.

### `JSONObject` {#JSONObject}

```ts
type JSONObject = { [k: string]: JSONValue }
```

Un objet JSON, chaque valeur un `JSONValue` : les `vars` de [`jsonbPathExists()`](/fr/conditions#conditions.jsonbPathExists).

### `JSONArray` {#JSONArray}

```ts
type JSONArray = JSONValue[]
```

Un tableau JSON, chaque élément un `JSONValue`.

## Grands nombres {#large-numbers}

### `Int8String` {#Int8String}

```ts
type Int8String = `${number}`
```

Un `int8` tel que `pg` le renvoie, une chaîne : `'9007199254740993'`, qu’aucun `number` ne peut contenir.

### `NumericString` {#NumericString}

```ts
type NumericString = `${number}`
```

Un `numeric` tel que `pg` le renvoie, une chaîne qui garde ses chiffres : `'1.10'`.

### `enableCustomJSONParsingForLargeNumbers()` {#enableCustomJSONParsingForLargeNumbers}

```ts
db.enableCustomJSONParsingForLargeNumbers(pg: typeof import('pg')): void
```

Fait parser par `pg` les valeurs `json` et `jsonb` avec [json-custom-numbers](https://www.npmjs.com/package/json-custom-numbers), qui donne un nombre sous forme de chaîne quand le convertir en `number` le modifierait. Chaque raccourci sauf les agrégats renvoie du `jsonb`, donc elle s’applique à leurs résultats.

```ts twoslash
import * as db from 'zapatos/db';
import pg from 'pg';
// ---cut---
db.enableCustomJSONParsingForLargeNumbers(pg);
```

| Un nombre dans du JSON | `JSON.parse()`, par défaut | Une fois activée |
|---|---|---|
| `12`, `0.1` | `12`, `0.1` | `12`, `0.1` |
| `9007199254740993` | `9007199254740992` | `'9007199254740993'` |
| `9007199254740992`, un entier au-delà de `Number.MAX_SAFE_INTEGER` | `9007199254740992` | `'9007199254740992'` |
| `1.00000000000000000001` | `1` | `'1.00000000000000000001'` |
| un `numeric` au-delà de `Number.MAX_VALUE` | `Infinity` | ses chiffres, sous forme de chaîne |

- Appelés directement, [`count()`](/fr/aggregates#count), `sum()` et `avg()` convertissent les valeurs non nulles avec `Number()`. Les appels directs à `min()` et `max()` donnent par défaut la valeur lue par `pg` et la convertissent avec `Number()` si `aggregatesTypedByColumn` vaut `false` à l’exécution. Sous une clé de `lateral`, c’est le parseur JSON de la requête extérieure qui s’applique. Activez le parseur personnalisé pour y préserver les grands nombres.
- Elle règle les parsers de types du module `pg` que vous donnez, donc de chaque pool et chaque client de ce module, à partir de là, requêtes de pgcast ou non.
- Elle ne change pas les types : c’est l’option [`customJSONParsingForLargeNumbers`](/fr/generator#generate.customJSONParsingForLargeNumbers) du générateur qui le fait.
- Une colonne `int8` ou `numeric` hors JSON est déjà une chaîne, par le parser de `pg` lui-même.

## Types range {#ranges}

### `RangeString` {#RangeString}

```ts
type RangeString<Bound extends string | number> = `${'[' | '('}${RangeBound<Bound>},${RangeBound<Bound>}${']' | ')'}` | 'empty'
type RangeBound<Bound extends string | number> = Bound | (number extends Bound ? 'Infinity' | '-Infinity' | 'NaN' : never)
```

Une valeur range telle que Postgres l’écrit : un crochet, deux bornes, un crochet, ou `'empty'` pour un range vide. Un range dont les bornes n’encadrent aucune valeur est vide lui aussi : `'[5,5)'::int4range` revient sous la forme `'empty'`. Postgres lit aussi `'EMPTY'`, et des espaces autour, mais n’écrit que `'empty'` : le type n’accepte donc que cette forme. Une borne `number` peut aussi valoir `Infinity`, `-Infinity` ou `NaN`, comme Postgres les écrit dans un `numrange`, même à partir de `infinity`, `inf` ou `nan` ; le type n’accepte que ces graphies. Zapatos 6.6.1 laissait de côté `'empty'` et ces trois valeurs.

### `NumberRangeString` {#NumberRangeString}

```ts
type NumberRangeString = RangeString<number | ''>
```

Un `int4range`, `int8range` ou `numrange` : `'[1,5)'`, `'[1.5,)'` sans borne supérieure, ou `'[0,Infinity)'` pour un `numrange`, dont les bornes peuvent être infinies ou `NaN`. Le type accepte aussi une telle borne pour les ranges d’entiers, alors que Postgres l’y refuse.

### `DateRangeString` {#DateRangeString}

```ts
type DateRangeString = RangeString<string>
```

Un `tsrange`, `tstzrange` ou `daterange`. Ses bornes suivent le `DateStyle` de la session, donc elles sont typées `string` : `daterange('2030-03-01', '2030-03-08')` vaut `'[2030-03-01,2030-03-08)'` avec le style `ISO`, et `'[01/03/2030,08/03/2030)'` avec `SQL, DMY`. Les bornes d’un `tsrange` ou d’un `tstzrange` arrivent entre guillemets, puisqu’elles contiennent une espace : `'["2030-03-01 19:30:00","2030-03-02 00:00:00")'`.

## Octets {#bytes}

### `ByteArrayString` {#ByteArrayString}

```ts
type ByteArrayString = `\\x${string}`
```

Un `bytea` en JSON, en hexadécimal après `\x` : `'\\x4c61'` dans le code source TypeScript.

### `toBuffer()` {#toBuffer}

```ts
db.toBuffer<T extends ByteArrayString | null>(d: T): T extends ByteArrayString ? Buffer<ArrayBuffer> | Exclude<T, ByteArrayString> : T
```

Décode l’hexadécimal d’un `ByteArrayString` en un `Buffer`, typé `Buffer<ArrayBuffer>`. `null` donne `null`, et le type le garde ; `undefined` lève une erreur, et le type le refuse avec `strictNullChecks` activé ([`strict()`](#strict)). Elle décode toute la valeur en mémoire.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const bytes = db.toBuffer('\\x4c61726b73707572');
const word = bytes.toString();  // 'Larkspur'
```

## Dates et heures {#dates-and-times}

Une date ou une heure dans un `JSONSelectable` est la chaîne qu’écrit `to_jsonb()`, en ISO 8601. Un `timestamptz` porte le décalage du `TimeZone` de la session : `'2030-03-01T19:30:00+00:00'` en `UTC`, `'2030-03-02T01:00:00+05:30'` en `Asia/Kolkata`.

<CastPanel example="toDate">

<<< ../examples/toDate.ts{ts twoslash}

</CastPanel>

| Type | Est | Par exemple |
|---|---|---|
| [`DateString`](#DateString) | `${number}-${number}-${number}` | `'2030-03-01'` |
| [`TimeString`](#TimeString) | `${number}:${number}`, puis un `:${number}` facultatif | `'19:30'`, `'19:30:00'` |
| [`TzSuffix`](#TzSuffix) | `'Z'`, ou `+` ou `-` et un nombre, puis un `:${number}` facultatif | `'Z'`, `'+01'`, `'+05:30'` |
| [`TimeTzString`](#TimeTzString) | `${TimeString}${TzSuffix}` | `'19:30:00+01'` |
| [`TimestampString`](#TimestampString) | `${DateString}T${TimeString}` | `'2030-03-01T19:30:00'` |
| [`TimestampTzString`](#TimestampTzString) | `${TimestampString}${TzSuffix}` | `'2030-03-01T19:30:00+00:00'` |

### `DateString` {#DateString}

```ts
type DateString = `${number}-${number}-${number}`
```

Une `date`.

### `TimeString` {#TimeString}

```ts
type TimeString = `${number}:${number}${'' | `:${number}`}`
```

Un `time`, avec ou sans ses secondes.

### `TzSuffix` {#TzSuffix}

```ts
type TzSuffix = 'Z' | `${'+' | '-'}${number}${'' | `:${number}`}`
```

Le fuseau horaire à la fin d’un `TimeTzString` ou d’un `TimestampTzString`.

### `TimeTzString` {#TimeTzString}

```ts
type TimeTzString = `${TimeString}${TzSuffix}`
```

Un `timetz`.

### `TimestampString` {#TimestampString}

```ts
type TimestampString = `${DateString}T${TimeString}`
```

Un `timestamp` : sans fuseau horaire.

### `TimestampTzString` {#TimestampTzString}

```ts
type TimestampTzString = `${TimestampString}${TzSuffix}`
```

Un `timestamptz`.

### `toDate()` {#toDate}

```ts
db.toDate<D extends null | TimestampTzString>(d: D, tzInterpretation?: undefined): D extends null ? null : Date
db.toDate<D extends null | TimestampString | DateString>(d: D, tzInterpretation: 'UTC' | 'local'): D extends null ? null : Date
```

Convertit en `Date` une chaîne venue de Postgres. Un `TimestampTzString` a son fuseau horaire. Un `TimestampString` ou un `DateString` n’en a pas, donc vous indiquez dans quel fuseau la lire : `'UTC'`, ou `'local'`, le fuseau horaire du processus JavaScript.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const curtain = db.toDate('2030-03-01T19:30:00+00:00');
const rehearsal = db.toDate('2030-03-01T15:00:00', 'UTC');
const opening = db.toDate('2030-03-01', 'local');
```

- `toDate('2030-03-01', 'UTC')` est minuit UTC ; `'local'` est minuit à l’heure locale.
- `null` donne `null` ; le type le garde, donc `TimestampTzString | null` donne `Date | null`.
- Un `Date` garde les millisecondes : les microsecondes d’une valeur Postgres sont perdues.
- Elle ne vérifie pas la chaîne : une chaîne qu’un `Date` ne sait pas lire donne une Invalid Date.

Un `TimestampString` ou un `DateString` sans `tzInterpretation` ne compile pas (TS2345). Un `TimestampTzString` avec un `tzInterpretation` non plus, puisque la première surcharge n’accepte `tzInterpretation` que comme `undefined` (TS2769) :

```ts twoslash
// @errors: 2345 2769
import * as db from 'zapatos/db';
// ---cut---
db.toDate('2030-03-01T15:00:00');
db.toDate('2030-03-01T19:30:00+00:00', 'UTC');
```

### `toString()` {#toString}

```ts
db.toString<D extends Date | null, T extends 'timestamptz' | 'timestamp:UTC' | 'timestamp:local' | 'date:UTC' | 'date:local'>(
  d: D,
  stringTypeTz: T,
): D extends null ? null : { timestamptz: TimestampTzString; 'timestamp:UTC': TimestampString; … }[T]
```

Convertit un `Date` en une chaîne que Postgres sait lire, typée selon `stringTypeTz` ; `null` donne `null`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const curtain = new Date('2030-03-01T19:30:00Z');
const day: db.DateString = db.toString(curtain, 'date:UTC');              // '2030-03-01'
const stamp: db.TimestampTzString = db.toString(curtain, 'timestamptz');  // '2030-03-01T19:30:00.000Z'
```

| `stringTypeTz` | Donne | Pour 19 h 30 UTC le 1er mars 2030, dans un processus avec `TZ=Asia/Kolkata` |
|---|---|---|
| `'timestamptz'` | `TimestampTzString`, d’après `toISOString()` | `'2030-03-01T19:30:00.000Z'` |
| `'timestamp:UTC'` | `TimestampString` | `'2030-03-01T19:30:00.000'` |
| `'timestamp:local'` | `TimestampString`, dans le fuseau horaire du processus | `'2030-03-02T01:00:00.000'` |
| `'date:UTC'` | `DateString` | `'2030-03-01'` |
| `'date:local'` | `DateString`, dans le fuseau horaire du processus | `'2030-03-02'` |

## `strict()` {#strict}

```ts
db.strict<FnIn, FnOut>(fn: (x: FnIn) => FnOut):
  <T extends FnIn | null>(d: T) => T extends FnIn ? Exclude<T, FnIn> | FnOut : T
```

Enveloppe une fonction à un argument pour que `null` donne `null` sans l’appeler, comme le fait une fonction Postgres déclarée `STRICT`. Le type suit : `FnIn` donne `FnOut`, `FnIn | null` donne `FnOut | null`, `null` donne `null`. [`toBuffer()`](#toBuffer) est `strict()` d’un décodeur de `ByteArrayString`.

```ts twoslash
import * as db from 'zapatos/db';
declare const tagline: string | null;
// ---cut---
const shout = db.strict((s: string) => s.toUpperCase());
const loud = shout(tagline);
```

- Seul `null` passe sans appel, comme seul `NULL` le fait pour une fonction `STRICT` dans Postgres : `undefined` atteint `fn`. Une fonction qui l’accepte le gère : `db.strict((title: string | undefined) => title ?? 'untitled')(undefined)` donne `'untitled'`.
- Avec `strictNullChecks` activé, le type refuse `undefined` sauf si `fn` l’accepte : `shout(undefined)` et `db.toBuffer(undefined)` ne compilent pas (TS2345).
- Avec `strictNullChecks` désactivé, un type ne contient ni `null` ni `undefined`, et aucun de ces types n’en dit rien : `toDate(null)` est typé `Date`, `shout(null)` `any`. `db.toBuffer(undefined)` compile alors, et lève « <span lang="en">TypeError: Cannot read properties of undefined (reading 'slice')</span> ».
