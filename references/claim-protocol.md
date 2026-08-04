# Claim and concurrency protocol

## Preferred mode: atomic lease

For `atomic-local-lease`, use the plugin's `scripts/claim-lock/cli.mjs` with the
consumer binding's repository-relative `coordination.databasePath`. Use a shared
claim service when configured. A successful claim returns:

- Unique run ID and claim token.
- Parent/child Linear IDs.
- Lease expiry and heartbeat interval.
- Exact resource keys.

Do not work without the token. Renew before expiry, finish with evidence, and release on every stop path. Agents on different machines need one shared atomic claim backend.

## Connector-only fallback

Linear mutations are not a true compare-and-set lock. When no atomic backend exists, reduce rather than eliminate collision risk:

1. Generate a unique run marker: `agent-claim:<host>:<session>:<nonce>`.
2. Re-read issue state, blockers, recent claim comments, and resource markers.
3. Write one claim comment containing marker, parent/child, resources, claimed time, and expiry.
4. Move the chosen issue to `In Progress` only if still `Ready`.
5. Immediately re-read comments and state.
6. Continue only if no earlier unexpired marker conflicts on the issue or any exact resource key.
7. If a conflict exists, write a release note for your marker and stop or choose another issue.
8. Heartbeat with the same marker. At completion, add evidence and a release marker.

Assignee and status alone are never proof of ownership.

## Staleness

Use the configured lease duration. If absent, default to 30 minutes and require a heartbeat at least every 10 minutes. Reconciliation may recover work only after expiry plus one heartbeat interval and a final re-read confirms no later heartbeat.

## Resource keys

Use the smallest exact scope that would cause concurrent work to conflict:

- `repo:example-product:src/marketing`
- `docs:sales-lead-sop`
- `linear:project:report`
- `production:example-product`

Overlapping semantics with different strings are not detectable. Projects should standardize resource key namespaces.
