---
name: code-style
description: 'Code style of pgcast, in the patterns of Zapatos: code in src/, JSDoc, error messages, docs voice and examples, going further than Zapatos. USE FOR: writing code, a JSDoc, an error or docs; judging whether a change reads like Zapatos. DO NOT USE FOR: size, split, titles, commits (pr-shape), the shape of a helper (zero-abstraction).'
---

# Code style

A change to pgcast reads like the rest of Zapatos: same patterns, same vocabulary, same visible SQL. Sources: [Zapatos's docs](https://jawj.github.io/zapatos/) and history (`git log upstream/master`). What pgcast refuses whatever the gain: `AGENTS.md` § What pgcast does not do.

## Zapatos's criteria

- "No abstractions, no distractions: just your database, with type safety."
- Shortcuts "with no fuss and no surprises, fully and automatically typed".
- Its contribution criteria ([Zapatos's docs](https://jawj.github.io/zapatos/) § Fixes, feature and contributions):
  - **"Correct, consistent, comprehensible"**: fix, harmonise, make readable;
  - **"Small is beautiful"**: no complexity for a niche case nor for a performance gain drowned in network latency.

## Code in `src/`

Zapatos's code keeps its form (skill `simple-big-wins` § Adopting a rule on existing code); new code takes the same patterns:

```ts
// src/db/shortcuts.ts
const
  returningSQL = SQLForColumnsOfTable(options?.returning, table),
  extrasSQL = SQLForExtras(options?.extras),
  query = sql`DELETE FROM ${table} WHERE ${where} RETURNING ${returningSQL}${extrasSQL} AS result`;
```

- Declarations grouped in a single `const`, cascading ternaries aligned vertically.
- An `XSignatures` interface for overloads, then `export const x: XSignatures = function (…) {…}` (`insert`, `update`, `select`).
- Section markers `/* === insert === */`.
- A comment explains a Postgres oddity and gives its link (the `ROW()` note of `update`).
- Postgres vocabulary for names (`isDistinctFrom`, `arrayOverlaps`, `selectExactlyOne`); a reserved name is simply worked around (`deletes`).
- A lookup keyed by caller input or a catalog name reads own keys only (`Object.prototype.hasOwnProperty.call`, as `hasOwn` in `src/generate/tables.ts`, or a `Map`; `Object.hasOwn` is past the ES2019 target, TS2550): `constructor`, `toString`, `__proto__` and `caller` crashed or masked lookups (#48, #399, #405, #486); `Object.create(null)` changes every later inherited lookup, and escapes through an export.
- Single quotes, semicolons, 2 spaces.
- File header kept; a new file takes the same comment block, with the fork's copyright line (`AGENTS.md` § Working rules).

## JSDoc and errors

- JSDoc: a first sentence in the imperative ("Generate an `INSERT` query `SQLFragment`."), one `@param` per parameter, and for a pgcast helper the SQL produced. Length: skill `concise-docs` § Target lengths.
- Danger is flagged loud and clear (`raw` in `src/db/core.ts`: "💥💥💣 **DANGEROUS** 💣💥💥").
- An error says what to do:
  - "Did you use `self` (the global object) where you meant `db.self`…?" (`src/db/core.ts`);
  - "hint: check `.query.compile()` on this Error" (`src/db/shortcuts.ts`).
  - Its advice is run as written, on each call and each kind of value that throws it ("spread it" turned a string back into its characters, #235); a warning that fires in more cases is reread for each; advice that moves where a transaction begins says what it costs, probed with a read, a write and an insert of the same key (#486, #492).

## Docs voice

- First person where natural, warm and brief, a little humour ("It is a truth universally acknowledged that ORMs aren't very good."); British spelling.
- Each feature shows three things side by side: the TypeScript you write, the SQL produced, the type obtained.
- **A docs page per feature**, in its Diátaxis group: tutorial, how-to, reference or explanation (decided 2026-11-12). Every export keeps its reference entry, checked by the docs build (#137). How to write one, from its template: `website/README.md` § Writing a page.

## Claims

A sentence in the docs, the CHANGELOG, a JSDoc, an issue or a plan states what a run showed (types: skill `type-tests` § A claim about a type; 6.6.1: skill `backward-compat` § Replay, do not reason).

- **A run, not a reading**: the exact code the page shows (`${'films'}`, not `films`), as the call its sentence describes, on the docs schema (a probe write on a table nothing references, or a foreign key stops it); the outer call too (an outer `selectOne()` hides duplicated rows), a chain as the reader writes it, the CLI from `npm pack`. An issue's, a brief's, a review's or an "Expected" claim (an advice, a suggested guard) is a hypothesis until run; before the plan, search the tests that already freeze the behaviour and the pages that already state it (#51, #168, #501).
- **At more than one value**: another size, isolation level or Postgres version, the empty result (`rows[0]`), a warm pool for a race, a realistic table for a plan (`EXPLAIN (ANALYZE)`), and what node-postgres hands over (`date` as a `Date`, `POINT` as `{ x, y }`; `pg.DatabaseError` from pg 8.6, on its tarballs), in a time zone east of UTC (pg sends local time), with `extra_float_digits=0` in `db.options` (a `float4` then arrives rounded: order in SQL, #49), on data where the two readings differ.
- **At every position it covers**: each row of an array, line 1 and a later line, a `where` and an `update()`, one nesting past the named ones, each outer call (`select()`, `selectOne()`, `selectExactlyOne()` with and without its opt-in, `count()`), at `.run()` and nested in `lateral` or `extras` (#164, #341, #420, #482, #484).
- **"Every", "only", "never"** are searched for their exceptions (`git grep` the name); "takes only" gets a negative `tsc` probe, "cannot mean anything in SQL" a run in Postgres, "the catalog doesn't say" the catalog table (`pg_constraint`).
- **A shortened rule keeps its condition**, or links it: a guide that restates a reference, a docs bullet, a JSDoc, a merged note, a CHANGELOG headline and its "Unchanged" list, a later version's contract (the narrowest wording of decision 003, both its exceptions), a quote of Zapatos (its subject and the clauses around it). Each carries every clause (an option such as `undefinedMeansMissing` or `castObjectParamsToJson`, a mode, an exception on an open issue); a list of conditions gets one test per clause (#164, #271, #402, #485).
- **What changed is searched for**: after a change of behaviour, an added exception, a closed issue or dropped advice, `git grep` the old phrase and its other wordings, the issue number, the message and its SQLSTATE codes across `website/` (both languages), `README.md`, `AGENTS.md`, `CHANGELOG.md`, JSDoc and messages in `src/`; then reread the sentence that frames each hit (a list's lead-in, a page's general rules, "never", "always"). Pages went stale after #32, #96, #179, #251, #447, #492.
- **What will move** is tied back: a known defect links its open issue, which gets a comment pointing at the line; no count of a list that grows ("the two opt-ins", a living report's tally).

## Examples: the film's cast

A new example in the docs, the README, a JSDoc, an issue or a PR uses pgcast's own world (`website/schema.sql`, issue #131), in snake_case, so its columns need no double quotes:

| Pattern | Tables |
|---|---|
| Plain rows, `lateral` on a foreign key | `studios`, `films` (`studio_id`, `title`, `release_year`, `runtime_minutes`) |
| Arrays (`TEXT[]`) | `films` (`genres`) |
| Full-text search, a generated `tsvector` | `films` (`title_search`) |
| Many-to-many | `actors`, `roles` (`film_id`, `actor_id`, `character`, `billing`) |
| Self-reference, with `alias` | `crew` (`mentor_id`) |
| `extras` with a `POINT` and a gist index | `cinemas` (nearest cinema) |
| Transactions, `SERIALIZABLE` | `screenings`, `seat_bookings` (one seat per screening) |
| A nullable `BOOLEAN` | `screenings` (`subtitled`) |
| A domain and its `custom/` placeholder | `seat_bookings` (`seat`, domain `seat_label`) |
| `upsert` counts, `updateValues` | `ratings` |
| Simple lookups | `tags` |

- Names are invented: no real person, no real film.
- Tests keep their fixture (`test/fixtures/schema.sql`, skill `type-tests`); existing JSDoc keeps Zapatos's tables.
- Never an extract from a real project (skill `consumer-usage`).

## Further than Zapatos

- Its roadmap first ([Zapatos's docs](https://jawj.github.io/zapatos/) § What's next): a real test suite, including on inferred types, then laterals typed by foreign keys.
- Its written limits (§ lateral, Limitations) are lifted first: joins are not checked ("REFERENCES relationships are not exploited"); `selectExactlyOne` is written by hand when the FK is `NOT NULL`, though it "might be inferred for us".
- What it did not have: tests, checked types, CI. They come without changing how it feels to use.
- A new API must be able to pass for Zapatos's: same vocabulary, same shape, same visible SQL.

## Checklist

- [ ] Code in Zapatos's patterns; JSDoc with the SQL produced; an error that says what to do
- [ ] Each claim from a run, its exceptions searched
- [ ] A new example in the film world, invented names
- [ ] The change passes Zapatos's criteria: correct, consistent, comprehensible, small
