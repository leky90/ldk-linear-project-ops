# Goal structure and claim-time decomposition

RoleFlow plans business outcomes across product, content, marketing, sales,
operations, support, legal, finance, and software without assuming a software
delivery path.

## Goal structure

A `goal-structure` work plan may create a native Initiative when the objective spans
Projects, one Project, ordered logical phases, native milestones, outcome issues,
blocking decisions, and durable resources. It must not create execution tasks.
Logical phases are contract metadata in the Project description or approved
lifecycle resource, not fabricated Linear objects.

Every new issue receives `urgent`, `high`, `normal`, or `low`. Use an explicit value,
inherit the parent outcome value for a child, or use policy default `normal` and
record `prioritySource: policy-default`. Never create new priority `none`.

## Claim-time decomposition

Claim-time decomposition begins only when the accountable lead or owner role starts
an outcome and discovers more than one independently reviewable deliverable:

1. Set `planningStage: outcome-decomposition` and name one `sourceOutcomeKey`.
2. Create only direct task or decision children of the claimed outcome.
3. Give each child one owner role, reviewer role, delivery boundary, and priority.
4. Add dependency edges only for real data, authority, or delivery prerequisites.
5. Remove convenience ordering, verify the graph is acyclic, and publish parallel waves.

Examples include product research plus legal review, content plus campaign setup,
sales enablement plus support preparation, operations configuration plus finance
approval, and software implementation plus independently owned documentation. The
department changes the deliverable, not the decomposition invariants.
