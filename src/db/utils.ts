/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

export type NoInfer<T> = [T][T extends any ? 0 : never];  // https://github.com/Microsoft/TypeScript/issues/14829

// an identifier as Postgres lexes it, as a regexp source for the `u` flag: unquoted, any non-ASCII character
// is a letter and `$` may follow the first one; quoted, or `U&` quoted, anything but NUL, with `""` for `"`;
// and the spaces Postgres allows around a dot, its ASCII ones only: a non-ASCII space is a letter to it, and
// `\s` would make a test backtrack for ever on a long run of them (see https://github.com/postgres/postgres/blob/master/src/backend/parser/scan.l)
export const
  identifier = /[A-Za-z_\u0080-\u{10FFFF}][A-Za-z0-9_$\u0080-\u{10FFFF}]*|(?:[Uu]&)?"(?:[^"\0]|"")+"/u.source,
  space = '[ \\t\\n\\r\\f\\v]*';

const warned = new Set<string>();

/**
 * Emit a `DeprecationWarning` once per process for each code.
 * @param code The warning code, e.g. `PGCAST_DEP001`
 * @param message What is deprecated, and the option that opts in to what replaces it
 */
export const warnOnce = (code: string, message: string) => {
  if (warned.has(code)) return;
  warned.add(code);
  process.emitWarning(message, { type: 'DeprecationWarning', code });
};

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
  const unionKeys = Object.assign({}, ...objs);
  for (const k in unionKeys) unionKeys[k] = defaultValue;
  return objs.map(o => ({ ...unionKeys, ...o }));
};

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
