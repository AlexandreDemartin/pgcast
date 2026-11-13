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
- **A well-formed rule follows Postgres's lexer** (`scan.l`: `ident_start`, `ident_cont`, `""`, `U&`, whitespace around `.`), on every Postgres of the CI matrix (`\v` is whitespace only from 17); `parse_ident(text, true)` is its oracle.
- **A regex on input** is timed on 1M repetitions of each repeated group, asserting which branch the input takes: a `\s*` beside a non-ASCII class turns polynomial, a repeated alternation throws V8's `RangeError`.

## Every branch, every place

- A change to what one branch of `compileExpression` passes through as it is (fragments, arrays, Whereables, `cols`/`vals`, `parent`, `vals([…])`, `conditionalParam`) is replayed through each caller that hands objects on (`upsert` `updateValues`, `lateral`, nested fragments) and each slot (Whereable value, `isIn`, `eq`). Three review rounds of #26 each found one more container.
- One PR fixes every place an input lands: after a fix of one place, an alias spliced into the other ran a second statement that 6.6.1 refused (#24).

## Injection tests

Each change adds, in `test/unit/injection.test.ts`:

- the hostile input (`"`, `'`, `;`, `--`, `/*`, `$1`, `\`, null byte) on each entry point touched;
- the expected compiled `text`, frozen;
- real execution against Postgres proving that the query stays a single statement.
- inputs that take the accept branch too, in each entry point that shares a regex, and valid names (plain, quoted, `U&`, mixed parts, lists): a changed valid form is a break to name;
- splices across two occurrences of one name (a literal opened in one, closed in the other), and an alias list plus a clause after the last;
- control characters made visible before an inline snapshot: Vitest writes a NUL raw and turns `\r\n` into `\n`.

"Nothing ran" is proved by the error naming the whole payload as one identifier, a read before the rollback, or `pool.connect` mocked to reject. Not by a read through another connection, a test placed last, a thrown error (`pg` answers a multi-statement query with an array, after the second statement ran), nor by SQLSTATE codes without the compiled text.

## Checklist

- [ ] User warned before writing, SQL before/after in the PR
- [ ] Hostile inputs tested in compilation and in execution
- [ ] No concatenated value; `raw` only on constants of the code
