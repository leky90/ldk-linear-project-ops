# Codex and Claude Code adapters

Use the host's connected Linear OAuth tools. Read first, mutate in a logical batch, and re-read affected entities. Never request a `LINEAR_API_KEY` when OAuth is available.

Use native Linear initiatives, projects, milestones, issues, parent relations,
blockers, labels, comments, documents, project resources and Project Updates when
exposed. Use issue type `outcome` for scope that belongs below a Project; never
simulate a native Initiative or Project Update with a generic issue/comment.

If a resource API is unavailable, attach the approved URL in the issue Resources
section and report the fallback; do not turn every document into a task. If native
Initiative, Milestone or Project Update mutation is unavailable, preserve a
validated preview, report the exact capability gap and stop that mutation.

Local issue locks and Git baselines live under ignored `.linear-ops/` state. They never appear in Linear. Hosts on different machines do not share local locks; use a separately approved shared lock service when true cross-machine concurrency is required.

Map canonical values through `scripts/linear-tool-mapping.mjs`: priorities become
Linear values 1-4, Project health becomes `onTrack`, `atRisk`, or `offTrack`, and
relations map `blockedByKeys → blockedBy`, `relatedToKeys → relatedTo`,
`duplicateOfKey → duplicateOf`, and `parentKey → parentId`. Classify tool operations
by their normalized verb. Unknown Linear operations are capability warnings and must
not be guessed as reads or writes.

For lifecycle handoff, map only the abstract session/model/effort values described in
[execution-profiles.md](execution-profiles.md). If fresh sessions or subagents are
unsupported, return the exact resume prompt and stop without claiming dispatch.

Hook routing:

- session start → verify project boundary;
- create/draft prompt → `$linear-create-work`;
- perform/review issue prompt → `$linear-do-issue`;
- report or native Project Update prompt → `$linear-project-status`;
- recovery prompt → `$linear-reconcile`;
- stop → release local lock and complete one human handoff if work occurred.
