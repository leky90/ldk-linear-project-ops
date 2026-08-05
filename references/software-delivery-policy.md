# Software delivery completion policy

Apply this policy to every issue whose managed metadata includes
`software.change`. Local implementation and passing tests are not delivered work.

## Default authority

A fully specified software issue in `Ready` authorizes only the actions listed in
`workflow.softwareDelivery.agentActions`. When the binding omits the policy, the
default authorizes commit, push, opening a pull request, and marking it ready for
review in a dedicated linked Git worktree and issue branch. Merge and deploy still require explicit
authority.

Never treat `automation paused` as a prohibition on an explicitly requested
interactive execution. Never claim work unless the same run can begin it.

## Worktree isolation

Default `workflow.softwareDelivery.worktreeIsolation` to `required`. After claiming
a software parent and before editing files:

1. Inspect the primary worktree without cleaning, stashing, committing, or deleting
   pre-existing changes.
2. Create or safely reuse one linked worktree and named issue branch for the claimed
   parent or goal chain. Related children share that worktree; unrelated parents never do.
3. Start from a verified base commit. A dirty primary worktree is not a blocker because
   its tracked and untracked files do not enter the linked worktree.
4. Refuse a linked worktree that is already dirty or belongs to another issue. Release
   the claim or mark the issue blocked when isolation cannot be established.
5. Record the clean baseline under the consumer's ignored `.linear-ops/` directory:

```sh
node <plugin-root>/scripts/capture-git-baseline.mjs \
  .linear-ops/baselines/ISSUE-ID.json \
  --issue ISSUE-ID \
  --repository .
```

The capture command refuses to overwrite a baseline, write a tracked coordination
file, or write inside a non-ignored worktree path. Reuse the original parent
baseline throughout the goal chain.

Resolve `<plugin-root>` from the loaded plugin skill; do not assume the consumer
repository contains plugin scripts. `allow-clean-primary` is an explicit binding
escape hatch for single-agent repositories, not the multi-agent default.

Declare `git.scopePaths` as repository-relative file or directory prefixes. Stage
explicit paths only; never use `git add .`, `git add -A`, or an equivalent broad
operation. If implementation needs an undeclared path, expand the Linear resource
scope after a conflict check or stop as blocked.

## State gates

- Child `Done`: acceptance criteria verified, every scoped change accounted, the
  live worktree is clean, the commit range contains only declared scope paths, and
  the child result is anchored to the current worktree HEAD.
- Parent `In Review`: aggregate acceptance verified, scoped changes accounted,
  the aggregate commit range passes the live Git gates, pushed branch present, pull
  request ready for review, and CI passed.
- Parent `Done`: every review gate still passes, manager acceptance occurred after
  the latest delivery change, the pull request is merged, and deployment is
  verified when the binding or acceptance criteria require it.

An approval that predates a later commit, force-push, material PR update, or deploy
is stale and cannot close the issue. Re-request acceptance against the latest
artifact.

## Deterministic validation

Create a transient evidence JSON matching
`schemas/software-delivery-evidence.schema.json`. Set `git.changeBaseSha` to the
previous verified child commit for a child, or the recorded baseline commit for
aggregate parent validation. Then run the packaged validator from the same linked
worktree before a software state transition:

```sh
node <plugin-root>/scripts/validate-software-delivery.mjs evidence.json \
  --target child-done|in-review|done \
  --binding .linear-project-ops.json \
  --baseline .linear-ops/baselines/ISSUE-ID.json \
  --repository .
```

Resolve the packaged script path from the loaded skill. The validator rejects a mismatched repository,
worktree, branch, baseline, HEAD commit, dirty/untracked file, empty commit range,
or committed path outside `git.scopePaths`.

Do not change the target state unless `valid` is `true`. Keep the issue worktree
and baseline until the delivery reaches a safe merged or explicitly handed-off
state; never delete another run's worktree. Store only durable,
non-secret evidence in Linear: commit SHA, branch, PR URL/state, CI result, merge,
deployment evidence, and acceptance timestamp. Keep transient validation files
outside Git or under the ignored coordination directory.

## Measurement

Post-delivery value measurement is a separate outcome unless the current issue's
acceptance criteria explicitly require it. Create a measurement issue or manager
decision instead of leaving a completed implementation ambiguously blocked or
claiming that unknown metrics were accepted.
