// Copyright (C) 2026 Alexandre Demartin
//
// One value of each built-in object that compileExpression refuses as a Whereable (#170),
// keyed by the name its error gives. Each has no own enumerable key, or only index keys,
// so Zapatos 6.6.1 compiled it to TRUE (every row) or to ("0" = $1 …); one with own keys
// added throws too. A subclass instance is not one of them, and compiles as in 6.6.1.
// test/unit/injection.test.ts compiles them, test/integration/injection.test.ts runs them.

/** A fresh value of each refused built-in object, keyed by the name its error gives. */
export const builtinObjects = (): Record<string, object> => {
  const
    Float16Array = (globalThis as any).Float16Array,  // Node 24 and later
    AggregateError = (globalThis as any).AggregateError,  // ES2021: not in the lib's ES2019 types
    SuppressedError = (globalThis as any).SuppressedError,  // Node 24 and later
    WeakRef = (globalThis as any).WeakRef,  // ES2021: not in the lib's ES2019 types
    FinalizationRegistry = (globalThis as any).FinalizationRegistry,  // ES2021: not in the lib's ES2019 types
    DisposableStack = (globalThis as any).DisposableStack,  // Node 24 and later
    AsyncDisposableStack = (globalThis as any).AsyncDisposableStack;  // Node 24 and later
  return {
    Date: new Date(0),
    Map: new Map([['id', 1]]),
    Set: new Set(['id']),
    WeakMap: new WeakMap(),
    WeakSet: new WeakSet(),
    WeakRef: new WeakRef({}),
    FinalizationRegistry: new FinalizationRegistry(() => {}),
    RegExp: /id/g,
    Promise: Promise.resolve({ id: 1 }),
    Error: new Error('id'),
    EvalError: new EvalError('id'),
    RangeError: new RangeError('id'),
    ReferenceError: new ReferenceError('id'),
    SyntaxError: new SyntaxError('id'),
    TypeError: new TypeError('id'),
    URIError: new URIError('id'),
    AggregateError: new AggregateError([new Error('id')], 'id'),
    ...SuppressedError && { SuppressedError: new SuppressedError(new Error('id'), new Error('id'), 'id') },
    ArrayBuffer: new ArrayBuffer(1),
    SharedArrayBuffer: new SharedArrayBuffer(1),
    DataView: new DataView(new ArrayBuffer(1)),
    Uint8Array: new Uint8Array(1),
    Float64Array: new Float64Array(2),
    Buffer: Buffer.from('id'),
    BigInt64Array: new BigInt64Array(1),
    ...Float16Array && { Float16Array: new Float16Array(1) },
    Number: new Number(1),
    String: new String('id'),
    Boolean: new Boolean(true),
    ...DisposableStack && { DisposableStack: new DisposableStack() },
    ...AsyncDisposableStack && { AsyncDisposableStack: new AsyncDisposableStack() },
  };
};
