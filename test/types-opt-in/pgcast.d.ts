// Copyright (C) 2026 Alexandre Demartin
//
// The declaration website/runtime-config.md § ConfigTypes gives, in a file of its own, for the whole program:
// `export {}` makes it a module, which augments zapatos/db; without it, the file declares a zapatos/db of its own.
export {};

declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: true }
}
