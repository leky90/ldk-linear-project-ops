---
name: linear-claim-focus
description: Select and claim one safe focus parent plus its next runnable child without concurrent-agent conflicts. Use when Codex or Claude Code is ready to start project work from Linear, including scheduled sessions and manual agent runs.
---

# Linear Focus Claim

Acquire one bounded focus before doing work. Reading or assigning an issue is not an atomic claim.

## Select candidates

1. Invoke `$linear-project-context` and `$linear-reconcile-project`.
2. Prefer an existing parent already claimed by this run; otherwise consider only `Ready`, claimable, unblocked parents in the exact project.
3. Order by explicit Linear priority, then due date, then oldest ready time. Do not invent urgency.
4. Exclude `manager:decision`, stale specifications, missing acceptance criteria, and any issue with unresolved blockers.
5. Inspect exact resource keys on the parent and next child.

## Claim safely

Follow [claim-protocol.md](../../references/claim-protocol.md).

- For `atomic-local-lease`, resolve [cli.mjs](../../scripts/claim-lock/cli.mjs) from this skill directory, resolve `coordination.databasePath` relative to the consumer repository, and require the returned claim token.
- When only the Linear connector is available, use the documented optimistic compare-and-set fallback: re-read, write a unique run marker, immediately re-read, and proceed only if your marker is the sole winning claim.
- Never use assignee or `In Progress` alone as a lock.
- Claim one focus parent and at most one executable child at a time.
- On conflict, release or abandon your marker and select another non-conflicting candidate.

Return the focus parent, active child, run ID, lease expiry, resources, blockers, and stop conditions. Do not edit project files until the claim is verified.
