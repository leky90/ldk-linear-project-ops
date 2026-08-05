---
name: linear-reconcile
description: Repair an interrupted or inconsistent Linear issue, role handoff, dependency, status, or local file lock. Use only when work is stale, a session stopped mid-issue, status and evidence disagree, a lock is abandoned, or the user explicitly asks to reconcile or recover work.
---

# Reconcile Linear Work

Keep reconciliation exceptional; do not run a project-wide repair before or after every normal issue.

## Reconciliation pass

1. Validate the project binding and scope the pass to the requested issue and directly related parent/children unless the user explicitly requests a project-wide audit.
2. Read status, current role, reviewer role, blockers, resources, latest handoff/review comment, and local lock state.
3. Classify mismatches before changing anything:
   - stale local lock;
   - active work without a valid owner role;
   - `In Review` without handoff evidence or reviewer;
   - `Done` without a passing review when review is required;
   - resolved dependency still blocking work;
   - legacy metadata needing a role mapping.
4. Recover a stale file lock only after expiry plus grace and a final liveness check. Never delete a live run's lock or worktree.
5. Preview ambiguous, bulk, reopen, cancel, or destructive changes. Apply deterministic repairs only within the requested scope.
6. Write at most one human reconciliation comment using the blocked/review style; never publish machine telemetry.
7. Re-read changed entities and report before/after status, role, evidence, remaining blocker, and whether the issue is ready for `$linear-do-issue`.

Use [work-model.md](../../references/work-model.md), [comment-policy.md](../../references/comment-policy.md), and [legacy-compatibility.md](../../references/legacy-compatibility.md).
