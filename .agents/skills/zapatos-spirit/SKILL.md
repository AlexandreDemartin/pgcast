---
name: zapatos-spirit
description: 'The spirit of Zapatos and George MacKerron, pushed further: size and scope of a PR, title, code style, JSDoc, error messages, voice of the docs. USE FOR: splitting a step, naming a PR, writing code or docs in src/, judging whether George would recognise his project. DO NOT USE FOR: the shape of a helper (zero-abstraction).'
---

# The spirit of Zapatos

If George MacKerron opens pgcast, he must find his project, only better. Sources: `docs/index.html` (his docs) and `git log upstream/master` (his history).

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

## Size and scope

Measured on his 212 commits that touch `src/`:

| | median | p75 | p90 |
|---|---|---|---|
| lines changed in `src/` | 14 | 42 | 84 |
| files | 1 | — | 4 |

- **One PR = one visible change**, described in one sentence. Never mix a fix, a feature and a refactor.
- **`src/`: ~100 lines changed at most per PR** (his p90). Beyond that, split into independent PRs, each useful on its own.
- **Tests in proportion**: a tests-only PR stays readable in one go (~800 hand-written lines, not counting generated snapshots). Beyond that, split by subject (types, injection, a module).
- Example of the right size: "Add conditions with array operators", 4 lines in `conditions.ts`.
- Counter-example: PR #5, ~2,900 lines in one PR; today it would be split into core, shortcuts, conditions and transaction.

## Splitting like George

George committed straight to `master`: **one George commit is one pgcast PR**. When his steps depend on each other, the series becomes a stack of PRs (skill `run-step` § Stacking PRs); otherwise, separate PRs. His history shows how he split:

| His move | Example from `git log upstream/master` | In pgcast |
|---|---|---|
| A feature grows by steps: one case, then the others, then the generalisation | "Added returning option to insert shortcut" → "Added returning option to upsert" → "Returning (and now also extras) options for insert/upsert/update/deletes" | One PR per step, each useful on its own. The first carries the simplest case. |
| Runtime and codegen apart (22 mixed commits out of 154) | "Direct lateral subquery support" (`db`); "add support for schema generation for materialized views" (`gen`) | One `src/generate` PR, then one `src/db` PR that uses it. Never both, except a format change that ties them (canary). |
| Docs follow the code (5 mixed commits out of 154) | "Updated docs for returning/extras and 2.0" | The code PR carries its `CHANGELOG.md` line and its JSDoc; the usage guide comes in a "Document …" PR after the series. |
| Fixing as he went | "Direct lateral subquery support" then "Fixed type inference for lateral direct subqueries" | A defect found after merge becomes a small "Fix …" PR, never a big fix mixed into what follows. |
| Dependencies apart | "Updated dependencies" | One PR for dependency updates, with no code. |
| Small, frequent versions (94 version commits) | "6.4.1", "6.4.2", one fix each | A version as soon as a useful change is merged. Publication remains a stop point. |
| Big exploratory work on a branch | "Started work on multi schema support" → "Progress on multi-schema work" → "Multi-schema updates" | First a decision note, then a series of small PRs. Never a giant PR. |
| The reason in the title when it is not obvious | "… to count(*) rather than count(alias.*) for performance reasons" | A short reason at the end of the title, if it helps. |

Example for step ③ (foreign keys):

1. "Generate foreign key metadata for each table" (`src/generate`, opt-in)
2. "Add related() for many-to-one lateral joins" (`src/db`)
3. "Add relatedMany() for one-to-many lateral joins" (`src/db`)
4. "Allow lateral results to be referenced in order and groupBy" (`src/db`)
5. "Document related() and relatedMany()" (docs)

## PR title

- **Plain English, a capital at the start, no prefix** (`test:`, `feat:`), with a verb that says the effect for the user: `Add …`, `Allow …`, `Fix …`, `Make …`, `Stop …`, `Characterise …`.
- **British spelling**, like George (`licence`, `characterise`, `parenthesise`, `favour`).
- API names as they are, without backticks: "Allow db.all as value of noNullUpdateColumns".
- **The step's issue at the end, always**: `(closes #n)`, like George ("Stop generating .eslintrc.json (closes #184)"); the body also carries `Closes #n`, which closes the issue on merge. `(addresses #n)` for a PR that does only part of it.
- Examples: "Fix not() so it parenthesises its condition (closes #30)", "Add related() and relatedMany() for lateral joins on foreign keys".

## Commits

Same voice as PR titles; his recent subjects give the model.

- **One line**, in plain English, a capital at the start, no prefix nor final full stop: "Add conditions with array operators", "Stop generating .eslintrc.json (closes #184)".
- **Imperative**, like his recent commits: `Add`, `Allow`, `Fix`, `Make`, `Stop`, `Ensure`, `Export`, `Characterise`.
- **Docs**: "Update docs for …"; **dependencies**: "Update dependencies"; **version**: the number alone ("6.7.0").
- **Learnings**: "Record what #22 taught"; **merge of master**: "Merge master into <branch>".
- No more commits that tick a box: merging the PR closes its issue.
- No body, except a reason that does not fit on the line; the requested `Co-Authored-By` line always stays.
- Old format (`test: …`, `fix: …`): history of PRs #1 to #12, not rewritten.

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

- [ ] A single visible change, described in one sentence
- [ ] `src/` ≤ ~100 lines, otherwise split
- [ ] Title in plain English, no prefix, British spelling
- [ ] Code in his patterns; JSDoc with the SQL produced; an error that says what to do
- [ ] George would accept the PR: correct, consistent, comprehensible, small
