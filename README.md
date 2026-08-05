# LDK Linear Project Ops

Plugin dùng chung cho Codex và Claude Code để làm việc trên Linear như một thành
viên trong tổ chức: đọc issue, nhận biết vai trò và trạng thái hiện tại, thực hiện
đúng một giai đoạn công việc, rồi bàn giao cho vai trò tiếp theo bằng comment dễ
đọc với con người.

Repository này chỉ chứa mã nguồn và gói cài đặt plugin. Nó không gắn với một
project Linear cụ thể và không chứa dữ liệu vận hành của LDKTech Solutions.

## Mô hình làm việc

```text
CPO tạo brief/PRD
        ↓
Tech Lead phân tích và tạo task triển khai
        ↓
Software Engineer phát triển, commit, PR
        ↓
QA review DoD và bằng chứng
        ↓
Done hoặc trả về Ready cho vai trò cần sửa
```

Luồng tương tự áp dụng cho content, marketing và sales. Mỗi issue khai báo:

- kết quả mong muốn và sản phẩm bàn giao;
- `ownerRole` và `reviewerRole`;
- Definition of Ready (DoR) và Definition of Done (DoD);
- resources và dependencies;
- một trạng thái Linear chuẩn.

Lệnh sử dụng thông thường chỉ cần:

```text
Hãy thực hiện issue LDK-123
```

Plugin tự đọc state, role, resources, DoR/DoD và chọn hành vi:

- `Ready`: vai trò owner thực hiện và bàn giao sang `In Review`;
- `In Review`: reviewer nghiệm thu; đạt thì `Done`, cần sửa thì về `Ready`;
- `Blocked`: ghi rõ nguyên nhân, ảnh hưởng, ai cần xử lý và điều kiện tiếp tục;
- `Refinement`: làm rõ phạm vi; Tech Lead có thể tạo task con nếu đó là sản phẩm
  bàn giao cần một vai trò khác thực hiện.

## Bốn skill công khai

- `linear-create-work`: tạo resources và issue theo vai trò từ brief/PRD/brainstorm.
- `linear-do-issue`: thực hiện issue theo vai trò và trạng thái hiện tại.
- `linear-project-status`: báo cáo hàng đợi, review, blocker và tiến độ theo vai trò.
- `linear-reconcile`: sửa một bất nhất cụ thể; không dùng cho công việc bình thường.

## Cấu trúc plugin

- `skills/`: bốn workflow công khai.
- `references/`: mô hình vai trò, routing, comment, authority và software work.
- `schemas/`: project binding, work plan, handoff và Git baseline.
- `scripts/`: validator, comment renderer, report, hook, Git guard và file lock nội bộ.
- `assets/`: template issue, brief, PRD, handoff, review, blocked và status.
- `examples/`: binding giả lập để copy vào consumer repository.

Không còn package CLI `linear-claim-lock` hay SQLite. Khóa chống hai agent xử lý
cùng issue là chi tiết runtime nội bộ tại `.linear-ops/locks/`, bị Git ignore và
không được ghi lên Linear.

## Thiết lập consumer

Copy `examples/project-binding.example.json` thành `.linear-project-ops.json` tại
repository dự án, thay các ID placeholder bằng project/team/state ID thật và giữ
file này ngoài Git. Kết nối Linear qua OAuth connector/MCP chính thức của host;
plugin không cần `LINEAR_API_KEY` và không tự cài API client.

Schema v1 cũ vẫn được đọc trong giai đoạn chuyển tiếp. Runtime bỏ qua SQLite,
claim telemetry và software gate arrays của schema cũ; nên migrate sang schema v2
khi chỉnh binding tiếp theo.

## Software delivery

Worktree Git riêng chỉ được tạo ở giai đoạn `software-engineer`. Baseline sạch ghi
nhận repository, worktree, branch và commit trước khi sửa. Trước khi bàn giao sang
QA, plugin yêu cầu toàn bộ thay đổi trong scope đã commit, worktree sạch và evidence
trỏ đúng HEAD. QA review commit/PR/test evidence bất biến, không tiếp quản worktree
đang chạy của engineer. Merge hoặc deploy chỉ thực hiện khi issue/DoD và quyền được
giao yêu cầu điều đó.

## Cài cho Claude Code

```sh
claude plugin marketplace add /absolute/path/to/ldk-linear-project-ops
claude plugin install ldk-linear-project-ops@ldk-linear-project-ops-local --scope user
```

Kết nối Linear OAuth theo connector hoặc MCP chính thức đã có trong host. Mở session
mới sau khi update plugin để Claude nạp lại skill và hook.

## Phát triển và kiểm tra

```sh
npm run check
claude plugin validate --strict .
```

Ngoài ra cần validate bốn skill, JSON Schema và Codex manifest trước khi cài lại.
Không commit binding thật, issue history, runtime lock, credential hoặc PII.
