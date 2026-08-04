<!-- codebase-memory-mcp:start -->
# Codebase Knowledge Graph (codebase-memory-mcp)

ALWAYS prefer MCP graph tools over grep/glob/file-search for code discovery.

1. `search_graph` — find functions, classes, routes, and variables.
2. `trace_call_path` — trace callers and callees.
3. `get_code_snippet` — read a specific symbol.
4. `query_graph` — run complex structural queries.
5. `get_architecture` — summarize architecture.

Fall back to native search only for literal/config/non-code queries or when the graph
does not contain the repository.
<!-- codebase-memory-mcp:end -->

<!-- CODEGRAPH_START -->
## CodeGraph

Use CodeGraph first for structural questions and edits:

- `codegraph_context` or `codegraph_explore` for focused implementation context.
- `codegraph_trace` for end-to-end flows.
- `codegraph_search`, `codegraph_callers`, and `codegraph_callees` for symbols.
- `codegraph_impact` before changing shared behavior.
- `codegraph_files` for indexed file structure.
- `codegraph_status` for index freshness.

Trust indexed AST results and do not repeat them with grep. Read only files named in
a staleness warning. If `.codegraph/` is absent, ask before running
`codegraph init -i`.
<!-- CODEGRAPH_END -->

# LDK Codex-native Linear workflow

Linear is the source of truth for goals, milestones, issues, dependencies, status,
priority, and evidence. The installed `ldk-linear-project-ops` plugin is the only
planning/workflow implementation.

## Project boundary

1. Load `.ldk-linear-project.json`.
2. Use its exact Linear project/team IDs.
3. Never select a project by name or import issues from a historical project.
4. Use the connected Linear OAuth tools. Never request or read `LINEAR_API_KEY`.

## Planning and approval

- Use `linear-capture-brainstorm` for discussion-to-plan drafts.
- Draft with `approved: false`; do not write Linear during brainstorming.
- Apply only after explicit manager approval through `linear-plan-apply`.
- Use the plugin `issues[]` schema. There is no local `items[]` plan or sync command.
- Use `linear-triage-work` and `linear-decompose-parent` for classification and
  2–7 direct sub-issues.

## Claim before work

Reading or assigning an issue is not a claim.

1. Reconcile project state and select one Ready, unblocked issue in the pinned project.
2. Read the issue metadata resource keys.
3. Acquire the local atomic lease:

   ```sh
   node claim-lock/cli.mjs claim \
     --database .state/claims.sqlite \
     --issue-id LINEAR_ISSUE_UUID \
     --worker UNIQUE_WORKER_ID \
     --resources exact:key,other:key \
     --lease-ms 1800000
   ```

4. Proceed only when `ok: true` and retain the returned token in session memory.
5. Re-read Linear. If the issue is no longer eligible, release the token immediately.
6. Update Linear status/comment through OAuth only after the lease is verified.
7. Never put the local claim token in Linear, logs, Git, or evidence.

For a goal chain, keep the parent lease for the whole run. Acquire a separate child
lease before each child. Pass only child resource keys not already covered by the
parent lease; the parent token continues to protect shared keys. Release the child
after its Linear update, then release the parent on the final stop path.

Heartbeat at least every 10 minutes:

```sh
node claim-lock/cli.mjs heartbeat --database .state/claims.sqlite --token TOKEN --lease-ms 1800000
```

Release on every completion, blocker, error, or stop path:

```sh
node claim-lock/cli.mjs release --database .state/claims.sqlite --token TOKEN
```

Use `expired` for reconciliation. Before recovering an expired issue, run `active`
and confirm no replacement claim exists for that issue. Run
`acknowledge --issue-id ID` only after Linear has been reconciled. The lock protects
agents sharing this filesystem; it is not a cross-machine lock.

## Goal-chain execution

- Use `linear-execute-goal-chain`.
- Keep exactly one focus parent per run.
- Execute runnable direct children in dependency order for at most 50 minutes.
- Re-read Linear and verify the claim after every child.
- Stop for manager decisions, missing authority, no runnable child, insufficient time,
  lease failure, or scope/resource conflict.
- Attach durable evidence, reconcile, and move completed parents to In Review—not Done.

Never copy secrets, credentials, customer PII, or raw confidential data into Linear,
comments, plans, logs, or the claim database.
