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

## Role-state contract

| State | Người thực hiện | Kết quả hợp lệ |
|---|---|---|
| Refinement | CPO, lead hoặc decision owner | đủ DoR để Ready hoặc Blocked rõ ràng |
| Ready | `ownerRole` | sản phẩm đạt DoD và bàn giao In Review |
| In Progress | `ownerRole` đang thực hiện | tiếp tục cùng role, không đổi ownership |
| In Review | `reviewerRole` | Done hoặc Ready kèm findings |
| Blocked | role đang sở hữu | điều kiện resume rõ ràng |
| Done | không còn hành động | evidence và review đã hoàn tất |

## Execution path

`linear-do-issue` là entry point chính:

1. Load immutable binding; đọc live hierarchy, issue, resources và relations.
2. Resolve role từ state và role label; legacy chỉ được suy luận thận trọng.
3. Kiểm tra DoR và acquire local file lock.
4. Thực hiện đúng một role phase.
5. Validate handoff/review evidence.
6. Update durable resources, một human comment, role label và state.
7. Re-read Linear rồi release lock.

Lock không thay thế Linear state. Agent ở nhiều máy dựa trên atomic update/re-read;
shared distributed lock nếu cần là hạ tầng riêng ngoài plugin.

## Creation and reporting paths

`linear-create-work` tạo work plan v2 rồi apply theo thứ tự Initiative → Project →
Milestone → Resource → Outcome/Task/Decision → relations. Stable keys và post-write
re-read giữ retry idempotent. Host không có native mutation nào thì plugin report
capability gap; không mô phỏng object đó bằng issue/comment sai tầng.

`linear-project-status` mặc định read-only. Nó tách issue-count progress và effort
progress, nhóm theo Initiative/Milestone/role, rồi chỉ publish native Project Update
khi người dùng yêu cầu trực tiếp và health có evidence.

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

## Human communication

Mỗi role phase tạo tối đa một comment: kết quả, deliverables/findings, DoD checks,
evidence, giới hạn và next action. Project health dùng native Project Update. Run ID,
token, heartbeat, database path, worktree path và raw JSON bị cấm trên Linear.

## Safety invariants

- Project/team identity chỉ đến từ consumer binding.
- Preview/draft là read-only; apply/publish/perform mới cho phép ghi đúng scope.
- Stable keys và post-mutation re-read bắt buộc cho idempotency.
- Delete yêu cầu exact ID, canonical preservation và phê duyệt riêng.
- Destructive, bulk, cross-project và production actions cần quyền rõ ràng.
- Secrets, credentials, PII và project fixtures thật bị cấm trong package.
