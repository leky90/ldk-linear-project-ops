# LDK Codex-native Project Operations

This repository binds LDKTech Solutions to one immutable Linear project and provides
an atomic local claim lock for concurrent Codex/Claude sessions.

Planning, triage, decomposition, Linear writes, reconciliation, and reporting belong
to the installed `ldk-linear-project-ops` plugin. Linear access uses the host's OAuth
connector. This repository has no Linear API client, no resident daemon, and no
second plan schema.

## Components

- [`.ldk-linear-project.json`](.ldk-linear-project.json): immutable project/team,
  workflow labels/states, and coordination policy.
- [`claim-lock/`](claim-lock): local SQLite issue/resource leases only.
- [`AGENTS.md`](AGENTS.md): mandatory workflow for Codex and Claude Code.
- [`templates/`](templates): managed Linear issue descriptions.
- [`docs/codex-native-architecture.md`](docs/codex-native-architecture.md): scope
  and architectural decision.

## Closed-loop workflow

1. Load project context from the immutable binding.
2. Turn brainstorming into an unapproved plugin plan.
3. Preview and obtain explicit manager approval.
4. Apply the approved plan through Linear OAuth.
5. Triage/decompose complex outcomes into 2–7 direct sub-issues.
6. Select one focus parent and acquire a local claim lease.
7. Execute a bounded chain of related children with evidence.
8. Reconcile parent, child, blocker, and expired-claim state.
9. Report milestone health, progress, decisions, blockers, and priority.

## Claim-lock commands

```sh
node claim-lock/cli.mjs claim \
  --database .state/claims.sqlite \
  --issue-id LINEAR_ISSUE_UUID \
  --worker codex-local-1 \
  --resources repo:ldktech-solutions:scope \
  --lease-ms 1800000

node claim-lock/cli.mjs heartbeat \
  --database .state/claims.sqlite \
  --token CLAIM_TOKEN \
  --lease-ms 1800000

node claim-lock/cli.mjs verify --database .state/claims.sqlite --token CLAIM_TOKEN
node claim-lock/cli.mjs release --database .state/claims.sqlite --token CLAIM_TOKEN
node claim-lock/cli.mjs active --database .state/claims.sqlite
node claim-lock/cli.mjs expired --database .state/claims.sqlite
node claim-lock/cli.mjs acknowledge --database .state/claims.sqlite --issue-id LINEAR_ISSUE_UUID
```

The token is a local fencing token. Never copy it into Linear or commit it.

During a goal chain, hold the parent lease for the full run and acquire one child
lease at a time. Omit child resource keys already protected by the parent token so
the run does not conflict with itself. Check `active` before reconciling an expired
claim.

## Scheduled runner

`LDK Linear Agent Runner` runs hourly from 08:00 through 22:00
`Asia/Ho_Chi_Minh`. It uses the plugin, Linear OAuth, and this local claim-lock.
Each run stays on one focus parent for up to 50 minutes; it is not a daemon.

## Verification

```sh
npm run check
```

The lock coordinates only agents sharing this SQLite database. Use a shared lease
service before allowing agents on multiple machines to execute concurrently.
