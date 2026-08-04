---
name: linear-decompose-parent
description: Assess a complex Linear parent issue and draft or apply a bounded dependency graph of direct sub-issues. Use when an outcome has multiple deliverables, capabilities, resources, approvals, dependencies, or will not fit safely in one execution run.
---

# Linear Parent Decomposition

Create independently verifiable execution steps without losing the parent outcome.

## Assess complexity

Read [decomposition-policy.md](../../references/decomposition-policy.md). Decompose when two or more complexity signals apply, or when one signal alone makes atomic execution unsafe.

Do not decompose a simple issue merely to create activity. If the issue is atomic, explain why and leave it intact.

## Draft the DAG

1. Invoke `$linear-project-context` and re-read the parent.
2. Preserve the parent acceptance criteria and boundaries.
3. Create 2–7 direct children. Never create nested sub-issues.
4. Target 15–30 minutes per child unless the domain requires a longer evidence cycle.
5. Give every child one deliverable, acceptance criteria, evidence URI expectation, capabilities, exact resource keys, and a stable key.
6. Express ordering with `blockedByKeys`; avoid dependencies that exist only for convenience.
7. Identify manager decisions as non-claimable `Refinement` children.
8. Resolve [validate-dependency-dag.mjs](../../scripts/validate-dependency-dag.mjs) from this skill directory and validate the graph before any write:

```sh
node ../../scripts/validate-dependency-dag.mjs decomposition.json --project-id PROJECT_ID
```

Show the draft DAG and resource collision analysis. Apply it only under the same explicit approval policy as `$linear-plan-apply`. After applying, verify parent links, blockers, labels, and statuses.
