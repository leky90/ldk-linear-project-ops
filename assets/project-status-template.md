# Project status — {{project}}

Data timestamp: {{as_of}} · Layout: **Ops** (default) | **Lanes** (on request: by department / weekly / stakeholder)

Legend: ✅ Done · 🔵 In Progress · 👀 In Review · ⏳ Ready/Todo · 🚫 Blocked · 📋 Backlog · ❓ Refinement/Decision.
Every not-done item carries `[Tier · Agent Model/effort · from main|stacked on <issue>]`.
"⟶ mở" = direct dependents unblocked when done · "← chờ" = blockers. Numbers come from the tracker only.

## Project properties

- Status / health / priority · Lead / members · Start date → target date
- Latest native Project Update
- Totals by state: ✅ n · 🔵 n · 👀 n · ⏳ n · 🚫 n · 📋 n · ❓ n (denominators stated; canceled excluded)

## Project lifecycle consistency

- Current live status ID / name / category
- Execution evidence
- Mismatch or advisory
- Recommended transition and required authority

## Progress by phase / milestone

One line per phase or milestone (issue count and estimated effort stated separately):

`P1 Name ▰▰▱▱▱ 40% (2/5 issues · 5/13 pts) · target {{date}} · critical path: {{ids}} / blocker: {{id}}`

## Ops layout (default) — clusters by dependency chain

```
🌳 Cluster — {{outcome or milestone}}
├─ ✅ LDK-101 title                         phase · role/lane                 (done items: one collapsed line per cluster)
├─ 👀 LDK-102 title                         phase · role/lane · priority      ⟶ mở 110, 120   review: [Opus/high]
│  ├─ 🔵 LDK-110 title                      phase · role/lane · priority      ⟶ mở 130        [L · Sonnet/high · stacked on LDK-110]
│  │   ├─ ✅ LDK-110-1 sub
│  │   └─ ⏳ LDK-110-2 sub                                                    [L · Sonnet/high · stacked on LDK-110]
│  └─ 🚫 LDK-120 title                      phase · role/lane · priority      ← chờ 102       [M · Sonnet/high · from main]
└─ 📋 LDK-130 title                         phase · role/lane · priority      ← chờ 110, 111
```

## Lanes layout (on request) — one table per role / department

Lanes: Software · Design · Content / Medical review · Marketing · QA / Validation · Ops · Decision.

| Ticket | Việc | Phase | Ưu tiên | TT | Xong thì mở → | Nested | Đề xuất |
|---|---|---|---|---|---|---|---|

## Review queues · Ready to Deliver · Delivery Verification

- Review queues by reviewer role.
- Ready to Deliver / Delivery Verification grouped by delivery owner; show persisted fallback phases when custom states are unavailable.
- Flag `Done` issues that lack mode-specific terminal evidence; list stale or inconsistent handoffs.

## ❓ Decisions pending (owner) — never assigned to an agent

## ▶ Ready queue · ⏸ Waiting · 📊 Totals

- ▶ Ready (unblocked, with tags) · ⏸ Waiting (with blockers) · 📊 done/total per phase.

## Next actions (≤ 5, evidence-based)
