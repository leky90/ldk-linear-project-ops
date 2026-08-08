# Terminal Git closure

Run this closure only when an issue is terminal (`Done` or `Canceled`), the
associated PR is merged or closed, or the user explicitly requests cleanup. Do
not remove delivery state merely because an engineer handed work to QA in `In
Review`.

This is an agent workflow, not an automatic `Stop` hook. A hook does not have
enough durable ownership context to decide that a branch or worktree is safe to
switch or delete, especially in a shared workspace.

## Preflight

1. Resolve the exact repository root, primary worktree, task worktree, current
   branch, task branch, and integration branch. Do not infer cleanup targets
   from directory globs.
2. Run `git status --short --branch` in every candidate worktree. If any target
   contains user changes, stop cleanup for that target and report it.
3. Run `git worktree list --porcelain` and distinguish the primary worktree from
   linked task worktrees before changing branches.
4. Run `git fetch --prune origin` so merge and patch-equivalence decisions use
   current remote state.
5. Prove that the task branch has no unique work left:
   - Prefer `git merge-base --is-ancestor <task-branch> origin/main` for a normal
     merge.
   - For squash or rebased merges, inspect `git cherry origin/main
     <task-branch>`. Cleanup is safe only when it prints nothing or every commit
     is prefixed with `-`.
   - Any `+` line means the branch has uniquely unmerged work; preserve it.

Never discard uncommitted, unpushed, or uniquely unmerged work. Never use a
force reset to make closure pass.

## Close a primary checkout

When the current checkout is the primary worktree and is clean:

1. Preserve the current branch unless the preflight proves it merged or
   patch-equivalent. A branch unrelated to the completed issue is not a cleanup
   target.
2. Run `git switch main` and then `git merge --ff-only origin/main`. If the
   fast-forward fails, stop and report the divergence; do not reset or rebase
   automatically.
3. Delete the exact local task branch only after the preflight proof. Use the
   normal delete for an ancestor merge; a forced local delete is allowed only
   for a branch whose complete `git cherry origin/main <task-branch>` output is
   patch-equivalent.
4. Run `git worktree prune`.

## Close a linked task worktree

Perform removal from the primary worktree, not from a shell that must continue
inside the target directory:

1. Recheck that the linked worktree is clean and that its branch passes the
   preflight proof.
2. Update the clean primary checkout with `git switch main` and `git merge
   --ff-only origin/main`.
3. Remove the exact linked path without `--force`, then delete the exact local
   task branch according to the same merge or patch-equivalence rule.
4. Run `git worktree prune`.

Never delete a remote branch as part of routine issue closure. Remote deletion
requires explicit user authority or the repository's normal merged-PR policy.

## Final proof

Before reporting completion, capture all of the following:

- `git status --short --branch` shows a clean primary checkout on `main`;
- primary `HEAD` matches the intended `origin/main` release after the
  fast-forward;
- `git worktree list --porcelain` no longer contains the task worktree;
- the exact local task branch is absent when it was safe to delete;
- no unrelated worktree or branch was changed.

If any proof is unavailable, report the remaining branch/worktree and the exact
safety reason. Do not describe the workspace as clean merely because the Linear
issue is terminal.
