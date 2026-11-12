-- Copyright (C) 2026 Alexandre Demartin
-- The docs schema, in George MacKerron's world: his tables, as his docs create them, and his rows. pgcast's own
-- generator writes zapatos/schema.d.ts from it: `npm run docs:schema` (README.md); CI fails if the committed file
-- differs. Plain Postgres, 14 or later: `stores` has a point where his had a PostGIS geometry.

CREATE TABLE "authors"
( "id" SERIAL PRIMARY KEY
, "name" TEXT NOT NULL
, "isLiving" BOOLEAN );

CREATE TABLE "books"
( "id" SERIAL PRIMARY KEY
, "authorId" INTEGER NOT NULL REFERENCES "authors"("id")
, "title" TEXT
, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now() );

CREATE TABLE "tags"
( "tag" TEXT NOT NULL
, "bookId" INTEGER NOT NULL REFERENCES "books"("id") ON DELETE CASCADE );

CREATE UNIQUE INDEX "tagsUniqueIdx" ON "tags"("tag", "bookId");

-- a self-reference, for lateral joins with an alias
CREATE TABLE "employees"
( "id" SERIAL PRIMARY KEY
, "name" TEXT NOT NULL
, "managerId" INTEGER REFERENCES "employees"("id") );

-- a many-to-many, for lateral passthrough
CREATE TABLE "photos"
( "photoId" int PRIMARY KEY GENERATED ALWAYS AS IDENTITY
, "url" text NOT NULL
);
CREATE TABLE "subjects"
( "subjectId" int PRIMARY KEY GENERATED ALWAYS AS IDENTITY
, "name" text NOT NULL
);
CREATE TABLE "subjectPhotos"
( "subjectId" int NOT NULL REFERENCES "subjects"("subjectId")
, "photoId" int NOT NULL REFERENCES "photos"("photoId")
, CONSTRAINT "userPhotosUnique" UNIQUE ("subjectId", "photoId")
);

-- for extras and joins on something other than a key: the nearest stores by `<->`, which a gist index serves. The
-- points are British National Grid eastings and northings, so a distance is in metres.
CREATE TABLE "stores"
( "id" SERIAL PRIMARY KEY
, "name" TEXT NOT NULL
, "geom" POINT NOT NULL );
CREATE INDEX "storesGeomIdx" ON "stores" USING gist("geom");

-- for upsert's updateValues
CREATE TABLE "nameCounts"
( "name" text PRIMARY KEY
, "count" integer NOT NULL
);

-- for transactions
CREATE TABLE "bankAccounts"
( "id" SERIAL PRIMARY KEY
, "balance" INTEGER NOT NULL DEFAULT 0 CHECK ("balance" >= 0) );

CREATE TABLE "doctors"
( "id" SERIAL PRIMARY KEY
, "name" TEXT NOT NULL );

CREATE TABLE "shifts"
( "day" DATE NOT NULL
, "doctorId" INTEGER NOT NULL REFERENCES "doctors"("id")
, PRIMARY KEY ("day", "doctorId") );

-- His rows. Keys start at 1000, as his books do, so an example that inserts gets 1, 2, 3, as in his docs.

INSERT INTO "authors" ("id", "name", "isLiving") VALUES
  (1000, 'Philip Pullman', true)
, (1001, 'Mark Haddon', true)
, (1002, 'Louis Sachar', true)
, (1003, 'Stephen Hawking', false);

INSERT INTO "books" ("id", "authorId", "title") VALUES
  (1000, 1000, 'Northern Lights')
, (1001, 1000, 'The Subtle Knife')
, (1002, 1000, 'The Amber Spyglass')
, (1003, 1001, 'The Curious Incident of the Dog in the Night-Time')
, (1004, 1002, 'Holes')
, (1005, 1003, 'A Brief History of Time');

INSERT INTO "tags" ("tag", "bookId") VALUES
  ('His Dark Materials', 1000), ('1/3', 1000)
, ('His Dark Materials', 1001), ('2/3', 1001)
, ('His Dark Materials', 1002), ('3/3', 1002)
, ('mystery', 1003)
, ('adventure', 1004)
, ('physics', 1005);

INSERT INTO "employees" ("id", "name", "managerId") VALUES
  (1000, 'Anna', NULL)
, (1001, 'Beth', 1000)
, (1002, 'Charlie', 1000)
, (1003, 'Dougal', 1001);

INSERT INTO "subjects" ("subjectId", "name") OVERRIDING SYSTEM VALUE VALUES
  (1000, 'Alice'), (1001, 'Bobby'), (1002, 'Cathy');

INSERT INTO "photos" ("photoId", "url") OVERRIDING SYSTEM VALUE VALUES
  (1000, 'photo1.jpg'), (1001, 'photo2.jpg'), (1002, 'photo3.jpg');

INSERT INTO "subjectPhotos" ("subjectId", "photoId") VALUES
  (1000, 1000), (1000, 1001), (1001, 1001), (1002, 1000), (1002, 1002);

INSERT INTO "stores" ("id", "name", "geom") VALUES
  (1000, 'Brighton', point(530590, 104190))
, (1001, 'London', point(534930, 179380))
, (1002, 'Edinburgh', point(323430, 676130))
, (1003, 'Newcastle', point(421430, 563130))
, (1004, 'Exeter', point(288430, 92130));

INSERT INTO "nameCounts" ("name", "count") VALUES
  ('Bobby', 2), ('Cathy', 1);

INSERT INTO "bankAccounts" ("id", "balance") VALUES
  (1000, 50), (1001, 50);

INSERT INTO "doctors" ("id", "name") VALUES
  (1000, 'Annabel'), (1001, 'Brian');

INSERT INTO "shifts" ("day", "doctorId") VALUES
  ('2020-12-24', 1000), ('2020-12-24', 1001)
, ('2020-12-25', 1000), ('2020-12-25', 1001);
