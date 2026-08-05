---
name: linear-create-work
description: Create or update role-ready Linear initiatives, tasks, decisions, product briefs, PRDs, and supporting resources. Use when a CPO, product lead, tech lead, content director, marketing lead, sales manager, or another owner asks to draft, create, organize, or update work in Linear.
---

# Create Linear Work

Turn an owner's intent into human-readable work packets. Each executable issue must have one current owner role, one deliverable, Definition of Ready, Definition of Done, resources, and an optional reviewer role.

## Workflow

1. Load and validate `.linear-project-ops.json`; pin the exact project and team IDs.
2. Read existing project resources, initiatives, issues, labels, and relations to avoid duplicates.
3. Interpret intent from the prompt:
   - `draft`, `propose`, `analyze`, or `preview` means read-only preview.
   - `create`, `update`, `sync`, or another direct imperative authorizes scoped writes.
   - Ask again only for destructive, bulk, ambiguous, or materially expanded work.
4. Create or update durable source material as project resources. Keep full briefs, PRDs, technical plans, and campaign briefs out of comments.
5. Draft a role-based work plan matching `schemas/work-plan.schema.json`. Use native parent/sub-issue relations and blockers.
6. Validate with the packaged `validate-work-plan.mjs`; for writes require `--apply`.
7. Apply only the requested diff, then re-read every changed entity.

Use [work-model.md](../../references/work-model.md), [approval-policy.md](../../references/approval-policy.md), and [comment-policy.md](../../references/comment-policy.md). Use [product-brief-template.md](../../assets/product-brief-template.md), [prd-template.md](../../assets/prd-template.md), and [issue-template.md](../../assets/issue-template.md) when applicable.

## Role-ready output

- A CPO-created product initiative normally hands off to `tech-lead`.
- A tech-lead breakdown creates tasks owned by the actual executing roles; split by independently owned deliverables, not agent time slices.
- A decision stays in `Refinement` and is not executable.
- `Ready` means the current role's DoR is satisfied and blockers are resolved.

Finish with created, updated, skipped, conflicted, and failed resources/issues plus direct Linear links and the next responsible role.
