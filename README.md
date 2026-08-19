# LDK Linear Project Ops · RoleFlow

Plugin dùng chung cho Codex và Claude Code để quản lý và thực hiện công việc trên
Linear như một tổ chức thật: chiến lược được đặt ở đúng tầng, mỗi issue có vai trò
chịu trách nhiệm, và mỗi giai đoạn kết thúc bằng một bàn giao dễ review.

Repository này chỉ chứa source và gói cài đặt plugin. Nó không gắn với project
Linear cụ thể, không chứa lịch sử vận hành của LDKTech Solutions và không cần
`LINEAR_API_KEY` khi host đã kết nối Linear qua OAuth.

Nếu repository có cả `.linear-project-ops.json` và `.github-project-ops.json`, tên,
URL hoặc ID native của tracker sẽ quyết định plugin được dùng. Một yêu cầu chung như
“tạo các issues” phải dừng để chọn Linear hoặc GitHub; hai plugin không được cùng ghi
hay tự sao chép dữ liệu qua lại. Xem `references/tracker-routing.md`.

## Mô hình dữ liệu Linear

```text
Native Initiative  — mục tiêu chiến lược liên project
        ↓
Project            — một chương trình/sản phẩm có owner và target date
        ↓
Milestone          — cột mốc kết quả quan trọng trong project
        ↓
Outcome issue      — kết quả lớn do lead/owner phù hợp claim
        ↓
Task / Decision    — deliverable của một vai trò hoặc quyết định cần chốt
```

Milestone biểu diễn kết quả kiểm chứng được như “Public beta ready”, không dùng để
thay phòng ban, sprint hay các bước nội bộ. Cycle là nhịp thực thi ngắn hạn; estimate
là effort; due date là cam kết riêng của issue. Xem `references/linear-hierarchy.md`
và `references/planning-properties.md`.

## RoleFlow

```text
CPO/Owner tạo Initiative/Project/phase/milestone/outcome
        ↓
Lead/Owner claim outcome rồi mới phân rã deliverable
        ↓
Engineer, Writer, Marketer, Sales… tạo deliverable
        ↓
QA/Lead/Director review DoD và evidence
        ↓
Artifact/decision hoàn tất → Done
        hoặc
Ready to Deliver → Delivery Verification → Done
```

Một issue khai báo outcome, deliverable, `ownerRole`, `reviewerRole`, DoR, DoD,
delivery mode/owner/verification, resources, relations và planning properties cần
thiết. Câu lệnh thường dùng vẫn là:

```text
Hãy thực hiện issue LDK-123
```

Plugin tự đọc live state và thực hiện đúng một role phase:

- `Refinement`: làm rõ hoặc phân rã outcome;
- `Ready`: owner thực hiện rồi bàn giao `In Review`;
- `In Review`: reviewer nghiệm thu, chuyển `Done` hoặc trả `Ready`;
- `Ready to Deliver`: review đạt nhưng merge/publish/deploy/external action chưa có bằng chứng;
- `Delivery Verification`: terminal action đã xảy ra và đang xác minh kết quả/cleanup;
- `Blocked`: ghi blocker, ảnh hưởng, người cần xử lý và điều kiện tiếp tục;
- `Done`: không thực hiện lại nếu không có yêu cầu mở lại rõ ràng.

## Bốn skill công khai

- `linear-create-work`: preview/apply native hierarchy, resources và role-ready issues.
- `linear-do-issue`: thực hiện một issue theo vai trò và trạng thái hiện tại.
- `linear-project-status`: báo cáo read-only hoặc publish native Project Update khi
  người dùng yêu cầu trực tiếp.
- `linear-reconcile`: sửa bất nhất và dọn legacy bằng preview exact-ID có phê duyệt.

## Work plan v4 và handoff v2

Schema canonical là `schemas/work-plan.schema.json` v4. Nó hỗ trợ:

- native Initiative, Project và Milestone;
- live project status ID/name/category, lifecycle mode, completion criteria, priority/lead/members/start/target;
- outcome, task, decision và parent-child;
- assignee, estimate, cycle, due date, milestone;
- blocked-by, related-to và duplicate-of;
- structured external blocker cho dependency thực sự nằm ngoài issue graph;
- resources, DoR, DoD và role routing.
- delivery contract bắt buộc với mode, owner, target tùy chọn và terminal verification.
- `goal-structure` chỉ tạo Initiative/Project/logical phase/milestone/outcome/decision, không tạo execution task;
- `outcome-decomposition` chỉ chạy khi role claim một outcome và tạo direct children theo parallel waves tối thiểu dependency;
- priority mới bắt buộc `urgent`, `high`, `normal`, hoặc `low`, kèm nguồn explicit/inherited/policy-default;
- terminal verification typed `{ mode, check }` và mode phải khớp delivery contract.

`blockedByKeys` là chiều canonical trong work plan và map sang native Linear
`blockedBy`; chiều `blocks` được suy ra. `relatedToKeys` map sang `relatedTo`,
`duplicateOfKey` map sang `duplicateOf`, và `parentKey` map sang `parentId`. Issue
`Ready` không được còn blocker; issue `Blocked` phải có native blocker hoặc
`externalBlocker` với owner và điều kiện tiếp tục. Xem
`references/issue-relations.md`.

Các delivery mode là `decision`, `artifact-review`, `publish`, `external-action`,
`software-merge`, `production-release` và `operations-change`. Role-phase DoD chỉ
cho phép bàn giao; `Done` còn cần bằng chứng terminal đúng mode. Xem
`references/delivery-lifecycle.md`.

Plan v1-v3 và handoff v1 vẫn được đọc để tương thích; mọi artifact mới phải ghi work
plan v4 và handoff v2. Legacy mutation phải preview migration, giải quyết decisions,
kiểm source hash rồi mới apply; rollback dùng compare-and-swap để không ghi đè thay
đổi độc lập.

## Project status và legacy cleanup

Status report phân biệt issue-count progress với estimated-effort progress, trình
bày Initiative, logical phase, Milestone, outcome, role/delivery queue, blocker,
decision, unknown/stale diagnostics, latest Project Update và
Project lifecycle consistency. Backlog/Planned có execution evidence được đề xuất
chuyển sang live status thuộc category In Progress. Continuous Project tạm hết
outcome vẫn giữ In Progress và yêu cầu CPO chọn outcome tiếp theo; plugin không tự
Completed chỉ vì issue hoặc milestone đạt 100%.

Khi `linear-do-issue` bắt đầu execution trên Project Backlog/Planned, yêu cầu thực
hiện issue cho phép plugin áp dụng transition an toàn sang exact live In Progress
status ID. Completed/Canceled phải có quyền reopen rõ ràng trước khi làm thêm việc.
Chỉ prompt publish/update rõ ràng mới ghi native Project Update với health `on-track`,
`at-risk` hoặc `off-track`.

Cleanup không xóa hàng loạt theo từ khóa. Nó snapshot dữ liệu, phân loại từng exact
ID, bảo toàn nội dung/relations ở entity canonical, yêu cầu duyệt từng hành động phá
hủy, apply rồi re-read. Issue/comment lịch sử không tự động bị xóa chỉ vì “legacy”.

## Cấu trúc plugin

- `skills/`: bốn entry point công khai.
- `references/`: hierarchy, decomposition, execution profile, role routing, policy, software work và cleanup.
- `schemas/`: binding, work plan, handoff, migration, snapshot, project update, cleanup và Git baseline.
- `scripts/`: validator, migration/rollback, snapshot normalizer, renderer, report, hooks, Git guard và local file lock.
- `assets/`: template Initiative, Milestone, outcome/task, brief, PRD và comment.
- `examples/`: binding giả lập để copy vào consumer repository.

Không có daemon, scheduler, CLI package hoặc SQLite claim database. Local lock tại
`.linear-ops/locks/` chỉ chống hai session trên cùng máy cùng xử lý một issue và
không bao giờ xuất hiện trên Linear.

## Thiết lập consumer

Copy `examples/project-binding.example.json` thành `.linear-project-ops.json` ở
repository dự án, thay placeholder bằng project/team/state ID thật và giữ binding
ngoài Git. Kết nối Linear bằng OAuth connector/MCP chính thức của host.

Nếu workspace có custom issue states tương ứng, thêm `readyToDeliver` và
`deliveryVerification` vào `workflow.states` bằng exact live state ID. Nếu không có,
plugin giữ issue ở `In Review` và ghi delivery phase vào handoff/resource đã validate;
không bắt buộc thay workflow Linear hiện hữu.

## Software delivery

Engineer dùng linked worktree riêng với baseline sạch. Trước handoff sang QA, mọi
thay đổi trong scope phải được commit, worktree sạch và evidence trỏ đúng HEAD. QA
review commit/PR/test evidence bất biến, không tiếp quản worktree của engineer. Với
`software-merge`, QA pass chỉ tạo trạng thái merge-ready; issue chỉ `Done` sau khi PR
đã merge, post-merge checks xanh và local delivery state được đóng an toàn. Deploy
production dùng `production-release` với smoke/rollback evidence riêng.

Khi issue chuyển sang trạng thái kết thúc, agent phải đưa primary checkout về
`main`, fast-forward an toàn, rồi dọn worktree/branch local đã merge hoặc có patch
tương đương. Không dùng hook tự động cho bước này vì hook không đủ ngữ cảnh sở hữu
workspace; mọi thay đổi bẩn, chưa push hoặc chưa merge phải được giữ nguyên và báo
rõ.

## Cài cho Claude Code

Từ GitHub Marketplace riêng của plugin:

```sh
claude plugin marketplace add https://github.com/leky90/ldk-linear-project-ops
claude plugin install ldk-linear-project-ops@ldk-linear-project-ops-local --scope user
```

Repository là public, nên các máy khác có thể thêm marketplace mà không cần
quyền GitHub của `leky90`. Tên marketplace giữ là
`ldk-linear-project-ops-local` để tương thích với manifest hiện tại; đây không
phải chỉ báo rằng plugin chỉ cài được local.

Khi phát triển plugin từ checkout cục bộ, có thể dùng đường dẫn local thay cho
URL GitHub:

```sh
claude plugin marketplace add /absolute/path/to/ldk-linear-project-ops
claude plugin install ldk-linear-project-ops@ldk-linear-project-ops-local --scope user
```

Mở session mới sau khi update để Claude nạp lại skill và hook.

## Phát triển và kiểm tra

```sh
npm run check
claude plugin validate --strict .
```

Ngoài ra cần validate bốn skill, JSON Schema và Codex manifest trước khi cài lại.
Không commit binding thật, runtime state, credential, PII hoặc fixture project thật.
