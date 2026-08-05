---
name: linear-execute-goal-chain
description: Execute a bounded sequence of related, runnable sub-issues under one claimed Linear parent. Use when an agent should complete a coherent chain of work in one session or scheduled run instead of stopping after a single task.
---

# Linear Goal Chain

Maintain one focus parent and finish as many safe dependent steps as the time budget permits.

## Run contract

1. Invoke `$linear-claim-focus`; require a verified claim token or optimistic claim marker.
2. Default to a 50-minute budget unless the project binding specifies another value.
3. Execute only work under the focus parent. Never switch to an unrelated parent in the same run.
4. Choose a runnable child in dependency order that can finish safely within the remaining budget.
5. Re-read the child and claim state immediately before work.
6. Follow the repository's domain workflow. For `software.change`, read [software-delivery-policy.md](../../references/software-delivery-policy.md) and obey its Git authority and completion gates; marketing, design, sales, and analysis use their own evidence workflow.
7. Before any software edit, create or safely reuse the focus parent's dedicated linked worktree and issue branch. Leave dirty/untracked files in the original worktree untouched. Capture a clean Git baseline with the packaged `capture-git-baseline.mjs`; stop and release if the worktree is dirty, mismatched, or cannot be isolated.
8. Work within declared resources. Stage explicit paths only, never a repository-wide add. Heartbeat or renew the lease during long steps.
9. Verify acceptance criteria and attach durable evidence. For a software child, build schema-v2 evidence with `git.baselineId`, the previous verified commit as `git.changeBaseSha`, and declared `git.scopePaths`; run `validate-software-delivery.mjs --target child-done --baseline ... --repository ...` from the claimed worktree before moving it to `Done`.
10. Invoke `$linear-reconcile-project`, re-read the parent, then continue with the newly unblocked child in the same worktree.

## Software delivery

- Treat `workflow.softwareDelivery.agentActions` as pre-authorized only for a fully specified `Ready` issue and its dedicated linked worktree and branch. The default permits commit, push, opening a pull request, and marking it ready; it does not permit merge or deploy.
- Treat `scopedChangesAccounted: true` as an assertion, not proof. The live `git-baseline`, `worktree-isolated`, and `scope-clean` gates must also pass.
- Do not ask for manager acceptance while implementation exists only in the working tree, the pull request is draft, or CI is incomplete.
- Before moving a parent to `In Review`, build current aggregate evidence from the recorded baseline through current HEAD and require the live validator with `--target in-review`, `--baseline`, and `--repository` to pass.
- After any commit, push, material PR update, merge, or deployment, invalidate older manager acceptance. Before `Done`, re-read Git/PR/deployment state and require the live validator with `--target done`, `--baseline`, and `--repository` to pass.
- A missing Git permission or required external action is an explicit blocker. Do not convert local test evidence into delivered completion.

## Stop conditions

Stop and release the active claim when:

- The parent reaches `In Review`, `Blocked`, `Canceled`, or `Done`.
- No child is runnable.
- A manager decision or credential is required.
- The next child cannot finish safely in the remaining budget.
- The claim cannot be renewed or ownership becomes ambiguous.
- The requested work would exceed scope or touch an undeclared conflicting resource.

End with completed children, commit/PR/deployment evidence when applicable, state changes, remaining runnable work, blockers, and released/retained claim status. Never mark a parent `Done` solely because all children are done or because local tests pass.
