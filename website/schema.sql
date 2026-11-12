-- Copyright (C) 2026 Alexandre Demartin
-- The docs schema, in George MacKerron's world (his docs, § How do I use it?). pgcast's own generator writes
-- zapatos/schema.d.ts from it: `npm run docs:schema` (README.md). Step 3 of Epic #85 adds the other tables.

CREATE TABLE "authors"
( "id" SERIAL PRIMARY KEY
, "name" TEXT NOT NULL
, "isLiving" BOOLEAN );

CREATE TABLE "books"
( "id" SERIAL PRIMARY KEY
, "authorId" INTEGER NOT NULL REFERENCES "authors"("id")
, "title" TEXT
, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now() );
