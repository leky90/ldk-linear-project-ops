# LDK Agent Workflow

Linear is the source of truth for goals, tasks, dependencies, and progress.

Before starting work:

1. Read the configured Linear project.
2. Claim exactly one Ready issue through `ldk-agent claim`.
3. Never work from an issue that was only read from Linear; a claim token is required.
4. Respect the declared resource keys and task scope.
5. Heartbeat during long work and finish with evidence.

After claiming a top-level parent, assess complexity before execution. Decompose it
into 2–7 direct sub-issues when it has multiple deliverables, capabilities,
resources, dependencies, approval steps, or cannot fit one scheduled run. Do not
create nested sub-issues. Use stable child keys and explicit `blockedByKeys`.

During a scheduled run, select exactly one focus parent. Execute its runnable
sub-issues sequentially in dependency order for up to 50 minutes, re-reading Linear
after each completion. Stop when the parent reaches In Review/Blocked, no runnable
child remains, or the next child cannot finish safely in the remaining time. Never
switch to an unrelated parent in the same run. Run parent reconciliation at the
start, after each child, and at the end.

For a new goal discussed in chat, draft a plan with `approved: false`. Sync it only
after the manager explicitly approves it, then require both `approved: true` and the
CLI `--approve` flag.

Use the immutable project ID from `config/linear.json`. Do not search for or infer a
project by name. Never import, relate, or copy issues from a historical project.

Never copy secrets, customer PII, or credentials into Linear, logs, or the claim database.
Never access a Linear project whose immutable ID differs from `config/linear.json`.
