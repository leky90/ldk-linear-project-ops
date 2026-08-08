# LDK Linear Project Ops · RoleFlow

Plugin dùng chung cho Codex và Claude Code để quản lý và thực hiện công việc trên
Linear như một tổ chức thật: chiến lược được đặt ở đúng tầng, mỗi issue có vai trò
chịu trách nhiệm, và mỗi giai đoạn kết thúc bằng một bàn giao dễ review.

Repository này chỉ chứa source và gói cài đặt plugin. Nó không gắn với project
Linear cụ thể, không chứa lịch sử vận hành của LDKTech Solutions và không cần
`LINEAR_API_KEY` khi host đã kết nối Linear qua OAuth.

## Mô hình dữ liệu Linear

```text
Native Initiative  — mục tiêu chiến lược liên project
        ↓
Project            — một chương trình/sản phẩm có owner và target date
        ↓
Milestone          — cột mốc kết quả quan trọng trong project
        ↓
Outcome issue      — kết quả lớn cần Tech Lead phân rã
        ↓
Task / Decision    — deliverable của một vai trò hoặc quyết định cần chốt
```

Milestone biểu diễn kết quả kiểm chứng được như “Public beta ready”, không dùng để
thay phòng ban, sprint hay các bước nội bộ. Cycle là nhịp thực thi ngắn hạn; estimate
là effort; due date là cam kết riêng của issue. Xem `references/linear-hierarchy.md`
và `references/planning-properties.md`.

## RoleFlow

```text
CPO tạo Initiative/Project/brief/PRD/outcome
        ↓
Tech Lead làm rõ outcome và tạo task theo vai trò
        ↓
Engineer, Writer, Marketer, Sales… tạo deliverable
        ↓
QA/Lead/Director review DoD và evidence
        ↓
Done hoặc trả về Ready kèm findings
```

Một issue khai báo outcome, deliverable, `ownerRole`, `reviewerRole`, DoR, DoD,
resources, relations và planning properties cần thiết. Câu lệnh thường dùng vẫn là:

```text
Hãy thực hiện issue LDK-123
```

Plugin tự đọc live state và thực hiện đúng một role phase:

- `Refinement`: làm rõ hoặc phân rã outcome;
- `Ready`: owner thực hiện rồi bàn giao `In Review`;
- `In Review`: reviewer nghiệm thu, chuyển `Done` hoặc trả `Ready`;
- `Blocked`: ghi blocker, ảnh hưởng, người cần xử lý và điều kiện tiếp tục;
- `Done`: không thực hiện lại nếu không có yêu cầu mở lại rõ ràng.

## Bốn skill công khai

- `linear-create-work`: preview/apply native hierarchy, resources và role-ready issues.
- `linear-do-issue`: thực hiện một issue theo vai trò và trạng thái hiện tại.
- `linear-project-status`: báo cáo read-only hoặc publish native Project Update khi
  người dùng yêu cầu trực tiếp.
- `linear-reconcile`: sửa bất nhất và dọn legacy bằng preview exact-ID có phê duyệt.

## Work plan v2

Schema canonical là `schemas/work-plan.schema.json` v2. Nó hỗ trợ:

- native Initiative, Project và Milestone;
- project status/priority/lead/members/start/target;
- outcome, task, decision và parent-child;
- assignee, estimate, cycle, due date, milestone;
- blocked-by, related-to và duplicate-of;
- resources, DoR, DoD và role routing.

Plan v1 vẫn được đọc trong một phiên bản chuyển tiếp; mọi plan mới phải ghi v2 và
map issue-level `initiative` cũ thành `outcome`.

## Project status và legacy cleanup

Status report phân biệt issue-count progress với estimated-effort progress, trình
bày Initiative, Milestone, role queue, blocker, decision và latest Project Update.
Chỉ prompt publish/update rõ ràng mới ghi native Project Update với health `on-track`,
`at-risk` hoặc `off-track`.

Cleanup không xóa hàng loạt theo từ khóa. Nó snapshot dữ liệu, phân loại từng exact
ID, bảo toàn nội dung/relations ở entity canonical, yêu cầu duyệt từng hành động phá
hủy, apply rồi re-read. Issue/comment lịch sử không tự động bị xóa chỉ vì “legacy”.

## Cấu trúc plugin

- `skills/`: bốn entry point công khai.
- `references/`: hierarchy, role routing, policy, software work và cleanup.
- `schemas/`: binding, work plan, handoff, project update, cleanup và Git baseline.
- `scripts/`: validator, renderer, report, hooks, Git guard và local file lock.
- `assets/`: template Initiative, Milestone, outcome/task, brief, PRD và comment.
- `examples/`: binding giả lập để copy vào consumer repository.

Không có daemon, scheduler, CLI package hoặc SQLite claim database. Local lock tại
`.linear-ops/locks/` chỉ chống hai session trên cùng máy cùng xử lý một issue và
không bao giờ xuất hiện trên Linear.

## Thiết lập consumer

Copy `examples/project-binding.example.json` thành `.linear-project-ops.json` ở
repository dự án, thay placeholder bằng project/team/state ID thật và giữ binding
ngoài Git. Kết nối Linear bằng OAuth connector/MCP chính thức của host.

## Software delivery

Engineer dùng linked worktree riêng với baseline sạch. Trước handoff sang QA, mọi
thay đổi trong scope phải được commit, worktree sạch và evidence trỏ đúng HEAD. QA
review commit/PR/test evidence bất biến, không tiếp quản worktree của engineer.
Merge/deploy chỉ xảy ra khi issue/DoD và quyền được giao yêu cầu rõ ràng.

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
