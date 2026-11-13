// Copyright (C) 2026 Alexandre Demartin
//
// One value of each built-in object that compileExpression refuses as a Whereable (#170),
// keyed by the name its error gives. Each has no own enumerable key, or only index keys,
// so Zapatos 6.6.1 compiled it to TRUE (every row) or to ("0" = $1 …).
// test/unit/injection.test.ts compiles them, test/integration/injection.test.ts runs them.

/** A fresh value of each refused built-in object, keyed by the name its error gives. */
export const builtinObjects = (): Record<string, object> => {
  class Frames extends Uint8Array {}  // a view of a class of its own is still binary data
  return {
    Date: new Date(0),
    Map: new Map([['id', 1]]),
    Set: new Set(['id']),
    WeakMap: new WeakMap(),
    WeakSet: new WeakSet(),
    RegExp: /id/g,
    Promise: Promise.resolve({ id: 1 }),
    Error: new Error('id'),
    EvalError: new EvalError('id'),
    RangeError: new RangeError('id'),
    ReferenceError: new ReferenceError('id'),
    SyntaxError: new SyntaxError('id'),
    TypeError: new TypeError('id'),
    URIError: new URIError('id'),
    ArrayBuffer: new ArrayBuffer(1),
    DataView: new DataView(new ArrayBuffer(1)),
    Uint8Array: new Uint8Array(1),
    Float64Array: new Float64Array(2),
    Buffer: Buffer.from('id'),
    Frames: new Frames(1),
    Number: new Number(1),
    String: new String('id'),
    Boolean: new Boolean(true),
  };
};
