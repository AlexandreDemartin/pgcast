// Copyright (C) 2026 Alexandre Demartin
// A query's values as `pg` sends them, for the playground's PGlite (pglite.ts), whose own serializers differ: a port of
// `prepareValue` from pg 8.23.1's lib/utils.js, which needs Node's `util` and `util/types` and so no bundle for a
// worker. What changes: any typed array or `DataView` stays as it is (pg copies it into a `Buffer`; PGlite sends both
// as binary, as pg sends a `Buffer`), a `Date` is told by `instanceof` (one realm here), and an invalid one emits no
// deprecation warning (Postgres rejects it all the same). `defaults.parseInputDatesAsUTC` is pg's default, false.
//
// node-postgres: MIT License, Copyright (c) 2010 - 2021 Brian Carlson.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of
// the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

const
  pad = (n: number | string, width = 2) => String(n).padStart(width, '0'),
  hex = (bytes: ArrayBufferView) =>
    Array.from(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), byte => pad(byte.toString(16))).join(''),
  escapeElement = (element: string) => '"' + element.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

/** A JS array as a Postgres array literal, with a comma between elements (not for `box`, whose separator is `;`). */
function arrayString(array: unknown[]): string {
  return '{' + array.map(item =>
    item == null ? 'NULL' :
      Array.isArray(item) ? arrayString(item) :
        ArrayBuffer.isView(item) ? '\\\\x' + hex(item) :
          escapeElement(prepare(item) as string)).join(',') + '}';
}

/** A `Date` as its local time, with its offset: `2030-03-01T00:00:00.000+05:30`; a year before 1 as BC. */
function dateToString(date: Date) {
  let offset = -date.getTimezoneOffset(), year = date.getFullYear();
  const isBCYear = year < 1;
  if (isBCYear) year = Math.abs(year) + 1;  // negative years are 1 off their BC representation
  let text = `${pad(year, 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  if (offset < 0) {
    text += '-';
    offset *= -1;
  } else text += '+';
  text += pad(Math.floor(offset / 60)) + ':' + pad(offset % 60);
  return isBCYear ? text + ' BC' : text;
}

function prepare(value: unknown, seen?: unknown[]): string | ArrayBufferView | null {
  if (value == null) return null;  // null and undefined are both null for Postgres
  if (typeof value === 'object') {
    if (ArrayBuffer.isView(value)) return value;
    if (value instanceof Date) return dateToString(value);
    if (Array.isArray(value)) return arrayString(value);
    const { toPostgres } = value as { toPostgres?: (prepare: (value: unknown) => unknown) => unknown };
    if (typeof toPostgres !== 'function') return JSON.stringify(value);
    seen ??= [];
    if (seen.includes(value)) throw new Error(`circular reference detected while preparing "${value}" for query`);
    seen.push(value);
    return prepare(toPostgres.call(value, prepare), seen);
  }
  return String(value);
}

/** `value` as `pg` sends it: text, bytes, or `null`. */
export const prepareValue = (value: unknown) => prepare(value);
