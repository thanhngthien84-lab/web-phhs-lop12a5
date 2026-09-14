# Phân quyền GVBM — bản thử nghiệm riêng

## Trạng thái

Đã viết trang nhập điểm, giao diện cấp/thu hồi quyền theo Gmail/môn, và kiểm tra quyền phía máy chủ. Chưa triển khai vào web thật. Không thay đổi index.html, saas.html, quyền chia sẻ Drive hoặc dữ liệu 12A5.

GVBM đăng nhập bằng Google (Gmail), không biết mã quản trị và không được cấp quyền truy cập cả Sheet. GVCN tạm dùng mã quản trị hiện có để quản lý quyền; đăng nhập Google cho GVCN và BTVN không thuộc bản này.

## Thử trên dữ liệu bản sao

1. Sao chép Google Sheet 12A5 thành file thử nghiệm RIÊNG, để quyền chia sẻ Restricted. Không chạy saas.html để chuẩn bị file (luồng đó có thể tự chia sẻ file công khai).
2. Mở Apps Script của bản sao. Dùng Code.gs và thêm TeacherAccess.gs từ nhánh này. Không để trùng hàm doPost với mã khác.
3. Script Properties:
   - ADMIN_SYNC_KEY: mã quản trị riêng của bản thử nghiệm.
   - GVBM_ENABLED: true (mặc định thiếu thuộc tính này là tắt).
   - GVBM_GOOGLE_CLIENT_ID: 463948005776-r1khed2hpi7t4jk1n44bopnhg58lcn03.apps.googleusercontent.com
4. Triển khai Web app riêng, thực thi bằng tài khoản chủ bản sao, cho phép người dùng truy cập endpoint. Quyền xem/sửa dữ liệu vẫn do backend kiểm tra; không chia sẻ Sheet cho Anyone.
5. Phục vụ teacher.html qua HTTPS ở origin đã đăng ký trong Google OAuth, hoặc localhost được đăng ký. Client ID trong HTML và Script Properties phải giống nhau. Không mở HTML bằng file://.
6. GVCN mở teacher.html?manage=1, nhập URL /exec thử nghiệm, nhập mã quản trị. Điền Gmail, chọn môn và Lưu quyền. Không có Gmail nào được cấp sẵn.
7. GVBM mở teacher.html (không có manage=1), nhập cùng URL thử nghiệm, đăng nhập bằng Gmail được cấp quyền. Không dùng mã quản trị ở trang GVBM.
8. Thử tạo bài, dán một cột điểm từ Excel (đúng thứ tự học sinh), lưu, tải lại và đối chiếu Sheet. Thử thu hồi quyền ở trang GVCN và xác nhận GVBM không thể tải/lưu tiếp.

## Trước khi đưa vào dùng thật

- Chưa kiểm thử tích hợp OAuth thật, CORS/redirect POST Google Apps Script, cấu hình origin, quota và đồng thời trên triển khai của giáo viên.
- Bản thử dùng Google tokeninfo để kiểm chứng ID token và kiểm tra aud/iss/exp/email_verified. Google mô tả tokeninfo dành cho phát triển/debug; cần thay bằng xác thực ID token qua thư viện Google/JWT được hỗ trợ ở backend trước khi phát hành sản phẩm. Không tự giải mã JWT rồi tin email.
- Chỉ Gmail được hỗ trợ; Google Workspace chưa được bật.
- Không đưa mã quản trị, ID token vào URL hoặc localStorage. Phân quyền lưu trong Script Properties, không gửi danh sách quyền cho GVBM.
- Lỗi mạng khi lưu có thể là đã ghi nhưng chưa nhận phản hồi: tải lại để kiểm tra trước khi thử lưu lần nữa; không tự động gửi lại thao tác ghi.
- Không merge/triển khai lên dữ liệu thật trước khi hoàn thành các kiểm tra trên. Giữ nguyên link PHHS cũ.

## Kiểm tra tự động

Chạy node access.test.cjs với Code.gs, TeacherAccess.gs và teacher.html cùng thư mục.
Bao gồm: lỗi token, sai audience/issuer/hết hạn/email; từ chối người chưa cấp quyền; lọc điểm theo môn; chặn giả mạo mã bài môn khác; dữ liệu điểm sai; quyền GVCN; thu hồi quyền; cờ tắt tính năng.

Tài liệu xác thực: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

