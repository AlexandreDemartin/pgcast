# Orchestrating a step: reference

The cases of skill `run-step` that serve a minority of steps; [SKILL.md](SKILL.md) names each section with when to read it.

## Models

| Role | Model | Effort |
|---|---|---|
| `builder`, every step (plan and build) and round of fixes | the session's | `high` |
| `branch-reviewer`, review and `verify` | the session's | `high` |
| `chores`, French proofreader, npm and site audits | `sonnet` | `medium` |
| Orchestrator | the session's | the session's |

Each change of this table is a lever of #812, with its keep-or-revert test and its measurements. It goes into the orchestrator's hand-over and brief templates too: a spawn's `model` and `effort` outrank the agent's frontmatter, so a stale brief keeps a reverted lever alive (#874).

## Issue order

- A task under its feature: `gh api repos/AlexandreDemartin/pgcast/issues/<feature>/sub_issues -F sub_issue_id=<id>`, where `<id>` is the task's `id`, not its number (`gh api repos/AlexandreDemartin/pgcast/issues/<n> -q .id`).
- A new idea at its place in the order: `PATCH …/issues/<epic>/sub_issues/priority`, with `sub_issue_id` and `after_id`.

## Rounds

- A third round finding a deeper hole in one part cuts it to a Deferred section, its blockers checked against what stays (#746); a design on several conditional types writes its hunt grid before the first review (#751).
- A round that accepts a cost above the Epic's **Done when** amends that **Done when** in the same round, naming the exception and where it is accepted; the range review rereads each absolute criterion ("at or under Zapatos 6.6.1") against the final baseline (#924's literal cost reached #919's range review as a blocker).

## Risk

- `{ col: self }` never passes through `conditions.ts`, so #106 was `high` from the start.

## Method PRs

- **A method PR's proof** is scripted from two maps, a learning's line to the rule that took it and to a key term of that rule: a line left out or given twice shows at once, where by hand two were missed (#846). Each kept row's term is found by `git grep -F` at the head and absent on the base, and the script is rerun after each fix round: a reworded rule loses its term (4 of 221 in #846). A dropped row that a rule on master already holds cites that rule, its term found on the base too, and counts as its second occurrence (a misquoted home, #874). The verdicts are a table, one row per line, posted as a comment on the PR. A fix that moves a rule or a pointer greps the PR body, the verdict comment and Epic #836's comments for its old place (three named it, #848).
- **A rule merged from several learnings** is reread against each source line, as a merge can drop the condition of one (the base tsconfig with no `include`, #848): before the first push, each source line's actor, flag and exception is grepped in the merged rule, as the proof checks only the kept term (`--unidiff-zero` and "an adapter's" were lost twice, #916); and against the code it describes: about a catalog relation (parent and child, partition, foreign table), the query that walks it (`pg_inherits` in `tools/typegen/src/origins.ts`), as a merge can move the condition to the wrong side (#846).
- **A learning about a check's limit**, or a verdict that a check catches it, is rerun on master on the learning's exact case before its verdict: a later PR may have fixed the check (#854 made two false, which the range review of #850 found), and a check may not see that case (a fragment probed alone numbers from `$1`, #916). A verdict that sends one to an open issue's fix comments there with its cases and the rule text the fix must update (#848).
- **§ Watch is reread** with the triggers earlier rereads left in Epic #836 ("becomes a sub-issue if …"), each said to have fired or not against the measure it was set on, a change of measure said in the comment (#848, #874). A new trigger is a threshold a check or a count shows, never a trend: "if the cores keep growing" fired at every method PR (#874).
- **An issue left open from the closing Epic** is attached to an open Epic, or its place said in the PR body, before `Closes #epic` merges, or § Finding the step never reaches it (#848).
