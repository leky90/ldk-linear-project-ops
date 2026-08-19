<!-- codebase-memory-mcp:start -->
# Codebase Knowledge Graph

Prefer graph tools for code discovery:

1. `search_graph` for symbols.
2. `trace_call_path` for callers and callees.
3. `get_code_snippet` for implementations.
4. `query_graph` for structural queries.
5. `get_architecture` for the high-level view.

Use native search for literal/config/non-code queries or when the graph lacks this
repository.
<!-- codebase-memory-mcp:end -->

<!-- CODEGRAPH_START -->
## CodeGraph

Use CodeGraph first for structural questions and before shared-code edits. Trust
indexed AST results. Read only files named in a staleness warning. If the index is
absent, ask before initializing it.
<!-- CODEGRAPH_END -->

# Plugin development boundary

This repository builds and packages `ldk-linear-project-ops`. It is not the
operations workspace for any specific Linear project.

- Never commit a real `.linear-project-ops.json`, Linear project/team ID, runtime
  lock, automation schedule, issue history, credential, token, or customer PII.
- Keep examples synthetic and obviously non-production.
- Put reusable behavior in `skills/`, `references/`, `schemas/`, `scripts/`, or
  `assets/`; put project-specific configuration in the consumer repository.
- Use the connected Linear OAuth app in consumers. Do not implement or request a
  `LINEAR_API_KEY`.
- Interpret direct create/update/perform instructions as scoped write authority;
  draft/propose/preview requests remain read-only.
- Keep internal lock tokens local. Never publish them, run IDs, heartbeats, local
  paths, or raw handoff JSON to Linear.

Before handoff, run `pnpm run check`, validate every skill, validate the plugin
manifest, scan tracked content for real bindings/secrets, and use the plugin
cachebuster/reinstall flow when installed behavior changed.
