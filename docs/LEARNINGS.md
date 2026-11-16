# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Nothing applies before the end of the chapter: the method is frozen until then (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
- #520: an overload added to fix an inference turns every refused call's error into TS2769 with one message per overload on TS 5 (TS 7 prints the last one): grep the docs' `// @errors:` lines before choosing that route.
- #520: `Parameters<>` of an overloaded function reads the last overload, and can differ from the single-signature result (`never` on 6.6.1's `sql`).
- #520: ESLint's base `no-redeclare` rejects TypeScript overload signatures; typescript-eslint advises turning it off for TS.
- #520: inside a generic shortcut, TS reads a key's contextual type through the type parameter's constraint, so a bare generic call infers from the union over every table, even when the table is named by a literal.
- #520: overloading an export that had one signature (`sql`, `eq()`, `param()`) is a public-API break by default (third time: R33 #276, R34 #282, #520): a type test against 6.6.1's signature freezes a generic higher-order function over it (`traced(db.sql)`: types, a call with type arguments, a refused argument) and a value written to 6.6.1's signature assigned to `typeof db.sql`, plus a contextually typed arrow under `noImplicitAny`.
- #520: a claim "wrappers and `typeof fn` keep their types" is tested in both directions: `db.fn` assigned to a signature, and a value assigned to `typeof db.fn`.
- #520: blocking a type parameter's inference from the return type in one signature needs a deferred wrapper, which also blocks inference for callers passing their own type parameter (`eq<T>`, wrappers, #181); forms TypeScript simplifies change nothing; a mapped `where` in the shortcuts fixes only a literal table and keeps only shared keys over a union (TS2353). Seven candidates measured: #493 became Document.
- #520: `npm run test:types` with a mutant `core.ts` leaves the mutant's declarations in `node_modules/.cache/pgcast`: re-emit them before another check reads that cache (TS 7 on `test/types`).
- #520: a probe grid's `.codes` files kept the first code of each line only, so a second code on a line could change unseen: record every `(line, code)` pair and diff the messages too.

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.
- #520 (defect): `test/types/core.test-d.ts` › `characterization: a bare template is refused`: the enum case the docs name is pinned only by a scratch probe; the fixture has a single enum column type.
- #520 (form): `CHANGELOG.md` Changed line of #493, "whose name another table's column of another enum has": hard to parse.
