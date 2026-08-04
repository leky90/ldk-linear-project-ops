---
name: linear-project-report
description: Produce an evidence-based overview of Linear project progress, milestones, priorities, blockers, decisions, claims, and next actions. Use for manager status reviews, session handoff, planning, scheduled summaries, or deciding what agents should do next.
---

# Linear Project Report

Generate a current management view from the exact bound project without changing Linear.

## Build the report

1. Invoke `$linear-project-context`.
2. Read current project/milestone data, open and recently completed issues, direct children, blockers, priorities, assignees, labels, claim markers, and recent evidence comments.
3. Compute counts from returned data. State the denominator and exclude canceled items from completion progress.
4. Group work by milestone and parent outcome, not only by assignee.
5. Separate blockers, manager decisions, stale claims, stale work, and resource conflicts.
6. Rank the next queue using [priority-policy.md](../../references/priority-policy.md); preserve ties when evidence cannot distinguish them.
7. Mark missing baselines or KPIs as `measurement-required`. Never invent targets, conversion rates, deadlines, or confidence.
8. Recommend at most five concrete next actions and name the responsible role.

Use [project-report-template.md](../../assets/project-report-template.md). For an exported snapshot, resolve [build-project-report.mjs](../../scripts/build-project-report.mjs) from this skill directory and run:

```sh
node ../../scripts/build-project-report.mjs snapshot.json
```

## Required sections

- Executive status and data timestamp.
- Milestone health.
- Progress by state and parent outcome.
- Current goal chains and claims.
- Blockers and manager decisions.
- Priority queue and why each item is next.
- Stale or inconsistent work.
- Next actions and measurement gaps.

Include direct Linear links where available and clearly distinguish observed facts from inferences.
