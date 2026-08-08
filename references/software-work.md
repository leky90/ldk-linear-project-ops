# Software role workflow

Apply these controls only while the current role is `software-engineer`. They are internal execution safety, not a project-wide status ceremony.

## Start

1. Acquire the issue file lock.
2. Leave pre-existing tracked and untracked files untouched.
3. Create or safely reuse an issue-specific linked Git worktree and branch containing the issue ID.
4. Capture a clean baseline under ignored `.linear-ops/` state.
5. Derive repository-relative scope paths from the issue and technical resources.

## Delivery

1. Implement and test only the issue deliverable.
2. Stage explicit paths; never use a broad repository add.
3. Commit, push, and open/update a PR when required by DoD.
4. Validate the live worktree, commit range, and scope with the packaged handoff validator.
5. Put commit, PR, CI, preview, and test artifacts in the handoff evidence.

The engineer may hand off only when the issue DoD and internal Git guard pass. After handoff, QA reviews immutable commit/PR/test evidence and does not need the engineer's local worktree or baseline.

Merge, deployment, release, and business acceptance are required only when the current issue's DoD or repository policy explicitly requires them. Do not impose them on every implementation task.

## Terminal Git closure

An engineer handoff to `In Review` may retain its clean pushed branch and linked
worktree while the PR is active. Once review makes the issue terminal, restore
the primary checkout and remove disposable local delivery state using
[git-closure.md](git-closure.md). The closure must prove normal merge ancestry
or complete patch equivalence before deleting a branch, and it must preserve
all dirty, unpushed, uniquely unmerged, and unrelated work.
