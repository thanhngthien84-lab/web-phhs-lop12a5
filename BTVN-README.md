# Đăng bài tập về nhà

- Trang cả lớp và học sinh phụ trách: `btvn.html`.
- Quản lý GVCN: `btvn.html?admin=1`, hoặc Cài đặt → Người đăng BTVN.
- GVCN nhập mã quản trị hiện có, chọn một học sinh và đặt mã riêng 8–32 chữ/số. Cấp lại hoặc thu hồi sẽ vô hiệu hóa phiên cũ ngay.
- Học sinh bấm Đăng bài, nhập mã riêng, có thể nhớ phiên 30 ngày trên thiết bị cá nhân. Đăng nhập mới kết thúc phiên cũ.
- Học sinh chỉ sửa bài do mình đăng; GVCN sửa/gỡ/khôi phục từ lịch sử.
- Không thay đổi dữ liệu đánh giá hoàn thành BTVN, điểm số hoặc điểm danh.

## Backend

`HomeworkPublisher.gs` là phần bổ sung cho backend Apps Script hiện có (dùng `assertAdminKey`, `getClassList`, `output`). Trong `doGet`, bên trong `try`, trước các nhánh cũ, thêm:

```js
if (mode.indexOf("hw-") === 0) return output(hwPublishHandle(parameters), callback);
```

Cập nhật phiên bản triển khai đang dùng, giữ nguyên URL. Phần bổ sung đã được triển khai vào dự án hiện tại. Không dán thêm lần nữa nếu các hàm `hwPublish*` đã tồn tại.

Thuộc tính `HW_PUBLISHER_V1` lưu duy nhất một người phụ trách, băm mã riêng và băm token phiên. Không đưa mã thật vào repository. Sheet `BTVN_GIAO_BAI` được tạo khi có bài đầu tiên, lưu lịch sử sự kiện JSON; không chỉnh tay cấu trúc sheet này.

## Kiểm thử

Chạy `node test-homework-publisher.cjs` trong thư mục repository. Dùng dữ liệu giả lập, không cấp quyền hoặc đăng bài thử vào lớp thật. Kiểm tra xác thực, thu hồi, giới hạn người đăng, quyền sửa, chống ghi đè và lịch sử khôi phục.
