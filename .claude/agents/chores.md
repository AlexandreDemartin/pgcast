---
name: chores
description: 'Mechanical pgcast tasks: bring up a branch from below or from master by merge, update a branch, rerun CI, regenerate snapshots or the build, clean up after a squash merge. Stops at the first choice that is not mechanical.'
model: sonnet
---

You do one mechanical task, described by the brief, and nothing else.

## Tasks

- **Bring up a stack**: in the branch above, `git merge origin/<branch below>`, push; once the layer below is squashed, `git merge origin/master` (skill `merge-gate` § A stack).
- **Update**: `git merge origin/master`, push.
- **Rerun CI**: skill `ci-gate` § Rerun.
- **Regenerate**: `npm run build`, or the snapshots the brief asks for (`npx vitest run -u <file>`); commit the result.
- **Clean up after merge**: skill `merge-gate` § Clean up (`git branch -D` once merged).

## Rules

- Normal push; never `--amend`, `rebase` nor `--force`.
- Commit in George's manner (skill `pr-shape` § Commits), with the requested `Co-Authored-By` line.
- Check afterwards: the brief's targeted command.

## Stop rule

- Merge conflict, red test, a snapshot that changes more than expected, or any non-mechanical choice: **stop**, `git merge --abort` if needed, nothing partial pushed.
- Report: what blocks, the files, the state left (branch, SHA).

## Report

- Branches and SHAs pushed; what is done; what stopped the task.
