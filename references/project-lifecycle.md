# Project lifecycle policy

Project analysis consumes a normalized snapshot. Physical Linear status remains
observed data; logical `ready-to-deliver` and `delivery-verification` may come from a
fresh validated handoff v2 when custom states are unavailable. Unknown custom states,
stale handoffs, policy-defaulted priorities, and terminal mismatches remain visible
diagnostics rather than disappearing from reports.

Resolve Project status from live Linear data. Prefer `status.id`, `status.name`, and
its category; never assume a workspace uses a particular custom status name.

`lifecycle.mode` and completion criteria are RoleFlow contract metadata rather than
native Linear Project properties. Persist them in the approved Project description
or a linked Project Lifecycle resource, then read that durable source in reports.

Linear categories used by RoleFlow are `backlog`, `planned`, `in-progress`,
`completed`, and `canceled`. Legacy plan values such as `started` are read-compatible
and normalize to `in-progress`. A custom status named `Paused` or `On Hold` must
retain its live Linear category; the name alone is not a category and must never be
auto-resumed.

## Invariants

- `Backlog` or `Planned` is valid only before execution begins.
- When a requested issue role-phase will execute and the Project is Backlog/Planned,
  move it to the live status ID in the `in-progress` category, then re-read it.
- A direct issue execution request authorizes that safe lifecycle transition; it is
  not a fabricated deadline, priority, scope, or completion decision.
- A Completed or Canceled Project cannot execute more issue work without an explicit
  reopen decision.
- Never infer Project completion from an empty queue, 100% issues, or 100% milestones.
- Completed requires explicit authority or verified Project completion criteria.
- For a continuous lifecycle Project with no open outcome, keep In Progress and ask
  the CPO to define the next outcome/milestone.

## Reporting and repair

Reports are read-only by default. Always flag:

- Backlog/Planned with In Progress, In Review, or Done evidence;
- Completed/Canceled with open work;
- In Progress with no open outcome.

Recommend the target category and require the exact live status ID for a mutation.
A direct request to fix/update Project status authorizes a safe Backlog/Planned →
In Progress correction. Reopen, Complete, Cancel, or ambiguous custom-status changes
still require explicit approval.
