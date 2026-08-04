# Parent decomposition policy

## Complexity signals

Count one signal for each:

- Multiple distinct deliverables.
- Multiple required capabilities or roles.
- Multiple independently conflicting resource scopes.
- A dependency chain or parallel branches.
- A manager approval/decision gate.
- More work than one bounded run.
- Different evidence types or review owners.

Decompose when two or more signals apply, or when one signal alone makes atomic execution unsafe.

## Child quality

Create 2–7 direct children. Each child must:

- Produce one verifiable deliverable.
- Preserve a clear relationship to the parent outcome.
- Normally fit 15–30 minutes of agent work.
- Include scope, exclusions, acceptance criteria, evidence expectation, capability, resource keys, and stable key.
- Be independently retryable.
- Declare `blockedByKeys` only for real prerequisites.

Do not create a child for coordination overhead, status reporting, or work already covered by another issue.

## Dependency graph

Dependencies form a directed acyclic graph. A child cannot block itself, reference an unknown key, or create a cycle. Avoid a purely serial chain when tasks genuinely can run in parallel, but use identical resource keys to prevent concurrent edits to the same scope.

Manager decision children are `Refinement`, `manager:decision`, and `claimable: false`. Executable children are `Ready` only when every non-issue prerequisite is already satisfied.

## Parent reconciliation

- Any child executing: parent remains `In Progress`.
- No runnable child and an unresolved blocker: parent becomes `Blocked`.
- Every executable child verified `Done`: parent becomes `In Review`.
- Parent becomes `Done` only after acceptance.
