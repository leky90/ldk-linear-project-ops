---
name: linear-capture-brainstorm
description: Convert a brainstorm, feature discussion, operational idea, or project goal into a reviewable Linear plan without writing to Linear. Use when the user is exploring what to build or do and wants milestones, issues, resources, dependencies, or decisions organized for approval.
---

# Linear Brainstorm Capture

Create a deterministic draft while preserving the difference between facts, assumptions, proposals, and unanswered decisions.

## Capture workflow

1. Invoke `$linear-project-context` and pin the exact project/team IDs.
2. Summarize the desired outcome, scope, exclusions, stakeholders, evidence, and constraints.
3. Separate confirmed facts from assumptions and questions. Never invent a business target or baseline.
4. Read existing milestones, parent issues, labels, and documents in the bound project to detect duplicates.
5. Draft milestones only for meaningful outcome checkpoints, not for every task.
6. Draft parent issues as independently reviewable outcomes. Route unresolved business decisions to `Refinement` with `manager:decision`.
7. Add acceptance criteria, priority rationale, capabilities, resources, dependencies, and evidence expectations.
8. Set `approved: false`. Do not call any Linear mutation tool.

Read [approval-policy.md](../../references/approval-policy.md), [priority-policy.md](../../references/priority-policy.md), and [linear-data-model.md](../../references/linear-data-model.md). Use [brainstorm-plan.example.json](../../assets/brainstorm-plan.example.json) as the output shape.

## Review output

Show a compact preview containing:

- Proposed milestones and resources.
- New, updated, duplicate, and skipped issues.
- Parent/sub-issue hierarchy and blockers.
- Priority and status rationale.
- Assumptions and manager decisions required.
- A stable key for every entity.

Resolve [validate-plan.mjs](../../scripts/validate-plan.mjs) from this skill directory and validate the draft with:

```sh
node ../../scripts/validate-plan.mjs plan.json --project-id PROJECT_ID
```

Finish by asking for an explicit approval such as `Duyệt kế hoạch Linear`. A request to brainstorm, refine, or preview is never approval.
