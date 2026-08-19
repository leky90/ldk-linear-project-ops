# Planning properties

Keep planning dimensions separate:

- `ownerRole`: kind of worker responsible for the current phase.
- `assigneeId`: actual accountable Linear member.
- `priority`: relative importance; every new issue uses `urgent`, `high`, `normal`, or `low`.
- `prioritySource`: `explicit`, `inherited`, or `policy-default`; defaulted new work uses `normal` and remains visible in reports.
- `estimate`: expected effort or complexity, using the team's configured scale.
- `cycleId`: time-box in which the team commits to work; it is not a release.
- `dueDate`: issue-specific deadline.
- `milestoneKey`: lifecycle checkpoint the issue advances.
- `phaseKey`: ordered logical Project phase stored as RoleFlow metadata, not a fabricated native Linear object.
- Project `startDate` and `targetDate`: project planning window.
- Project `projectStatus.id/name/category`: live Linear lifecycle status; category is one of `backlog`, `planned`, `in-progress`, `completed`, or `canceled`.
- Project `lifecycle.mode`: `bounded` or `continuous`; completion criteria define the whole Project end-state.
- Native Initiative `targetDate`: strategic expectation across Projects.

Do not fabricate an assignee, estimate, due date, cycle, lead, member, target date, or health status. Preserve existing values unless the user or source material authorizes a change.

Project lifecycle transitions follow [project-lifecycle.md](project-lifecycle.md). In particular, execution evidence makes Backlog/Planned inconsistent, while an empty queue does not make a Project Completed.

Project Updates use `on-track`, `at-risk`, or `off-track` plus observed progress, risks, next steps, and evidence. A report is read-only; a Project Update is a native Linear mutation requiring a direct publish/update request.
