-- Supabase Schema for Kho Vận & Dẫn Đường Tài Xế (spff)

-- 1. Bật extension tạo UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Bảng Profiles (Thông tin tài xế & Quyền hạn)
CREATE TABLE IF NOT EXISTS public.profiles (
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
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Tài xế'),
    CASE WHEN new.email = 'hashdotlee@gmail.com' THEN 'admin' ELSE 'user' END
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      role = CASE WHEN EXCLUDED.email = 'hashdotlee@gmail.com' THEN 'admin' ELSE public.profiles.role END;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Bảng Warehouses (Vị trí các kho hàng)
CREATE TABLE IF NOT EXISTS public.warehouses (
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
CREATE TABLE IF NOT EXISTS public.voice_notes (
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
CREATE TABLE IF NOT EXISTS public.voice_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voice_note_id UUID NOT NULL REFERENCES public.voice_notes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    vote_value INT NOT NULL CHECK (vote_value IN (1, -1)), -- +1: Upvote, -1: Downvote
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(voice_note_id, user_id)
);

-- 6. Bảng Reports (Báo cáo vi phạm)
CREATE TABLE IF NOT EXISTS public.reports (
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
CREATE TABLE IF NOT EXISTS public.badges (
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
('legend', 'Hiệp Sĩ Xa Lộ', 'Đóng góp xuất sắc cho cộng đồng', 'ShieldCheck', 100)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  min_points = EXCLUDED.min_points;

CREATE TABLE IF NOT EXISTS public.user_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_id TEXT NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id, badge_id)
);

-- 8. Functions & Triggers for Vote Aggregation and Reputation
CREATE OR REPLACE FUNCTION public.handle_voice_vote_change()
RETURNS trigger AS $$
DECLARE
    target_note_id UUID;
    target_author_id UUID;
    up_cnt INT;
    down_cnt INT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_note_id := OLD.voice_note_id;
    ELSE
        target_note_id := NEW.voice_note_id;
    END IF;

    -- Tính toán lại số upvotes và downvotes
    SELECT
        COUNT(*) FILTER (WHERE vote_value = 1),
        COUNT(*) FILTER (WHERE vote_value = -1)
    INTO up_cnt, down_cnt
    FROM public.voice_votes
    WHERE voice_note_id = target_note_id;

    UPDATE public.voice_notes
    SET upvotes_count = up_cnt,
        downvotes_count = down_cnt
    WHERE id = target_note_id
    RETURNING user_id INTO target_author_id;

    -- Cập nhật reputation cho tác giả của voice note (+5 cho mỗi upvote, -2 cho mỗi downvote)
    IF target_author_id IS NOT NULL THEN
        UPDATE public.profiles
        SET reputation_score = GREATEST(0, (
            SELECT COALESCE(SUM(CASE WHEN vv.vote_value = 1 THEN 5 ELSE -2 END), 0)
            FROM public.voice_notes vn
            JOIN public.voice_votes vv ON vn.id = vv.voice_note_id
            WHERE vn.user_id = target_author_id
        ))
        WHERE id = target_author_id;

        -- Kiểm tra tự động gán badges dựa trên reputation_score
        INSERT INTO public.user_badges (user_id, badge_id)
        SELECT target_author_id, b.id
        FROM public.badges b
        CROSS JOIN public.profiles p
        WHERE p.id = target_author_id
          AND p.reputation_score >= b.min_points
        ON CONFLICT (user_id, badge_id) DO NOTHING;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_voice_vote_changed ON public.voice_votes;
CREATE TRIGGER on_voice_vote_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.voice_votes
  FOR EACH ROW EXECUTE PROCEDURE public.handle_voice_vote_change();

-- 9. Row Level Security (RLS) Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- Profiles: Ai cũng xem được profile công khai; user sửa của mình; admin sửa tất cả
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = id OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Warehouses: Ai cũng xem được kho 'active', admin xem được tất cả; user đăng nhập được thêm
CREATE POLICY "Active warehouses are viewable by everyone" ON public.warehouses
  FOR SELECT USING (
    status = 'active' OR
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authenticated users can create warehouses" ON public.warehouses
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_banned = true)
  );

CREATE POLICY "Owners and admins can update warehouses" ON public.warehouses
  FOR UPDATE USING (
    auth.uid() = created_by OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Owners and admins can delete warehouses" ON public.warehouses
  FOR DELETE USING (
    auth.uid() = created_by OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Voice Notes: Xem các note active; User đăng nhập được thêm
CREATE POLICY "Active voice notes are viewable by everyone" ON public.voice_notes
  FOR SELECT USING (
    status = 'active' OR
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authenticated users can create voice notes" ON public.voice_notes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_banned = true)
  );

CREATE POLICY "Owners and admins can update voice notes" ON public.voice_notes
  FOR UPDATE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Owners and admins can delete voice notes" ON public.voice_notes
  FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Voice Votes: Đã đăng nhập mới được vote
CREATE POLICY "Authenticated users can view votes" ON public.voice_votes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can cast votes" ON public.voice_votes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_banned = true)
  );

CREATE POLICY "Users can change their vote" ON public.voice_votes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can remove their vote" ON public.voice_votes
  FOR DELETE USING (auth.uid() = user_id);

-- Reports: Đăng nhập được gửi report, admin được xem và xử lý
CREATE POLICY "Authenticated users can submit reports" ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Admins and reporters can view reports" ON public.reports
  FOR SELECT USING (
    auth.uid() = reporter_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update reports" ON public.reports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete reports" ON public.reports
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Badges: Xem tự do
CREATE POLICY "Badges are viewable by everyone" ON public.badges
  FOR SELECT USING (true);

CREATE POLICY "User badges are viewable by everyone" ON public.user_badges
  FOR SELECT USING (true);

-- 10. Storage Buckets (Tự động thiết lập nếu có quyền storage.buckets)
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-notes', 'voice-notes', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
CREATE POLICY "Public Read for voice-notes" ON storage.objects
  FOR SELECT USING (bucket_id = 'voice-notes');

CREATE POLICY "Authenticated users can upload voice notes" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'voice-notes' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Public Read for avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid() IS NOT NULL
  );

-- 11. Gán quyền Quản Trị Viên (Admin) cho tài khoản quản lý
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'hashdotlee@gmail.com';

