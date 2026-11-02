# SPFF - Ứng Dụng Hỗ Trợ Tài Xế: Định Vị Kho Bãi & Voice Chỉ Đường

Dự án mã nguồn mở hỗ trợ cộng đồng tài xế giao nhận hàng: đánh dấu vị trí cổng kho, thu âm chỉ dẫn ngõ ngách, dẫn đường trực tiếp Google Maps, upvote/downvote và donate cảm ơn qua VietQR.

---

## 🚀 Hướng Dẫn Kích Hoạt Database Supabase (1 Bước Duy Nhất)

1. Mở trang quản trị Supabase tại dự án của bạn: [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Chọn menu **SQL Editor** ở thanh điều hướng bên trái.
3. Mở file [supabase/schema.sql](file:///home/lee/projects/spff/supabase/schema.sql) trong dự án này, copy toàn bộ nội dung và dán vào ô SQL Editor.
4. Bấm nút **Run** (Chạy).
5. Trong mục **Storage** của Supabase, đảm bảo các bucket sau đã được tạo ở chế độ Public:
   - `voice-notes` (Public read, Authenticated upload)
   - `avatars` (Public read, Authenticated upload)
   - `incident-photos` (Public read, Authenticated upload)
   - `warehouse-images` (Public read, Authenticated upload)

> [!TIP]
> Nếu dự án đã kích hoạt trước đó, bạn chỉ cần copy và chạy file [supabase/migration_incidents.sql](file:///home/lee/projects/spff/supabase/migration_incidents.sql) trong SQL Editor để cập nhật bảng Incidents và cột ảnh kho.

---

## 🛠️ Biến Môi Trường (.env.local)

Đã được cấu hình tự động:
```env
NEXT_PUBLIC_SUPABASE_URL=https://knavhrrvszbtfvzfzfge.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_P5I37NcGa9rbotvLwbk5nA_ntamsxj9
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_P5I37NcGa9rbotvLwbk5nA_ntamsxj9
```

---

## 📦 Chạy Môi Trường Phát Triển (Development)

```bash
# Khởi động ứng dụng Next.js
npm run dev
```

Mở trình duyệt tại [http://localhost:3000](http://localhost:3000).

---

## 📱 Các Tính Năng Đã Triển Khai Theo PLAN.md

- **Trang chủ (`/`)**: 
  - Tự động lấy vị trí GPS hiện tại của tài xế.
  - Tính khoảng cách Haversine chuẩn km đến các kho.
  - Bản đồ Leaflet OpenStreetMap với marker GPS nhấp nháy và các ghim kho số 1-5.
  - Danh sách Top 5 kho gần nhất với 2 nút thao tác 1 chạm: **"Đi ngay (G-Maps)"** và **"Nghe chỉ dẫn"**.
- **Báo cáo sự cố khẩn cấp SOS (`/incidents`, `/incidents/new`, `/incidents/[id]`)**:
  - Hỗ trợ các tình huống khẩn cấp: hỏng xe, hết xăng, nổ lốp, chết bình ắc quy, va chạm...
  - **Bắt buộc chụp ảnh hiện trường thực tế** để chứng minh sự cố, nén ảnh tự động client-side để tiết kiệm mạng 4G.
  - Tự động đo khoảng cách GPS thời gian thực tới các đồng nghiệp ở gần.
  - **Cơ chế tương trợ**: Bác tài nhìn thấy có thể chọn **hỗ trợ** (nhập ETA thời gian đến, lời nhắn đồ nghề) hoặc **bỏ qua**.
  - Dẫn đường Google Maps 1 chạm và gọi điện thoại thoại trực tiếp cho người gặp sự cố hoặc người trợ giúp.
  - Đánh dấu marker sự cố nhấp nháy màu đỏ 🚨 trực tiếp trên bản đồ Trang chủ kèm banner cảnh báo sự cố xung quanh.
- **Ghim kho mới & Chụp ảnh cổng kho (`/warehouse/new`, `/warehouse/[id]`)**:
  - Tích hợp tính năng **chụp ảnh trực tiếp bằng camera điện thoại** hoặc chọn ảnh từ thư viện cho cổng bến bãi, biển hiệu.
  - Tự động nén ảnh chất lượng cao và hiển thị ảnh thực tế tại trang chi tiết kho, xem phóng to toàn màn hình.
  - Hiển thị huy hiệu "Ảnh thực tế" và thumbnail trên danh sách kho gần nhất và bản đồ.
- **Chi tiết kho & Thu âm Voice (`/warehouse/[id]`)**:
  - Thu âm micro trực tiếp với thanh sóng âm thanh và đếm ngược tối đa 60s.
  - Nghe lại thử trước khi đăng. Upload trực tiếp lên Supabase Storage `voice-notes`.
  - Upvote / Downvote cộng/trừ điểm uy tín tự động cho người tạo.
  - Nút Báo cáo cờ đỏ vi phạm gửi lên Admin.
- **Hồ sơ & VietQR Donate (`/profile/[id]`, `/profile/edit`)**:
  - Tạo mã VietQR động theo STK và ngân hàng của tài xế để nhận tiền tip cảm ơn.
  - Nút 1-click sao chép số tài khoản.
  - Bảng danh hiệu huy hiệu đóng góp (Tài Xế Mới, Chỉ Đường Chuẩn, Thổ Địa Giao Hàng, Hiệp Sĩ Xa Lộ).
- **Bảng Vàng Bác Tài (`/leaderboard`)**: Top 10 tài xế có điểm cống hiến cao nhất, vinh danh huy chương Vàng, Bạc, Đồng.
- **Khu Vực Quản Trị Viên (`/admin`)**: Dành riêng cho tài xế có quyền `role = 'admin'`. Kiểm duyệt báo cáo, 1-click Khóa tài khoản (Ban), 1-click Ẩn kho/voice note vi phạm.
- **PWA Ready**: Đầy đủ `manifest.json`, icon app để tài xế có thể chọn "Thêm vào màn hình chính" (Add to Home Screen) trên điện thoại.
