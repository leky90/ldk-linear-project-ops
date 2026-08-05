# Plugin architecture

## Source, consumer và host

Repository này là source/package dùng chung. Mỗi consumer repository cung cấp một
`.linear-project-ops.json` chứa Linear IDs, state IDs và role labels. Codex hoặc
Claude Code cung cấp Linear OAuth tools. Plugin không chứa project thật, scheduler,
credential hay Linear API client.

## Role-state contract

Linear là nguồn sự thật cho công việc người dùng nhìn thấy. Một issue luôn có một
vai trò chịu trách nhiệm cho giai đoạn hiện tại và một sản phẩm bàn giao hữu hình.

| State | Người thực hiện | Kết quả hợp lệ |
|---|---|---|
| Refinement | CPO, lead hoặc decision owner | đủ DoR để Ready hoặc Blocked rõ ràng |
| Ready | `ownerRole` | sản phẩm đạt DoD và bàn giao In Review |
| In Progress | `ownerRole` đang thực hiện | tiếp tục cùng role, không đổi ownership |
| In Review | `reviewerRole` | Done hoặc Ready kèm findings |
| Blocked | role đang sở hữu | điều kiện resume rõ ràng |
| Done | không còn hành động | evidence và review đã hoàn tất |

Sub-issue chỉ được tạo khi một deliverable riêng cần một role thực hiện độc lập.
Không chia task theo thời lượng, token budget hay từng bước nội bộ của agent.

## Execution path

`linear-do-issue` là entry point chính:

1. Load immutable project binding và đọc live issue/resources/dependencies.
2. Resolve role từ state và role label; legacy issue được suy luận thận trọng.
3. Kiểm tra DoR và acquire file lock nội bộ.
4. Thực hiện đúng một role phase.
5. Validate handoff/review evidence.
6. Update resources, một human comment, role label và state.
7. Re-read Linear rồi release lock.

Lock chỉ ngăn concurrency cục bộ. Nó không thay thế Linear state, không dùng SQLite,
không tạo comment claim/heartbeat và không xuất token ra báo cáo. Agent ở nhiều máy
dựa trên atomic Linear update/re-read; nếu cần shared locking thực sự thì đó là hạ
tầng riêng ngoài plugin.

## Software boundary

Engineer dùng linked worktree và Git baseline để cô lập issue. Validator so live
Git với baseline, commit HEAD và declared scope trước handoff. Những file dirty hay
untracked ở worktree khác không được nhận vào scope, stash, xóa hoặc commit ké.
QA chỉ đọc commit/PR/CI/test evidence; QA không cần dùng worktree của engineer.

## Human communication

Mỗi role phase tạo tối đa một comment có cấu trúc: kết quả, deliverables/findings,
DoD checks, evidence, giới hạn và next action. Machine telemetry như run ID, token,
heartbeat, database path, worktree path và raw JSON bị cấm trên Linear.

## Safety invariants

- Project/team identity chỉ đến từ consumer binding.
- Direct create/update/perform là quyền ghi có scope; draft/propose/preview là read-only.
- Stable keys và post-mutation re-read giữ thao tác idempotent.
- Destructive, bulk, cross-project và production actions cần quyền rõ ràng.
- Secrets, credentials, PII và project fixtures thật bị cấm trong package.
