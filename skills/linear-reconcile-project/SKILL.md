---
name: linear-reconcile-project
description: Reconcile Linear parent, child, dependency, and claim state in the bound project. Use at run start and end, after each completed child, after interruptions, or when stale In Progress work, expired leases, incorrect parent states, or orphaned blockers are suspected.
---

# Linear Project Reconcile

Repair coordination state conservatively while preserving evidence and human decisions.

## Reconciliation pass

1. Invoke `$linear-project-context`.
2. Read active parents, their direct children, blocker relations, claim comments/lease records, and recent updates.
3. Compare Linear state with the configured coordination backend.
4. Expire a claim only when its lease is demonstrably stale and no later heartbeat or active run exists.
5. Return an abandoned child to `Ready` only if it remains fully specified and unblocked; otherwise move it to `Blocked` or `Refinement` with rationale.
6. When all executable children are verified `Done`, move the parent to `In Review`.
7. When an incomplete child is blocked and no sibling can advance the outcome, mark the parent `Blocked` and identify the blocker.
8. Reopen a parent only when new child work or failed acceptance evidence justifies it.
9. Remove obsolete blocker relations only after verifying the referenced dependency is complete or invalid.

## Safety

- Do not auto-complete manager decisions or accept a parent on the manager's behalf.
- Do not infer liveness only from an old Linear timestamp; inspect lease/heartbeat evidence.
- Preview bulk repairs before applying them.
- Add one reconciliation summary comment rather than noisy per-field comments.
- Re-read every changed issue and report unresolved inconsistencies.

Use [claim-protocol.md](../../references/claim-protocol.md) for stale-claim thresholds and [linear-data-model.md](../../references/linear-data-model.md) for state invariants.
