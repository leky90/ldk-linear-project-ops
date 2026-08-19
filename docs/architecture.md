# Plugin architecture

## Source, consumer và host

Repository là package dùng chung. Consumer repository cung cấp
`.linear-project-ops.json` với Linear project/team/state IDs và role labels. Codex
hoặc Claude Code cung cấp OAuth tools. Plugin không chứa project thật, scheduler,
credential, Linear transport hay database claim.

## Native planning hierarchy

```text
Initiative → Project → Milestone → Outcome issue → Task / Decision
```

- Initiative là mục tiêu chiến lược có thể gom nhiều project.
- Project giữ owner, members, status, priority, start và target date.
- Milestone là checkpoint kết quả trong một project.
- Outcome issue là scope lớn để lead phân rã; không giả lập Initiative bằng issue.
- Task/Decision là đơn vị role-ready. Sub-issue chỉ dành cho deliverable độc lập.

Cycle, estimate, assignee và due date là thuộc tính lập kế hoạch bổ sung; chúng
không thay thế hierarchy hoặc `ownerRole`/`reviewerRole`.

Project status dùng live Linear status ID/name/category. `started` chỉ là legacy
read alias cho category `in-progress`; custom status names không được hard-code.
Project có thể khai báo lifecycle `bounded` hoặc `continuous`, nhưng cả hai vẫn cần
completion criteria ở cấp Project.

## Role-state contract

| State | Người thực hiện | Kết quả hợp lệ |
|---|---|---|
| Refinement | CPO, lead hoặc decision owner | đủ DoR để Ready hoặc Blocked rõ ràng |
| Ready | `ownerRole` | sản phẩm đạt DoD và bàn giao In Review |
| In Progress | `ownerRole` đang thực hiện | tiếp tục cùng role, không đổi ownership |
| In Review | `reviewerRole` | Done, Ready to Deliver, hoặc Ready kèm findings |
| Ready to Deliver | `delivery.ownerRole` | thực hiện terminal action đã được duyệt |
| Delivery Verification | `delivery.ownerRole` | xác minh kết quả, audit, checks và cleanup |
| Blocked | role đang sở hữu | điều kiện resume rõ ràng |
| Done | không còn hành động | terminal evidence đúng delivery mode |

## Execution path

`linear-do-issue` là entry point chính:

1. Load immutable binding; đọc live hierarchy, issue, resources và relations.
2. Resolve role từ state và role label; legacy chỉ được suy luận thận trọng.
3. Kiểm tra DoR và Project lifecycle. Nếu Project Backlog/Planned và role-phase sẽ
   chạy, chuyển sang exact live status ID thuộc In Progress rồi re-read.
4. Acquire local file lock và thực hiện đúng một role phase.
5. Validate handoff/review evidence và delivery phase.
6. Update durable resources, một human comment, role label và state. Review pass chỉ
   đi thẳng `Done` cho `decision`/`artifact-review`; action mode đi qua delivery.
7. Re-read issue và Project lifecycle rồi release lock.

Lock không thay thế Linear state. Agent ở nhiều máy dựa trên atomic update/re-read;
shared distributed lock nếu cần là hạ tầng riêng ngoài plugin.

## Creation and reporting paths

`linear-create-work` tạo work plan v4 `goal-structure` rồi apply theo thứ tự Initiative → Project →
logical phase metadata → Milestone → Resource → Outcome/Decision → relations. Execution
tasks chỉ xuất hiện khi role claim outcome và tạo `outcome-decomposition`. Stable keys và post-write
re-read giữ retry idempotent. Host không có native mutation nào thì plugin report
capability gap; không mô phỏng object đó bằng issue/comment sai tầng.

Mỗi issue có delivery contract machine-readable. `decision` và `artifact-review`
kết thúc bằng accepted durable outcome; `publish`, `external-action`,
`software-merge`, `production-release` và `operations-change` cần terminal action và
verification. Hai custom issue state delivery là optional; khi workspace không có,
issue giữ `In Review` và handoff/resource lưu delivery phase thay vì dùng `Done` sớm.

Dependency dùng `blockedByKeys` làm chiều canonical và map sang native Linear
`blockedBy`; `blocks` là inverse, `relatedToKeys` là symmetric `relatedTo`, và
`duplicateOfKey` map sang `duplicateOf`. DoR phụ thuộc planned work phải có native
edge; external dependency phải có owner và resume condition. Execution đọc live
state của cả hai đầu để không báo một dependency đã Done là blocker hiện tại.

`linear-project-status` mặc định read-only. Nó tách issue-count progress và effort
progress, nhóm theo Initiative/Milestone/role và luôn kiểm tra lifecycle consistency.
Planned có execution evidence được đề xuất In Progress; continuous Project không có
open outcome vẫn giữ In Progress. Skill chỉ sửa status hoặc publish native Project
Update khi người dùng yêu cầu trực tiếp.

## Legacy cleanup path

`linear-reconcile` snapshot project, phân loại từng issue/comment, tạo cleanup plan
exact-ID, rồi dừng để duyệt. Apply chỉ cho các entry destructive có `approved:true`,
sau khi nội dung và relations đã được chuyển sang canonical entity. Kết quả phải
liệt kê applied, skipped, conflicted và failed; không có wildcard delete.

## Software boundary

Engineer dùng linked worktree và Git baseline để cô lập issue. Validator so live
Git với baseline, commit HEAD và declared scope trước handoff. Dirty/untracked file
ở worktree khác không được nhận vào scope, stash, xóa hoặc commit ké. QA chỉ đọc
commit/PR/CI/test evidence bất biến.

Issue `software-merge` chỉ merge-ready sau QA, required checks và review findings.
Sau merge, Delivery Verification chứng minh merge ancestry, post-merge checks và
safe worktree/branch closure trước `Done`. Stacked packet PR không độc lập mergeable
là checkpoint của một canonical integration issue, không phải nhiều issue `Done`.

## Human communication

Mỗi role phase tạo tối đa một comment: kết quả, deliverables/findings, DoD checks,
evidence, giới hạn và next action. Project health dùng native Project Update. Run ID,
token, heartbeat, database path, worktree path và raw JSON bị cấm trên Linear.

## Safety invariants

- Project/team identity chỉ đến từ consumer binding.
- Preview/draft là read-only; apply/publish/perform mới cho phép ghi đúng scope.
- Perform issue cho phép transition Backlog/Planned → In Progress; không cho phép
  Complete/Cancel/reopen Project nếu thiếu quyền rõ ràng.
- Empty queue hoặc 100% current work không phải Project completion evidence.
- Role DoD/handoff không phải terminal issue evidence.
- External action cần authority riêng; review approval không tự cấp quyền publish,
  outreach, spend, merge, deploy, file hoặc mutate production.
- Stable keys và post-mutation re-read bắt buộc cho idempotency.
- Delete yêu cầu exact ID, canonical preservation và phê duyệt riêng.
- Destructive, bulk, cross-project và production actions cần quyền rõ ràng.
- Secrets, credentials, PII và project fixtures thật bị cấm trong package.
