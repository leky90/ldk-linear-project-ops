# [Step] Kết quả nguyên tử

## Parent outcome

Nêu parent issue và vai trò của bước này trong kết quả tổng thể.

## Phạm vi

- Một deliverable duy nhất.
- Có thể hoàn thành trong một scheduled run khoảng 30–60 phút.
- Không lặp scope/resource với sub-issue khác trừ khi cần khóa tuần tự.

## Acceptance criteria

- Kết quả có thể kiểm chứng độc lập.
- Có URI evidence trước khi chuyển Done.

```ldk-agent
{"key":"parent-key-atomic-step","kind":"sub-issue","claimable":true,"capabilities":["software.review"],"resources":["repo:exact-child-scope"]}
```
