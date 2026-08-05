# Human comment policy

Comments are handoff records for people, not an execution log.

## Rules

- Post at most one comment per completed role-phase.
- Put full PRDs, briefs, technical plans, test reports, and content artifacts in project resources or their native systems. Link them from the comment.
- Never publish claim tokens, run IDs, lease expiry, heartbeat, local paths, Git baseline JSON, raw validator JSON, or hidden coordination data.
- Use the packaged templates for handoff, review, blocked, and reconciliation comments.
- State observed facts. Mark assumptions and missing evidence explicitly.
- Update status and role only after the comment and durable resources are ready.

## Handoff structure

1. `Handoff · From role → To role`
2. Result summary
3. Deliverables
4. DoD checklist
5. Evidence links
6. Known limitations
7. Next action

## Review structure

1. `Review passed` or `Changes requested`
2. Reviewer role
3. Checks performed
4. Findings with severity/reproduction when relevant
5. Evidence
6. Next owner and state

## Blocked structure

1. Blocker
2. Impact
3. Needed from role/person
4. Resume condition

Do not add a separate start comment by default. Linear status and role already communicate ownership; use a progress comment only for a material, long-running update that changes the expected handoff.
