# Linear operating model

## Project boundary

Every consumer repository must bind to one exact Linear `projectId` and `teamId`. The ID is authoritative; the name is display-only. Keep known historical project IDs in an exclusion list and never copy, relate, or import their issues automatically.

Use exactly one `.linear-project-ops.json` at the consumer repository root, validated
with [project-binding.schema.json](../schemas/project-binding.schema.json). Do not
search legacy paths, select a project by name, or place a real binding in the plugin
source repository.

## Hierarchy

- Project: the durable operating boundary for one product or business initiative.
- Milestone: a meaningful outcome checkpoint or review boundary.
- Parent issue: a manager-readable outcome.
- Sub-issue: one independently verifiable execution step.
- Resource: a reference URL/document and an exact coordination lock key.
- Decision issue: non-claimable work requiring manager judgment.

Allow only one sub-issue level. A parent may have 2–7 children after decomposition. Use blocker relations for execution order rather than nesting.

## Stable metadata

Put one fenced block in every managed issue:

```linear-project-ops
{"key":"project-wide-stable-key","kind":"parent","claimable":true,"capabilities":["software.review"],"resources":["repo:exact-scope"]}
```

The `key` is immutable and unique within the project. Match by explicit Linear ID first, then exact metadata key. Never match by title alone.

## State invariants

- `Refinement`: unresolved scope, missing acceptance criteria, or manager decision.
- `Ready`: fully specified, claimable, and unblocked.
- `In Progress`: a verified active claim exists.
- `Blocked`: execution cannot advance and the blocker is explicit.
- `In Review`: evidence is complete and manager acceptance is pending.
- `Done`: accepted completion.
- `Canceled`: intentionally abandoned or superseded.

Do not auto-promote parent issues from `In Review` to `Done`.

## Required labels

- `agent:parent`
- `agent:sub-issue`
- `manager:decision`

Add domain labels such as `area:marketing`, `area:product`, `area:operations`, or capability labels only when the project already uses them or the manager approves their creation.

## Secrets and evidence

Never store API keys, credentials, access tokens, customer PII, or raw confidential datasets in Linear descriptions, comments, labels, resource URLs, plans, logs, or claim records. Store durable evidence as a repository path, commit/PR URL, document URL, test artifact, or concise verified result.
