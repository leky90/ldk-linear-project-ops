# Inline execution and fresh-context handoff

Inline execution is the default. One session performs one current role phase.

## Review independence

A reviewer in a separate session may review inline. When the current session authored
the deliverable, it must dispatch a fresh-context reviewer subagent. The reviewer
receives only the issue contract, canonical deliverable, DoD, accessible evidence,
and known limitations. Passed review records `fresh-session`, `fresh-subagent`, or
`external-reviewer`; same-context self-approval is invalid.

If subagents are unsupported, stop at `In Review`, persist the handoff v2 artifact,
and return an exact resume prompt. Never claim a review was dispatched or completed.

## Next execution profile

Handoff v2 may request:

- session policy: `reuse`, `new-preferred`, or `new-required`;
- model class: `fast`, `standard`, or `reasoning`;
- effort: `low`, `medium`, or `high`;
- a human-readable reason.

These are host-neutral values. Host adapters may start a new session only when the
capability exists and must not persist provider model IDs, prompts, session IDs, or
effort controls to Linear. If `new-preferred` or `new-required` cannot be honored,
stop at handoff and return an exact resume prompt instead of fabricating dispatch.
