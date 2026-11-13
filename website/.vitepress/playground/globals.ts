// Copyright (C) 2026 Alexandre Demartin
// The two Node globals zapatos/db reads, set in the playground's worker before it loads: `Buffer`, one of the
// built-ins whose instances are values, not objects to cast (core.ts), and `process.emitWarning`, for its deprecation
// warnings (utils.ts), which the playground shows under the SQL.
export const warnings: string[] = [];

Object.assign(globalThis, {
  Buffer: class Buffer extends Uint8Array {},
  process: { emitWarning: (message: string, { code }: { code: string }) => warnings.push(`${code}: ${message}`) },
});
