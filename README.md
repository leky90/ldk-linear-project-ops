# LDK Linear Project Ops

Reusable Codex/Claude plugin source for closed-loop Linear project operations. It
turns discussions into approved plans, triages and decomposes work, coordinates
concurrent agents, executes bounded goal chains, reconciles state, and reports
progress.

This repository is the canonical source and packaging workspace for the plugin. It
does not bind to or operate any real Linear project.

## Plugin contents

- `.codex-plugin/plugin.json`: Codex plugin manifest.
- `skills/`: nine composable Linear operation skills.
- `references/`: approval, data model, priority, decomposition, host, and claim rules.
- `schemas/`: project binding, planning, and decomposition contracts.
- `scripts/`: deterministic validators, reporting, hooks, stable keys, and claim lock.
- `assets/`: neutral templates and example plans.
- `examples/`: copyable consumer configuration with placeholder IDs.
- `tests/`: plugin behavior fixtures and tests.

## Consumer setup

Install the plugin through the personal marketplace, then copy
`examples/project-binding.example.json` to `.linear-project-ops.json` in the
consumer repository. Replace only the placeholder project/team/state IDs and keep
credentials out of the file.

For local coordination, keep `coordination.mode` as `atomic-local-lease`. The
plugin stores runtime leases at the consumer-relative `databasePath`. That database
is project state, not plugin source, and must remain uncommitted.

The plugin accesses Linear through the host's connected OAuth app. It does not read
`LINEAR_API_KEY` and does not include a Linear API client.

## Development

```sh
npm run check
```

Validate the plugin package with the Codex plugin-creator validator and validate
each skill with the skill-creator validator before reinstalling. Use the
cachebuster/reinstall flow for local development so new Codex tasks load the updated
skills.

## Boundary

Real bindings, SQLite lease databases, automation schedules, issue identifiers,
progress history, and project-specific operating instructions belong to consumer
projects or the Codex host configuration. They must never be committed here.
