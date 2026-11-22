# Codegen output: reference

The cases of skill `codegen-output` for the typed SQL tool, `tools/typegen` (decision 012); [SKILL.md](SKILL.md) names each section with when to read it.

## Describing

- A new module's `dist/` file joins the exact list of `ci.yml`'s package-contents step in the same commit (skill `ci-gate` § Pitfalls).
- The user's text goes through Parse only, or not at all: `PREPARE` and `pg_prepared_statements` over the simple protocol run any statement that follows it in the text (#746).
- `pg`'s documented Submittable (as pg-cursor uses it) gives Parse and Describe with `pg`'s own login and TLS; an ErrorResponse clears the active query, so a describer resolves and removes its listeners in `handleError`, where `handleReadyForQuery` never fires (#746).
- Parse takes the statement's locks: a describe on a shared database sets `lock_timeout`; a probe script that talks the protocol sets a timeout per message and drops its leftover database on start (#746).
- Only type-resolution SQLSTATEs drop a form: `42883` is also a function the describing session cannot see (that condition is documented), and an untyped `$n` fails Parse with `42P18` where the JSON-cast form succeeds, as `42725` (#807).

## Neutralising

A typed placeholder for run-time content (an interpolation, a condition) proves only what fits at that spot:

- each soundness probe has content that appends SQL (`UNION`, `GROUP BY ROLLUP`) and an unbalanced fragment, as parentheses contain one only if its own balance (#746);
- it is replayed on every member of the API it feeds, not a sample: 5 pairs hid 10 `db.conditions` exports that throw or compile another text; `param(x, true)` casts to JSON only an array or a plain object, so the syntax alone cannot tell the form (#746);
- a keyword guard reads the cooked strings the tag receives (`head.text`, not `getText()`: `\x4c` makes a keyword at run time), matches the raw text case-insensitively (only as sound as its lexer otherwise), uses no `\b` on its left (Postgres 14 lexes `1LEFT` as `1 LEFT`), and treats `U&` itself as a guard word (`U&"\006fld"` is `old`) (#746, #815);
- a coverage figure is counted at the depth the rule checks, and each replayed text is tagged with its scope, so a cut recomputes the figures (#746).

## Name binding

- A name the tool evaluates binds to the library's export through the checker, or is refused: a scan of `getText()` accepts shadowed names. The rule compares the imported name (`ImportSpecifier.propertyName`) as well as the local one (`import { raw as param }`), skips type-only imports, and pins `<ns>.sql` to one level (#746).
- A `zapatos/db` or `pgcast/db` import is accepted by resolving it, under the project's options, to an external library, not by its specifier (a `paths` entry can map it to a local file); in a solution tsconfig, from the project whose program selected the file. Identical SQL hides which compiler ran: the test counts the application compiler's calls (#811, #816).
- Every alias of the db module resolves to one installation: two copies of one pgcast version compile a parameter differently, as the tag recognises it by class identity (#816).

## Program selection

- The files a tsconfig selects are the compiler's, not a scan of its roots: build the program (no checker) to follow import-only files, skip composite sources replaced by declarations, and take each TypeScript version's extension rules (#811).
- Project references are also tried in reverse order: a file two projects share keeps each project's verdict, and a disagreement drops the template either way (#811).
- An inherited `include` or `files` resolves from the base tsconfig's folder, and only a key the extending file writes from its own; with neither in the base (what `tsc --init` writes), the default `**/*` resolves from the extending file's folder, and `extends` alone selects nothing of the project above it. A tsconfig that docs or a review prescribe is first run with `tsc -p <file> --listFilesOnly` on a base with neither key (what `tsc --init` writes) and on one with `include` (#847).

## Nullability

A `NOT NULL` proof from the catalog:

- withdraws unless every table of the origin's inheritance tree holds it (`ALTER TABLE child … DROP NOT NULL`, `ALTER TABLE ONLY parent … SET NOT NULL` on Postgres 14 to 17), for a foreign table or foreign partition, where `NOT NULL` is not enforced, and for a `RETURNING` a rewrite rule supplies (`relhasrules` anywhere in the origin's tree); Postgres refuses most other states that would break a name-matched `pg_inherits` proof (#746, #815);
- holds no outer join with no keyword: `MERGE … RETURNING` with `WHEN NOT MATCHED BY SOURCE` null-extends the source, and Describe still gives its column's origin (#746);
- is read inside Describe's transaction while Parse holds its locks, at `READ COMMITTED`: a later lookup can read a renamed column by its attribute number, and a `REPEATABLE READ` snapshot predates Parse's lock wait (#815);
- reads a domain from the origin column: RowDescription gives the base type (`citext`) (#746);
- is a type that removes `null` only on the decoded field: `pg` decodes JSON `null` to `null`, so `COALESCE(x, 'null'::jsonb)` is not enough (#824).

## Watch mode

- TypeScript's watchers miss an edit made within about a second of starting, on macOS: a test settles before editing (#830).
- `close()` leaves the pending 250 ms update timer (4.1 to 6), which rebuilds and reopens the watchers: a signal test sends the signal right after an edit (#830).
- The watch host exits the process on a deleted or unreadable tsconfig unless `onUnRecoverableConfigFileDiagnostic` is overridden, and a no-op override throws from its timer; once that throw is caught, the watch reloads by itself when the file comes back (#830).
- An end-to-end test that spawns a watcher sets its own timeout: Vitest's 5 s sat within 0.3 to 1 s of their duration on CI (#830).

## A CLI and its credentials

- One redactor on every printed line, with `uncaughtException` and `unhandledRejection` handlers installed before connecting: `pg` throws some errors from socket callbacks, outside any `try` (#814).
- A `{{…}}` placeholder is printed only when it is a POSIX name: a credential pasted there reaches the diagnostic (#826). A test never expects a word the redactor can hide (CI's password is `postgres`), and an `it.each` title takes `%#`, never an argument holding a URL (#722, #826).
- A client option is read as the driver parses it: `pg` reads `query_timeout` from a Unix-socket URI that `URL.searchParams` misses (#814).
- The client is ended only after a connection succeeded: on `pg` 8.6.0 and 8.23.1, awaiting `end()` after a rejected `connect()` never settles, and the CLI exits 0 in silence (#814).
- A missing peer is checked by a small module that the CLI imports first (`tools/typegen/src/peers.ts`): TypeScript's CommonJS output keeps the import order, and no `try` wraps an import (#847).

## Determinism

- Relations are read concurrently (`Promise.all` in `tsOutput.ts`): a value they share (`customTypes`, its imports and origins) is merged whatever the order, through state the run already shares, or a new out-parameter written under Decided alone when the order needs data per column (#669), and tested through `placeholdersInEveryOrder` (`test/integration/codegen.test.ts`); no `await` inside `definitionForRelationInSchema`'s row loop. Within one relation, 6.6.1's winner is kept by the position Postgres returns the column at, not by its name compared in JavaScript; a determinism fix is replayed on the reviewer's grid and on the cases whose winner was already fixed (#669). A byte-for-byte proof leaves #42's shared placeholders out or compares several runs; "only where 6.6.1's output already varied" is probed with `db: { max: 1 }` and the schemas in both orders (#184, #449, #484, #490).

## Qualifying by schema

- A branch on a built-in type's name checks `pg_catalog` too, an enum is looked up in its type's own schema (`otherEnums[udtSchema]`), not the relation's, and an array is not known by a `_` prefix (Postgres names `tag[]` `_tag_1` beside an enum `_tag`); each is tested against an enum, a composite and a domain named like the built-in (`int4`, `interval`) in a user schema, beside an array of it (#484, #519, #522).

## Hostile catalogs

- a change to an introspection query is compared with the catalog itself (`pg_index` by `indrelid`) over partitions in another schema, inheritance, names holding `"`, `.` or `[]`, a materialised view (its own query) and objects in a transient state (`indisvalid`); a filter on a `LEFT JOIN`'s right table goes in its `ON`; a fact read two ways (`information_schema` for tables, `pg_catalog` for materialised views) gets one test per path, on data where they differ (#37, #42, #43, #47, #166). A reader of catalog SQL text (`pg_get_constraintdef()`) matches the forms Postgres stores (`VALUE = ANY (ARRAY[…])`, a one-value `IN` as `=`), with `standard_conforming_strings` off too (a backslash comes back doubled), and filters on `contype` (from 17, a domain's `NOT NULL` is a row) (#646).

## Compiling the output

- `npm run typecheck` compiles the fixture's output. A claim about the output is replayed with `skipLibCheck` both ways, with 6.6.1's placeholders still on disk (the generator never rewrites them), in a prefixed and an unprefixed schema, through the CLI when `cliConfig.ts` changes (#557); parsing (`syntaxErrors()`) and compiling are two checks (#48, #184, #399, #487). Each import a placeholder writes compiles under each `customTypesTransform`, with `skipLibCheck: false`, and the clash rule matches the base type (`name`, `name[]`), not the names alone (#648, #651). Two runs are compared with `db: { max: 1 }`, queries sorted without their sequence numbers (#557, #648). A `--check` re-renders what it parsed with the writer and compares bytes (a deleted import, CRLF), leaving row types to the database check; a cache of what it read is invalidated on the output file's bytes, as another process can write it (#823, #830). A fix to one mode (a plain run, `--check`, `--watch`) greps the others for the same code path, and its `CHANGELOG.md` line names the modes it covers (#847).

## Comments

- Template text is neutralised too. Line ends are normalised first (`/^/gm` matches after `\r`, U+2028, U+2029); a generated string literal escapes U+2028 and U+2029, which `JSON.stringify` leaves raw and 4.1.6 ends a literal at (TS1002, #746). What TypeScript reads (a tag, a hover, a strike-through) is checked with its own parser (`ts.getJSDocTags`, `getQuickInfoAtPosition`) on the real `tsForConfig` output, margins included, against master's output; any doubt keeps master's layout. A rule that predicts how TypeScript reads the output ships with a seeded fuzz, `typescript` as the oracle, over the parser's token classes (`\` escapes, `\n`, `\r`, U+2028, U+2029, quotes, backticks, `/`, conflict markers, NBSP) (#46, #48, #308, #473, #488).
