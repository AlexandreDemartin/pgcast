-- Copyright (C) 2026 Alexandre Demartin
-- The home's loop (index.md, loop.data.ts): a column changes. `npm run docs:schema` applies this to the docs schema
-- and generates loop/schema.d.ts from the result, as `npx zapatos` would after this migration.
ALTER TABLE films ALTER COLUMN runtime_minutes DROP NOT NULL;
