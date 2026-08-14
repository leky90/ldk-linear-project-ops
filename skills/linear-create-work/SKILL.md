---
name: linear-create-work
description: Create or update native Linear initiatives, projects, milestones, role-ready outcome issues, tasks, decisions, briefs, PRDs, and resources. Use when an owner asks to plan, draft, create, organize, schedule, or update strategic and execution work in Linear.
---

# Create Linear Work

Turn an owner's intent into native Linear planning objects and human-readable role-owned work packets. Follow `Initiative → Project → Milestone → Issue → Sub-issue`; never use an issue-level `initiative` type.

Before selecting a tracker, read [tracker-routing.md](../../references/tracker-routing.md).
Never mirror, migrate, or duplicate work into GitHub merely because a GitHub binding
also exists.

## Workflow

1. Load and validate `.linear-project-ops.json`; pin the exact project and team IDs.
   If an explicit Linear request has no binding, perform read-only discovery and
   produce an exact binding preview instead of borrowing a GitHub Project target.
2. Read existing native initiatives, project properties, live Project statuses and categories, milestones, resources, issues, cycles, labels, assignees, estimates, dates, and relations to avoid duplicates.
3. Interpret intent from the prompt:
   - `draft`, `propose`, `analyze`, or `preview` means read-only preview.
   - `create`, `update`, `sync`, or another direct imperative authorizes scoped writes.
   - Ask again only for destructive, bulk, ambiguous, or materially expanded work.
4. Select the smallest correct Linear object using [linear-hierarchy.md](../../references/linear-hierarchy.md). Use native Initiatives only for an objective spanning projects; use milestones for lifecycle checkpoints, not departments or weeks.
5. Create or update durable source material as project resources. Keep full briefs, PRDs, technical plans, and campaign briefs out of comments.
6. Draft a schema-v3 work plan matching `schemas/work-plan.schema.json`, including project properties, native initiatives, milestones, resources, role-owned issues, scheduling properties, and relations that are actually known. Follow [issue-relations.md](../../references/issue-relations.md): every DoR dependency on another planned issue/decision needs `blockedByKeys`; a genuinely external dependency needs structured `externalBlocker`. New plans use `projectStatus: { id, name, category }` from live Linear and may declare `lifecycle.mode` plus completion criteria; `project.status` is legacy read compatibility only. Persist lifecycle mode/criteria in the Project description or an approved lifecycle resource because they are RoleFlow contract metadata, not fabricated native Linear fields.
7. Give every issue a `delivery` contract from [delivery-lifecycle.md](../../references/delivery-lifecycle.md): select one mode, name the terminal `ownerRole`, record the target when applicable, and list observable verification checks. Split approved artifacts from later publish, outreach, merge, deploy, filing, spending, or production mutation when ownership, authority, or evidence differs. Plans v1/v2 are read-compatible only.
8. Use `outcome` for a manager-readable parent issue, `task` for one independently owned deliverable, and `decision` for authority or judgment. Use one direct sub-issue level.
9. Distinguish role from accountability and scheduling: issue `ownerRole` owns the current deliverable, `delivery.ownerRole` owns terminal delivery, `assigneeId` names the responsible person, estimate sizes effort, cycle time-boxes team commitment, due date deadlines the issue, and milestone marks a project checkpoint.
10. Validate with the packaged `validate-work-plan.mjs`; for writes require `--apply`.
11. Apply in dependency order: resources and native initiative, project properties, milestones, outcome issues, child tasks, then relations. Map `blockedByKeys → blockedBy`, `relatedToKeys → relatedTo`, `duplicateOfKey → duplicateOf`, and `parentKey → parentId`; derive the inverse `blocks` edge instead of storing `blocksKeys`. Re-read both ends of every changed relation.
12. Creating planned work does not itself prove execution began. Do not downgrade an active Project or infer Completed from a fully Done plan; use [project-lifecycle.md](../../references/project-lifecycle.md).

Use [work-model.md](../../references/work-model.md), [delivery-lifecycle.md](../../references/delivery-lifecycle.md), [linear-hierarchy.md](../../references/linear-hierarchy.md), [issue-relations.md](../../references/issue-relations.md), [planning-properties.md](../../references/planning-properties.md), [project-lifecycle.md](../../references/project-lifecycle.md), [approval-policy.md](../../references/approval-policy.md), and [comment-policy.md](../../references/comment-policy.md). Use the initiative, milestone, outcome issue, product brief, PRD, and task templates when applicable.

## Role-ready output

- A CPO-created outcome issue normally hands off to `tech-lead`; a native Initiative groups related Projects and is not executable work.
- A tech-lead breakdown creates tasks owned by the actual executing roles; split by independently owned deliverables, not agent time slices.
- A decision stays in `Refinement` and is not executable.
- `Ready` means the current role's DoR is satisfied and blockers are resolved.

Finish with created, updated, skipped, conflicted, and failed resources/issues plus direct Linear links and the next responsible role.

If the connected Linear tool cannot mutate a requested native object, do not emulate it with a fake issue. Create a validated preview, link the supporting resource, report the unsupported operation, and leave the object for an authorized Linear UI/API path.
