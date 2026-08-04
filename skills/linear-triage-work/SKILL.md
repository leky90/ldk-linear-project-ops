---
name: linear-triage-work
description: Classify, label, prioritize, and route existing Linear issues in the bound project. Use for backlog grooming, manager-created tasks, unlabelled work, priority review, decision routing, or preparing safe agent-claimable work.
---

# Linear Work Triage

Turn raw issues into a queue that humans and agents can interpret consistently.

## Triage workflow

1. Invoke `$linear-project-context`.
2. Read open issues in the exact project and inspect parent, blockers, labels, priority, assignee, status, due date, and recent comments.
3. Classify each issue as `parent`, `sub-issue`, `decision`, `incident`, or `reference`.
4. Assign area/capability labels already defined by the project; propose missing labels before creating them.
5. Apply [priority-policy.md](../../references/priority-policy.md). Preserve an existing manager priority unless evidence warrants a proposed change.
6. Route incomplete decisions to `Refinement` plus `manager:decision`.
7. Route fully specified, unblocked work to `Ready`. Keep blocked or underspecified work out of `Ready`.
8. Add a concise rationale when making a material status or priority change.

## Claimability checklist

An issue is agent-claimable only when it has:

- One independently verifiable outcome.
- Explicit scope and exclusions.
- Acceptance criteria and evidence expectation.
- Required capabilities and exact resource keys.
- No unresolved manager decision.
- Resolved dependencies or explicit blockers.
- A stable metadata key and the correct hierarchy label.

Batch only logically related edits. Preview broad triage changes and require approval under [approval-policy.md](../../references/approval-policy.md).
