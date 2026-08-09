---
name: linear-reconcile
description: Repair inconsistent Linear Project lifecycle status, issues, hierarchy, handoffs, relations, local locks, or legacy workflow data. Use for stale work, interrupted sessions, Project/issue status-evidence mismatches, abandoned locks, issue-level initiative migration, project-wide legacy audit, approved merge, or selective purge.
---

# Reconcile Linear Work

Keep reconciliation exceptional; do not run a project-wide repair before or after every normal issue.

## Reconciliation pass

1. Validate the project binding and scope the pass to the requested issue and directly related parent/children unless the user explicitly requests a project-wide audit.
2. Read status, current role, reviewer role, blockers, resources, latest handoff/review comment, and local lock state.
3. Classify mismatches before changing anything:
   - Backlog/Planned Project with started or completed execution evidence;
   - Completed/Canceled Project with open work;
   - stale local lock;
   - active work without a valid owner role;
   - `In Review` without handoff evidence or reviewer;
   - `Done` without a passing review when review is required;
   - resolved dependency still blocking work;
   - legacy metadata needing a role mapping.
   - an issue-level `initiative` that must become `outcome` or a native Initiative/Project;
   - agent bookkeeping, duplicate micro-tasks, or telemetry comments that have no durable business value.
4. Recover a stale file lock only after expiry plus grace and a final liveness check. Never delete a live run's lock or worktree.
5. For a project-wide legacy audit, use [legacy-cleanup.md](../../references/legacy-cleanup.md) and produce `schemas/legacy-cleanup-plan.schema.json`. Classify exact entity IDs as `KEEP`, `NORMALIZE`, `MERGE_THEN_DELETE`, `CONVERT_TO_RESOURCE_THEN_DELETE`, `DELETE_ISSUE`, `DELETE_COMMENT`, or `NEEDS_DECISION`.
6. Use [project-lifecycle.md](../../references/project-lifecycle.md). A direct reconciliation request may normalize a safe Backlog/Planned → In Progress mismatch with the exact live status ID. Preview reopen, Complete, Cancel, ambiguous custom-status, bulk, merge, or destructive changes. Validate an approved apply plan with `validate-legacy-cleanup.mjs --apply`; every destructive entry must be individually approved.
7. Before deletion, transfer preserved content, resources, parent/child links, milestones, blockers, related links, and durable evidence to the canonical object. Delete only exact approved IDs. Never delete real completed delivery history merely because it uses legacy metadata.
8. Write at most one human reconciliation comment when a surviving issue needs human context; never add a cleanup comment to an entity being deleted.
9. Re-read changed entities and report created, normalized, merged, converted, deleted, skipped, conflicted, failed, and whether surviving work is ready for `$linear-do-issue`.

Use [work-model.md](../../references/work-model.md), [comment-policy.md](../../references/comment-policy.md), and [legacy-compatibility.md](../../references/legacy-compatibility.md).
