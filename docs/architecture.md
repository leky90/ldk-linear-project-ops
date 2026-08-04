# Plugin architecture

## Source layer

The repository contains reusable plugin instructions, deterministic scripts,
schemas, templates, and tests. `.codex-plugin/plugin.json` is the package manifest.

## Consumer layer

Each product or business repository supplies one `.linear-project-ops.json` binding
with immutable Linear IDs and coordination policy. The plugin discovers and verifies
that file before Linear work. No consumer binding belongs in this source repository.

## Host layer

Codex or Claude provides authenticated Linear OAuth tools and optionally schedules
runs. Host automation is deployment state and is not packaged with the plugin.

## Coordination layer

The packaged claim-lock offers atomic SQLite leases to agents sharing one consumer
filesystem. The database path is consumer-relative and ignored by Git. Teams running
agents across machines must provide a shared atomic lease backend; Linear comments
remain an explicitly weaker optimistic fallback.

## Safety invariants

- Plan-driven writes require current explicit approval and `approved: true`.
- Project identity comes only from the immutable consumer binding.
- Stable keys and re-reads make writes idempotent and verifiable.
- Claim tokens never leave local session memory.
- Secrets, credentials, customer PII, and real project fixtures are forbidden in
  the plugin package.
