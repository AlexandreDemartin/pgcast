CREATE SCHEMA extra;
CREATE TYPE extra.mood AS ENUM ('a"b', 'ok');
CREATE DOMAIN feeling AS extra.mood;
CREATE TABLE feelings (value feeling NOT NULL);
INSERT INTO feelings VALUES ('ok');
CREATE DOMAIN amounts AS numeric[];
CREATE TABLE users (id integer NOT NULL, manager integer, mood extra.mood, scores amounts NOT NULL);
INSERT INTO users VALUES (1, NULL, 'ok', ARRAY[1.25,NULL]), (2, 1, 'a"b', ARRAY[2]);
CREATE TABLE accounts (id integer NOT NULL, balance numeric NOT NULL);
INSERT INTO accounts VALUES (1, 10), (3, 30);
CREATE TABLE excluded (mood extra.mood NOT NULL);
INSERT INTO excluded VALUES ('ok');
CREATE VIEW user_ids AS SELECT id FROM users;
CREATE TABLE versions (id integer NOT NULL);
INSERT INTO versions VALUES (1);

CREATE TABLE parent_only (x int);
CREATE TABLE other_child () INHERITS (parent_only);
INSERT INTO other_child VALUES (NULL);
ALTER TABLE ONLY parent_only ALTER x SET NOT NULL;

CREATE TABLE events (id int NOT NULL) PARTITION BY LIST (id);
CREATE TABLE event_a PARTITION OF events FOR VALUES IN (1);
CREATE TABLE event_b PARTITION OF events DEFAULT;
INSERT INTO events VALUES (1), (2);

CREATE EXTENSION file_fdw;
CREATE SERVER files FOREIGN DATA WRAPPER file_fdw;
CREATE FOREIGN TABLE imported (id int NOT NULL, label text NOT NULL)
  SERVER files OPTIONS (program 'echo 1,', format 'csv');
CREATE TABLE parts (id int NOT NULL, label text NOT NULL) PARTITION BY LIST (id);
CREATE FOREIGN TABLE leaf PARTITION OF parts DEFAULT
  SERVER files OPTIONS (program 'echo 1,', format 'csv');
CREATE TABLE nested (id int NOT NULL, label text NOT NULL) PARTITION BY LIST (id);
CREATE TABLE middle PARTITION OF nested DEFAULT PARTITION BY LIST (id);
CREATE FOREIGN TABLE deep_leaf PARTITION OF middle DEFAULT
  SERVER files OPTIONS (program 'echo 1,', format 'csv');
