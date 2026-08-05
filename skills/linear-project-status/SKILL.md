---
name: linear-project-status
description: Report Linear project progress in a human management view organized by outcomes, current roles, review queues, blockers, and recent handoffs. Use for project status, team workload, milestone health, priority review, and identifying what each department should do next.
---

# Linear Project Status

Build a read-only management view from the exact bound project.

1. Validate the binding and read current milestones, initiatives, direct tasks, blockers, priorities, role labels, resources, and recent structured handoffs.
2. Compute progress from actual issue states; state the denominator and exclude canceled work.
3. Group by initiative/outcome, then current role. Do not expose lock tokens, local paths, heartbeat details, or machine coordination state.
4. Separate:
   - ready work by role;
   - active work;
   - review queues by reviewer role;
   - blockers and decisions;
   - stale or inconsistent handoffs;
   - recently completed deliverables.
5. Recommend at most five next actions using explicit Linear priority, due date, dependency impact, and readiness. Do not invent business value or deadlines.

Use [project-status-template.md](../../assets/project-status-template.md). Include direct Linear and resource links, a data timestamp, and a clear distinction between observed facts and inference.
