# Planning properties

Keep planning dimensions separate:

- `ownerRole`: kind of worker responsible for the current phase.
- `assigneeId`: actual accountable Linear member.
- `priority`: relative importance.
- `estimate`: expected effort or complexity, using the team's configured scale.
- `cycleId`: time-box in which the team commits to work; it is not a release.
- `dueDate`: issue-specific deadline.
- `milestoneKey`: lifecycle checkpoint the issue advances.
- Project `startDate` and `targetDate`: project planning window.
- Native Initiative `targetDate`: strategic expectation across Projects.

Do not fabricate an assignee, estimate, due date, cycle, lead, member, target date, or health status. Preserve existing values unless the user or source material authorizes a change.

Project Updates use `on-track`, `at-risk`, or `off-track` plus observed progress, risks, next steps, and evidence. A report is read-only; a Project Update is a native Linear mutation requiring a direct publish/update request.
