-- Copyright (C) 2026 Alexandre Demartin
-- The docs schema: pgcast's own example world, a film's cast. pgcast's own generator writes zapatos/ from it:
-- `npm run docs:schema` (README.md). Plain Postgres only, loaded as it is on 14, 16 and 18.
-- Every name is invented. Seeded rows have ids from 1000, so a row an example inserts gets a small id; the tables
-- that examples fill themselves (seat_bookings, ratings, tags) start empty.

CREATE TABLE studios
( id SERIAL PRIMARY KEY
, name TEXT NOT NULL );

CREATE TABLE films
( id SERIAL PRIMARY KEY
, studio_id INTEGER NOT NULL REFERENCES studios(id)
, title TEXT NOT NULL
, release_year INTEGER NOT NULL
, runtime_minutes INTEGER NOT NULL
, tagline TEXT );

CREATE TABLE actors
( id SERIAL PRIMARY KEY
, name TEXT NOT NULL );

-- The cast: who plays whom in which film (many-to-many)
CREATE TABLE roles
( film_id INTEGER NOT NULL REFERENCES films(id)
, actor_id INTEGER NOT NULL REFERENCES actors(id)
, character TEXT NOT NULL
, billing INTEGER NOT NULL
, PRIMARY KEY (film_id, billing) );

CREATE INDEX roles_actor_id_idx ON roles (actor_id);
COMMENT ON COLUMN roles.billing IS 'Position in the credits: 1 is top billing';

CREATE TYPE crew_job AS ENUM ('director', 'writer', 'editor', 'cinematographer', 'composer');

CREATE TABLE crew
( id SERIAL PRIMARY KEY
, name TEXT NOT NULL
, job crew_job NOT NULL
, mentor_id INTEGER REFERENCES crew(id) );

CREATE TABLE cinemas
( id SERIAL PRIMARY KEY
, name TEXT NOT NULL
, location POINT NOT NULL );

CREATE INDEX cinemas_location_idx ON cinemas USING gist (location);
COMMENT ON COLUMN cinemas.location IS 'Kilometres east and north of the city centre';

CREATE TABLE screenings
( id SERIAL PRIMARY KEY
, film_id INTEGER NOT NULL REFERENCES films(id)
, cinema_id INTEGER NOT NULL REFERENCES cinemas(id)
, starts_at TIMESTAMPTZ NOT NULL );

CREATE TABLE seat_bookings
( screening_id INTEGER NOT NULL REFERENCES screenings(id)
, seat TEXT NOT NULL
, customer TEXT NOT NULL
, booked_at TIMESTAMPTZ NOT NULL DEFAULT now()
, PRIMARY KEY (screening_id, seat) );

CREATE TABLE ratings
( film_id INTEGER NOT NULL REFERENCES films(id)
, stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5)
, votes INTEGER NOT NULL DEFAULT 1
, PRIMARY KEY (film_id, stars) );

CREATE TABLE tags
( film_id INTEGER NOT NULL REFERENCES films(id)
, tag TEXT NOT NULL
, PRIMARY KEY (film_id, tag) );

INSERT INTO studios (id, name) VALUES
  (1000, 'Larkspur Pictures')
, (1001, 'Greyhaven Studios')
, (1002, 'Ninefold Films');

INSERT INTO films (id, studio_id, title, release_year, runtime_minutes, tagline) VALUES
  (1000, 1000, 'The Salt Orchard', 1974, 112, 'Some harvests take a lifetime.')
, (1001, 1001, 'A Lantern for Edith', 1991, 98, NULL)
, (1002, 1000, 'The Cartographer''s Silence', 2008, 131, 'Every map leaves something out.')
, (1003, 1002, 'Small Hours at Calder Bay', 2019, 104, NULL);

INSERT INTO actors (id, name) VALUES
  (1000, 'Odile Marchetti')
, (1001, 'Rufus Pendergast')
, (1002, 'Imogen Thackery')
, (1003, 'Teodor Vasko')
, (1004, 'Saoirse Lindqvist')
, (1005, 'Ambrose Okafor')
, (1006, 'Clementine Ashdown')
, (1007, 'Halvard Brecke');

INSERT INTO roles (film_id, actor_id, character, billing) VALUES
  (1000, 1000, 'Marguerite Vey', 1)
, (1000, 1001, 'Silas Vey', 2)
, (1000, 1003, 'The surveyor', 3)
, (1001, 1002, 'Edith Carrow', 1)
, (1001, 1005, 'Tom Carrow', 2)
, (1001, 1000, 'Aunt Lise', 3)
, (1002, 1003, 'Anselm Roth', 1)
, (1002, 1004, 'Greta Holm', 2)
, (1002, 1007, 'The ferryman', 3)
, (1003, 1006, 'Nell Ashby', 1)
, (1003, 1005, 'Dr Idris Kane', 2)
, (1003, 1004, 'Mara Ashby', 3);

INSERT INTO crew (id, name, job, mentor_id) VALUES
  (1000, 'Wilhelmina Strand', 'director', NULL)
, (1001, 'Corin Halloway', 'director', 1000)
, (1002, 'Petra Ilves', 'editor', 1000)
, (1003, 'Jonah Merriweather', 'cinematographer', 1001);

INSERT INTO cinemas (id, name, location) VALUES
  (1000, 'The Lantern', point(0.4, 1.2))
, (1001, 'Kestrel Picture House', point(-2.1, 0.3))
, (1002, 'The Old Mill Screen', point(3.5, -1.8));

INSERT INTO screenings (id, film_id, cinema_id, starts_at) VALUES
  (1000, 1000, 1000, '2030-03-01 19:30+00')
, (1001, 1002, 1000, '2030-03-01 21:45+00')
, (1002, 1003, 1001, '2030-03-02 18:00+00')
, (1003, 1001, 1002, '2030-03-02 20:15+00');
