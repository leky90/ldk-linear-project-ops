# Claude instructions

Read and follow `AGENTS.md` before planning or claiming work.

Use `node src/cli.mjs` for plan validation, Linear sync, claim, heartbeat, recovery,
and finish. A Linear issue being visible is not authorization to work; a valid claim
token is required.

Treat top-level Ready issues as parent outcomes. Follow the complexity and
decomposition rules in `AGENTS.md`. Keep one focus parent per scheduled run and
continue through its related runnable sub-issues within the bounded time budget.
