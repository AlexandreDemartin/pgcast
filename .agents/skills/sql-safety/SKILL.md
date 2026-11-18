---
name: sql-safety
description: 'The core.ts sensitive zone: identifier escaping, parameterisation, raw, cols/vals, parent/self, compilation. Stop point and mandatory injection tests. USE FOR: touching compileExpression, param, raw, an interpolated identifier, an object key compiled into SQL. DO NOT USE FOR: the shape of a helper (zero-abstraction).'
---

# SQL safety

`src/db/core.ts` (`SQLFragment.compile`, `compileExpression`) turns each interpolation into SQL. A mistake here is an injection for every user.

## Stop point

- Any change to `compileExpression`, `Parameter`, `DangerousRawString`, `ColumnNames`, `ColumnValues`, `ParentColumn` or to quoting: **tell the user before writing**, with the SQL before/after.
- Risk `high`, lens `sql` (skill `run-step` § Risk).

## Rules

- **A value is a parameter** (`$n`), never concatenated; `raw` is reserved for fixed keywords in the code (`ASC`, `FOR UPDATE`), never for an input.
- **An identifier comes from the type** (`Table`, `Column`); at run time it may come from an untyped object (`req.body` passed as a `Whereable` or an `Insertable`): compile it as if it were hostile.
- **Object keys** (`Whereable`, `cols`, `vals`, `extras`, `lateral`) are identifiers: same rule.
- The `cast` of `param(x, 'type')` and the name of a `lateral` key are interpolated: same rule.
- **Escaped is not allowed**: a caller's string interpolated in `sql` is a name, and quoting only stops it closing its quotes. In a value's place, `'title'` gives `"title" = "title"`, every row; as a table, it reaches any relation the role can read (`pg_catalog.pg_roles`). A caller's name is checked against a list.
- **Entry points** are found by grepping `raw(` and interpolations in `src/`, not from the docs of the options: a parameter "used internally" (`aggregate`) is one.
- **A well-formed rule follows Postgres's lexer** (`scan.l`: `ident_start`, `ident_cont`, `""`, `U&`, whitespace around `.`), on every Postgres of the CI matrix (`\v` is whitespace only from 17); `parse_ident(text, true)` is its oracle. A name compared as Postgres resolves it is the FROM item's alias, else the table's last part, with `""` undoubled, `U&` decoded (only after a quoted part: `"public".U&"…"`) and 63 bytes kept (NAMEDATALEN; a test payload stays under it); an `AS` repeating the table's name is not neutral, nor is a correlated subquery's inner table of the outer one's name (#546, #567, #571, #621).
- **A regex on input** is timed on 1M repetitions of each repeated group, asserting which branch the input takes: a `\s*` beside a non-ASCII class turns polynomial, a repeated alternation throws V8's `RangeError`. A regex that replaces another is compared by full match arrays on every string up to length 7 over a small alphabet, plus random long ones (#551).
- **A value checked, then written** (`raw()`, an alias) is converted to a string once, and that string is written: `RegExp.test`, a template literal and `+=` each call `toString()`, with hints `string` and `default`. Proved by a conversion log or a `toString()` that answers anew, and a `toString()`/`valueOf()` split, never a steady value; by a run, not the compiled text (#601, #607, #610).
- **A gate on built-ins** (`Date`-likes, `Temporal`, `Intl`): its list is generated from the runtime (a bare `vm` context's constructors, and what their values hand out, `Segments`), keyed by path, and its test-side mirror changes in the same PR; a global read at load goes through `globalThis` with a fallback, tested by loading `zapatos/db` with it deleted (`vi.resetModules()`); a match by shape or prototype gets a stand-in matrix (class, literal, iterator, null-prototype, a real polyfill; before and after the first read) diffed against master's output; a per-row path runs its cheap test first (`keys.length`, `ArrayBuffer.isView`) (#511, #517, #521, #527, #545, #546).

## Every branch, every place

- A change to what one branch of `compileExpression` passes through as it is (fragments, arrays, Whereables, `cols`/`vals`, `parent`, `vals([…])`, `conditionalParam`) is replayed through each caller that hands objects on (`upsert` `updateValues`, `lateral`, nested fragments) and each slot (Whereable value, `isIn`, `eq`). Three review rounds of #26 each found one more container. The callers come from `git grep` of the changed function in `src/`, not from the plan (`grep -nE '\b(cols|vals)\(' src/db/*.ts`): `having`, and `numericAggregate` → `select()` → `cols()`, were missed (#244, #252); and each position its type accepts (`GROUP BY ()`, `ROW()`, #33). `currentColumn` is set by a filter's key and by a write's `vals({…})` key alike, and `upsert()` `updateValues` compiles with none: a refusal keyed on it is replayed in each (#666, #677).
- One PR fixes every place an input lands: after a fix of one place, an alias spliced into the other ran a second statement that 6.6.1 refused (#24).

## Injection tests

Each change adds, in `test/unit/injection.test.ts`:

- the hostile input (`"`, `'`, `;`, `--`, `/*`, `$1`, `\`, null byte) on each entry point touched;
- the expected compiled `text`, frozen;
- real execution against Postgres proving that the query stays a single statement.
- inputs that take the accept branch too, in each entry point that shares a regex, and valid names (plain, quoted, `U&`, mixed parts, lists): a changed valid form is a break to name;
- splices across two occurrences of one name (a literal opened in one, closed in the other), and an alias list plus a clause after the last;
- control characters made visible before an inline snapshot: Vitest writes a NUL raw and turns `\r\n` into `\n`;
- each shape `compileExpression` takes in an identifier slot (string, fragment, array, Whereable), each character a check's class excludes (`[^"\0]`), and payloads that close every parenthesis they open. A second statement runs only with no parameter, which a `lateral` map and `extras` add and a single `lateral` does not: check `compile().values.length` per shape (#607, #610).

"Nothing ran" is proved by the error naming the whole payload as one identifier, a read before the rollback, or `pool.connect` mocked to reject. Not by a read through another connection, a test placed last, a thrown error (`pg` answers a multi-statement query with an array, after the second statement ran), nor by SQLSTATE codes without the compiled text.

## Checklist

- [ ] User warned before writing, SQL before/after in the PR
- [ ] Hostile inputs tested in compilation and in execution
- [ ] No concatenated value; `raw` only on constants of the code
