# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Nothing applies before the end of the chapter: the method is frozen until then (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
- #513: a draft PR runs no Postgres or Node matrix, so a claim that depends on a version not installed locally (Postgres 18's `WITHOUT OVERLAPS`) stays unproven until the PR is ready; the orchestrator marks it ready early for that proof.
- #513: under heavy machine load a few codegen variant-snapshot tests time out at their 5 s default, even on reruns; a third run once the load dropped was green.
- #512: a Done when that names one mutant for every row is checked against each shape before the issue is written: a primitive's property reads `undefined` and a stored `null` is reset to the default, so neither goes red on a plain direct read.
- #512: `getConfig()` returns `{ minMs: undefined, maxMs: undefined }` for a truthy primitive `transactionRetryDelay` (`100`), where 6.6.1 returned `100`; nothing throws, value only.
- #522: a new variant snapshot is not on disk until the first run writes it, so its "compiles" test fails once: run the file twice before reading a red.
- #522: `it.each([undefined, false])` passed into `Config` fails `typecheck` under `exactOptionalPropertyTypes`; spread the key conditionally instead.
- #522: a structural type that a value must satisfy to be written (`toPostgres()`) needs a negative case per required member: a mutant making one optional went uncaught while another member was still required.
- #522: a codegen branch keyed on a built-in type's bare name (`'interval'`, `'_interval'`, `root.name`) without `pg_catalog` came up in two sibling PRs (#519, #522): any new branch on a built-in name checks the schema and is tested against an enum, a composite and a domain of that name in a user schema (candidate for skill `codegen-output`, and a grep check for `=== '<builtin>'` in `src/generate/`).
- #522: docs that promise "doesn't compile" for something in a `.d.ts` (placeholders, generated schema) say what happens under `skipLibCheck`: nothing, and the type becomes `any`.
- #522: a note's lead-in that names the kinds of column it lists is checked against every kind its listing code admits, under each option that widens the list (`domainsTypedByContext`): one probe column per kind in the note's test, the lead-in asserted word for word (missed twice in #522).
- #522: three rounds because the code that picks a note's columns and the code that types them are separate: each opt-in with a note gets one test over a set of shapes asserting the note's list equals the columns whose lines or placeholders differ between the key `true` and left out (placeholders counted: a domain over `interval` changes only there).
- #522: domain roots compose (domain over array over domain): the listing condition reads the root exactly as the typing does, or the two drift.
- #522: a probe column added to a fixture table broke a runtime test comparing exact rows (`toEqual`); a separate table avoids it.

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.
- #522 (form): `website/versions.md` § opt-ins list, "which types an `interval` in `Selectable` as `pg` parses it": three "and"s end the list (FR too).
- #522 (form): `src/generate/tables.ts`, `rootOf(row)` computed for the note and again for the typing, each rebuilding `(isArray ? '_' : '') + name`: one shared value would keep them from drifting.
