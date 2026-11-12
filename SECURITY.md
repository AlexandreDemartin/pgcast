# Security policy

## Supported versions

| Version | Supported |
|---|---|
| The latest 6.x minor of `pgcast` | yes: fixes ship as a patch release |
| Older `pgcast` versions | no: upgrade to the latest minor, a drop-in |
| `zapatos` (Zapatos itself) | not maintained here; a flaw that pgcast shares is reported here, and its fix offered upstream |

## Reporting a vulnerability

- Use GitHub's private vulnerability reporting: [Report a vulnerability](https://github.com/AlexandreDemartin/pgcast/security/advisories/new), from the repository's **Security** tab.
- Never a public issue, pull request or discussion.
- Include the call, the SQL it compiles to (`.compile()`), and what an attacker controls.

## What to expect

- An acknowledgement within a week.
- A fix with its tests, in a patch release, and a GitHub security advisory with a CVE.
- Coordinated disclosure: the advisory is published once the fixed version is out, on a date agreed with you.
- Credit in the advisory and in the `Security` section of [CHANGELOG.md](CHANGELOG.md), unless you would rather not be named.

## Scope

| In scope | Out of scope |
|---|---|
| SQL that `zapatos/db` compiles from caller input: values, table and column names, object keys, options | SQL you write yourself in `raw()`, which is written as is by design |
| The codegen (`pgcast` / `zapatos` CLI) and the files it writes | Flaws in Postgres, `pg` (node-postgres) or TypeScript themselves |
| | The repository's dev tooling, which is not published |

## Threat model

- **Values are parameters** (`$1`, `$2`, …), never concatenated into the SQL.
- **Identifiers come from the generated types** (`Table`, `Column`). At run time, any string or object key that may come from outside (a `Whereable` built from a request body, `cols`, a `lateral` key, the cast of `param()`) is compiled as hostile: quoted, with any `"` doubled, so it cannot close its quotes.
- **Keywords typed as literals** (lock modes, isolation levels, `truncate()` options, the aggregate of `select()`) are checked at run time before any query.
- What 6.6.1 let through, and how each hole was closed: [docs/CHARACTERISATION-REPORT.md](docs/CHARACTERISATION-REPORT.md) § Security.
- Contributors who touch compilation or escaping: skill [`sql-safety`](.agents/skills/sql-safety/SKILL.md).
