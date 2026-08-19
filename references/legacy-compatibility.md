# Legacy compatibility

Read old plugin bindings, work plans v1-v3, handoff v1, and issue metadata conservatively; write only work plan v4 and handoff v2. Mutation requires a migration preview, no unresolved decisions, unchanged source hash, and successful canonical validation.

Map legacy issue type `initiative` to `outcome`. Promote it to a native Linear Initiative only when it is truly a strategic objective spanning multiple Projects.

## Binding

A schema-v1 binding may still supply project/team IDs and state IDs. Ignore its old `coordination`, run-budget, heartbeat, and software completion arrays. Recommend migration to the schema-v2 example, but do not block read-only access solely because legacy fields exist.

## Issue mapping

- `software.change` → owner `software-engineer`, reviewer `qa`.
- `software.review` or an issue already in review → owner `qa`.
- `manager:decision` → owner `cpo`, type `decision`, state `Refinement`.
- `area:product` → `product-manager` unless the issue clearly requests CPO authority.
- `area:marketing` → `marketer`.
- `area:sales` → `sales-representative`.

Do not infer a role when evidence conflicts. Move the issue to `Refinement` or ask for a decision. Old claim comments are audit history only; never treat an expired comment as a current lock and never create new machine claim comments.

Legacy priority `none` or a missing priority remains a reconciliation diagnostic. Do
not silently rewrite it during contract migration. Generic verbs such as implement,
launch, finish, or ship are not evidence for a terminal delivery mode.
