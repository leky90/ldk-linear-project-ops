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
6. When all executable children are verified `Done`, inspect parent capabilities. For `software.change`, read [software-delivery-policy.md](../../references/software-delivery-policy.md), re-read live Git/PR/CI evidence, and move the parent to `In Review` only after `validate-software-delivery.mjs --target in-review` passes. For other domains, require their durable evidence policy.
7. When an incomplete child is blocked and no sibling can advance the outcome, mark the parent `Blocked` and identify the blocker.
8. Before any parent moves to `Done`, ensure acceptance is current. For `software.change`, require `validate-software-delivery.mjs --target done`; manager acceptance must follow the latest delivery change, the PR must satisfy the configured merge gate, and required deployment must be verified.
9. Detect parents already marked `Done` that fail their domain completion gate. Report the exact missing evidence and preview a conservative reopen to `In Review` (or `In Progress` when review gates also fail).
10. Remove obsolete blocker relations only after verifying the referenced dependency is complete or invalid.

## Safety

- Do not auto-complete manager decisions or accept a parent on the manager's behalf.
- Do not accept a statement that excludes commit, push, PR, merge, or required deployment as software completion when the configured gate requires those artifacts.
- Do not infer liveness only from an old Linear timestamp; inspect lease/heartbeat evidence.
- Preview bulk repairs before applying them.
- Add one reconciliation summary comment rather than noisy per-field comments.
- Re-read every changed issue and report unresolved inconsistencies.

Use [claim-protocol.md](../../references/claim-protocol.md) for stale-claim thresholds and [linear-data-model.md](../../references/linear-data-model.md) for state invariants.
