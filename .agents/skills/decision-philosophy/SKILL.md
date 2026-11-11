---
name: decision-philosophy
description: 'Deciding alone a choice that nothing writes down: where to look, which limits come first, what waits for the user, where to write it. USE FOR: choosing without a written rule, principles in conflict, "can I decide alone", challenging a need. DO NOT USE FOR: measuring a gain (simple-big-wins), designing a helper (zero-abstraction).'
---

# Deciding alone

A written rule (`AGENTS.md`, a skill, an accepted note) always wins: this skill applies only where nothing is written.

## 1. Look before deciding

In this order, stopping as soon as the answer is written:

1. `AGENTS.md` § Philosophy and § Stop points.
2. `docs/decisions/` (accepted notes), then the chapter's Epic (`gh issue view`).
3. The subject's skill (`.agents/README.md` § Skill map).
4. Zapatos code that already solves the same problem.
5. Real usage in the corpus (skill `consumer-usage`).
6. The market standard: the Postgres docs, then pgTyped, sqlc, Kysely, Slonik.

- **Found**: apply it without reopening the debate; a better idea is proposed, not imposed.
- **Shaky need** (workaround, contorted case, magic): do not code around it; raise it.

## 2. The limits, in this order

1. **Security**: no injection, a parameter rather than a literal, the safest option (skill `sql-safety`).
2. **6.6.1 backward compatibility** (skill `backward-compat`).
3. **The 5 principles** of `AGENTS.md` § Philosophy.

## 3. Within these limits, all else equal

- The SQL closest to what you would write by hand.
- The type derived from the database rather than written by hand.
- Opt-in rather than default; a separate package rather than the core.
- The one a test or the compiler checks rather than review.
- The one that costs the least compile time (`bench:types`).
- The most reversible.

## 4. Alone, or with the user

| Decided alone, written in the PR ("decided alone"), and we carry on | Waits for the user |
|---|---|
| Shape of the code, tests, dev tooling, method | Any new dependency, even a dev one |
| Splitting a step, order of tasks | A change to the public API or to the default codegen output |
| A contained fix with its test | `core.ts`: escaping or compilation |
| Internal naming | A decision note (`docs/decisions/`) |
| | npm publication, release, anything visible outside |
