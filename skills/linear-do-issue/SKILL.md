---
name: linear-do-issue
description: Perform one Linear issue as its currently responsible role, align a not-yet-started Project to In Progress, and hand work to the next role. Use for requests such as "Hãy thực hiện issue LDK-123", including product analysis, technical breakdown, software implementation, QA review, content creation, marketing, sales, and other role-owned work.
---

# Do One Linear Issue

Treat one run as one employee performing one role-phase. Do not switch to another issue or adopt the next role unless the user explicitly asks.

## Route the issue

1. Validate the project binding and read the exact issue, Project, live Project status ID/category, available issue and Project statuses, milestone, cycle, assignee, estimate, dates, parent, children, relations, role labels, resources, description, declared delivery contract, and latest human handoff. For every `blockedBy` relation, read the blocker issue's live state; use [issue-relations.md](../../references/issue-relations.md) to distinguish open blockers, resolved historical relations, and missing DoR prerequisites. For legacy issues without a delivery contract, infer a mode conservatively from the explicitly scoped outcome and record the inference; never reopen an old terminal issue solely because the new field is absent.
2. Determine the action from state and role:
   - `Ready`: perform the owner role's deliverable.
   - `In Review`: perform the reviewer role's review.
   - `Ready to Deliver`: perform only the authorized terminal action as the declared delivery owner.
   - `Delivery Verification`: verify the terminal result and cleanup evidence.
   - `Blocked` or `Refinement`: explain the missing input; do not execute.
   - `Done` or `Canceled`: do not repeat the role deliverable. If the current
     workspace still contains branch/worktree state from this completed work,
     perform terminal Git closure using
     [git-closure.md](../../references/git-closure.md), then report; otherwise
     report and stop.
3. Prefer the explicit `role:*` label. For legacy issues only, infer a role conservatively using [legacy-compatibility.md](../../references/legacy-compatibility.md).
4. Check the issue's Definition of Ready independently from its relation list. If it fails, post one structured blocked comment and set the appropriate non-executing state. Name only open issues as current blockers. When every relation is resolved but DoR still fails, identify the missing decision/deliverable/resource, propose the exact prerequisite issue or structured external blocker, and recommend targeted reconciliation instead of attributing the block to a Done issue.
5. Apply [project-lifecycle.md](../../references/project-lifecycle.md):
   - if this run will execute or review work and the Project is Backlog/Planned, update it to the live status ID in category `in-progress`, then re-read it;
   - if the Project is Completed/Canceled, stop unless the user explicitly authorizes reopening;
   - never complete the Project merely because this issue or the current queue becomes Done.

## Perform and hand off

1. Acquire the packaged local file lock immediately before work. Keep lock IDs, renewal, and recovery out of Linear comments.
2. Perform the actual role deliverable using attached resources and the relevant repository/domain workflow.
3. For a tech lead, break an `outcome` issue into independently owned direct sub-issues only when breakdown is the requested deliverable. Do not time-slice work for agent convenience and never create an issue-level `initiative`.
4. For software implementation, follow [software-work.md](../../references/software-work.md): isolate Git work internally, verify scope, and produce commit/PR/test evidence before QA handoff.
5. Update durable resources first. Comments summarize and link; they do not become the artifact.
6. Check the role-phase Definition of Done and create a local handoff JSON matching `schemas/handoff.schema.json`, including `delivery.mode` and the resulting `delivery.phase`.
7. Validate and render the human comment with `validate-handoff.mjs` and `render-work-comment.mjs`.
8. Post exactly one handoff, review, or blocked comment using [comment-policy.md](../../references/comment-policy.md).
9. Update status and the single current `role:*` label using [delivery-lifecycle.md](../../references/delivery-lifecycle.md):
   - successful delivery → `In Review` plus reviewer role;
   - review passed for `decision` or `artifact-review` → `Done` only after terminal verification passes;
   - review passed for `publish`, `external-action`, `software-merge`, `production-release`, or `operations-change` → `Ready to Deliver` plus `delivery.ownerRole`;
   - terminal action completed → `Delivery Verification`;
   - delivery verification passed → `Done`;
   - changes requested → `Ready` plus previous owner role;
   - blocked → `Blocked` or `Refinement`.
   If the preferred delivery states are not configured, keep `In Review` and persist the exact `delivery.phase`; never fabricate a state or substitute `Done`.
10. Re-read the issue and Project; verify their lifecycle states are consistent, then release the local lock.
11. For `software-merge`, a QA pass proves merge readiness, not delivery. Require a non-draft PR, current reviewed SHA, green required checks, and no unresolved required P1/P2 findings. After merge, verify merge ancestry and post-merge checks, then perform terminal Git closure using [git-closure.md](../../references/git-closure.md) during `Delivery Verification` and before `Done`. Also run closure when this run cancels an issue or encounters already-terminal Git state. Preserve dirty, unpushed, uniquely unmerged, or unrelated work and report why it could not be cleaned.
12. Recheck branch, status, and `git worktree list --porcelain`, then report the
    actual handoff and cleanup result. Do not call an issue fully closed while
    silently leaving a disposable task worktree or merged task branch active.

Never write claim, heartbeat, token, raw baseline, or validator JSON into Linear. Never mark a review passed on behalf of a different role.

Review approval does not authorize publishing, outreach, spending, merging,
deployment, filing, or production mutation. Perform those actions only when the
user request, issue contract, and applicable policy grant that authority.

Milestone, cycle, estimate, due date, assignee, and role have different meanings. Do not change planning commitments unless the issue work or user explicitly authorizes it. The safe Backlog/Planned → In Progress transition required to begin execution is a lifecycle invariant, not a new planning commitment.
