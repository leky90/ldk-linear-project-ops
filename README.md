# LDK Agent Workflow

A small Linear-first coordination workflow for local Codex and Claude sessions.

It intentionally has no dependency on the previous `ldk-work-os` implementation.
Linear stores work and visible progress. A local SQLite file stores only short-lived
claim leases and exact resource locks so concurrent sessions cannot claim the same
task or edit the same declared scope.

## Workflow

1. Discuss a goal in Codex or Claude.
2. Export a plan JSON and review it.
3. Set `approved: true`, then run `ldk-agent sync --approve`.
4. Agents call `ldk-agent claim` and receive one issue plus a fenced claim token.
5. A claimed parent is assessed: execute it directly if atomic, or decompose it into 2–7 sub-issues.
6. Agents execute at most one runnable sub-issue per scheduled run and finish with evidence.
7. Parent reconciliation moves completed work to In Review or stalled work to Blocked.
8. The next claim automatically returns expired In Progress leases to Ready.

The active Linear project is [LDKTech Solutions — Agent Operations](https://linear.app/ldktech/project/ldktech-solutions-agent-operations-e48c600c4632). Its immutable ID is pinned in the local config, so a project with a similar name cannot be selected accidentally.

## Configuration

The active Codex scheduled runner uses the connected Linear OAuth app and does not
need a personal API key. Copy `config/linear.example.json` to `config/linear.json`
only when using the standalone CLI or Claude Code outside Codex. In that case, the
API key is provided only at runtime:

```sh
export LINEAR_API_KEY='...'
```

The committed configuration never contains a credential. The project ID, rather
than a project name or search query, isolates this workflow from historical projects.

## Scheduled runner

The Codex automation `LDK Linear Agent Runner` runs hourly from 08:00 through 22:00
in `Asia/Ho_Chi_Minh`. It uses the Linear connector, reconciles parent state, focuses
on an active parent, and executes at most one atomic unit per run. It exits when no
runnable work exists; there is no resident daemon.

## Commands

```sh
node src/cli.mjs plan-check --config config/linear.json --plan plan.json
node src/cli.mjs sync --config config/linear.json --plan plan.json --approve
node src/cli.mjs claim --config config/linear.json --worker codex-local-1 --capabilities sales.research,software.review
node src/cli.mjs heartbeat --config config/linear.json --token CLAIM_TOKEN
node src/cli.mjs recover --config config/linear.json
node src/cli.mjs decompose --config config/linear.json --token CLAIM_TOKEN --plan decomposition.json
node src/cli.mjs reconcile --config config/linear.json
node src/cli.mjs finish --config config/linear.json --token CLAIM_TOKEN --outcome review --evidence https://example.com/result
```

All commands print JSON for easy use from Codex and Claude.

## Chat approval contract

When a session turns a discussion into work, it must:

1. Draft a schema-version-1 plan with `approved: false`.
2. Show the scope, acceptance criteria, capabilities, and exclusive resources to the manager.
3. Wait for explicit approval in chat.
4. Change `approved` to `true` and call `sync --approve`.

Both approval signals are required. Re-running the same plan is safe because each
item has a stable `key` and sync is idempotent within the pinned project.

## Direct Linear tasks

A manager can create an issue directly in Linear. To make it claimable, put it in
`Ready` and append the metadata block from `templates/linear-agent-task.md`.
Manager decisions stay in `Refinement` and do not receive an `ldk-agent` block.

Resource keys are exact locks. Use the smallest shared scope that would conflict,
for example `repo:ldktech-solutions:src`, `docs:sales-lead-sop`, or
`production:ldktech-solutions`.

## Parent and sub-issues

A top-level Ready issue is a parent outcome. After claiming it, decompose it when it
contains multiple deliverables, capabilities, resources, dependencies, approval
steps, or more work than one scheduled run. A decomposition contains 2–7 direct
sub-issues; nested sub-issues are not allowed.

Each sub-issue must be independently verifiable, fit one 30–60 minute run, declare
its own capabilities/resources, and use `blockedByKeys` for dependencies. Keys are
stable and project-wide, so retrying a partial decomposition cannot duplicate work.

The scheduler keeps focus on an existing In Progress parent. It executes at most
one runnable sub-issue per run. When every sub-issue is Done, reconciliation moves
the parent to In Review for manager acceptance.

## Coordination boundary

The SQLite claim database coordinates sessions that share this workspace. Agents
running on different machines must use a shared claim service/database before they
are allowed to claim concurrently; Linear status changes alone are not an atomic lock.
