---
name: linear-project-context
description: Load and verify the immutable Linear team and project binding for the current repository. Use before planning, triage, claiming, execution, reconciliation, reporting, or any Linear write when similarly named or historical projects could be confused.
---

# Linear Project Context

Establish one trusted project boundary before any Linear operation.

## Load the binding

1. Search from the repository root for `.linear-project-ops.json` only.
2. Resolve [validate-project-binding.mjs](../../scripts/validate-project-binding.mjs) from this skill directory and validate the binding before reading Linear.
3. Extract the exact `project.linearProjectId` and `project.linearTeamId`.
4. Reject missing, blank, placeholder, or name-only bindings. Never infer a project from search results or a display name.
5. Read the exact project, team, workflow states, and labels through the connected Linear app.
6. Stop if the returned project/team IDs differ from the binding.
7. Note historical project IDs as exclusions; never import or relate their issues automatically.

Read [linear-data-model.md](../../references/linear-data-model.md) and [approval-policy.md](../../references/approval-policy.md) before making project changes.

## Return a context snapshot

Return:

- Repository and binding file.
- Exact team/project names and IDs.
- Available state IDs and required labels.
- Open milestone summary and issue counts by state.
- Coordination mode, lease source, and run budget.
- Missing configuration or permissions.

Treat this snapshot as stale after any write. Re-read affected entities before the next decision.

Do not expose credentials, tokens, customer PII, or confidential raw data in the snapshot.
