---
name: consumer-usage
description: 'Validate a need and an API against the local corpus of real Zapatos usage: where to look, what to note, what never leaves the machine. USE FOR: justifying an option or a helper, choosing an API, finding existing workarounds, preparing a decision note. DO NOT USE FOR: the shape of a helper (zero-abstraction).'
---

# Real usage

Real projects that use Zapatos form a **corpus of examples**, not the target: pgcast aims at a Zapatos that goes the last mile for any application (`README.md` § Roadmap). Their workarounds show where people leave the typed path.

## Where

- The projects, their paths and their entry points are in `.agents/local/corpus.md`, **ignored by git**: it lives only on the user's machine.
- File missing: ask the user; never guess a path.

## Rules

- **Read only**, never a change nor a commit in these repositories.
- **Confidentiality**: the corpus's code does not leave the machine, and neither do its project names. Nothing from it is quoted in the repository, a PR, an issue or an external service: describe the **pattern**, never the extract, the project nor a business name.
- **Invented examples**: never an extract from the corpus, even modified. An example showing the same pattern is written with other table and column names: George's (skill `zapatos-spirit` § Doc), or the fixture's in a test.
- **Public**: pgcast's issues and PRs are public, like the repository. Write only **unnamed patterns** there: no project, no extract, no business name, no path; "a corpus of real usage", with orders of magnitude ("about a thousand hand-written laterals").
- **Look for the workaround**, not just the usage: `as unknown as`, a rewritten `runResultTransform`, `db.raw` on a value, `sql``` that reimplements a shortcut, a home-made helper around `db.conditions`.
- **A need is worth an API** if it is **general to Postgres** (a pattern every application meets) and if it recurs in the corpus. A project-specific choice (`simple` + `unaccent` configuration, a business domain name) becomes a parameter, never a dedicated helper. An isolated case stays a `sql` fragment.
- **The proposed API** replaces the workaround without changing the SQL produced, or by making it valid (empty `and()`).

## Checklist

- [ ] Pattern cited with its order of magnitude, without name or extract
- [ ] Invented examples, on other tables and columns
- [ ] The workaround's SQL compared with the proposed helper's SQL
- [ ] The caller's migration described in one line
