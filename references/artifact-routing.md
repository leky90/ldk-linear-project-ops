# Planning and delivery artifact routing

## Problem

Linear planning objects become hard to understand when an issue description or
canonical brief is used as an append-only execution journal. Repository-local test
commands, worktree state and repeated RED/GREEN checkpoints obscure the outcome,
while mixed merge and production criteria make one issue impossible to close under
one authority and one delivery mode.

## Routing contract

Use each system at its natural information altitude:

| Information | System of record | Linear representation |
|---|---|---|
| Outcome, why, scope, DoR/DoD, owner and delivery boundary | Linear issue | Keep the description as a stable planning contract. Edit it only when the approved contract changes. |
| Product brief, PRD, business decision or operating policy | Linear resource or its approved native system | Link from the issue; do not append implementation checkpoints. |
| Technical spec, ADR, BDD/TDD contract, commands and local verification | Repository | Link a commit or PR when accessible; do not copy the execution log into Linear. |
| Implementation diff, CI, preview and review evidence | Commit, PR and CI system | Summarize the result and link accessible immutable evidence. |
| Role handoff or review result | Linear comment | Keep one concise comment per role phase; omit local-only paths and raw test logs. |
| Project health and executive progress | Linear Project Update | Do not repurpose issue comments. |

An issue description must not accumulate timestamped headings such as BDD RED,
TDD GREEN, local verification, commit checkpoint or QA history. Linear already has
state history and comments; repository and PR history preserve technical evidence.

## Delivery boundary

One issue has one terminal delivery mode. Split work when merge, production release
or operational mutation differs in owner, authority, target or verification:

```text
software implementation → software-merge issue
production deployment    → production-release issue
edge/DNS/HSTS mutation    → operations-change issue
```

A production assurance issue may depend on the merged implementation. Local or
production-like verification may support the implementation issue, but it must not
make a public deployment or edge readback part of that issue's terminal DoD.

## Acceptance criteria

1. Planning skills keep issue descriptions manager-readable and free of execution
   history.
2. Execution skills update the correct native artifact and publish only a concise
   handoff with accessible evidence.
3. A work plan is rejected when one issue's terminal verification mixes
   `software-merge`, `production-release` or `operations-change` signals.
4. Rendered handoff comments summarize successful checks and cap repeated lists;
   the durable handoff artifact may retain full detail.
5. Local absolute or repository-relative evidence paths are omitted from rendered
   Linear comments.

## Test plan

This plugin has no BDD runner, so BDD is not applicable. Node tests cover mixed
delivery detection and compact comment rendering. Architecture tests ensure every
planning/execution/reconciliation skill routes through this contract.

## Affected modules

- `skills/linear-create-work/SKILL.md`
- `skills/linear-do-issue/SKILL.md`
- `skills/linear-reconcile/SKILL.md`
- `references/comment-policy.md`
- `references/software-work.md`
- `scripts/lib.mjs`
- `test/architecture.test.mjs`
- `tests/run-tests.mjs`
