# Legacy cleanup and selective purge

Audit the whole requested scope; mutate only exact approved entities.

## Classification

- `KEEP`: real delivery or decision history that remains meaningful.
- `NORMALIZE`: preserve the entity and update hierarchy, type, role, DoR/DoD, resources, or relations.
- `MERGE_THEN_DELETE`: move unique content and relations to a canonical issue, then delete the duplicate.
- `CONVERT_TO_RESOURCE_THEN_DELETE`: create/link a durable document or resource, then delete the issue used only as storage.
- `DELETE_ISSUE`: delete pure claim, heartbeat, recovery, run bookkeeping, empty duplicate, or agent time-slice issue.
- `DELETE_COMMENT`: delete machine telemetry, token, raw JSON, heartbeat, or content duplicated by durable evidence.
- `NEEDS_DECISION`: human judgment is required before mutation.

## Destructive sequence

1. Capture a timestamped inventory and deterministic plan ID.
2. List exact entity IDs, reasons, preserved content, canonical destinations, and relation moves.
3. Obtain explicit approval for each destructive entry or an exact approved set.
4. Create/update canonical resources and issues first.
5. Move parent/child, milestone, blocker, related, duplicate, and evidence links.
6. Re-read destinations.
7. Delete only approved source IDs.
8. Re-read the Project and report every result category.

Never expand deletion scope from title similarity alone. Never delete an active lock/worktree or real completed delivery history. If the host connector lacks a delete or native-object mutation, stop that entry and report the required Linear UI/API action.
