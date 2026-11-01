# KẾ HOẠCH TRIỂN KHAI: ỨNG DỤNG HỖ TRỢ TÀI XẾ - ĐỊNH VỊ KHO & VOICE CHỈ ĐƯỜNG

> **Mục tiêu**: Xây dựng web app cộng đồng phi lợi nhuận cho tài xế giao nhận hàng, giúp đánh dấu vị trí kho hàng và thu âm ghi chú giọng nói (Voice Note) chỉ dẫn đường đi chi tiết (tránh lạc đường, ngõ hẹp, cổng phụ). Người sau có thể nghe chỉ đường, upvote/downvote, donate cảm ơn bằng VietQR. Hệ thống có cơ chế xếp hạng vinh danh và công cụ quản trị (Admin) khóa tài khoản vi phạm.

---

## 1. Kiến Trúc Kỹ Thuật (Tech Stack)

| Hạng mục | Công nghệ | Chi tiết & Lý do |
| :--- | :--- | :--- |
| **Frontend Framework** | **Next.js (App Router) + TypeScript** | Tối ưu hiệu năng, routing chuẩn hiện đại, tương thích hoàn hảo với Vercel. |
| **Styling & UI** | **Tailwind CSS + Lucide Icons + Shadcn UI** | Thiết kế Mobile-First tối ưu cho thao tác 1 tay của tài xế trên điện thoại. |
| **Bản đồ trực quan** | **Leaflet.js + OpenStreetMap** | Hoàn toàn miễn phí, không tốn chi phí API, nhẹ và dễ tùy biến. |
| **Dẫn đường thời gian thực** | **Google Maps Universal Link** | Mở trực tiếp App Google Maps trên điện thoại qua deep link: `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`. |
| **Tính khoảng cách** | **Haversine Formula** | Tính toán khoảng cách (km) cực nhanh ngay trên client hoặc qua PostgreSQL, chi phí 0đ. |
| **Ghi âm giọng nói** | **Web Audio `MediaRecorder API`** | Thu âm trực tiếp qua mic trình duyệt, nén file `.webm` / `.m4a` gọn nhẹ (giới hạn 60–90 giây). |
| **Backend & Database** | **Supabase (PostgreSQL + RLS)** | Quản lý người dùng, bảng dữ liệu quan hệ, phân quyền Row Level Security. |
| **Xác thực (Auth)** | **Supabase Auth (Email & Mật khẩu)** | Đăng ký & đăng nhập nhanh chóng, bảo mật, không cần cấu hình Google Console phức tạp. |
| **Lưu trữ âm thanh & ảnh** | **Supabase Storage** | Bucket lưu trữ file voice notes và mã QR cá nhân của tài xế. |
| **Ủng hộ / Cảm ơn** | **VietQR API** | Sinh mã QR ngân hàng tự động theo số tài khoản tài xế, người khác quét trực tiếp từ app ngân hàng. |
| **Hosting & Deploy** | **Vercel** | Triển khai nhanh chóng với chứng chỉ SSL HTTPS miễn phí (bắt buộc cho quyền GPS & Micro). |
| **Trải nghiệm App** | **PWA (Progressive Web App)** | Cho phép tài xế bấm "Thêm vào màn hình chính" (Add to Home Screen) dùng như App Native. |

---

## 2. Thiết Kế Cơ Sở Dữ Liệu (Supabase SQL Schema)

Chạy đoạn script SQL này trong **Supabase SQL Editor** khi thiết lập dự án:

```sql
-- 1. Bật extension tạo UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Bảng Profiles (Thông tin tài xế & Quyền hạn)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT NOT NULL DEFAULT 'Tài xế',
    phone TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    bank_name TEXT,          -- Ví dụ: MB, VCB, ACB, TPB...
    bank_account_no TEXT,    -- Số tài khoản nhận donate
    bank_account_name TEXT,  -- Tên chủ tài khoản
    reputation_score INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Trigger tự động tạo Profile khi user đăng ký qua Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', 'Tài xế'));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Bảng Warehouses (Vị trí các kho hàng)
CREATE TABLE public.warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    address TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    description TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reported', 'hidden')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Bảng Voice Notes (Lời nhắn chỉ đường bằng âm thanh)
CREATE TABLE public.voice_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    audio_url TEXT NOT NULL,
    duration_seconds INT NOT NULL DEFAULT 0,
    note_text TEXT,          -- Ghi chú chữ tóm tắt (tùy chọn)
    upvotes_count INT NOT NULL DEFAULT 0,
    downvotes_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Bảng Voice Votes (Lưu lượt đánh giá, chống spam vote)
CREATE TABLE public.voice_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voice_note_id UUID NOT NULL REFERENCES public.voice_notes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    vote_value INT NOT NULL CHECK (vote_value IN (1, -1)), -- +1: Upvote, -1: Downvote
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(voice_note_id, user_id)
);

-- 6. Bảng Reports (Báo cáo vi phạm)
CREATE TABLE public.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE,
    voice_note_id UUID REFERENCES public.voice_notes(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. Bảng Badges & User Badges (Huy hiệu vinh danh)
CREATE TABLE public.badges (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    icon_name TEXT NOT NULL,
    min_points INT NOT NULL DEFAULT 0
);

INSERT INTO public.badges (id, title, description, icon_name, min_points) VALUES
('rookie', 'Tài Xế Mới', 'Bắt đầu hành trình chia sẻ chỉ đường', 'Award', 0),
('guide', 'Chỉ Đường Chuẩn', 'Có trên 5 lượt upvote cho lời nhắn', 'Navigation', 20),
('master', 'Thổ Địa Giao Hàng', 'Đã đánh dấu 10 kho chính xác', 'Compass', 50),
('legend', 'Hiệp Sĩ Xa Lộ', 'Đóng góp xuất sắc cho cộng đồng', 'ShieldCheck', 100);

CREATE TABLE public.user_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_id TEXT NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id, badge_id)
);

-- 8. Cấu hình Storage Bucket trên Supabase
-- Tạo 2 bucket:
--   1. 'voice-notes' (Public read: Cho phép ai cũng nghe được, Authenticated write: Chỉ tài xế đã đăng nhập mới upload được).
--   2. 'avatars' (Public read).
```

---

## 3. Cấu Trúc Thư Mục Dự Án (Next.js App Router)

```text
spff/
├── public/
│   ├── icons/                  # PWA icons & markers
│   └── manifest.json           # File cấu hình PWA cài đặt vào điện thoại
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx       # Màn hình Đăng nhập (Email/Password)
│   │   │   └── register/page.tsx    # Màn hình Đăng ký
│   │   ├── admin/
│   │   │   └── page.tsx             # Trang kiểm duyệt báo cáo & Khóa tài khoản
│   │   ├── leaderboard/
│   │   │   └── page.tsx             # Bảng xếp hạng vinh danh tài xế
│   │   ├── profile/
│   │   │   ├── [id]/page.tsx        # Xem profile công khai & Quét VietQR Donate
│   │   │   └── edit/page.tsx        # Cập nhật thông tin ngân hàng & cá nhân
│   │   ├── warehouse/
│   │   │   ├── new/page.tsx         # Ghim vị trí kho mới
│   │   │   └── [id]/page.tsx        # Chi tiết kho, nghe & thu âm voice notes
│   │   ├── layout.tsx               # Root layout chung (Header, Bottom Nav mobile)
│   │   └── page.tsx                 # Trang chủ: Bản đồ OSM + Danh sách 5 kho gần nhất
│   ├── components/
│   │   ├── map/
│   │   │   ├── MapView.tsx          # Leaflet OpenStreetMap hiển thị các kho
│   │   │   └── LocationPicker.tsx   # Chọn tọa độ khi thêm kho
│   │   ├── voice/
│   │   │   ├── AudioRecorder.tsx    # Nút thu âm & xem trước lời nhắn
│   │   │   └── VoiceNoteCard.tsx    # Trình phát audio + nút Upvote/Downvote + nút Report
│   │   ├── warehouse/
│   │   │   └── NearestList.tsx      # Danh sách 5 kho gần nhất (đánh số 1-5, nút Đi ngay)
│   │   ├── donation/
│   │   │   └── VietQRModal.tsx      # Popup hiển thị mã QR VietQR chuyển khoản cảm ơn
│   │   └── layout/
│   │       ├── Navbar.tsx
│   │       └── BottomNavigation.tsx # Thanh điều hướng dưới cùng cho mobile
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts            # Supabase Browser Client
│   │   │   ├── server.ts            # Supabase Server Client
│   │   │   └── middleware.ts        # Chặn tài khoản is_banned hoặc chưa đăng nhập
│   │   └── utils/
│   │       ├── distance.ts          # Hàm tính khoảng cách Haversine chuẩn km
│   │       ├── googleMaps.ts        # Hàm tạo link điều hướng Google Maps
│   │       └── vietqr.ts            # Hàm tạo link mã VietQR động
│   └── types/
│       └── database.ts              # Định nghĩa TypeScript cho các bảng DB
├── .env.local.example               # Mẫu biến môi trường kết nối Supabase
├── package.json
├── tailwind.config.js
└── PLAN.md                          # Tài liệu này
```

---

## 4. Lộ Trình Triển Khai Từng Bước (Implementation Checklist)

### Giai đoạn 1: Khởi tạo & Cấu hình môi trường
- [ ] Cài đặt Next.js 14+ (App Router, Tailwind CSS, TypeScript).
- [ ] Cài các thư viện: `@supabase/supabase-js`, `@supabase/ssr`, `leaflet`, `react-leaflet`, `@types/leaflet`, `lucide-react`.
- [ ] Tạo file `.env.local`:
  ```env
  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
  ```
- [ ] Chạy file SQL tạo các bảng trên trang quản trị Supabase.
- [ ] Tạo bucket `voice-notes` trên Supabase Storage.

### Giai đoạn 2: Xác thực & Quản lý người dùng (Auth)
- [ ] Xây dựng trang Đăng ký (`/register`) và Đăng nhập (`/login`) bằng Email & Mật khẩu.
- [ ] Thiết lập Middleware kiểm tra trạng thái đăng nhập và kiểm tra xem tài khoản có bị khóa (`is_banned == true`) hay không.
- [ ] Xây dựng màn hình cài đặt Profile (`/profile/edit`): Cập nhật họ tên, số điện thoại, ngân hàng, số tài khoản nhận donate.

### Giai đoạn 3: Bản đồ OpenStreetMap & 5 Kho Gần Nhất (Trang chủ)
- [ ] Viết hàm lấy vị trí GPS hiện tại của tài xế (`navigator.geolocation`).
- [ ] Viết thuật toán Haversine tính khoảng cách giữa tọa độ tài xế và các kho trong hệ thống.
- [ ] Tích hợp bản đồ Leaflet hiển thị vị trí hiện tại và các marker kho hàng.
- [ ] Hiển thị danh sách **5 kho gần nhất** xếp thứ tự 1 đến 5:
  - Tên kho, địa chỉ, khoảng cách (VD: `350m`, `1.2km`).
  - Nút **"Đi ngay"**: Click mở ứng dụng Google Maps dẫn đường `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`.
  - Nút **"Xem chỉ dẫn"**: Click chuyển sang trang chi tiết kho (`/warehouse/[id]`).

### Giai đoạn 4: Ghim Kho Mới & Ghi Âm Lời Nhắn Thoại (Voice Note)
- [ ] Trang Thêm Kho Mới (`/warehouse/new`): Tự động lấy tọa độ hiện tại (hoặc bấm chọn trên map), nhập tên và mô tả.
- [ ] Component Ghi âm (`AudioRecorder`):
  - Bấm nút Mic để thu âm qua `MediaRecorder API`.
  - Hiển thị thời gian đếm ngược (tối đa 60s).
  - Nghe lại thử trước khi gửi.
  - Upload file âm thanh lên Supabase Storage bucket `voice-notes` -> Lưu URL vào bảng `voice_notes`.
- [ ] Trình phát âm thanh `VoiceNoteCard`:
  - Phát/Dừng mượt mà.
  - Hiển thị lượt Upvote / Downvote.
  - Xử lý click Upvote / Downvote (ghi nhận vào `voice_votes` và tăng điểm cống hiến cho người tạo).

### Giai đoạn 5: Vinh Danh, Bảng Xếp Hạng & VietQR Donate
- [ ] Màn hình chi tiết tài xế (`/profile/[id]`):
  - Hiển thị danh hiệu (Badges) và điểm cống hiến.
  - Hiển thị mã VietQR tạo tự động theo cú pháp:
    `https://img.vietqr.io/image/{bank_name}-{bank_account_no}-compact.png?amount=&addInfo=Cam%20on%20dong%20nghiep`
  - Nút "Sao chép số tài khoản" để đồng nghiệp dễ dàng chuyển khoản cảm ơn.
- [ ] Trang Bảng Xếp Hạng (`/leaderboard`): Top 10 tài xế có điểm đóng góp cao nhất.

### Giai đoạn 6: Báo Cáo & Quản Trị Viên (Admin Moderation)
- [ ] Nút Báo cáo (Cờ đỏ) trên từng kho hàng và voice note.
- [ ] Trang Admin (`/admin`):
  - Phân quyền chỉ tài xế có `role = 'admin'` mới truy cập được.
  - Xem danh sách báo cáo vi phạm.
  - Nút 1-click **Khóa tài khoản (Ban User)**: Cập nhật `is_banned = true`.
  - Nút 1-click **Ẩn Voice Note / Ẩn Kho hàng**.

### Giai đoạn 7: Tối ưu PWA & Triển khai lên Vercel
- [ ] Cấu hình `manifest.json` để tài xế có thể chọn "Thêm vào màn hình chính" (Add to Home Screen) trên Chrome/Safari.
- [ ] Đẩy code lên GitHub và kết nối Deploy tự động trên Vercel.
- [ ] Điền `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` trong Environment Variables của Vercel.

---

## 5. Hướng Dẫn Bắt Đầu Nhanh Cho Session Tiếp Theo
Khi mở lại dự án ở session sau, bạn chỉ cần thực hiện 3 bước:
1. Đảm bảo Node.js đã sẵn sàng:
   ```bash
   node -v && npm -v
   ```
2. Cài đặt các gói phụ thuộc (Dependencies):
   ```bash
   npm install
   ```
3. Tạo file `.env.local` điền thông tin Supabase của bạn và chạy môi trường dev:
   ```bash
   npm run dev
   ```
