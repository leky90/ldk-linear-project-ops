# Codex and Claude Code adapters

## Linear access

Prefer the host's connected Linear OAuth tools. Read first, mutate in logical batches, then re-read for verification. Do not request or store `LINEAR_API_KEY` when OAuth tools are available.

If Linear tools are unavailable, stop and ask the user to connect the Linear integration. Do not silently fall back to browser automation or a different workspace.

## Capability differences

Tool availability varies by host/version. Resolve operations as follows:

- Issues, labels, comments, projects: use native Linear tools.
- Milestones: use native project milestone operations when exposed. Otherwise draft them and report the unsupported write; do not simulate milestones as unrelated issues without approval.
- Project resources: use native resource operations when exposed. Otherwise attach the approved URL to a project document or a dedicated reference issue, and identify the fallback in the result.
- Blocker relations: use native relation operations when exposed. If unavailable, preserve `blockedByKeys` in managed metadata and keep the child out of `Ready` until the relation can be verified.
- Atomic claims: use the plugin-packaged local lease or a configured shared lease backend. Connector-only mode uses [claim-protocol.md](claim-protocol.md).
- Software delivery: use native Git/GitHub tooling available to the host and enforce [software-delivery-policy.md](software-delivery-policy.md). If the host cannot verify a required commit, PR, CI, merge, or deployment artifact, keep the issue below the gated state.

Never claim a capability succeeded when the host lacks its mutation tool.

## Hook mapping

The plugin's Codex/Claude-compatible hooks map operating concepts to host events:

- `SessionStart` → project-context-load.
- `UserPromptSubmit` → brainstorm/Linear routing guidance.
- `PreToolUse` → before-linear-write guard.
- `PostToolUse` → after-linear-write verification reminder.
- `Stop` → session evidence, software-delivery gate, and claim-release reminder.

Scheduled-run start/end are phases of `$linear-execute-goal-chain`, because Codex automations start new sessions rather than a resident daemon.
