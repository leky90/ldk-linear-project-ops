---
name: linear-plan-apply
description: Preview and idempotently apply an explicitly approved plan to the bound Linear project. Use after a brainstorm or planning draft has been reviewed and the user clearly authorizes creation or updates of milestones, resources, parent issues, sub-issues, labels, and dependencies.
---

# Linear Plan Apply

Apply only the reviewed diff to the immutable project boundary.

## Preconditions

1. Invoke `$linear-project-context` and confirm exact IDs.
2. Require a clear approval in the current conversation and `approved: true` in the plan.
3. Validate the plan with `validate-plan.mjs --for-apply`.
4. Re-read target entities and rebuild the preview. If scope changed materially since approval, stop for renewed approval.
5. Refuse plans containing credentials, PII, unresolved project identity, or references to excluded historical projects.

Follow [approval-policy.md](../../references/approval-policy.md) and [host-adapters.md](../../references/host-adapters.md).

## Apply order

1. Ensure required labels exist.
2. Upsert milestones by stable key or explicit Linear ID.
3. Upsert resource links/documents; if native project resources are unavailable, use the documented fallback and report it.
4. Upsert parent issues, then direct sub-issues.
5. Apply blocker relations only after every referenced issue resolves to an ID.
6. Set statuses last. Keep decisions in `Refinement`; make only fully executable work `Ready`.
7. Re-read each changed entity and report the actual result.

Never use title-only matching as identity. Prefer explicit Linear ID, then exact stable metadata key scoped to the pinned project. On retry, update the existing entity instead of duplicating it.

## Result

Return created/updated/skipped/error groups, direct Linear links, unresolved fallbacks, and the next recommended skill. Do not claim success for a write that was not verified.
