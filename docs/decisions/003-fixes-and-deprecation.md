# 003 — Breaking fixes: fix, or deprecate

- **Status**: accepted (2026-11-12), by delegation from the user (paraphrased from French): "the best solution according to the philosophy; do not break everything; deprecation that keeps working and is flagged". Revised on 2026-11-12 after audit (R8, R14, R16).
- **Scope**: the "breaking" findings of [CHARACTERISATION-REPORT.md](../CHARACTERISATION-REPORT.md), chapter 2 (Epic [#18](https://github.com/AlexandreDemartin/pgcast/issues/18)).

## Context

29 findings out of 61 are breaking: the fix changes a result that is valid today. pgcast's promise is that a project on Zapatos 6.6.1 changes its import without rewriting its code (note 002).

## Industry practice

| Reference | What it does |
|---|---|
| Node.js, deprecation cycle | docs only → run-time warning (`DeprecationWarning`, code `DEPxxxx`) → removal in a major version |
| React Router, Remix: *future flags* | the new behaviour is opt-in through a flag, then becomes the default in the next major |
| TypeScript, the `--strict*` family | one option per safer behaviour, off by default |

## Rule

Three classes, from the most direct to the most cautious:

| Class | Criterion | What we do | CHANGELOG |
|---|---|---|---|
| **Fix** | Postgres already refused the SQL, the type already refused the call, or the old result contradicts the function's name, type or docs, so that nobody can reasonably depend on it. Vulnerabilities too. | direct fix, failing test first | `Fixed` (`Security` for a vulnerability) |
| **Opt-in, then default in 7.0** | The current result is valid and code may depend on it. | config option (default: the old behaviour); the old path emits a `DeprecationWarning` **once per process** that names the option; it becomes the default in 7.0 and the old behaviour goes in 8.0 | `Added` (the option) + `Deprecated` (the old behaviour) |
| **Document** | The behaviour follows Postgres, or is intended. | one line of docs or JSDoc | `Changed` (docs) |

- **Warning**:
  - runtime: `warnOnce(code, message)` of `src/db/utils.ts` (`process.emitWarning(message, { type: 'DeprecationWarning', code })`, once per code), only when the deprecated path is actually taken;
  - codegen: through `warningListener`, only if the schema is affected.
  - The message names the option to turn on and says it will be the default in 7.0.
  - Its code `PGCAST_DEP00n` goes in the table below when its PR is opened, so that two opt-ins never share one.
- **Opt-in without switch-over**: when the old behaviour remains a reading that George uses and documents, the option stays opt-in for good, with no warning and no switch-over in 7.0 (R14). CHANGELOG: `Added` (the option) + `Changed` (the docs).
- **Option names**: flat keys, like the existing options (`castArrayParamsToJson`, `unprefixedSchema`).
- **Optional keys**: a new key of the runtime `Config` is optional (`?:`) and read with `?? <default>`, so that a `Config` written for 6.6.1 still compiles (JSDoc of `Config`).
- **JSDoc**: `@deprecated` on the old behaviour when it has a shape of its own (an option value, a signature).

## The 11 breaking findings

| # | Class | Why | Option (default = 6.6.1) | Code |
|---|---|---|---|---|
| R4 | Fix (`Security`) | the type promises a value; a string compiled as an identifier is also an injection path | — | — |
| R8 | Opt-in | data loss, but code may rely on every column being updated | `upsertRequiresSameKeys: true`: without `updateColumns`, a key missing from some row and still set from `EXCLUDED` (not a key of `updateValues`, not a column of an array or string `conflictTarget`; with `constraint()`, any key) throws an error that says what to do ("rows have different keys: pass updateColumns, or give every row the same keys"); no column is silently skipped, since Postgres cannot tell an inserted `DEFAULT` apart; the old path warns on the same rule. Refined 2026-11-12 in #27: new rows without their serial `id`, upserted on `'id'`, lose nothing | `PGCAST_DEP001` |
| R9, R11 | Opt-in | `undefined` → `NULL` is observable and may be intended | `undefinedMeansMissing: true`: an `undefined` value behaves like a missing key (`update` omits it, `insert` sends `DEFAULT`); the old path warns at the first `undefined` value | — |
| R12 | Fix | `not()` must negate its whole condition; `(NOT a) OR b` contradicts its name | — | — |
| R13 | Fix | the type accepts a `Parameter`, the runtime wraps it twice; `Default` in a filter throws an error that says what to do | — | — |
| R14 | Opt-in without switch-over | hundreds of calls in the corpus; George nests `selectExactlyOne` in a `lateral` (docs § lateral, JSDoc of `shortcuts.ts`), where a `LIMIT 2` would duplicate the parent row | `selectExactlyOneChecksForSecondRow: true`, for a top-level `run` only; never in a `lateral`, which keeps `LIMIT 1`; no warning, no switch-over in 7.0; the docs say "at least one row, `LIMIT 1`" | — |
| R16 | Opt-in | `0` on an empty set, a date in milliseconds: observable results that code may compare; the report proposed documenting | `aggregatesTypedByColumn: true` (proposed name, settled in its PR): `avg`, `sum`, `min` and `max` return `null` on an empty set, `min` and `max` are typed by column instead of going through `Number()`; the old path warns when its result differs | — |
| R35 | Fix | `never[]` helps nobody; the correct type refuses no call that used to work | — | — |
| R40 | Opt-in (codegen) | `any` → literal union may refuse code that compiles today | `typeEnumsAcrossSchemas: true` | — |
| R50 | Opt-in (codegen) | the order of the `every.<enum>` tuple is observable | `enumOrder: 'declared'` (default `'alphabetical'`, deprecated) | — |

## The other stop points of chapter 2

- **`core.ts`** (R1, R2, R3, R13): covered by this delegation. Review `high`, lens `sql`, then `verify`. The SQL before and after is written in the PR.
- **Non-breaking codegen output** (R41, R47, R48, R49): fix. Invalid output becomes valid, or comments are added. The snapshot diff is justified line by line (skill `codegen-output`).
- **`param()` casts** (R27, R28): fix. Postgres already refused these queries.

## Consequences

- No project on 6.6.1 changes behaviour without asking for it, except for a bug of the "Fix" class.
- Version 7.0 comes down to switching the defaults of the options listed here, except R14's; the warnings announce it.
