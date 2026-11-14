// Copyright (C) 2026 Alexandre Demartin
//
// One value of each kind that isIn() and isNotIn() refuse as their list (#235), keyed by the
// name their error gives. Zapatos 6.6.1 read `a.length`: none for an iterable, so `false` and
// `true` (every row for isNotIn); the keys of an array-like or a string as the values; a
// TypeError at the call for null and undefined.
// test/unit/injection.test.ts compiles them, test/integration/injection.test.ts runs them.

/** A fresh value of each kind that isIn() and isNotIn() refuse, keyed by the name their error gives. */
export const nonArrayLists = (): Record<string, unknown> => ({
  'Set': new Set([1, 2]),
  'Map Iterator': new Map([[1, 'a'], [2, 'b']]).keys(),
  'Generator': (function* () { yield 1; yield 2; })(),
  'Object': { length: 2, 0: 1, 1: 2 },
  'string': '12',
  'Uint8Array': new Uint8Array([1, 2]),
  'null': null,
  'undefined': undefined,
});
