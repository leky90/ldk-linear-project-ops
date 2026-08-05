# Plugin architecture

## Source layer

The repository contains reusable plugin instructions, deterministic scripts,
schemas, templates, and tests. `.codex-plugin/plugin.json` packages Codex and
`.claude-plugin/plugin.json` packages Claude Code. Both hosts share the same
`skills/`, `hooks/`, scripts, schemas, references, and assets.

## Consumer layer

Each product or business repository supplies one `.linear-project-ops.json` binding
with immutable Linear IDs and coordination policy. The plugin discovers and verifies
that file before Linear work. No consumer binding belongs in this source repository.

## Host layer

Codex or Claude provides authenticated Linear OAuth tools and optionally schedules
runs. Claude Code connects to Linear's official remote MCP endpoint and completes
OAuth interactively. Host automation and OAuth state are deployment state and are
not packaged with the plugin.

## Coordination layer

The packaged claim-lock offers atomic SQLite leases to agents sharing one consumer
filesystem. The database path is consumer-relative and ignored by Git. Teams running
agents across machines must provide a shared atomic lease backend; Linear comments
remain an explicitly weaker optimistic fallback.

## Delivery layer

Domain completion is separate from claim ownership and local verification. For
`software.change`, a deterministic evidence validator applies consumer-configured
child, review, and done gates. The default keeps merge and deployment outside
agent authority while allowing a Ready issue to flow autonomously through branch,
commit, push, PR, and CI. Manager acceptance is timestamped against the latest
delivery change so an older approval cannot close newer code.

## Safety invariants

- Plan-driven writes require current explicit approval and `approved: true`.
- Project identity comes only from the immutable consumer binding.
- Stable keys and re-reads make writes idempotent and verifiable.
- Claim tokens never leave local session memory.
- Software states cannot advance from local-only evidence or stale acceptance.
- Secrets, credentials, customer PII, and real project fixtures are forbidden in
  the plugin package.
