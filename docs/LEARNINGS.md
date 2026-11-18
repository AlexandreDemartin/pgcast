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
- #708 — A `readonly T[]` parameter with `T extends string` widens to `string` inside a Whereable, while `like(a: T)` keeps the literal, which changes the type on enum columns: frozen as a negative rather than assumed — builder
- #708 — `bench:types` run from a worktree whose `node_modules` is linked to another's overwrites that one's `node_modules/.cache/pgcast` declarations — builder
- #708 — A brief that says "mark it ready" overrides the builder's rule only when the orchestrator means it; briefs name the exception explicitly — orchestrator
- #708 — A list helper `<T extends string>(a: readonly T[])` widens array-literal items to `string` inside a Whereable, where `<T extends string>(a: T)` keeps the literal; its type tests include a column typed as a literal union or a template literal — branch-reviewer
- #708 — A list helper whose `T` comes from the items infers `never` from a literal `[]`, which every Whereable accepts; for an operator Postgres types, `[]` is tested on a column of the wrong type — branch-reviewer
- #708 — On a literal-union column, keeping the literals and refusing an enum label pull against each other: TypeScript cannot tell an enum from a `domainsTypedAsUnions` union — builder
- #703 — `vi.resetModules()` reloads TypeScript sources only; the root's `db.js` shim loads `dist` through Node's CommonJS cache, which Vitest does not reset, so a once-per-process warning is tested on `src/db` — builder
- #703 — A test that needs a fresh prepared statement on a pooled connection uses a text of its own: the connection handed out may already have prepared the same text — builder
- #703 — A package's own scripts run tools from the root's install without listing them: npm puts every parent folder's `node_modules/.bin` on `PATH` — builder
- #703 — postgres.js 4.0.0 (2026-10-29) is ESM only, reads `timestamp` as UTC and lets the server type parameters; anything that names postgres.js covers both majors — builder
- #703 — A driver parity test that sends one value per query misses paths that depend on the other parameters: postgres.js 4 serializes by the reported type as soon as one parameter is untyped (a NULL), when `types` has a serializer, and when it retries a prepared statement; a parameter table has a row with a NULL beside the value and a second run of a prepared query — branch-reviewer
- #703 — A negative type test against a peer's typings compiles on every version of the peer range: postgres.js 3.4.0's `TransactionSql extends Sql` (with `reserve()`), 3.4.9's extends `ISql` — branch-reviewer
- #703 — A stacked branch that merged an earlier tip of the layer below conflicts with master once that layer is squashed; merge master in before the review, not after — orchestrator
- #703 — postgres.js `sql.unsafe()` defaults to `prepare: false` on 3.4 and 4.x: a probe of the driver alone beat reading `connection.js`, whose 4.x retry paths suggested every query was prepared — builder
- #703 — A transform guard needs a row per transform key alone: `postgres.camel` sets both `column.from` and `value.from`, which hid a missing column guard — builder
- #703 — A red test commit can pass `npm test` and still fail `test:types` (TS2379 under `exactOptionalPropertyTypes`); both run on the red commit — builder
- #703 — When a driver can rerun a statement by itself (postgres.js 4 after 26000 or a bind error), the parity tests force that rerun (`DEALLOCATE ALL`, a value that fails at bind); steady-state runs never take that path — branch-reviewer
- #715 — Second finding that no script checks a `<!-- tsc -->` mark in a site page (only `CHANGELOG.md`): the marks in `conditions.md` are never compiled, so skill `type-tests` § A claim about a type does not hold for pages yet — builder
- #715 — A cast panel shows the type of the first top-level `const`; an example meant to name a type defines its helpers with `function` or goes in `examples/plain/` — builder
- #714 — An issue's code sketch inside a `sql` template was wrong as written: a plain string interpolated there (`${'200'}`) is an identifier, not a value; a sketch is replayed exactly as written before it is copied — builder
- #721 — A real-SSI test that runs the competing transaction with a 0 ms retry delay depends on how fast the server writes to disk: order the writes so the loser retries only after the winner's `COMMIT` has returned — builder, `adapters/postgres-js/test/pool.test.ts`
- #721 — `commit_delay=<µs>&commit_siblings=0` in the test URL (postgres.js sends query parameters as startup parameters; superuser) recreates slow CI commits locally — builder
- #721 — "One more row than expected" was one more retry message: read the failing assertion before suspecting a double commit — builder
- #721 — A promise of another transaction awaited inside a `transaction()` callback brings that transaction's error into the callback, and its 40001 is retried as the callback's own: an ordering in a test or user code stops on the other side's failure — branch-reviewer
- #721 — A mutant that removes a test's ordering wait proves it only under the replay condition (13/30 red without the commit delay, 30/30 with it): run it with the slow-commit trick on — branch-reviewer

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.
- #700 — form: French page text committed before its proofread (it found nothing in those lines); the proofread comes before the commit — builder
- #700 — form: `CHANGELOG.md` `Changed:` "a generic or an `infer` that reads `run`'s parameter" (and both sql-template pages) gives no remedy; add "name `db.Queryable` instead of reading it off `run`" — branch-reviewer
- #700 — form: `CHANGELOG.md` `<!-- tsc -->` mark proves the cast on `frag.run = …`, not on the spy or a library's re-export it is prescribed for; the re-export consumer's cast is compiled nowhere in the repo — branch-reviewer
- #700 — defect: `QueryableLike` with `strict: false` still accepts a `query()` that requires more than `run()` sends (no `strictFunctionTypes`) — builder
- #701 — defect: a helper generic over `db.PoolLike<C>` typing its callback `db.TxnClientLike<C, …>` gives TS2345 (filed in #702) — branch-reviewer
- #708 — defect: `likeAny([])` infers `never` and compiles on an int column, which Postgres refuses with 42883 — branch-reviewer
- #708 — form: `notAnArray` says "value" for `likeAny()`/`ilikeAny()` where `notAList` says "patterns" — branch-reviewer
- #721 — form: #720's Done when asked for a replay on Postgres 14; only CI's leg covers it (the fix does not depend on the version) — branch-reviewer
