---
name: ci-gate
description: 'When CI runs and when to wait for it: draft PR while iterating, `gh pr ready`, docs only, the CI passed check of master, exceptional `[skip ci]`, rerun. USE FOR: opening or finalising a PR, rerunning CI, docs-only PR. DO NOT USE FOR: local checks (**Done when** of the issue), risk (run-step), the merge (merge-gate).'
---

# Run, wait, or move on

We validate locally while iterating; CI runs **once ready**.

## When CI runs

| Situation | What happens |
|---|---|
| **Draft** PR | no heavy job (`.github/workflows/ci.yml`, condition on `draft`) |
| Ready PR, **docs only** (`.md` outside `.agents/`, `.claude/` and `website/`, `CHANGELOG.md` aside) | `changes` then **CI passed**; `build`, `bench-types`, `typescript-7` and `docs` skipped |
| Ready PR, **docs site only** (anything under `website/`, its Markdown included, or `CHANGELOG.md`, its `/changelog` page) | `docs` (builds the site, checks its examples), then **CI passed**; `build`, `bench-types` and `typescript-7` skipped |
| Ready PR, anything else | full run: `build` (9 jobs), `bench-types`, `typescript-7`, `docs` when `src/`, the root `package*.json`, `tsconfig.json` or a workflow changes, then **CI passed** |
| Push to `master` | full run |
| Layer of a stack (base: the branch below) | same rule as a PR to `master`: CI runs on each layer |

## Iterate, then run

1. `gh pr create --draft --base master --repo AlexandreDemartin/pgcast`: reviews possible straight away.
2. Check locally (the issue's **Done when**).
3. Ready: `gh pr ready`, then `gh pr checks --watch`; the merge follows its gate (skill `merge-gate`).
4. Fixes after ready: each push reruns CI; group them.

## The check of `master`

- `master` is protected: a PR merges only with **CI passed** green **on its last commit**. This job fails if a job failed; a job skipped on purpose (docs only) counts as passed.
- A docs-only PR thus costs only two small jobs: no need for `[skip ci]` to save a run. Example: "Move the plan into GitHub issues".
- **Exceptional `[skip ci]`**: on an **intermediate** commit of a ready PR, when the next one follows at once (it avoids a run that would be thrown away). **Never on the last commit**: without a run, no **CI passed**, the merge stays blocked.

## Pitfalls

- **Forgotten draft**: no checks; `gh pr ready` before waiting.
- **Proofs on a draft**: **CI passed** is green with every job skipped; they are local only.
- **`[skip ci]` on the last commit**: no check, the merge is blocked; push a commit without it.
- **A job added to `ci.yml`**: add it to the `needs` of **CI passed**, otherwise its failure does not block the merge.

## Rerun

- Draft PR: `gh pr ready` first.
- Then `gh run rerun <id>`, or `git commit --allow-empty -m "Rerun CI"`.
- Follow with `gh pr checks --watch` in the background, never by polling by hand.
