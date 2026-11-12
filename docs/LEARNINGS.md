# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Nothing applies before the end of the chapter: the method is frozen until then (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.

- 1.1 — Dropping databases by `LIKE 'pgcast_test_%'` is wrong: `_` is a wildcard; `starts_with()` and a JS guard on the name — `builder`, `test/helpers/databases.ts`
- 1.1 — `string_agg(… ORDER BY 1)` sorts by the constant 1, not by the first column: sort by the expression — `builder`
- 1.1 — Auto mode refuses any command that could print `TEST_DATABASE_URL`: print only booleans — `builder`
- 1.1 — `timeout` does not exist on macOS; network retries go through a `for` loop — `builder`
- 1.1 — `new URL()` puts the whole string in `err.input`, which Vitest prints: a URL carrying a secret is never parsed without redaction — `branch-reviewer`, `test/helpers/databases.ts:44`
- 1.1 — `ROLLBACK` does not undo `nextval`: a test never pins a sequence value, it reads it through `RETURNING` (candidate: skill `type-tests` or a testing skill) — `branch-reviewer`, `test/helpers/db.ts`
- 1.1 — `process.loadEnvFile` does not replace a variable already set: the environment wins over the file — `branch-reviewer`
- 1.1 — A test database is created with `ENCODING 'UTF8' LOCALE 'C'`: the libc collation differs between macOS and glibc — `branch-reviewer`, `test/helpers/globalSetup.ts`
- 1.1 — `git stash` of a single file breaks the files that depend on it; to show a red test before a fix, a direct `node -e` is safer — `builder`
- 1.2 — The sources of `src/db` compile only against the stub schema; a type test imports the emitted declarations, as a consumer does — `builder`, `test/generated/tsconfig.json`
- 1.2 — A `.d.ts` snapshot folder under `test/` must be excluded from `test/tsconfig.json`, otherwise `tsc -p test` compiles it — `builder`
- 1.2 — A tsconfig that `extends` and sets `files` keeps the parent's `include`: add `"include": []` — `builder`
- 1.2 — `toMatchFileSnapshot` and `-u` never delete a file: each folder of file snapshots has its check for extra or orphan files (candidate: skill `codegen-output`) — `branch-reviewer`
- 1.3 — Destructuring `const { all, Default } = db` widens the `unique symbol`s to `symbol`: use named imports — `builder`
- 1.3 — A display helper in a test (`JSON.stringify`) erases what it should catch (Date / string, `undefined` / `null`): snapshot the raw compiled object (candidate: skill `type-tests` or a testing skill) — `branch-reviewer`, `test/unit/conditions.test.ts:14`
- 1.3 — `RETURNING` without `ORDER BY` has no order: a multi-row result is sorted before `toEqual` — `branch-reviewer`
- 1.3 — A surprise seen on one case is tried again with a parameter changed before it is written as a rule (isolation level: warning or 25001) — `branch-reviewer`
- 1.3 — `npx vitest run -u <file>` sometimes reran the whole suite: check `git status` afterwards — `builder`
- 1.3 — A worktree whose `node_modules` is a link to the checkout writes into its cache (`node_modules/.cache/pgcast`) — `branch-reviewer`
- 1.5 — A "nothing leaked" test placed last proves nothing when run alone or shuffled: isolation is checked within the test itself, by reading back through another connection — `branch-reviewer`, `test/integration/injection.test.ts`
- 1.5 — Injection entry points are listed by searching for `raw(` and interpolations in `src/`, not by following the docs of the options; a public parameter "used internally" (`aggregate`) remains an entry point (candidate: skill `sql-safety`) — `branch-reviewer`
- 1.5 — Vitest `-t` takes a JS regex: `a\|b` finds nothing — `builder`
- 1.5 — `toMatchInlineSnapshot` writes a raw NUL byte into the source: replace it with a visible marker before pinning — `builder`
- 1.5 — In a retry loop, `git push … | tail` hides the exit code: test the command itself — `builder`
- 1.4 — A negative case written through a typed helper (`constraint<'users'>(…)`) tests the helper, not the shortcut: build the value apart, then pass it (candidate: skill `type-tests`) — `branch-reviewer`, `test/types/shortcuts.test-d.ts:155`
- 1.4 — `X extends T ? true : false` checks only an inclusion, like `toMatchTypeOf`: `toEqualTypeOf` as soon as the type can be written — `branch-reviewer`
- 1.4 — A type that is wrong only when inferred in a shortcut call does not show on an annotated variable: test the call itself — `builder`
- 1.4 — Declarations emitted into the system temp folder do not resolve `pg`: emit them under `node_modules/.cache/` — `builder`
- 1.4 — A merge of `master` conflicts in `AGENTS.md` as soon as a branch has changed the commands table: plan for it in the brief — `builder`
- 1.4 — Splitting an already pushed PR is done with new branches and `cherry-pick`, the old PR closed with a pointer — `builder`
- 1.6 — The `Instantiations` of a whole project are dominated by `lib.dom` and `@types` (~82 %): a cost measure subtracts a floor — `builder`, `scripts/bench-types.mjs`
- 1.6 — A guard `if (x > threshold) fail` lets `NaN` through: validate any value read from a tool or a file (`Number.isInteger`) before comparing (candidate: skill `type-tests`) — `branch-reviewer`
- 1.6 — A baseline compared on a single bound drifts upwards: a deterministic measure also has a lower bound, or a mandatory update — `branch-reviewer`
- 1.6 — `git commit --no-edit` after a resolved merge keeps the `# Conflicts:` lines: write the message with `-m` — `builder`
- 1.6 — A `paths` redefined in a child tsconfig erases the parent's (`"*": ["src/typings/*"]`): that is what leaves `zapatos/schema` to the generated ambient module — `builder`
- 1.6 — `scripts/` has neither lint nor tests: a script's guard is checked by reported trials, or extracted into a testable function — `builder`
- 1.7 — Rewriting a Markdown section with an `re.S` regex let `.*` run to the end of the file: replace an exact section, or check `git diff --stat` before committing — `builder`
- 1.7 — In a Markdown table, a test name containing backticks needs a double-backtick code span — `builder`
- 2.1 — `git checkout <ref> --` without a path changes the HEAD of the main checkout: read another revision with `git show <ref>:<path>` or a worktree — `branch-reviewer`
- 2.1 — A whitelist on a variadic parameter also refuses `undefined` / `null`, which the old code rendered empty: check the old SQL for these cases (projects without `strictNullChecks`) before pinning a refusal (candidate: skill `backward-compat`) — `branch-reviewer`
- 2.1 — To prove "before any query" on code that commits, `pool.connect` replaced by `mockRejectedValue`: a regression cannot write anything — `builder`
- 2.1 — A fix makes the report's line and the CHANGELOG's "nothing is fixed yet" line stale: the commit that ticks the step updates them — `builder`
- 2.2 — A whitelist of Postgres identifiers follows the lexer (`scan.l`: `ident_start`, `ident_cont`, `""`, `U&`), not `\p{L}`; each refusal is tested against Postgres before being pinned (candidate: skill `sql-safety`) — `branch-reviewer`
- 2.2 — `\s*` next to a class that contains non-ASCII characters makes a regex polynomial (2,000 non-breaking spaces: 3 s): use Postgres's whitespace `[ \t\n\r\f\v]` (from Postgres 17; `[ \t\n\r\f]` before) and time a long run — `builder`
- 2.2 — `RegExp.prototype.test` converts its argument to a string: `null` passes as `'null'`; if the behaviour without `strictNullChecks` depends on it, a test pins it — `branch-reviewer`
- 2.2 — An empty `toMatchInlineSnapshot()` is written with the current output: for a red test of a fix, write the expected snapshot by hand — `builder`
- #22 — Before calling an input "never valid", replay it in its 6.6.1 form against Postgres: a quote break can be a workaround in use (`a"."b` gave a schema-qualified cast), so closing it is a break to name — `branch-reviewer`
- #22 — A "written as is when well-formed" rule follows Postgres's grammar, whitespace around `.` included, or it refuses calls that ran (candidate: skill `sql-safety`) — `branch-reviewer`
- #22 — Lexer behaviour pinned in an integration test must hold on every Postgres of the CI matrix: `\v` is whitespace only from 17 (`scan.l`, `REL_17_STABLE`); a local 17 and a draft PR hide it (candidate: skill `sql-safety`) — `branch-reviewer`, `test/helpers/hostileCasts.ts`
- #22 — Vitest inline snapshots turn `\r\n` into `\n` and keep `\f` / `\v` raw: make control characters visible before snapshotting — `builder`
- #22 — A NUL byte in the query text gives 08P01 and the client stays usable; Postgres cuts identifiers to 63 bytes, so a 42704 message shows only the start of a forged name — `builder`
- #22 — In a worktree the sandbox refuses compound shell commands that run git (`for` retry loops, pipes): brief worktree builders to run plain `git -C` commands — `builder`

## Minors kept

Minor review defects, taken up by the end-of-chapter review.

- 1.1 — `test/helpers/db.ts:44`: a single `client` per file; `it.concurrent` would overwrite another test's transaction — throw if `client` is already set — `branch-reviewer`
- 1.1 — `vitest.config.mts:7`: `globalSetup` also runs under `test:types` and creates a template database for nothing — `branch-reviewer`
- 1.2 — `test/integration/codegen.test.ts:88`: only the main output is compiled; the variants (except `edge`) are not — to take up in 1.4 — `branch-reviewer`
- 1.2 — `test/integration/codegen.test.ts:8`: the header does not say that after `-u` a stale file of `test/generated/zapatos/` is deleted by hand — `branch-reviewer`
- 1.2 — `test/integration/codegen.test.ts:92`: nothing spots an orphan file in `test/__snapshots__/codegen/` — `branch-reviewer`
