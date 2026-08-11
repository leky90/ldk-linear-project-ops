# Role-based work model

## Core contract

Treat one issue as one role-owned work packet inside a native Linear Project. Its human contract contains:

- one outcome and one current deliverable;
- one current `role:*` label;
- an optional reviewer role;
- Definition of Ready (DoR);
- role-phase Definition of Done (DoD);
- one declared delivery mode, terminal owner, and verification contract;
- durable resources and real blocker relations, or a structured external blocker
  when the dependency is genuinely outside the planned issue graph.

DoR determines whether the current role may start. DoD determines whether that role
may hand off. Review determines acceptance; it is not performed by the delivering
role. Neither handoff nor review alone means the issue is terminal: use
[delivery-lifecycle.md](delivery-lifecycle.md) to verify the real outcome.

Every DoR dependency on another planned issue, decision, or role-owned deliverable
must be represented by a native blocker relation. See
[issue-relations.md](issue-relations.md).

## States

- `Refinement`: missing scope, decision, DoR, role, or resource.
- `Ready`: current role can start and no blocker is open.
- `In Progress`: work on the outcome or issue has begun. This is human progress, not proof of a machine lock.
- `In Review`: the deliverable is handed to the reviewer role with evidence.
- `Ready to Deliver`: review and pre-delivery gates passed; an approved publish,
  merge, submission, external action, or operational change is still pending.
- `Delivery Verification`: the terminal action occurred and its checks, audit,
  measurement, or cleanup are being verified.
- `Blocked`: execution stopped with an explicit owner and resume condition.
- `Done`: the declared delivery mode has terminal evidence. A role handoff, approved
  artifact, or QA pass is insufficient when a later delivery action is in scope.
- `Canceled`: intentionally abandoned or superseded.

On changes requested, return the issue to `Ready` and restore the delivering role.
Do not leave an issue `In Progress` when no one owns an active work phase. When the
workspace lacks either optional delivery state, keep `In Review` and persist the
validated delivery phase instead of inventing a state or prematurely using `Done`.

## Planning hierarchy and issue types

- Native `Initiative`: strategic objective grouping Projects; it is not an issue type.
- Native `Project`: bounded outcome with lead, dates, status, resources, and milestones.
- Native `Milestone`: lifecycle checkpoint inside one Project.
- `outcome`: manager-readable parent issue that may contain direct tasks.
- `task`: one independently owned deliverable.
- `decision`: judgment or authority required before execution.
- `reference`: durable source material; normally use a project resource instead of an executable issue.

Use only one direct sub-issue level. Split by deliverable, role, reviewer, dependency, or resource boundary—not by arbitrary agent duration. The outcome issue remains `In Progress` while its tasks advance and may move to `In Review` when its outcome-level DoD is satisfied.

## Common handoffs

- CPO → Tech Lead: product brief/PRD becomes a technical breakdown request.
- Tech Lead → Software Engineer: implementation task with technical context and QA-ready DoD.
- Software Engineer → QA: PR/commit/test evidence.
- QA → Software Engineer: changes requested; QA → Ready to Deliver when a merge or
  release remains; QA → Done only when the reviewed artifact/verdict is itself the
  declared terminal outcome.
- Content Director → Content Writer → Content Director.
- Marketing Lead → Marketer → Marketing Lead.
- Sales Manager → Sales Representative → Sales Manager.

The same Codex or Claude host may assume different roles in different runs, but one run performs only the role currently requested by the issue.

## Project lifecycle

Issue state and Project status are separate but must remain consistent. Before the
first executing role-phase, move a Backlog/Planned Project to the live status in the
In Progress category. Keep continuous lifecycle Projects In Progress between phases;
an empty queue or completed launch milestone is not proof that the whole Project is
Completed. See [project-lifecycle.md](project-lifecycle.md).
