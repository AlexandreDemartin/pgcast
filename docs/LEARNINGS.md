# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Nothing applies before the end of the chapter: the method is frozen until then (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
- #693 — A type gap kept by Document freezes the public alias's own property (`NonNullable<db.TxnClientForSerializableRO['_zapatos']>['isolationLevel']`), not only the callback's: an alias-only widening passed every callback test and the containment test — branch-reviewer, `test/types/transaction.test-d.ts`
- #693 — A grid for widening a type alias that is both a callback's client and a user's parameter has cells inside a helper's own body (assignment, exhaustive `switch`, forwarding, `Record` keyed by the property), not only on the callback: the alias-only route broke only those — branch-reviewer
- #690 — A refusal rule that reads a command's words after quotes are emptied missed every quoted argument and every `src:dst` refspec (`HEAD:refs/tags/v7.0.0` created the tag); such a rule is tested with the quoted and the colon form of each argument it looks for — branch-reviewer, `.claude/hooks/guard.mjs`
- #690 — A minor judged "still true" went into #689 though #560 had fixed it; a verdict of still true is a run on master (`git log -S`, the built export) before it goes into an issue — branch-reviewer
- #700 — A driver interface's member declared as a method is checked bivariantly: `QueryableLike.query(…)` accepted a `query()` that required a `name` `run()` never sends (TypeError at run time); members a library calls are declared as properties — branch-reviewer, `src/db/core.ts`
- #700 — Widening a writable field's parameter type moves one compat cell per path that reads it (contextual arrow, `typeof`, `Pick`, spy, generic or `infer`, a library `.d.ts` re-export), not only the call; each path gets its own probe and line — branch-reviewer
- #700 — A method's bivariance holds only where the target is the method's own declaration; any copy as a function type (re-exported `const` in a `.d.ts`, Vitest's `mockImplementation`) checks one way under `strictFunctionTypes`, so a claim that relies on it is probed through each copy with the library's real types, not a hand-written stand-in — branch-reviewer
- #700 — The docs build type-checks `<!-- tsc -->` marks in `CHANGELOG.md` only, not in the site's pages — builder
- #700 — A TS 7 probe emit without `rootDir` wrote a stray `src/typings/zapatos/schema.d.ts` into the worktree; a probe tsconfig sets `rootDir` — builder
- #700 — A docs bullet that lists several migration paths gives each its own remedy or says it has none, each checked by a probe at that path's own position: a mark proved the cast on `frag.run = …` while the text prescribed it for a spy and a re-export — branch-reviewer
- #700 — Vitest 4's declarations do not parse on TS 4.1.6; a 4.1 spy probe uses `@vitest/spy`'s `spyOn` directly — builder
- #701 — `Parameters` and `infer` reduce an unconstrained type parameter to `unknown`; testing `unknown extends C` for the `pg` case keeps the erased forms and mocks on 6.6.1's types, and small rewrites of the pool member silently broke those cells, so tests pin them — builder, `src/db/transaction.ts`
- #701 — A union member that holds a bare type parameter (`C & X`) collects inference candidates from every argument, `pg` ones included, and broke non-generic `pg` calls, not only generic forwarders — builder
- #701 — `@types/pg` 7 and 8 `connect()` overloads end with the callback form, so they give no inference to a `PromiseLike<C>` target — builder
- #701 — An empty `tsc` output proves nothing alone: record its exit code beside it — builder
- #701 — A type parameter meant to be inferred from one argument is `NoInfer`'d everywhere else it appears: inference reached into both branches of a conditional, so a callback passed by reference or annotated inferred it from its own parameter and lost the isolation guard; a compat grid for a callback-taking function has cells with the callback by reference, annotated and through a forwarder — branch-reviewer, `src/db/transaction.ts`
- #701 — Matching a `pg` class by identity does not cover its subclasses: one that overrides an overloaded method with a single signature becomes inferable, so the grid has a subclass with an override, not only `interface X extends pg.Pool { extra }` — branch-reviewer
- #701 — A docs claim that a third-party driver "gives" a field is checked against that driver's declarations (optional or required), not only at run time — branch-reviewer
- #701 — Two guards that each cover the same cases need a test only one of them catches, or the mutants of the other survive: `[C] extends [pg.PoolClient]` also refused the 12 isolation cells, so dropping `NoInfer` went unseen until a callback typed for another driver's client on a `pg` pool was added — builder
- #701 — An issue number written into the docs is checked with `gh issue view <n>` on that number alone: a fix linked PGlite's adapter to #697 (postgres.js) — orchestrator
- #701 — `NoInfer` on a callback's parameter also blocks a generic caller from forwarding a callback typed with the same type parameter; a helper type exported "so users can type a helper" gets a probe of that helper, generic over the parameter — branch-reviewer
- #701 — A fix-round grid compares the whole `(cell, code)` list and the emitted `.d.ts` with 6.6.1's, not only the cells the review named — branch-reviewer

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.
- #700 — form: French page text committed before its proofread (it found nothing in those lines); the proofread comes before the commit — builder
- #700 — form: `CHANGELOG.md` `Changed:` "a generic or an `infer` that reads `run`'s parameter" (and both sql-template pages) gives no remedy; add "name `db.Queryable` instead of reading it off `run`" — branch-reviewer
- #700 — form: `CHANGELOG.md` `<!-- tsc -->` mark proves the cast on `frag.run = …`, not on the spy or a library's re-export it is prescribed for; the re-export consumer's cast is compiled nowhere in the repo — branch-reviewer
- #700 — defect: `QueryableLike` with `strict: false` still accepts a `query()` that requires more than `run()` sends (no `strictFunctionTypes`) — builder
- #701 — defect: a helper generic over `db.PoolLike<C>` typing its callback `db.TxnClientLike<C, …>` gives TS2345 (filed in #702) — branch-reviewer
