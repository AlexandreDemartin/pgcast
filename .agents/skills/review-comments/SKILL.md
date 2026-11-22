---
name: review-comments
description: 'Review comments on a pgcast PR: Conventional Comments labels, what blocks, one comment per round, who posts it, the verify comment, `→ fixed in <sha>`. USE FOR: writing or posting a review, triaging its items, verifying fixes, marking a blocker fixed. DO NOT USE FOR: what a review checks (agent branch-reviewer), the merge (merge-gate).'
---

# Review comments

A review leaves one comment per round on the PR. The reviewer stays read-only and returns the text; the orchestrator posts it.

## Labels

[Conventional Comments](https://conventionalcomments.org/), one item per line, each with its `file:line` and a short phrase to grep, since lines move (up to 150 by the end of a chapter); a test by its name, a PR by its own number, not its issue's (#253, #502):

| Label | For |
|---|---|
| `issue (blocking)` | bug, injection, breaking change, wrong or too wide type, SQL different from the one announced, a **Done when** criterion not met, missing test on a risk, a PR that mixes two subjects |
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

## Rounds

1. **Review**: the orchestrator posts it with `gh pr comment <pr> --repo AlexandreDemartin/pgcast --body-file <file>`; the URL it prints ends with `#issuecomment-<id>`.
2. **Fixes**: blocking items only, by a fresh `builder` (skill `run-step` § Sequence). Non-blocking items do not block ("LGTM with comments"): they go to `docs/LEARNINGS.md` § Minors kept, each tagged `form` or `defect`, so the end-of-chapter review reads the defects first.
3. **Verify** (`high`): a second comment, posted the same way (§ Verify comment).
4. **Marked fixed**: once a blocking item's fix is verified, the orchestrator edits the review comment and ends the item with `→ fixed in <sha>`:
   `gh api -X PATCH repos/AlexandreDemartin/pgcast/issues/comments/<id> -F body=@<file>`.

At `normal` there is no verify round: the orchestrator checks the fix commit against the item before marking it. A passage rewritten across rounds is reread against skill `concise-docs` before `gh pr ready`: clauses added round by round end as one long sentence (#873).

## Verify comment

- Heading `Verify`, then one line per blocking item of the review, in its order:

```text
- fixed: `src/db/conditions.ts:42`, `not(or(a, b))` — <sha> — `unit/conditions › not parenthesises its condition` gives `NOT (a OR b)`
```

- Verdicts: `fixed`, `partly`, `not fixed`, `regressed`, each with the SHA and the evidence (a test, a `file:line`).
- `not fixed` or `regressed`: back to the fixes, then a new verify comment.
- New defects found on the way: below the verdicts, in Conventional Comments.
