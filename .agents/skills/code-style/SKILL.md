---
name: code-style
description: 'Code style of pgcast, in the patterns of Zapatos: code in src/, JSDoc, error messages, docs voice and examples, going further than Zapatos. USE FOR: writing code, a JSDoc, an error or docs; judging whether a change reads like Zapatos. DO NOT USE FOR: size, split, titles, commits (pr-shape), the shape of a helper (zero-abstraction).'
---

# Code style

A change to pgcast reads like the rest of Zapatos: same patterns, vocabulary and visible SQL. Sources: [Zapatos's docs](https://jawj.github.io/zapatos/) and history (`git log upstream/master`). What pgcast refuses whatever the gain: `AGENTS.md` § What pgcast does not do.

Cases that serve a minority of steps are in [reference.md](reference.md), read when this core names them.

## Zapatos's criteria

- "No abstractions, no distractions: just your database, with type safety."
- Shortcuts "with no fuss and no surprises, fully and automatically typed".
- Its contribution criteria ([Zapatos's docs](https://jawj.github.io/zapatos/) § Fixes, feature and contributions):
  - **"Correct, consistent, comprehensible"**: fix, harmonise, make readable;
  - **"Small is beautiful"**: no complexity for a niche case nor for a performance gain drowned in network latency.

## Code in `src/`

Zapatos's code keeps its form (skill `simple-big-wins` § Adopting a rule on existing code); new code takes its patterns:

```ts
// src/db/shortcuts.ts
const
  returningSQL = SQLForColumnsOfTable(options?.returning, table),
  extrasSQL = SQLForExtras(options?.extras),
  query = sql`DELETE FROM ${table} WHERE ${where} RETURNING ${returningSQL}${extrasSQL} AS result`;
```

- Declarations grouped in a single `const`, cascading ternaries aligned vertically.
- Overloads: an exported `XSignatures` interface, then `export const x: XSignatures = function (…) {…}` (`select`, `deletes`), or the signatures in place on the `const` (`insert`, `eqAny`). A type a public signature names is exported or a module-local alias, never an unexported interface, class or `unique symbol`, which a consumer's re-export cannot name (TS4023, TS2742); each new public function gets its re-export line in `test/types-opt-in/declarations.ts` (#573, #576, #579, #581, #583).
- Section markers `/* === insert === */`.
- A comment explains a Postgres oddity, with its link (the `ROW()` note of `update`).
- Postgres vocabulary for names (`isDistinctFrom`, `arrayOverlaps`, `selectExactlyOne`); a reserved name is worked around (`deletes`).
- Single quotes, semicolons, 2 spaces.
- File header kept; a new file takes the same block, with the fork's copyright line (`AGENTS.md` § Working rules).
- A lookup keyed by caller input or a catalog name: [reference.md](reference.md) § Lookups.

## JSDoc and errors

- JSDoc: a first sentence in the imperative ("Generate an `INSERT` query `SQLFragment`."), one `@param` each, and for a pgcast helper the SQL produced. Length: skill `concise-docs` § Target lengths.
- Danger is flagged loudly (`raw` in `src/db/core.ts`: "💥💥💣 **DANGEROUS** 💣💥💥").
- An error says what to do:
  - "Did you use `self` (the global object) where you meant `db.self`…?" (`src/db/core.ts`);
  - "hint: check `.query.compile()` on this Error" (`src/db/shortcuts.ts`).
  - Before writing or moving its advice, or a message the docs quote: [reference.md](reference.md) § Error messages.

## Docs voice

- First person where natural, warm and brief, a little humour ("It is a truth universally acknowledged that ORMs aren't very good."); British spelling.
- Each feature shows side by side the TypeScript you write, the SQL produced and the type obtained.
- **A docs page per feature**, in its Diátaxis group: tutorial, how-to, reference or explanation. Every export keeps its reference entry, checked by the docs build (#137). How to write one: `website/README.md` § Writing a page.

## Claims

A sentence anywhere (docs, CHANGELOG, JSDoc, issue, plan) states what a run showed (types: skill `type-tests` § A claim about a type; 6.6.1: skill `backward-compat` § Replay, do not reason).

Before writing one, read [reference.md](reference.md) § Claims: a run, not a reading; more than one value; every position; "every", "only", "never"; a shortened rule; what changed; a CHANGELOG entry; what will move.

## Examples: the film's cast

A new example, wherever it is written, uses pgcast's own world (`website/schema.sql`, #131), in snake_case (no double quotes):

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

- Invented names: no real person or film.
- Tests keep their fixture (`test/fixtures/schema.sql`, skill `type-tests`); existing JSDoc keeps Zapatos's tables.
- Never an extract from a real project (skill `consumer-usage`).

## Further than Zapatos

- Its roadmap first ([Zapatos's docs](https://jawj.github.io/zapatos/) § What's next): a real test suite, including on inferred types; then what it did not have (checked types, CI), without changing how it feels to use.
- A new API passes for Zapatos's: same vocabulary, shape and visible SQL.
- A change to laterals, `parent` or their written limits (note 007): [reference.md](reference.md) § Laterals.

## Checklist

- [ ] Zapatos's patterns, a JSDoc with its SQL, errors that say what to do
- [ ] Each claim from a run, its exceptions searched
- [ ] A new example in the film world, invented names
- [ ] The change passes Zapatos's criteria: correct, consistent, comprehensible, small
