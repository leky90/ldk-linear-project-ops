# Codex and Claude Code adapters

Use the host's connected Linear OAuth tools. Read first, mutate in a logical batch, and re-read affected entities. Never request a `LINEAR_API_KEY` when OAuth is available.

Use native Linear issues, parent relations, blockers, labels, comments, milestones, documents, and project resources when exposed. If a resource API is unavailable, attach the approved URL in the issue Resources section and report the fallback; do not turn every document into a task.

Local issue locks and Git baselines live under ignored `.linear-ops/` state. They never appear in Linear. Hosts on different machines do not share local locks; use a separately approved shared lock service when true cross-machine concurrency is required.

Hook routing:

- session start → verify project boundary;
- create/draft prompt → `$linear-create-work`;
- perform/review issue prompt → `$linear-do-issue`;
- report prompt → `$linear-project-status`;
- recovery prompt → `$linear-reconcile`;
- stop → release local lock and complete one human handoff if work occurred.
