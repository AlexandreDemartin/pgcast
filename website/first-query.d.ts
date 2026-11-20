// Copyright (C) 2026 Alexandre Demartin
// First query uses the new-project alias. Both spellings use the site's checked library and film schema.
declare module 'pgcast/db' { export * from 'zapatos/db'; }
declare module 'pgcast/schema' { export * from 'zapatos/schema'; }
