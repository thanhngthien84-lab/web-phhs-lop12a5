# Bảo vệ dữ liệu — 18/10/2026

Đợt này sửa năm nhóm lỗi của đợt 1 trong REVIEW.md. Không sửa dữ liệu lớp thật để kiểm thử, không tự sửa điểm/sao cũ và không chuyển dữ liệu lần đầu từ phiên trống.

## Hành vi sau bản vá

- Các trường dữ liệu được escape theo ngữ cảnh chữ/thuộc tính/JavaScript. URL ảnh chỉ nhận HTTP(S) hoặc ảnh raster base64; bảng HTML nhập từ Excel được dựng lại bằng danh sách thẻ bảng và thuộc tính colspan/rowspan, không giữ script/sự kiện/liên kết/ảnh nhúng.
- Lỗi ghi localStorage trả thất bại thật. Trạng thái và thông báo không báo lưu thành công; giữ thay đổi trong bộ nhớ, cảnh báo khi đóng trang. Có thể xuất bản nháp hoặc chủ động lưu lên Sheet. Không hứa bản nháp đã bền trên máy trước khi lưu được xác nhận.
- Xuất bản nháp có thêm deviceData cho lịch, chỗ ngồi, công việc và bản nháp điểm đang ở state; phục hồi được các phần này. Đây là nội dung của file sao lưu tải về, không tự đưa cache/bản nháp điểm vào snapshot chung. Không xuất mã quản trị/token.
- Học sinh → sửa → **Ngừng theo dõi** thay thao tác xóa. Dữ liệu điểm và lịch sử nằm trong snapshot chung cùng cờ lưu trữ. Tải lại danh sách không tự đưa học sinh trở lại. Nút **Học sinh đã lưu trữ** cho khôi phục theo dõi và giữ số dư/lịch sử.
- Lưu trữ chỉ áp dụng danh sách theo dõi của ứng dụng quản lý. Giữ hàng gốc HOC_SINH và các bảng học tập; không thu hồi mã PHHS hoặc xóa điểm. Trạng thái lưu trữ chỉ có hiệu lực trên thiết bị khác sau khi Sheet xác nhận snapshot mới. Không tự hoàn thành hồ sơ đồng hành khi lưu trữ học sinh.
- Mỗi ghi nhận điểm mới lưu starsDelta thực tế. Hoàn tác giữ bản gốc và thêm giao dịch đảo; các báo cáo rèn luyện bỏ bản đã hoàn tác và giao dịch đảo khỏi số lần vi phạm.
- Ghi nhận cũ chưa có starsDelta: hộp xác nhận nói rõ chỉ hoàn điểm, giữ nguyên sao vì không biết mức sao thực tế đã thay đổi. Không tự suy đoán hay sửa hàng loạt dữ liệu cũ.
- Nếu sao thưởng đã được sử dụng, không hoàn tác để tạo số sao âm. Ghi nhận trước lần đặt lại số dư không tự thay số dư hiện tại; cần tạo điều chỉnh mới.

## Backend ghi điểm

Deployment đang dùng đã cập nhật lên **version 31**, giữ nguyên URL và quyền hiện có. Nguồn đầy đủ là web12a5-reference/Code.gs; bản trong checkout phát hành có cùng nội dung.

1. Kiểm tra tất cả điểm, mã HS trùng/không tồn tại, môn, ngày hợp lệ, độ dài nội dung trước khi sửa sổ điểm.
2. Chuẩn bị vùng dữ liệu và ghi bản trước vào **SAO_LUU_GHI_DIEM** theo phiên/chunk JSON. Bản sao chứa ô, công thức, ghi chú và định dạng.
3. Ghi vùng theo lô, giữ định dạng mã học sinh dạng chữ. Tiêu đề do người dùng nhập không được biến thành công thức Sheet.
4. Nếu bước ghi/đọc xác nhận gặp lỗi, khôi phục bản trước trong cùng khóa máy chủ.
5. Nếu quá trình bị ngắt hoặc phục hồi cũng lỗi, giữ phiên pending/recovery-needed; chặn các lượt ghi điểm tiếp theo, lưu trữ/khôi phục bài kiểm tra và đọc điểm qua các endpoint được bảo vệ cho đến khi phục hồi.
6. Học tập → **Kiểm tra / phục hồi lần lưu điểm** đọc trạng thái và cho GVCN xác nhận phục hồi phiên lỗi. Không phục hồi bản committed tùy ý hoặc ghi đè phiên lỗi khác mã.

Không tuyên bố SpreadsheetApp là giao dịch ACID. Thiết kế dùng kiểm tra trước, bản sao bền, khóa, rollback và cơ chế chặn/phục hồi khi Apps Script kết thúc bất ngờ. Không xóa hoặc sửa trực tiếp SAO_LUU_GHI_DIEM; chưa có cơ chế tự cắt lịch sử trong đợt này.

Bản mã trước cập nhật: output/class-hub-live-before-protection-20261018.gs. Có thể chuyển deployment về version 30 khi cần; không xóa bảng dữ liệu/bản sao để rollback mã.

## Kiểm thử

- node test-data-protection-backend.cjs: dữ liệu sai không ghi ô nào; ngày/mã trùng; sao lưu; lỗi giữa lượt ghi; rollback; lỗi rollback và chặn ghi; phục hồi đúng phiên; chống công thức từ tiêu đề; điểm 0 và mã số 0 đầu.
- node test-data-protection-browser.cjs: hoàn tác đúng sao, bản cũ, lịch sử được giữ, lưu trữ/khôi phục qua thiết bị khác; HTML nguy hiểm ở các màn, ảnh/Excel/toast, ID có dấu nháy; hết dung lượng; xuất/nhập bản nháp điểm và việc trên máy.
- Các bộ test-class-hub, test-class-hub-rules, test-home-results, test-homework-publisher và test-class-hub-browser phải tiếp tục chạy qua.

Các vấn đề ngoài đợt 1 (cache điểm dùng chung, đồng bộ lịch/chỗ ngồi, chống xung đột sổ điểm, phân quyền nhiều danh tính, parser lịch) vẫn theo báo cáo review, chưa được coi là đã xử lý.
