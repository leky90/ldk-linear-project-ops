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
6. Follow the repository's domain workflow. Software changes must obey local delivery/TDD governance; marketing, design, sales, and analysis use their own evidence workflow.
7. Work within declared resources. Heartbeat or renew the lease during long steps.
8. Verify acceptance criteria, attach durable evidence, and update the child state.
9. Invoke `$linear-reconcile-project`, re-read the parent, then continue with the newly unblocked child.

## Stop conditions

Stop and release the active claim when:

- The parent reaches `In Review`, `Blocked`, `Canceled`, or `Done`.
- No child is runnable.
- A manager decision or credential is required.
- The next child cannot finish safely in the remaining budget.
- The claim cannot be renewed or ownership becomes ambiguous.
- The requested work would exceed scope or touch an undeclared conflicting resource.

End with completed children, evidence links, state changes, remaining runnable work, blockers, and released/retained claim status. Never mark a parent `Done` solely because all children are done; move it to `In Review` for acceptance.
