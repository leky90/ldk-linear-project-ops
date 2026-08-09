# Native Linear hierarchy

Use each Linear object for one planning altitude:

| Object | Purpose | Do not use it for |
|---|---|---|
| Initiative | Strategic objective grouping multiple Projects | Executable work or a parent issue |
| Project | Bounded outcome with lead, dates, status, and resources | Permanent department backlog |
| Milestone | Meaningful lifecycle checkpoint inside one Project | Department, week, or arbitrary task group |
| Outcome issue | Manager-readable result inside a Project | Cross-project strategy |
| Task/sub-issue | One independently owned deliverable | Agent steps or time slices |
| Decision issue | Explicit judgment or authority | Implementation work |
| Resource/document | Durable context and artifacts | A task merely to store text |

Prefer three to six milestones named as achieved states, such as `Product scope approved`, `Internal alpha`, `Public launch`, and `Post-launch validation`. A milestone belongs to one Project. If it grows into a separately led outcome with its own lifecycle, propose converting it to a Project.

Canonical hierarchy:

```text
Native Initiative
└── Project
    ├── Milestone
    ├── Outcome issue
    │   └── Task or decision
    └── Resources/documents
```

Legacy issue type `initiative` maps to `outcome` unless it actually represents a strategic objective spanning multiple Projects. Never silently create both.

A `continuous` Project may span development, launch, operations, acquisition,
conversion, and support when those phases share one declared Product end-state.
Continuous does not mean an unbounded department backlog: keep lifecycle mode and
completion criteria explicit, then use milestones/outcomes to advance each phase.
