# Approval policy

## Read-only operations

The following need no separate approval when the user requests planning, reporting, triage, or execution:

- Read bound project, team, issues, labels, comments, documents, cycles, and milestones.
- Compare current state with an already approved plan.
- Draft a plan with `approved: false`.
- Validate schemas, stable keys, dependencies, and local fixtures.
- Produce a preview or report.

## Explicit approval required

Require clear approval in the current conversation before:

- Creating or materially updating milestones, issues, sub-issues, resources, or labels from a brainstorm.
- Bulk-changing status, priority, assignment, parent, or blockers.
- Deleting, canceling, archiving, merging, or replacing work.
- Expanding scope beyond the approved preview.

Approval must be unambiguous, such as `Duyệt kế hoạch Linear`, `Apply the preview`, or `Tạo các issue này`. Brainstorming, asking for a preview, editing the draft, or saying `looks good` without a referenced preview is not enough.

For structured plans, require both:

1. An explicit approval in the current conversation.
2. `approved: true` in the exact plan being applied.

## Execution updates

After a manager has placed a fully specified issue in `Ready`, normal claim, heartbeat, evidence, child-state, and reconciliation updates are pre-authorized within that issue's scope.

For `software.change`, the consumer binding's `workflow.softwareDelivery.agentActions` is also explicit execution authority. The default authorizes commit, push, opening a pull request, and marking it ready on a dedicated issue branch. Actions outside that list—including merge and deploy by default—still require explicit authority. Never downgrade a missing external action into local-only `Done` evidence.

New deliverables outside the approved issue, credentials, money, production changes not authorized by the delivery policy, or other irreversible actions still require the authority demanded by the issue and repository policy.

## Material drift

Re-preview and request renewed approval if the apply-time diff changes:

- Project/team identity.
- More than a minor wording detail.
- Milestone, issue count, hierarchy, dependencies, priority, due dates, or status.
- Resource/production scope.
- A manager decision into an executable task.

## Verification

After every write, re-read the affected entity. Report actual created, updated, skipped, conflicted, and failed items. Never infer success from a mutation request alone.

Manager acceptance of software is valid only against identified delivery evidence. If a later commit, force-push, material PR update, merge, or deployment changes that evidence, request acceptance again before `Done`.
