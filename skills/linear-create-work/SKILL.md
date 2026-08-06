---
name: linear-create-work
description: Create or update native Linear initiatives, projects, milestones, role-ready outcome issues, tasks, decisions, briefs, PRDs, and resources. Use when an owner asks to plan, draft, create, organize, schedule, or update strategic and execution work in Linear.
---

# Create Linear Work

Turn an owner's intent into native Linear planning objects and human-readable role-owned work packets. Follow `Initiative → Project → Milestone → Issue → Sub-issue`; never use an issue-level `initiative` type.

## Workflow

1. Load and validate `.linear-project-ops.json`; pin the exact project and team IDs.
2. Read existing native initiatives, project properties, milestones, resources, issues, cycles, labels, assignees, estimates, dates, and relations to avoid duplicates.
3. Interpret intent from the prompt:
   - `draft`, `propose`, `analyze`, or `preview` means read-only preview.
   - `create`, `update`, `sync`, or another direct imperative authorizes scoped writes.
   - Ask again only for destructive, bulk, ambiguous, or materially expanded work.
4. Select the smallest correct Linear object using [linear-hierarchy.md](../../references/linear-hierarchy.md). Use native Initiatives only for an objective spanning projects; use milestones for lifecycle checkpoints, not departments or weeks.
5. Create or update durable source material as project resources. Keep full briefs, PRDs, technical plans, and campaign briefs out of comments.
6. Draft a schema-v2 work plan matching `schemas/work-plan.schema.json`, including project properties, native initiatives, milestones, resources, role-owned issues, scheduling properties, and relations that are actually known.
7. Use `outcome` for a manager-readable parent issue, `task` for one independently owned deliverable, and `decision` for authority or judgment. Use one direct sub-issue level.
8. Distinguish role from accountability and scheduling: `ownerRole` routes work, `assigneeId` names the responsible person, estimate sizes effort, cycle time-boxes team commitment, due date deadlines the issue, and milestone marks a project checkpoint.
9. Validate with the packaged `validate-work-plan.mjs`; for writes require `--apply`.
10. Apply in dependency order: resources and native initiative, project properties, milestones, outcome issues, child tasks, then relations. Re-read every changed entity.

Use [work-model.md](../../references/work-model.md), [linear-hierarchy.md](../../references/linear-hierarchy.md), [planning-properties.md](../../references/planning-properties.md), [approval-policy.md](../../references/approval-policy.md), and [comment-policy.md](../../references/comment-policy.md). Use the initiative, milestone, outcome issue, product brief, PRD, and task templates when applicable.

## Role-ready output

- A CPO-created outcome issue normally hands off to `tech-lead`; a native Initiative groups related Projects and is not executable work.
- A tech-lead breakdown creates tasks owned by the actual executing roles; split by independently owned deliverables, not agent time slices.
- A decision stays in `Refinement` and is not executable.
- `Ready` means the current role's DoR is satisfied and blockers are resolved.

Finish with created, updated, skipped, conflicted, and failed resources/issues plus direct Linear links and the next responsible role.

If the connected Linear tool cannot mutate a requested native object, do not emulate it with a fake issue. Create a validated preview, link the supporting resource, report the unsupported operation, and leave the object for an authorized Linear UI/API path.
