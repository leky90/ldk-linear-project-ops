# Role-based work model

## Core contract

Treat one issue as one role-owned work packet. Its human contract contains:

- one outcome and one current deliverable;
- one current `role:*` label;
- an optional reviewer role;
- Definition of Ready (DoR);
- Definition of Done (DoD);
- durable resources and real blocker relations.

DoR determines whether the current role may start. DoD determines whether that role may hand off. Review determines acceptance; it is not performed by the delivering role.

## States

- `Refinement`: missing scope, decision, DoR, role, or resource.
- `Ready`: current role can start and no blocker is open.
- `In Progress`: work on the initiative or issue has begun. This is human progress, not proof of a machine lock.
- `In Review`: the deliverable is handed to the reviewer role with evidence.
- `Blocked`: execution stopped with an explicit owner and resume condition.
- `Done`: required review passed, or the issue explicitly requires no separate review.
- `Canceled`: intentionally abandoned or superseded.

On changes requested, return the issue to `Ready` and restore the delivering role. Do not leave an issue `In Progress` when no one owns an active work phase.

## Issue types

- `initiative`: manager-readable outcome that may contain direct tasks.
- `task`: one independently owned deliverable.
- `decision`: judgment or authority required before execution.
- `reference`: durable source material; normally use a project resource instead of an executable issue.

Use only one direct sub-issue level. Split by deliverable, role, reviewer, dependency, or resource boundary—not by arbitrary agent duration. The initiative remains `In Progress` while its tasks advance and may move to `In Review` when its outcome-level DoD is satisfied.

## Common handoffs

- CPO → Tech Lead: product brief/PRD becomes a technical breakdown request.
- Tech Lead → Software Engineer: implementation task with technical context and QA-ready DoD.
- Software Engineer → QA: PR/commit/test evidence.
- QA → Software Engineer: changes requested; or QA → Done: review passed.
- Content Director → Content Writer → Content Director.
- Marketing Lead → Marketer → Marketing Lead.
- Sales Manager → Sales Representative → Sales Manager.

The same Codex or Claude host may assume different roles in different runs, but one run performs only the role currently requested by the issue.
