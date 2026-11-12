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

## Injection tests

Each change adds, in `test/unit/injection.test.ts`:

- the hostile input (`"`, `'`, `;`, `--`, `/*`, `$1`, `\`, null byte) on each entry point touched;
- the expected compiled `text`, frozen;
- real execution against Postgres proving that the query stays a single statement.

## Checklist

- [ ] User warned before writing, SQL before/after in the PR
- [ ] Hostile inputs tested in compilation and in execution
- [ ] No concatenated value; `raw` only on constants of the code
