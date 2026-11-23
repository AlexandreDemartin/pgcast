/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import type { Parameter, ParentColumn, SQLFragment } from './core';

// no longer used in src/db (core.ts and shortcuts.ts declare their own), and kept: the declarations a package emitted
// under node10 resolution, against Zapatos 6.6.1 or against pgcast before #578, name it as `zapatos/dist/db/utils`
// (test/types/utils.test-d.ts)
export type NoInfer<T> = [T][T extends any ? 0 : never];  // https://github.com/Microsoft/TypeScript/issues/14829

/**
 * The type of a domain's column in one context of the generated schema, with the generator's `domainsTypedByContext`:
 * `InContext`, its base type's type there, while its placeholder `Custom` is still exactly `Generated`, the type the
 * generator wrote in it; otherwise `Custom`, in every context, as without the option. So an `any` stays `any`, and an
 * `any[]` stays `any[]`, such as a placeholder Zapatos 6.6.1 wrote over `int8[]` with no import.
 */
export type DomainInContext<Custom, Generated, InContext> =
  (<T>() => T extends Custom ? 1 : 2) extends (<T>() => T extends Generated ? 1 : 2) ? InContext : Custom;

/**
 * The value a `Whereable` takes for a column of type `T`, written by the generator's `valuesTypedAsAliases` in place of
 * the union it otherwise spells out on each line: the same type.
 */
export type WhereableValue<T> =
  T | Parameter<T> | SQLFragment | ParentColumn | SQLFragment<any, T | Parameter<T> | SQLFragment | ParentColumn>;

/**
 * The value an `Insertable` takes for a column of type `T`, written as `WhereableValue` is. `Extra` is
 * `null | DefaultType` for a nullable column, `DefaultType` for one with a default.
 */
export type InsertableValue<T, Extra = never> = T | Parameter<T> | Extra | SQLFragment<any>;

/** The value an `Updatable` takes for a column of type `T`, with `Extra` as in `InsertableValue`. */
export type UpdatableValue<T, Extra = never> =
  T | Parameter<T> | Extra | SQLFragment | SQLFragment<any, T | Parameter<T> | Extra | SQLFragment>;

// an identifier as Postgres lexes it, as a regexp source for the `u` flag: unquoted, any non-ASCII character
// is a letter and `$` may follow the first one; quoted, or `U&` quoted, anything but NUL, with `""` for `"`;
// and the spaces Postgres allows around a dot, its ASCII ones only: a non-ASCII space is a letter to it, and
// `\s` would make a test backtrack for ever on a long run of them (see https://github.com/postgres/postgres/blob/master/src/backend/parser/scan.l)
export const
  identifier = /[A-Za-z_\u0080-\u{10FFFF}][A-Za-z0-9_$\u0080-\u{10FFFF}]*|(?:[Uu]&)?"(?:[^"\0]|"")+"/u.source,
  space = '[ \\t\\n\\r\\f\\v]*';

// the value of obj[k] (a shortcut's option, an option of exists() or isInSelect(), a key of an order or lock item,
// upsert()'s updateValues for a column; none when obj is null or undefined, as options left out), read through getters,
// prototypes and a Proxy's `get`, as in 6.6.1, except a key of Object.prototype that neither obj nor a prototype of its
// own has: there, `valueOf` or `hasOwnProperty` is a function, which threw, `__proto__` is Object.prototype, and any
// other key was added there by other code. For a data property, a Proxy answering through `get` alone keeps a value
// that differs by Object.is from Object.prototype's. For `__proto__`, compare the getter's result on the same receiver.
// For another getter, walk the chain: the getter may return a new value on each read. Each option read calls its
// getter or Proxy once, as before, except an order item's direction and nulls and a lock item's for and wait,
// which select() now reads once each (#586)
export function callerValue<T extends object, K extends keyof T & string>(obj: T | null | undefined, k: K): T[K] | undefined {
  const
    value = obj?.[k],
    held = Object.getOwnPropertyDescriptor(Object.prototype, k);
  if (value === undefined || held === undefined) return value;
  if (k === '__proto__' ? value !== Reflect.get(Object.prototype, k, obj) :
    Object.prototype.hasOwnProperty.call(held, 'value') ? !Object.is(value, held.value) : held.get === undefined) return value;
  for (let o: object | null = obj!; o !== null && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    if (Object.prototype.hasOwnProperty.call(o, k)) return value;
  }
  return undefined;
}

/**
 * Basic zero-padding for small, positive integers
 * @param n The integer to pad
 * @param pad The minimum desired output string length: 2, 3 or 4
 */
export const pad = (n: number, pad: 2 | 3 | 4 = 2) => {
  const s = String(n);
  return '000'.slice(s.length + 3 - pad) + s;
};

/**
 * Simple promisification of setTimeout.
 * @param delayMs Time to wait, in milliseconds
 */
export const wait = (delayMs: number) => new Promise(resolve => setTimeout(resolve, delayMs));

/**
 * Map an input array to an output array, interspersing a constant separator value 
 * between the mapped values.
 * @param arr Input array
 * @param separator Separator value
 * @param cb Mapping function
 */
export const mapWithSeparator = <TIn, TSep, TOut>(
  arr: readonly TIn[],
  separator: TSep,
  cb: (x: TIn, i: number, a: readonly TIn[]) => TOut
): (TOut | TSep)[] => {

  const result: (TOut | TSep)[] = [];
  for (let i = 0, len = arr.length; i < len; i++) {
    if (i > 0) result.push(separator);
    result.push(cb(arr[i], i, arr));
  }
  return result;
};

/**
 * Map an array of objects to an output array by taking the union of all objects' keys
 * and ensuring that any key not present on any object gets a default value. 
 * 
 * `e.g. [{ x: 1 }, { y: 2 }] => [{ x: 1, y: defaultValue }, { x: defaultValue, y: 2}]`
 * @param objs The array of objects
 * @param defaultValue The default value to assign to missing keys for each object
 */
export const completeKeysWithDefaultValue = <T extends object>(objs: T[], defaultValue: any): T[] => {
  // a row cols() or vals() refuse is left as it is, for them to refuse as the query compiles: a primitive (spread,
  // a string gave its character indexes as keys, a number none), a Buffer, before its keys, one per byte, are listed,
  // and a built-in with no own enumerable key, whose prototype is read only once its spread is found empty, so that a
  // row with keys has none read (Zapatos 6.6.1 spread both into a row of defaults, or of "0", "1" columns, #543);
  // null and undefined are read as {}, as in Zapatos 6.6.1. The keys are gathered into an object with no prototype,
  // so that they are the rows' own keys, as cols() lists one row's: none that Object.prototype was given, and a row's
  // own `__proto__` (from JSON.parse) is one of them, where `{}` took it as its prototype and listed that prototype's
  // keys. The defaults are a plain object, as before, which V8 spreads as fast: spread from one with no prototype,
  // each row took several times as long
  const unionKeys = Object.fromEntries(Object.keys(Object.assign(Object.create(null),
    ...objs.filter(o => !isPrimitive(o) && !isRefusedBuffer(o)))).map(k => [k, defaultValue]));
  return objs.map(o => {
    if (isPrimitive(o) || isRefusedBuffer(o)) return o;
    const own = { ...o };
    return o != null && !hasKey(own) && isBuiltin(o) ? o : { ...unionKeys, ...own };
  });
};

// for a plain object: for…in lists its own keys first, then any that Object.prototype was given, which are not its own
const hasKey = (x: object) => {
  for (const k in x) return Object.prototype.hasOwnProperty.call(x, k);
  return false;
};

/**
 * Test that a value is a primitive other than `null` and `undefined` (a string, a number…), which is no row
 * @param x The value to test
 */
export const isPrimitive = (x: unknown) => x != null && typeof x !== 'object' && typeof x !== 'function';

/**
 * Test that a value is a Plain Old JavaScript Object (such as one created by an object 
 * literal, e.g. `{x: 1, y: 2}`)
 * @param x The value to test 
 */
export const isPOJO = (x: any) =>
  typeof x === 'object' &&
  x !== null &&
  x.constructor === Object &&
  x.toString() === '[object Object]';

// built-in objects that are no filter, by their exact prototype, so that a class instance never is one, even of
// a class that extends a built-in. Zapatos 6.6.1 compiled them as Whereables of their own keys: none (`TRUE`,
// every row), or indexes (`"0" = $1`). A typed array's prototype is one whose own prototype is %TypedArray%'s:
// `Uint8Array.prototype`, `Float64Array.prototype`…, and not a subclass's (`Buffer` is listed for this reason).
// `AggregateError`, `WeakRef`, `FinalizationRegistry` (ES2021, past the lib's ES2019 types), `SuppressedError`,
// `DisposableStack`, `AsyncDisposableStack` (Node 24) and `SharedArrayBuffer` (which a runtime may leave out) are
// read from `globalThis`, where the runtime has them, as are the boxes `BigInt` (ES2020) and `Symbol`, the eight
// `Temporal` constructors (Node 26; Node 22 with `--harmony-temporal`, whose `TimeZone` and `Calendar`, dropped
// from the proposal, are left out) and the `Intl` ones (`DurationFormat` from Node 23). ECMAScript built-ins and
// ECMA-402's `Intl` only, no host object (`URL`, `Blob`).
// A namespace object (`Math`, `JSON`, `Reflect`, `Atomics`, `Intl`, and `Temporal` and `Temporal.Now` where the
// runtime has them) is matched by identity, as its prototype is `Object.prototype`, a plain object's, and its
// functions are no enumerable keys, and named by its path. Each is read from `globalThis`, so that a runtime
// without one still loads `zapatos/db`; `console` and `WebAssembly` are host APIs.
// An iterator or a generator, sync or async, is matched by %IteratorPrototype% or %AsyncIteratorPrototype% on its
// chain, as each generator function has its own prototype, and only with no own enumerable key, so that a class
// that extends `Iterator` with fields stays a filter, and one without is refused. So is a host iterator
// (`URLSearchParams`'s), which inherits them too.
// The `Segments` object that `Intl.Segmenter`'s `segment()` returns has no constructor to read a prototype from
// (ECMA-402's %IntlSegmentsPrototype%), so its prototype is read from one, the first time a filter's prototype has
// no `constructor` of its own: making a Segmenter as `zapatos/db` loads would cost every process about 7 ms, and
// a plain object, an array or a class instance never pays it. It is kept only if it inherits `Object.prototype`
// directly, as %IntlSegmentsPrototype% does: a runtime without `Intl.Segmenter`, or a stand-in whose `segment()`
// throws or gives a plain object or an iterator, leaves it out, so that an iterator with own keys stays a filter
const
  intl = (globalThis as any).Intl,
  temporal = (globalThis as any).Temporal,
  builtinPrototypes = new Set<unknown>([
    Date, Map, Set, WeakMap, WeakSet, RegExp, Promise, ArrayBuffer, DataView, Buffer, Number, String, Boolean,
    Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError,
    (globalThis as any).AggregateError, (globalThis as any).SuppressedError,
    (globalThis as any).WeakRef, (globalThis as any).FinalizationRegistry, (globalThis as any).SharedArrayBuffer,
    (globalThis as any).DisposableStack, (globalThis as any).AsyncDisposableStack,
    (globalThis as any).BigInt, (globalThis as any).Symbol,
    intl?.Collator, intl?.DateTimeFormat, intl?.DisplayNames, intl?.DurationFormat, intl?.ListFormat, intl?.Locale,
    intl?.NumberFormat, intl?.PluralRules, intl?.RelativeTimeFormat, intl?.Segmenter,
    temporal?.Duration, temporal?.Instant, temporal?.PlainDate, temporal?.PlainDateTime, temporal?.PlainMonthDay,
    temporal?.PlainTime, temporal?.PlainYearMonth, temporal?.ZonedDateTime,
  ].filter(Boolean).map(builtin => builtin.prototype)),
  builtinNamespaces = new Map<unknown, string>(Object.entries({
    Math: (globalThis as any).Math, JSON: (globalThis as any).JSON, Reflect: (globalThis as any).Reflect,
    Atomics: (globalThis as any).Atomics, Intl: intl, Temporal: temporal, 'Temporal.Now': temporal?.Now,
  }).filter(([, namespace]) => namespace).map(([path, namespace]) => [namespace, path])),
  typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype),
  // transpiled below ES2018, `async function* () {}` is a plain function, with no `.prototype` to read: then
  // %AsyncIteratorPrototype% is left out, rather than `zapatos/db` throwing as it loads
  asyncGeneratorPrototype = Object.getPrototypeOf(async function* () {}).prototype,
  iteratorPrototypes = [
    Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())),
    asyncGeneratorPrototype && Object.getPrototypeOf(asyncGeneratorPrototype),
  ].filter(Boolean);

let segmentsPrototype: object | null | undefined;
const isSegments = (prototype: object | null) => {
  if (prototype === null || Object.prototype.hasOwnProperty.call(prototype, 'constructor')) return false;
  if (segmentsPrototype === undefined) {
    try {
      const read = Object.getPrototypeOf(new intl.Segmenter().segment(''));
      segmentsPrototype = Object.getPrototypeOf(read) === Object.prototype ? read : null;
    } catch { segmentsPrototype = null; }
  }
  return prototype === segmentsPrototype;
};

const isIterator = (x: object) =>
  iteratorPrototypes.some(prototype => Object.prototype.isPrototypeOf.call(prototype, x)) && Object.keys(x).length === 0;

export const isBuiltin = (x: object) => {
  const prototype = Object.getPrototypeOf(x);
  return builtinNamespaces.has(x) || builtinPrototypes.has(prototype) ||
    (prototype !== null && Object.getPrototypeOf(prototype) === typedArrayPrototype) || isIterator(x) ||
    isSegments(prototype);
};

// an iterator's constructor gives no name (`''` for a generator's, `Object` before Node 22, which has no `Iterator`):
// its tag does, `Array Iterator`, `Generator`; `Segments` has neither, and would read `Object`
export const builtinName = (x: object): string => builtinNamespaces.get(x) ??
  (isIterator(x) ? Object.prototype.toString.call(x).slice(8, -1) :
    isSegments(Object.getPrototypeOf(x)) ? 'Segments' : Object.getPrototypeOf(x).constructor.name);

export const isRefusedBuffer = (x: object) => ArrayBuffer.isView(x) && Buffer.isBuffer(x) && isBuiltin(x);
export const isKeylessBuiltin = (x: object, keys: readonly unknown[]) => keys.length === 0 && isBuiltin(x);
