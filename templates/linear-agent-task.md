# [Area] Kết quả cần bàn giao

## Mục tiêu

Mô tả một kết quả độc lập mà một agent có thể hoàn thành.

## Phạm vi

- Bao gồm việc gì.
- Không bao gồm việc gì.
- Quyền truy cập hoặc quyết định nào đã có.

## Acceptance criteria

- Tiêu chí kiểm chứng thứ nhất.
- Tiêu chí kiểm chứng thứ hai.
- Evidence cần nộp trước khi chuyển In Review/Done.

```ldk-agent
{"key":"stable-unique-key","claimable":true,"capabilities":["software.review"],"resources":["repo:exact-conflict-scope"]}
```

Đặt issue ở **Ready** chỉ khi nội dung đã đủ rõ để agent tự thực hiện.
