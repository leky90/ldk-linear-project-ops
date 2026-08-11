# Issue relations and readiness gates

Use native Linear relations as the executable dependency graph. Do not rely on
free-text DoR alone when another issue, decision, or deliverable must finish first.

## Canonical plan-to-Linear mapping

| Work-plan field | Linear mutation field | Meaning |
|---|---|---|
| `relations.blockedByKeys` | `blockedBy` | This issue waits for the referenced issues. |
| inverse of `blockedByKeys` | `blocks` | Derived outgoing relation; do not duplicate it in the plan. |
| `relations.relatedToKeys` | `relatedTo` | Symmetric context relation; there is no `relatedBy`. |
| `relations.duplicateOfKey` | `duplicateOf` | This issue duplicates the canonical issue. |
| `parentKey` | `parentId` | Hierarchy, not a dependency. |

Removal uses `removeBlockedBy`, `removeBlocks`, and `removeRelatedTo`. Apply
relations only after every referenced issue has a live ID, then re-read both ends.

## Planning invariants

- Every DoR condition that depends on another planned issue, role-owned
  deliverable, or authority decision must have a prerequisite task/decision and a
  native `blockedByKeys` edge.
- `Ready` requires no open native blocker and no `externalBlocker`.
- `Blocked` requires at least one `blockedByKeys` entry or a structured
  `externalBlocker` with `reason`, `ownerRole`, and `resumeWhen`.
- Use `externalBlocker` only when the dependency is genuinely outside the planned
  issue graph. Do not use it to hide a missing decision or task.
- A completed former blocker may be kept as `relatedTo` when its history remains
  useful, but it must not be reported as the current cause of a blocked state.

## Execution and reconciliation

Before stopping on a Blocked issue, read the live status of every `blockedBy`
issue. Distinguish these cases:

1. At least one blocker is open: report those exact issues.
2. Every blocker is resolved and DoR now passes: propose targeted reconciliation
   to remove/convert stale relations and move the issue to `Ready`.
3. Every blocker is resolved but DoR still fails: identify the missing decision,
   deliverable, resource, or external input. Produce an exact prerequisite issue
   preview when planned work is missing; create it only when the request authorizes
   creation.

Reconciliation must re-read both sides after relation changes. Never infer that a
resolved relation proves DoR; evaluate DoR independently.
