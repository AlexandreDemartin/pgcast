---
name: zapatos-spirit
description: 'The spirit of Zapatos and George MacKerron, pushed further: his principles, what he would not have done, code style, JSDoc, error messages, voice of the docs. USE FOR: writing code or docs in src/, judging whether George would recognise his project. DO NOT USE FOR: size, split, titles, commits (pr-shape), the shape of a helper (zero-abstraction).'
---

# The spirit of Zapatos

If George MacKerron opens pgcast, he must find his project, only better. Sources: `docs/index.html` (his docs) and `git log upstream/master` (his history). The shape of a PR, after his commits: skill `pr-shape`.

## His principles

- "No abstractions, no distractions: just your database, with type safety."
- Shortcuts "with no fuss and no surprises, fully and automatically typed".
- His contribution criteria (`docs/index.html` § Fixes, feature and contributions):
  - **"Correct, consistent, comprehensible"**: fix, harmonise, make readable;
  - **"Small is beautiful"**: no complexity for a niche case nor for a performance gain drowned in network latency.
- His roadmap (§ What's next) comes first: a real test suite, including on inferred types, then laterals typed by foreign keys.
- **His limits, written by him** (§ lateral, Limitations): joins are not checked ("REFERENCES relationships are not exploited"); `selectExactlyOne` is written by hand when the FK is `NOT NULL`, though it "might be inferred for us". Going further means lifting these limits first.
- "Zapatos is always explicit about what client or pool is running your query": no default client, "too easy to accidentally issue queries outside of transactions".

## What George would not have done

A PR that makes one of these moves is refused, whatever its gain:

- A model, an entity class, a relationship declared in TypeScript ("just (fully-typed) POJOs").
- Lazy loading, an identity map, change tracking, a query cache.
- A method chain that builds a query and hides its SQL (`.where().join()`).
- An implicit, default or global client; a transaction opened without being asked for.
- Managing the connection pool or migrations ("Zapatos doesn't handle schema migrations").
- An abstraction to switch databases tomorrow at the expense of Postgres today ("a source of misery").
- A guessed type that the database does not state; a concatenated value instead of a parameter.
- SQL that depends on state or changes with the values without being documented.
- Complicating the core for a niche case or a gain drowned in network latency ("Small is beautiful"): it goes in a separate package, or opt-in.

## Code in `src/`

Reuse his patterns, without reformatting them elsewhere:

```ts
// src/db/shortcuts.ts
const
  returningSQL = SQLForColumnsOfTable(options?.returning, table),
  extrasSQL = SQLForExtras(options?.extras),
  query = sql`DELETE FROM ${table} WHERE ${where} RETURNING ${returningSQL}${extrasSQL} AS result`;
```

- Declarations grouped in a single `const`, cascading ternaries aligned vertically.
- An `XSignatures` interface for overloads, then `export const x: XSignatures = function (…) {…}`.
- Section markers `/* === insert === */`.
- A comment explains Postgres's oddity and gives its link (see the `ROW()` note of `update`).
- Postgres vocabulary for names (`isDistinctFrom`, `arrayOverlaps`, `selectExactlyOne`). A reserved name is simply worked around (`deletes`).
- Single quotes, semicolons, 2 spaces.
- File header kept; a new file takes the same form, with the fork's line.

## JSDoc and errors

- JSDoc: a first sentence in the imperative ("Generate an `INSERT` query `SQLFragment`."), then one `@param` per parameter, and for pgcast the SQL produced.
- Danger is flagged loud and clear (`raw`: "💥💥💣 **DANGEROUS** 💣💥💥").
- An error says what to do: "Did you use `self` (the global object) where you meant `db.self`…?", "hint: check `.query.compile()` on this Error".

## Doc

- First person, warm and brief, a little humour ("It is a truth universally acknowledged that ORMs aren't very good.").
- Each feature shows three things side by side: the TypeScript you write, the SQL produced, the type obtained.
- **His examples, his world**: `authors` (`"id"`, `"name"`, `"isLiving"`), `books` (`"authorId"`, `"title"`, `"createdAt"`), `tags` (`"tag"`, `"bookId"`); `employees` (`"managerId"`, with `alias`) for a self-reference; `photos` / `subjects` / `subjectPhotos` for a many-to-many (lateral passthrough); `stores` for `extras` (PostGIS); `nameCounts` for `updateValues`; `bankAccounts` and `doctors` / `shifts` for transactions. Columns in camelCase within double quotes, as in his docs. A new example (JSDoc, docs, issue, PR) reuses these tables; never an extract from a real project.

## Further, without betraying

- What he wanted, first: tests and laterals typed by FKs.
- What he did not have: tests, checked types, CI. We add them without changing how it feels to use.
- A new API must be able to pass for his: same vocabulary, same shape, same visible SQL.

## Checklist

- [ ] Size, split and title of the PR (skill `pr-shape`)
- [ ] Code in his patterns; JSDoc with the SQL produced; an error that says what to do
- [ ] George would accept the PR: correct, consistent, comprehensible, small
