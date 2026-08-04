# Priority policy

Use Linear's explicit priority as the primary ordering signal:

1. Urgent
2. High
3. Normal
4. Low
5. No priority

Within the same priority, order by:

1. Active incident or verified customer/business harm.
2. Earliest explicit due date.
3. Work that unblocks the greatest number of already-prioritized issues.
4. Existing focus parent with an active valid claim.
5. Oldest time in `Ready`.

Do not calculate business value, revenue, conversion, impact, confidence, or effort when baselines are absent. Mark them `unknown` or `measurement-required`.

## Suggested meanings

- Urgent: active severe incident, security issue, or deadline breach with verified immediate harm.
- High: blocks a committed outcome, launch, customer obligation, or several ready tasks.
- Normal: useful planned work with clear value but no immediate harm or committed blocker.
- Low: optional improvement, experiment, cleanup, or non-blocking polish.
- No priority: untriaged; keep out of autonomous claim queues until reviewed.

Preserve manager-set priority. When proposing a change, cite the observed evidence and show it in the preview.
