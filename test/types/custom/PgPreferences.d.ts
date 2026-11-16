// Copyright (C) 2026 Alexandre Demartin
//
// The placeholder of the fixture's domain preferences, over jsonb, narrowed as website/custom-types.md § A `jsonb`
// domain teaches, with an interface: this program reads it in place of ../../generated/zapatos/custom/PgPreferences.d.ts
// (tsconfig.json), left as generated, `db.JSONValue`.

declare module 'zapatos/custom' {
  export interface PgPreferences {
    theme: 'dark' | 'light';
    sizes?: number[];
  }
}
