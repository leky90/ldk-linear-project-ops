# [Step] Atomic deliverable

## Parent outcome

State how this step advances the parent.

## Scope

- One deliverable.
- Explicit exclusions.
- Expected to fit one bounded work step.

## Acceptance criteria

- Independently verifiable result.
- Durable evidence URI.
- For `software.change`: execute in the parent's dedicated linked worktree; require a clean Git baseline, only declared scope paths in the verified commit range, no remaining tracked/untracked changes, and current-HEAD commit evidence before Done.

## Dependencies

- Blocked by stable keys:

```linear-project-ops
{"key":"stable-child-key","kind":"sub-issue","claimable":true,"capabilities":["domain.capability"],"resources":["resource:exact-scope"]}
```
