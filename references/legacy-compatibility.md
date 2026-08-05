# Legacy compatibility

Read old plugin bindings and issue metadata conservatively; write only the role-based v1 format.

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
