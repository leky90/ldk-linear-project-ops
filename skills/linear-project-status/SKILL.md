---
name: linear-project-status
description: Report Linear project progress, detect Project lifecycle-status mismatches, safely correct Backlog/Planned to In Progress on direct request, or explicitly publish a Project Update. Use for management status, health updates, workload, roadmap checkpoints, lifecycle consistency, and next-action reviews.
---

# Linear Project Status and Updates

Build a read-only management view by default. Publish a native Linear Project Update only when the user directly asks to publish or update project health.

1. Validate the binding and read native Initiative context, live Project status ID/name/category, all available Project statuses, lifecycle mode/completion criteria from the Project description or lifecycle resource, lead/members/start/target date/priority, milestones, issues, relations, cycles, estimates, assignees, role labels, resources, latest native Project Update, and recent structured handoffs.
2. Compute issue-count and estimated-effort progress separately; state denominators and exclude canceled work.
3. Group first by milestone and outcome, then current role. Do not expose lock tokens, local paths, heartbeat details, or machine coordination state.
4. Separate:
   - ready work by role;
   - active work;
   - review queues by reviewer role;
   - blockers and decisions;
   - stale or inconsistent handoffs;
   - recently completed deliverables.
5. Apply [project-lifecycle.md](../../references/project-lifecycle.md). When using the packaged snapshot path, run `analyze-project-lifecycle.mjs` or `build-project-report.mjs`; always include a `Project lifecycle consistency` result:
   - Backlog/Planned plus started or completed evidence → mismatch; recommend In Progress;
   - Completed/Canceled plus open work → mismatch requiring an explicit reopen decision;
   - continuous In Progress plus no open outcome → keep In Progress and request the next CPO outcome;
   - custom Paused/On Hold status → do not resume without a direct request;
   - never recommend Completed solely because all current issues or milestones are Done.
6. Recommend at most five next actions using explicit priority, milestone, due date, cycle, dependency impact, and readiness. Do not invent business value or deadlines.
7. Reports remain read-only. A direct request to fix/change/update Project status authorizes only a verified safe Backlog/Planned → In Progress correction using the exact live status ID; re-read the Project afterward. Reopen, Complete, Cancel, or ambiguous custom-status mutations require explicit authority.
8. If publishing, draft `schemas/project-update.schema.json`, select health only from observed facts, validate with `validate-project-update.mjs --publish`, render with `render-project-update.mjs`, publish through Linear's native Project Update surface, and re-read it. Do not use an issue comment as a substitute.

Use [project-status-template.md](../../assets/project-status-template.md), [project-update-template.md](../../assets/project-update-template.md), [planning-properties.md](../../references/planning-properties.md), and [project-lifecycle.md](../../references/project-lifecycle.md). Include direct Linear and resource links, a data timestamp, and a clear distinction between observed facts and inference.
