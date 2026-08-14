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
5. Keep repository-native technical evidence—technical specs, ADRs, BDD/TDD contracts, commands, raw test reports, and local verification—in the repository. Put only accessible commit, PR, CI, preview, or resource references in the Linear handoff evidence; omit local paths.

The engineer may hand off only when the issue DoD and internal Git guard pass. After
handoff, QA reviews immutable commit/PR/test evidence and does not need the
engineer's local worktree or baseline.

A local-only commit is an immutable checkpoint for local QA, not publication,
merge, production release, or terminal delivery evidence. The issue description
remains the stable planning contract; implementation chronology belongs in Git.

Use `artifact-review` for a specification, BDD RED contract, technical decision, or
other software artifact whose accepted artifact is terminal. Any issue whose outcome
changes the integration branch uses `software-merge`; an unmerged PR is then only a
handoff checkpoint. Production deployment is a separate `production-release` issue
unless the approved scope explicitly combines merge and release.

For `software-merge`, QA pass moves the issue to `Ready to Deliver` only when the PR
is non-draft, required checks are green, the reviewed SHA is current, and no required
P1/P2 finding remains unresolved. A new commit, failing check, or new required
finding invalidates merge-ready status and returns the issue to review.

Do not split one logical change into independently `Done` stacked PR issues when the
intermediate branches are not independently mergeable and green. Use one canonical
integration issue/PR; intermediate packet PRs are checkpoints and remain nonterminal
until the integration outcome is delivered.

## Terminal Git closure

An engineer handoff to `In Review` and a merge-ready issue may retain its clean
pushed branch and linked worktree while the PR is active. After merge, enter
`Delivery Verification`: verify merge ancestry, post-merge CI and any required
smoke evidence, then restore the primary checkout and remove disposable local
delivery state using [git-closure.md](git-closure.md) before `Done`. The closure
must preserve all dirty, unpushed, uniquely unmerged, and unrelated work.
