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
- **A note's claims are runs** (skill `code-style` § Claims): each signature compiled before the note is accepted (TS2536), each SQL string grepped in the output of one harness that replays them all, every round; a quote of Zapatos or of a maintainer runs to its conclusion and to the linked issue's closing comment, and any source cited by its exact wording is fetched and the quote checked (#747); a Zapatos change is dated by its commit against the version commits; how the existing keys treat the same case is the precedent (#567, #635, #646, #680).

## 2. The limits, in this order

1. **Security**: no injection, a parameter rather than a literal, the safest option (skill `sql-safety`).
2. **6.6.1 backward compatibility** (skill `backward-compat`).
3. **The 6 principles** of `AGENTS.md` § Philosophy.

## 3. Within these limits, all else equal

- The SQL closest to what you would write by hand.
- The cheaper SQL for the same result, measured (`AGENTS.md` § Philosophy, point 6).
- The type derived from the database rather than written by hand.
- An addition opt-in rather than default, and a switch between two behaviours only with its exit, the sole behaviour at the next major (decision 019); a separate package rather than the core.
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
