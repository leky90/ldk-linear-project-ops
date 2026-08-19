---
name: linear-reconcile
description: Use when asked to repair inconsistent Linear lifecycle state, hierarchy, handoffs, relations, local locks, legacy RoleFlow contracts, interrupted work, exact-ID cleanup, or approved rollback.
---

# Reconcile Linear Work

Keep reconciliation exceptional; do not run a project-wide repair before or after every normal issue. RoleFlow v4 and handoff v2 are canonical write contracts; legacy artifacts remain read-compatible.

## Reconciliation pass

1. Validate the project binding and scope the pass to the requested issue and directly related parent/children unless the user explicitly requests a project-wide audit.
2. Read status, current role, reviewer role, blockers and each blocker's live state, resources, latest handoff/review comment, and local lock state. Apply [issue-relations.md](../../references/issue-relations.md); a relation to a resolved issue is historical evidence, not automatically an open blocker.
3. Classify mismatches before changing anything:
   - Backlog/Planned Project with started or completed execution evidence;
   - Completed/Canceled Project with open work;
   - stale local lock;
   - active work without a valid owner role;
   - `In Review` without handoff evidence or reviewer;
   - `Done` without mode-specific terminal evidence;
   - passed review for an action mode incorrectly moved directly to `Done`;
   - `Ready to Deliver` with a draft PR, stale reviewed SHA, failed required check, or unresolved required P1/P2 finding;
   - `Delivery Verification` without proof that the terminal action occurred;
   - merged software work marked `Done` while disposable worktree/branch state remains without an explicit preserved-state exception;
   - resolved dependency still blocking work or still named as the active blocker;
   - failed DoR with no native prerequisite relation and no structured external blocker;
   - legacy metadata needing a role mapping.
   - an issue-level `initiative` that must become `outcome` or a native Initiative/Project;
   - agent bookkeeping, duplicate micro-tasks, or telemetry comments that have no durable business value.
   - an issue description or Linear resource used as an append-only execution journal instead of a stable planning contract under [artifact-routing.md](../../references/artifact-routing.md);
   - one issue whose acceptance or delivery checks cross multiple terminal modes such as software merge, production release, and operations change.
4. Recover a stale file lock only after expiry plus grace and a final liveness check. Never delete a live run's lock or worktree.
5. For contract migration, use `migrate-contract.mjs preview` before apply. Missing delivery, task parent, planning stage, lifecycle criteria, live Project status, or priority is an unresolved decision; never infer action mode from generic verbs and never silently default legacy priority. Apply only an eligible plan with unchanged source hash. Use `rollback-preview` and `rollback-apply` for local artifacts; compare-and-swap must report a rollback conflict rather than overwrite an independent edit.
6. For a project-wide legacy audit, use [legacy-cleanup.md](../../references/legacy-cleanup.md) and produce `schemas/legacy-cleanup-plan.schema.json`. Classify exact entity IDs as `KEEP`, `NORMALIZE`, `MERGE_THEN_DELETE`, `CONVERT_TO_RESOURCE_THEN_DELETE`, `DELETE_ISSUE`, `DELETE_COMMENT`, or `NEEDS_DECISION`.
7. Use [project-lifecycle.md](../../references/project-lifecycle.md). A direct reconciliation request may normalize a safe Backlog/Planned → In Progress mismatch with the exact live status ID. Preview reopen, Complete, Cancel, ambiguous custom-status, bulk, merge, or destructive changes. Validate an approved apply plan with `validate-legacy-cleanup.mjs --apply`; every destructive entry must be individually approved.
8. Apply [delivery-lifecycle.md](../../references/delivery-lifecycle.md). Move a reviewed action-mode issue to `Ready to Deliver`, or keep `In Review` with a persisted delivery phase when the custom status is unavailable. Return invalidated delivery evidence to the correct active state. For a legacy `Done` issue with durable terminal proof, preserve it and record an inferred delivery mode instead of reopening it only for missing metadata.
9. Before deletion, transfer preserved content, resources, parent/child links, milestones, blockers, related links, and durable evidence to the canonical object. Normalize an execution journal by restoring the stable planning contract and linking repository-native technical evidence; preserve version/comment history unless exact destructive cleanup was approved. For a resolved blocker, re-evaluate DoR, remove `blockedBy`, optionally preserve useful history as `relatedTo`, and move to `Ready` only when DoR passes. If planned prerequisite work is missing, produce an exact create-work preview and create it only when the current request authorizes creation. Delete only exact approved IDs. Never delete real completed delivery history merely because it uses legacy metadata.
10. Write at most one human reconciliation comment when a surviving issue needs human context; never add a cleanup comment to an entity being deleted.
11. Re-read changed entities and report created, normalized, merged, converted, deleted, skipped, conflicted, failed, and whether surviving work is ready for `$linear-do-issue`.

Use [work-model.md](../../references/work-model.md), [delivery-lifecycle.md](../../references/delivery-lifecycle.md), [artifact-routing.md](../../references/artifact-routing.md), [issue-relations.md](../../references/issue-relations.md), [comment-policy.md](../../references/comment-policy.md), and [legacy-compatibility.md](../../references/legacy-compatibility.md).
