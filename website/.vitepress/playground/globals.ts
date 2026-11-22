// Copyright (C) 2026 Alexandre Demartin
// The Node global zapatos/db reads, set in the playground's worker before it loads: `Buffer`, one of the built-ins
// whose instances are values, not objects to cast (core.ts), and whose `byteLength` measures a name as Postgres cuts it
// (`exists()` and `isInSelect()` with `parent`, conditions.ts). `Buffer.from` (`db.toBuffer`) says it is not here.
// check-buffer.mjs fails the docs build on a static method that zapatos/db calls and this class lacks.
Object.assign(globalThis, {
  Buffer: class Buffer extends Uint8Array {
    static byteLength(text: string): number {
      return new TextEncoder().encode(text).length;
    }
    static from(): never {
      throw new Error('There is no `Buffer` in the playground: run the code that makes one (`db.toBuffer()`) in Node');
    }
    // no value in the worker is a Node `Buffer`: its only ones are this class's, as pglite.ts makes a `bytea`
    static isBuffer(value: unknown): boolean {
      return value instanceof Buffer;
    }
  },
});
