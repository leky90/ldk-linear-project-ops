---
name: linear-project-status
description: Report or explicitly publish Linear project progress using project properties, milestone health, role queues, cycles, estimates, blockers, and recent handoffs. Use for management status, health updates, workload, roadmap checkpoints, and next-action reviews.
---

# Linear Project Status and Updates

Build a read-only management view by default. Publish a native Linear Project Update only when the user directly asks to publish or update project health.

1. Validate the binding and read native Initiative context, project status/lead/members/start/target date/priority, milestones, issues, relations, cycles, estimates, assignees, role labels, resources, latest native Project Update, and recent structured handoffs.
2. Compute issue-count and estimated-effort progress separately; state denominators and exclude canceled work.
3. Group first by milestone and outcome, then current role. Do not expose lock tokens, local paths, heartbeat details, or machine coordination state.
4. Separate:
   - ready work by role;
   - active work;
   - review queues by reviewer role;
   - blockers and decisions;
   - stale or inconsistent handoffs;
   - recently completed deliverables.
5. Recommend at most five next actions using explicit priority, milestone, due date, cycle, dependency impact, and readiness. Do not invent business value or deadlines.
6. If publishing, draft `schemas/project-update.schema.json`, select health only from observed facts, validate with `validate-project-update.mjs --publish`, render with `render-project-update.mjs`, publish through Linear's native Project Update surface, and re-read it. Do not use an issue comment as a substitute.

Use [project-status-template.md](../../assets/project-status-template.md), [project-update-template.md](../../assets/project-update-template.md), and [planning-properties.md](../../references/planning-properties.md). Include direct Linear and resource links, a data timestamp, and a clear distinction between observed facts and inference.
