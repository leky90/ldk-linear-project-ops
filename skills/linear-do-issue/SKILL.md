---
name: linear-do-issue
description: Perform one Linear issue as its currently responsible role and hand it to the next role. Use for requests such as "Hãy thực hiện issue LDK-123", including product analysis, technical breakdown, software implementation, QA review, content creation, marketing, sales, and other role-owned work.
---

# Do One Linear Issue

Treat one run as one employee performing one role-phase. Do not switch to another issue or adopt the next role unless the user explicitly asks.

## Route the issue

1. Validate the project binding and read the exact issue, Project, milestone, cycle, assignee, estimate, dates, parent, children, relations, role labels, resources, description, and latest human handoff.
2. Determine the action from state and role:
   - `Ready`: perform the owner role's deliverable.
   - `In Review`: perform the reviewer role's review.
   - `Blocked` or `Refinement`: explain the missing input; do not execute.
   - `Done` or `Canceled`: report and stop.
3. Prefer the explicit `role:*` label. For legacy issues only, infer a role conservatively using [legacy-compatibility.md](../../references/legacy-compatibility.md).
4. Check the issue's Definition of Ready. If it fails, post one structured blocked comment and set the appropriate non-executing state.

## Perform and hand off

1. Acquire the packaged local file lock immediately before work. Keep lock IDs, renewal, and recovery out of Linear comments.
2. Perform the actual role deliverable using attached resources and the relevant repository/domain workflow.
3. For a tech lead, break an `outcome` issue into independently owned direct sub-issues only when breakdown is the requested deliverable. Do not time-slice work for agent convenience and never create an issue-level `initiative`.
4. For software implementation, follow [software-work.md](../../references/software-work.md): isolate Git work internally, verify scope, and produce commit/PR/test evidence before QA handoff.
5. Update durable resources first. Comments summarize and link; they do not become the artifact.
6. Check Definition of Done and create a local handoff JSON matching `schemas/handoff.schema.json`.
7. Validate and render the human comment with `validate-handoff.mjs` and `render-work-comment.mjs`.
8. Post exactly one handoff, review, or blocked comment using [comment-policy.md](../../references/comment-policy.md).
9. Update status and the single current `role:*` label:
   - successful delivery → `In Review` plus reviewer role;
   - review passed → `Done`;
   - changes requested → `Ready` plus previous owner role;
   - blocked → `Blocked` or `Refinement`.
10. Re-read the issue, release the local lock, and report the actual handoff.

Never write claim, heartbeat, token, raw baseline, or validator JSON into Linear. Never mark a review passed on behalf of a different role.

Milestone, cycle, estimate, due date, assignee, and role have different meanings. Do not change planning commitments unless the issue work or user explicitly authorizes it.
