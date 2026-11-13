// Copyright (C) 2026 Alexandre Demartin
// The two Node globals zapatos/db reads, set in the playground's worker before it loads: `Buffer`, one of the
// built-ins whose instances are values, not objects to cast (core.ts), and `process.emitWarning`, for its deprecation
// warnings (utils.ts), which the playground shows under the SQL. `Buffer.from` (`db.toBuffer`) says it is not here.
export const warnings: string[] = [];

Object.assign(globalThis, {
  Buffer: class Buffer extends Uint8Array {
    static from(): never {
      throw new Error('There is no `Buffer` in the playground: run the code that makes one (`db.toBuffer()`) in Node');
    }
  },
  process: { emitWarning: (message: string, { code }: { code: string }) => warnings.push(`${code}: ${message}`) },
});
