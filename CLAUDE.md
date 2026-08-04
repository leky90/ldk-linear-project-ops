# Claude Code instructions

Read and follow `AGENTS.md` before planning, claiming, or executing work.

Use the installed `ldk-linear-project-ops` skills and connected Linear OAuth tools
for all project operations. Do not create a local plan schema, call a Linear API
directly, or request `LINEAR_API_KEY`.

Before editing any project resource, acquire a token with
`node claim-lock/cli.mjs claim`. Heartbeat during work and release on every stop
path. Keep one focus parent per run and continue only through its related runnable
children within the configured time budget.
