# Role routing

Use the issue's single `role:*` label as the current owner role. Use `reviewer:*` only in the issue contract or managed metadata when the reviewer differs from project defaults.

## Defaults

| Current role | Typical deliverable | Default next role |
|---|---|---|
| `cpo` | Product brief, PRD, native Initiative/Project, outcome issue | `tech-lead` |
| `product-manager` | Refined requirements and acceptance scenarios | `tech-lead` |
| `tech-lead` | Technical understanding, plan, role-owned sub-issues | task-specific role |
| `software-engineer` | Tested implementation and PR | `qa` |
| `qa` | Review result and evidence | delivery owner, `done`, or `software-engineer` |
| `content-director` | Content brief or editorial review | `content-writer` or `done` |
| `content-writer` | Content deliverable | `content-director` |
| `marketing-lead` | Campaign brief and tasks | `marketer` |
| `marketer` | Campaign deliverable and metrics setup | `marketing-lead` |
| `sales-manager` | Sales brief, account plan, or review | `sales-representative` or `done` |
| `sales-representative` | Outreach/account deliverable | `sales-manager` |

Project-specific DoR, DoD, and reviewer assignments in Linear resources override these defaults. Never infer that a role may approve its own delivery unless the issue explicitly says no separate review is required.

After review, route by [delivery-lifecycle.md](delivery-lifecycle.md). A passing QA
review for `software-merge` normally restores the declared `delivery.ownerRole` and
moves to `Ready to Deliver`; it does not close the implementation issue. The QA
review issue itself may be `Done` when its declared outcome is the accepted verdict.

## Legacy inference

Use capability or area labels only when no role label exists. Add the inferred role in the same verified update and explain the mapping in the final result, not as a machine comment.
