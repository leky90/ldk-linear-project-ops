# Planning intake

Goal structure is built from decided input. Before creating any planning
object, verify the goal is **decidable**: it has a canonical brief, the
blocking decisions are resolved or explicitly captured as decision issues, and
acceptance criteria exist for the outcomes the owner cares about.

## The intake gate

When the owner brings an idea that has no approved brief:

1. Clarify first. If the host exposes a requirements-clarification skill (a
   brainstorming-class skill), run it to explore intent, options, and
   trade-offs. If the host has none, perform the same work inline as a
   refinement interview: ask for the goal, audience, constraints, done-when,
   and the decisions only the owner can make.
2. Produce a canonical brief: the goal, approved scope, the recorded decisions
   with their consequences, and acceptance criteria per outcome.
3. Present the brief and obtain the owner's approval.
4. Only then build the goal structure, preview it, and apply after approval.

The clarification phase is read-only outside the conversation: it creates no
tracker items and no worktrees or agent sessions. Structure and every tracker
write belong to this skill, after the gate passes.

## Skip rules

- An approved brief or spec skips the clarification step entirely; go straight
  to goal structure.
- An issue that already carries a contract (work plan, DoR/DoD, delivery mode)
  is never re-clarified; execute or refine it through its own lifecycle.
- Claiming and execution start only after the issues exist; the intake gate
  never dispatches work.

## Domain neutrality

Products are not only software. A film, an online course, a content program,
or a marketing launch flows through the same gate: clarify → brief → approve →
goal structure. Declare domain roles (for example director, editor,
instructional-designer) through the binding's `roles` array, and map terminal
work to `artifact-review`, `publish`, or `external-action` delivery modes.
Example: "build a video course about X" → clarification captures audience,
platform, and scope decisions → the brief is approved → goal structure creates
outcomes for curriculum, production, and launch owned by content and marketing
roles — with no execution tasks until an outcome is claimed and decomposed.
