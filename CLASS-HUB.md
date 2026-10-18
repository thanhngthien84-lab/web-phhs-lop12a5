# Dữ liệu chung của trang quản lý 12A5

Trang quản lý vẫn dùng Apps Script và Google Sheet của lớp 12A5. Cổng PHHS độc lập và dự án nhiều giáo viên không đổi.

## Chức năng

- Học sinh, Tổ thi đua và hồ sơ học sinh có nút ghi nhận thi đua / đồng hành. Học tập có liên kết quản lý người đăng BTVN. Danh mục quà nằm tại Quà tặng.
- Trạm đồng hành dùng `studentCode`, chuyển tiếp hồ sơ cũ khi ghép được mã. Hồ sơ chưa ghép được vẫn giữ và cho sửa. Có mục tiêu, ngày đánh giá, nhật ký, hoàn thành và mở lại. Không xóa hồ sơ hoàn thành.
- Tuyên dương tính từ lịch sử thật. Thi đua là điểm cộng trừ ròng trong kỳ; tiến bộ rèn luyện là chênh lệch điểm ròng giữa hai kỳ có dữ liệu, so cùng phần kỳ đã qua. Học tập dùng hai ngày kiểm tra gần nhất cùng môn trong sổ điểm đã lưu, bỏ ô trống và điểm ngoài 0–10. Giáo viên duyệt lý do; bằng chứng tại thời điểm duyệt được giữ nguyên. Thu hồi giữ bản ghi.
- Gợi ý đồng hành dùng dữ liệu đã tải: từ 3 ghi nhận trừ điểm, 2 lần nghỉ không phép, 3 BTVN chưa đủ hoặc có điểm dưới 5 trong kỳ. Chưa tải đủ điểm/BTVN thì có thông báo; không tự quyết định lập hồ sơ.
- Đổi quà có lịch sử, tôn trọng cấu hình trừ sao và không trừ điểm thi đua.
- Cài đặt còn thông tin chung, quy tắc, dữ liệu và thao tác đặc biệt. Đặt lại số dư không xóa lịch sử. Sao lưu/phục hồi bản dữ liệu chung hỗ trợ JSON.

## Backend và triển khai

1. Dùng **toàn bộ Code.gs trong bản này**, có đầy đủ chức năng 5 chữ số, giới hạn nhập sai, ghi nhận truy cập PHHS, điểm TB lớp, điểm danh và học tập. Không thay bằng Code.gs rút gọn ở workspace gốc. Giữ HomeworkPublisher.gs của deployment hiện tại.
2. Cập nhật phiên bản của deployment hiện có, giữ URL:
   `https://script.google.com/macros/s/AKfycbxAOm6rvHIUbC1jq8oCY5yGVLT4y8Wp9J250Yl9lQfK1D1m4zIN7OnHahw3bKzE2nTC/exec`
3. Frontend cần index.html và ba tệp class-hub-model.js, class-hub.js, class-hub.css; giữ home-results.js và teacher-*. Không đưa dữ liệu thử, ảnh kiểm thử hoặc credential lên repo.
4. Dùng cùng mã quản trị đã cấu hình (`ADMIN_SYNC_KEY`). Ba mode hub-read / hub-stage / hub-commit đều kiểm tra mã ở máy chủ. Không thêm quyền công khai đọc dữ liệu lớp.
5. Sau lần đọc đầu tiên, nếu Sheet chưa có dữ liệu chung, người dùng bấm **Chuyển dữ liệu máy lên Sheet** trên thiết bị đang có dữ liệu đầy đủ nhất. Không tự tải dữ liệu cũ lên. Trước bước này nên xuất bản nháp.

## Lưu trữ và xung đột

- `DU_LIEU_LOP`: JSON chia phần, mỗi ô có tiền tố JSON: để dữ liệu người dùng không trở thành công thức.
- `DONG_BO_LOP`: chỉ mục các phiên bản đã ghi đầy đủ. Ghi các phần trước, flush, rồi ghi chỉ mục. Phần chưa có chỉ mục không được đọc làm bản hiện tại. Không chỉnh trực tiếp hai bảng này.
- Upload được chia thành gói nhỏ trong cache, chỉ commit sau khi đủ gói. Lock máy chủ và kiểm tra phiên bản ngăn hai thiết bị âm thầm ghi đè nhau. Mã phiên lưu giúp commit idempotent.
- Chỉ báo lưu lên Sheet sau xác nhận. Sau lỗi không tự thử lại. Khi chưa rõ kết quả, đọc lại Sheet trước. Nếu khác nhau: xuất bản nháp rồi chọn dùng bản Sheet hoặc bản máy. Bản Sheet cũ có lịch sử; trước khi nạp bản khác còn có bản sao trên máy.
- Snapshot chứa thi đua, sao, lịch sử, dữ liệu đồng hành, tuyên dương, đổi quà, nhóm, danh mục, tiêu chí và cấu hình. Không chứa khóa quản trị/token/lookup code/điện thoại. Danh sách và nhận dạng chính vẫn ở HOC_SINH. Sổ điểm, điểm danh, BTVN và nhận xét vẫn ở các bảng nguồn đang có, không ghi đè bằng snapshot.
- Ghi chú đồng hành và tuyên dương chưa được công bố sang cổng PHHS. Không tự thông báo hay gửi nội dung cho phụ huynh.
- Lịch sử snapshot hiện được giữ theo lần lưu, chưa tự cắt lịch sử. Dữ liệu ảnh lớn nên dùng URL thay vì nhúng ảnh dung lượng cao; tối đa 1,5 triệu ký tự JSON cho một bản lưu.

## Kiểm thử

`node test-class-hub.cjs`: thời gian Việt Nam, tính điểm thật, adapter sổ điểm, BTVN bổ sung, ghép mã, xác thực backend, commit nguyên tử, idempotency và xung đột.

`node test-class-hub-browser.cjs`: Edge headless, dữ liệu giả lập và chặn dịch vụ thật; kiểm tra chuyển tiếp hồ sơ, hoàn thành, duyệt tuyên dương, thay đổi trong lúc lưu, thiết bị thứ hai, lỗi lưu, xung đột, đổi quà, điện thoại và cách ly cổng PHHS.

`node test-homework-publisher.cjs` từ thư mục repo: giữ luồng quyền BTVN đang có.

## Tùy chỉnh tiêu chí

Vào Đồng hành & Tuyên dương → chọn tab → Thiết lập tiêu chí. Mỗi tab chỉ sửa tiêu chí của phần đó. Có thể bật/tắt từng điều kiện và sửa ngưỡng. Trạm hỗ trợ đạt ít nhất một / đạt tất cả tiêu chí đang bật; tắt mọi tiêu chí sẽ không gợi ý. Tuyên dương cho chỉnh mức điểm/mức tăng, số ghi nhận hoặc số môn cần so sánh, bật/tắt hạng mục và giới hạn số đề xuất hiển thị.

Xem trước danh sách chỉ đọc dữ liệu đã tải, không lưu cấu hình hoặc tạo hồ sơ. Điền tiêu chí mặc định chỉ điền biểu mẫu, cần bấm Lưu tiêu chí mới áp dụng. Cấu hình được lưu trong settings.hubRules qua snapshot đang có; không cần đổi backend phiên bản 30 hoặc chuyển dữ liệu lần đầu lại. Dữ liệu cũ giữ các ngưỡng đã lưu; phạm vi điểm kiểm tra chưa được cấu hình dùng 4 tuần gần nhất. Hồ sơ và tuyên dương đã duyệt giữ nguyên; các lần duyệt mới lưu kèm bộ tiêu chí tại thời điểm duyệt.

Kiểm thử thêm: node test-class-hub-rules.cjs. Bộ kiểm thử trình duyệt có kiểm tra xem trước không ghi dữ liệu, lưu thay đổi tác động đến đề xuất và cấu hình được đọc lại trên thiết bị thứ hai.

## Tiêu chí tự thêm và dữ liệu điểm

Nút + Thêm tiêu chí ở mỗi phần cho tạo tên và điều kiện riêng: chọn dữ liệu (điểm, thi đua, điểm danh, BTVN, tiến bộ, hoàn thành đồng hành), phép so sánh, giá trị, môn, thời gian và từ khóa thi đua. Mỗi phần tối đa 50 tiêu chí; có thể bật/tắt, sửa và bỏ khỏi biểu mẫu rồi Lưu tiêu chí. Đồng hành kết hợp cả tiêu chí sẵn có và tự thêm theo một/tất cả. Mỗi tiêu chí Tuyên dương tạo một hạng mục riêng; lịch sử đã duyệt giữ tên và bằng chứng dù sau này bỏ tiêu chí. Không suy ra điểm trung bình 0 hoặc thành tích không vi phạm khi chưa có bằng chứng.

Trạm, Tuyên dương và trang tiêu chí tự đọc bảng điểm/BTVN qua quyền quản trị hiện có, tối đa một lần mỗi phút khi mở trang. Nút Tải điểm và BTVN mới nhất cho đọc lại ngay. Dùng bản đọc riêng, không ghi đè sổ điểm và bản nháp đang nhập. Không đưa cache nguồn vào snapshot dữ liệu chung. Lỗi nguồn hiển thị rõ và giữ dữ liệu đã đọc trước.

Điểm kiểm tra thấp có phạm vi riêng: mặc định 4 tuần gần nhất, hoặc kỳ đang chọn, hoặc toàn bộ lịch sử đến hôm nay. Thống kê hiển thị số điểm, số bài dưới ngưỡng trong/ngoài kỳ và số bài thiếu ngày hợp lệ. Điểm tương lai, trống, sai thang 0–10 hoặc thiếu ngày không tạo gợi ý. Các tiêu chí đếm được tính theo từng học sinh. Hệ thống tự tạo gợi ý; giáo viên vẫn duyệt/lập kế hoạch trước khi thành hồ sơ đồng hành và duyệt trước khi thành tuyên dương.

## Bố trí giao diện 18/10/2026

- Gỡ Lịch báo giảng và Sổ theo dõi khỏi menu máy tính, điện thoại và lối tắt; các route cũ quay về Trang chủ. Dữ liệu cũ không bị xóa.
- Một mục Đồng hành & Tuyên dương mở hai tab. Các nút Trang chủ/Hồ sơ vẫn đi thẳng đúng tab. Nội bộ giữ route tram-dong-hanh và xep-hang để tương thích.
- Thiết lập tiêu chí ngay trong từng tab. Lưu/điền mặc định chỉ áp dụng phần đang sửa, giữ tiêu chí của tab còn lại. Nút menu hoặc Quay lại danh sách đóng trình chỉnh.
- Cài đặt chỉ có Thông tin lớp & giao diện, Kết nối & sao lưu, Nâng cao. Nâng cao thu gọn công cụ đặt lại số dư; khôi phục bản trước khi tải Sheet ở Kết nối & sao lưu.
- Tổ thi đua có Quy tắc thi đua và Xuất báo cáo thi đua. Quà tặng có danh mục, lịch sử, quy tắc đổi quà. Học tập có quản lý người đăng BTVN và Xuất báo cáo học tập.
- Báo cáo PDF dùng dữ liệu thật đã tải: thi đua trong kỳ; học tập gồm toàn bộ điểm có ngày hợp lệ đến hôm nay, trung bình cộng tham khảo và số bài dưới 5. Không thay điểm tổng kết học kỳ bằng trung bình tham khảo.

## Bảo vệ dữ liệu 18/10/2026

Xem DATA-PROTECTION.md: backend v32 thêm journal SAO_LUU_GHI_DIEM và phục hồi; giao diện escape dữ liệu, báo lỗi lưu cục bộ thật, lưu trữ/khôi phục học sinh và hoàn tác theo starsDelta thực tế. File xuất bản nháp có thêm deviceData (bao gồm điểm chưa lưu) để phục hồi trên máy, không đưa các cache này vào snapshot dùng chung. Lưu trữ không xóa hàng HOC_SINH hoặc thu hồi mã PHHS.
