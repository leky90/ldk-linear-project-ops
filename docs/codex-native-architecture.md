# Codex-native Linear architecture

## Decision

The installed `ldk-linear-project-ops` plugin is the only planning and workflow
implementation. Codex and Claude Code read and write Linear through their connected
OAuth tools. This repository does not implement a second plan schema, Linear API
client, or synchronization command.

The repository keeps one local-only component: `ldk-claim-lock`. It provides an
atomic SQLite lease for agents sharing this workspace. It never selects work, calls
Linear, changes issue state, or reads an API key.

## Scope

Included:

- Immutable project/team binding.
- Atomic issue and exact-resource leases.
- Heartbeat, release, fencing, and expired-claim reconciliation records.
- Agent instructions and issue templates.
- Scheduled Codex goal-chain workflow.

Excluded:

- A resident daemon.
- A local plan or issue schema.
- Linear GraphQL/REST clients.
- `plan-check`, `sync`, `decompose`, or `finish` commands.
- Cross-machine locking. Agents on different machines require a shared lease service.

## Acceptance criteria

- No executable or package bin named `ldk-agent` remains.
- No repository code reads `LINEAR_API_KEY` or calls Linear.
- Plugin planning uses `issues[]` and explicit approval; no `items[]` adapter exists.
- Two local agents cannot hold the same issue or exact resource simultaneously.
- Expired tokens are fenced and exposed for reconciliation.
- The scheduled runner uses Linear OAuth and the local claim-lock.
- Repository tests and CodeGraph initialization pass on the final structure.
