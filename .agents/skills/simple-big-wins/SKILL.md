---
name: simple-big-wins
description: 'Simple big wins, nothing shaky: measured gain weighed against added complexity, reuse before writing, what to test. USE FOR: before writing a mechanism, choosing between two solutions, optimising, adding a dependency, a rule on existing code. DO NOT USE FOR: the shape of a helper (zero-abstraction), recording a decision (decision-philosophy).'
---

# Simple big wins, not complicated small wins

- The right balance is judged by the **measured gain** weighed against the **added complexity**: lines, special cases, conditional types, assumptions to keep in mind.
- **Simple big win**: take it at once. **Costly small win**: leave it, even if correct and tested.
- **Shaky solution** (fragile workaround, reliance on an internal detail of `pg` or TS, behaviour that works by chance): refused, even if it works today.
- Removing code or a dependency with no loss of function is a big win.

## Before writing code

1. Already in `src/`? Reuse it (`mapWithSeparator`, `SQLFragment.copy`, `conditionalParam`…).
2. Postgres already does it? Expose the SQL, do not reimplement it in JS.
3. Otherwise short home-made code, with no runtime dependency (`AGENTS.md` § Philosophy, point 4).

## Types

- One more conditional type is paid for at every compilation by every user: measure it (`npm run bench:types`).
- The simplest type that refuses the wrong cases; no feat of typing that catches nothing more.

## Tests

- Each observable behaviour: its compiled SQL (`text` + `values`) and its real execution.
- Each public type: a positive and a negative case (skill `type-tests`).
- Outside Pareto, covered in full: escaping and parameterisation (skill `sql-safety`).
- Nothing Postgres does not promise: a multi-row `RETURNING` is sorted before `toEqual`, a sequence value is read through `RETURNING` (`ROLLBACK` does not undo `nextval`).
- `transaction()`: a change is probed on a pool and on a plain client, with a second call at the same moment (`Promise.all`); a test of commit or rollback runs on `t.pool` (`t.client` is already inside `BEGIN`). A fake of `pg` follows pg's source at its peer floor (7.18.2) and at the latest: a client queues each `query()` until `connect()`, `getTransactionStatus()` lags a rejected query, a lazy getter replaces itself (#35, #233, #246, #268); `Pool.query()` destroys its client when the query fails, so a probe of what a reused connection reads keeps one client from `pool.connect()` (#747). Before a test of a transaction: [reference.md](reference.md) § Transactions; of two at once, [reference.md](reference.md) § Races; of an adapter or a driver, [reference.md](reference.md) § Drivers. A fix that ends a shared pool replays the work already queued inside pg-pool (more queries than `max`, `connectionTimeoutMillis`, waiting past it), and its guard sits where the failure lands, the `catch` (#302).
- A test or a replay that must not reach a database (config validation, a CLI that may ignore its config) runs against an unreachable one (`postgres://nobody@127.0.0.1:1/none`, `PGHOST=/nonexistent`): a live pool or a fallback connection hides the difference (#364, #368, #407). A CLI replay sets both the URL and `PGHOST`/`PGPORT` on a closed port: with no config file, 6.6.1 falls back to the `PG*` variables and reaches the machine's Postgres (#722).
- A compiled result is snapshotted raw, never through `JSON.stringify`, which erases `Date` against string and `undefined` against `null`; an error is asserted by `{ name, message }`, as `toThrow('…')` reads the message alone (#645); a shape (an event, a row) by `toStrictEqual`, as `toEqual` ignores keys set to `undefined` (#730). A probe's log prints a value whose type matters with `JSON.stringify`: `"2"` is not `2` (#744).
- A test that bounds synchronous code sizes its input so the slow version still ends in seconds: Vitest's timeout fires only once the work returns. A mutant that loops forever is stopped by killing vitest's fork worker by PID (`ps -axo pid,ppid,command`), which outlives its main process (#551, #638, #647). An embedded backend that blocks the event loop (PGlite's `execProtocol()` after `close()`, an unanswered `COPY FROM STDIN`) fires no timer either: such a probe or red test runs in the background under an alarm, killed by PID (#698, #709).
- A test of a process's end asserts that it exits, not only that it stops printing: an early return on SIGINT left one that only SIGKILL ends. The end closes what a constructor that threw had opened: `createWatchProgram` leaves its file watchers (#863).
- A speed claim compares master and the branch in one process, interleaved, then again in reversed order (#545, #553).
- A check (a docs checker, `check:agents`, a guard) is first proved in the direction that passes silently: plant near misses of its marker (`<!---`, a plural, case, spacing, an info string), a duplicate, a comment; and every form it must refuse, not only the one the tree uses: a guard that read a command's words with quotes emptied missed each quoted argument and `src:dst` refspec (#690, #834).
  - Run with no input (a missing argument, an empty list), it exits non-zero, never with its pass message: an orchestrator check run without its argument passed (#918).
  - A loose detector beside the strict parser fails on any line it sees and cannot read; a scanner is compared with the real parser (markdown-it's `fence` tokens) on every page.
  - Equality, not `[\s\S]*?` between expected lines, which accepts a dropped one.
  - Its rule sits in a module a self-check can import alone, not one that pulls in a data loader (#236).
  - A pattern check is proved on a table of the forms it reads, each with a case it reports and one it leaves (plain, `./`, code span, link, anchor, another folder's path: `(?<![\w/])` skipped `./` too, #873), and by mutating each real match in the tree, not only synthetic probes (68 in under a second, #854).
  - A docs check reads every page, as `check-prose.mjs` does, never a hand list, which reopens the hole at the next page (#700, #715, #854); it skips each page-level comment it does not own, VitePress's `<!-- @content -->` and `<!-- @changelog -->` included (#854).

## Adopting a rule on existing code

- A new rule applies to new or touched code; no sweep of all of `src/` (except for a bug or a vulnerability).
- Zapatos's original code keeps its style; we do not reformat it.
