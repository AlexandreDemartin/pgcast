---
name: review-comments
description: 'Review comments on a pgcast PR: Conventional Comments labels, what blocks, one comment per round, who posts it, its table and fold, the verify that edits it. USE FOR: writing or posting a review, triaging its items, verifying fixes, marking a blocker fixed. DO NOT USE FOR: what a review checks (agent branch-reviewer), the merge (merge-gate).'
---

# Review comments

A review leaves one comment per round on the PR, and its verify edits that comment. The reviewer stays read-only and returns the text; the orchestrator posts and edits it.

## Labels

[Conventional Comments](https://conventionalcomments.org/), one item per line, each with its `file:line` and a short phrase to grep, since lines move (up to 150 by the end of a chapter); a test by its name, a PR by its own number, not its issue's (#253, #502):

| Label | For |
|---|---|
| `issue (blocking)` | bug, injection, a breaking change outside the major's decided list or without its migration entry (skill `backward-compat`), wrong or too wide type, SQL different from the one announced, a **Done when** criterion not met, missing test on a risk, a PR that mixes two subjects |
| `suggestion (non-blocking)` | a better way, not needed to merge |
| `nitpick (non-blocking)` | naming, JSDoc, form |
| `question (non-blocking)` | a doubt with no concrete scenario yet |

```text
- issue (blocking): `src/db/conditions.ts:42` — `not(or(a, b))` compiles to `NOT a OR b`, which negates only `a` (skill `zero-abstraction`). Expected: `NOT (a OR b)`, frozen by a test.
```

- At most 10 items, from most to least serious.
- A blocking item rests on a concrete scenario (input → wrong behaviour); a doubt is a `question`.
- Nothing to flag: one line, "LGTM". No summary of the diff nor compliment.
- The agent's "learning" remarks go apart, never in the comment (skill `run-step`).

## Round comment

Two layers (skill `plan-and-proofs` § Two layers):

```markdown
| # | Blocking | Fix |
|---|---|---|
| 1 | `not(or(a, b))` compiles to `NOT a OR b`, which negates only `a` | pending |

For you: <a doubt the owner must settle>

2 minors → LEARNINGS, 1 no action, 1 pre-existing → #n.

<details><summary>Items in full</summary> … </details>
```

- Above the fold: one row of about 15 words per blocking item, its scenario (input → wrong behaviour), not the reviewer's prose. Then one `For you:` line, left out when there is no doubt to settle. Then the count of the others: minors → `docs/LEARNINGS.md`, no action, pre-existing → an issue.
- Folded: every item in full, as the reviewer wrote it (§ Labels).
- No blocking item: `LGTM` in place of the table, then the count.
- The reviewer returns the whole text; the orchestrator writes the count once it has triaged, runs `node scripts/check-body.mjs <file>`, then posts it.

## Rounds

1. **Review**: the orchestrator posts the round comment, each **Fix** `pending`, with `gh pr comment <pr> --repo AlexandreDemartin/pgcast --body-file <file>`; the URL it prints ends with `#issuecomment-<id>`.
2. **Fixes**: blocking items only, by a fresh `builder` (skill `run-step` § Sequence). Non-blocking items do not block ("LGTM with comments"): they go to `docs/LEARNINGS.md` § Minors kept, each tagged `form` or `defect`, so the end-of-chapter review reads the defects first.
3. **Verify** (`high`, § Verify), or the orchestrator's check of the fix commit against the item (`normal`): the orchestrator edits the same comment, never a second one. Each **Fix** becomes `<sha>, verify: <verdict>`, and the verify's evidence goes inside the fold:
   `gh api -X PATCH repos/AlexandreDemartin/pgcast/issues/comments/<id> -F body=@<file>`.
4. A `partly`, `not fixed` or `regressed` verdict opens the next round, with its own comment.

A passage rewritten across rounds is reread against skill `concise-docs` before `gh pr ready`: clauses added round by round end as one long sentence (#873).

## Verify

- The reviewer returns, as text, one line per blocking item of the round, in its order:

```text
- fixed: `src/db/conditions.ts:42`, `not(or(a, b))` — <sha> — `unit/conditions › not parenthesises its condition` gives `NOT (a OR b)`
```

- Verdicts: `fixed`, `partly`, `not fixed`, `regressed`, each with the SHA and the evidence (a test, a `file:line`).
- The orchestrator writes each verdict into its row's **Fix**, and the lines under a `Verify` heading inside the fold.
- New defects found on the way: below the verdicts, in Conventional Comments.
