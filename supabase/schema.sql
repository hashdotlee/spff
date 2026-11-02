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
    image_url TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reported', 'hidden')),
    category TEXT NOT NULL DEFAULT 'warehouse' CHECK (category IN ('warehouse', 'eatery', 'customer', 'parking')),
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
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

-- 8. Functions & Triggers for Reputation, Location Pinning, Voice & Votes
CREATE OR REPLACE FUNCTION public.recalculate_user_reputation(target_user_id UUID)
RETURNS void AS $$
DECLARE
    warehouse_pts INT := 0;
    voice_pts INT := 0;
    vote_pts INT := 0;
    total_pts INT := 0;
    user_is_banned BOOLEAN := FALSE;
BEGIN
    IF target_user_id IS NULL THEN
        RETURN;
    END IF;

    -- Kiểm tra nếu tài khoản bị khóa / ban thì xóa toàn bộ điểm cống hiến (0đ)
    SELECT COALESCE(is_banned, false) INTO user_is_banned
    FROM public.profiles
    WHERE id = target_user_id;

    IF user_is_banned THEN
        UPDATE public.profiles
        SET reputation_score = 0,
            updated_at = timezone('utc'::text, now())
        WHERE id = target_user_id;
        RETURN;
    END IF;

    -- A. Điểm từ ghim định vị kho bãi công khai (+10 điểm mỗi điểm ghim)
    SELECT COALESCE(COUNT(*) * 10, 0) INTO warehouse_pts
    FROM public.warehouses
    WHERE created_by = target_user_id
      AND status = 'active'
      AND is_private = false;

    -- B. Điểm từ voice chỉ dẫn đóng góp (+5 điểm mỗi voice note)
    SELECT COALESCE(COUNT(*) * 5, 0) INTO voice_pts
    FROM public.voice_notes
    WHERE user_id = target_user_id
      AND status = 'active';

    -- C. Điểm từ đánh giá cộng đồng (+5 mỗi upvote, -2 mỗi downvote)
    SELECT COALESCE(SUM(CASE WHEN vv.vote_value = 1 THEN 5 ELSE -2 END), 0) INTO vote_pts
    FROM public.voice_notes vn
    JOIN public.voice_votes vv ON vn.id = vv.voice_note_id
    WHERE vn.user_id = target_user_id
      AND vn.status = 'active';

    total_pts := GREATEST(0, warehouse_pts + voice_pts + vote_pts);

    -- Cập nhật reputation_score cho profile
    UPDATE public.profiles
    SET reputation_score = total_pts,
        updated_at = timezone('utc'::text, now())
    WHERE id = target_user_id;

    -- Tự động gán huy hiệu theo điểm cống hiến
    INSERT INTO public.user_badges (user_id, badge_id)
    SELECT target_user_id, b.id
    FROM public.badges b
    WHERE total_pts >= b.min_points
    ON CONFLICT (user_id, badge_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger cho warehouses: cập nhật điểm khi ghim/xóa kho & cascade ẩn voice notes
CREATE OR REPLACE FUNCTION public.handle_warehouse_reputation_change()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Cascade ẩn tất cả voice notes của kho bị xóa
        UPDATE public.voice_notes
        SET status = 'hidden',
            updated_at = timezone('utc'::text, now())
        WHERE warehouse_id = OLD.id
          AND status = 'active';

        PERFORM public.recalculate_user_reputation(OLD.created_by);
    ELSIF TG_OP = 'UPDATE' THEN
        -- Khi kho bị chuyển sang hidden, tự động ẩn toàn bộ voice của kho đó
        IF NEW.status = 'hidden' AND OLD.status IS DISTINCT FROM 'hidden' THEN
            UPDATE public.voice_notes
            SET status = 'hidden',
                updated_at = timezone('utc'::text, now())
            WHERE warehouse_id = NEW.id
              AND status = 'active';
        END IF;

        IF OLD.created_by IS DISTINCT FROM NEW.created_by OR OLD.status IS DISTINCT FROM NEW.status THEN
            PERFORM public.recalculate_user_reputation(OLD.created_by);
            PERFORM public.recalculate_user_reputation(NEW.created_by);
        END IF;
    ELSE -- INSERT
        PERFORM public.recalculate_user_reputation(NEW.created_by);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_warehouse_reputation_changed ON public.warehouses;
CREATE TRIGGER on_warehouse_reputation_changed
    AFTER INSERT OR UPDATE OR DELETE ON public.warehouses
    FOR EACH ROW EXECUTE PROCEDURE public.handle_warehouse_reputation_change();

-- Trigger cho voice_notes: cập nhật điểm khi thêm/xóa voice note
CREATE OR REPLACE FUNCTION public.handle_voice_note_reputation_change()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.recalculate_user_reputation(OLD.user_id);
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.status IS DISTINCT FROM NEW.status THEN
            PERFORM public.recalculate_user_reputation(OLD.user_id);
            PERFORM public.recalculate_user_reputation(NEW.user_id);
        END IF;
    ELSE -- INSERT
        PERFORM public.recalculate_user_reputation(NEW.user_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_voice_note_reputation_changed ON public.voice_notes;
CREATE TRIGGER on_voice_note_reputation_changed
    AFTER INSERT OR UPDATE OR DELETE ON public.voice_notes
    FOR EACH ROW EXECUTE PROCEDURE public.handle_voice_note_reputation_change();

-- Trigger cho voice_votes: cập nhật vote count và điểm tác giả
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

    IF target_author_id IS NOT NULL THEN
        PERFORM public.recalculate_user_reputation(target_author_id);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_voice_vote_changed ON public.voice_votes;
CREATE TRIGGER on_voice_vote_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.voice_votes
  FOR EACH ROW EXECUTE PROCEDURE public.handle_voice_vote_change();

-- Trigger khi khóa / mở khóa tài khoản (profiles.is_banned)
CREATE OR REPLACE FUNCTION public.handle_profile_ban_change()
RETURNS trigger AS $$
BEGIN
    IF OLD.is_banned IS DISTINCT FROM NEW.is_banned THEN
        IF NEW.is_banned = true THEN
            -- Ẩn các kho và voice của tài khoản bị khóa
            UPDATE public.warehouses
            SET status = 'hidden',
                updated_at = timezone('utc'::text, now())
            WHERE created_by = NEW.id AND status = 'active';

            UPDATE public.voice_notes
            SET status = 'hidden',
                updated_at = timezone('utc'::text, now())
            WHERE user_id = NEW.id AND status = 'active';
        END IF;

        PERFORM public.recalculate_user_reputation(NEW.id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_ban_changed ON public.profiles;
CREATE TRIGGER on_profile_ban_changed
    AFTER UPDATE OF is_banned ON public.profiles
    FOR EACH ROW EXECUTE PROCEDURE public.handle_profile_ban_change();

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

-- Warehouses: Ai cũng xem được kho công khai 'active', người tạo xem được kho riêng tư của mình, admin xem được tất cả; user đăng nhập được thêm
CREATE POLICY "Active warehouses are viewable by everyone" ON public.warehouses
  FOR SELECT USING (
    (status = 'active' AND (is_private = false OR created_by = auth.uid())) OR
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

-- 11. Bảng Incidents & Incident Helpers (Báo cáo sự cố khẩn cấp SOS & Cứu trợ)
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    incident_type TEXT NOT NULL CHECK (incident_type IN ('broken_vehicle', 'out_of_gas', 'flat_tire', 'battery_dead', 'accident', 'other')),
    description TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address TEXT,
    photo_url TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'helping', 'resolved', 'cancelled')),
    helper_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON public.incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_user_id ON public.incidents(user_id);

CREATE TABLE IF NOT EXISTS public.incident_helpers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    helper_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'accepted', 'completed', 'cancelled')),
    message TEXT,
    eta_minutes INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(incident_id, helper_id)
);

CREATE INDEX IF NOT EXISTS idx_incident_helpers_incident ON public.incident_helpers(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_helpers_helper ON public.incident_helpers(helper_id);

-- Trigger tự động cập nhật số người giúp và trạng thái sự cố
CREATE OR REPLACE FUNCTION public.handle_incident_helper_change()
RETURNS trigger AS $$
DECLARE
    target_incident_id UUID;
    active_helpers_count INT;
    current_status TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_incident_id := OLD.incident_id;
    ELSE
        target_incident_id := NEW.incident_id;
    END IF;

    SELECT status INTO current_status
    FROM public.incidents
    WHERE id = target_incident_id;

    SELECT COUNT(*)
    INTO active_helpers_count
    FROM public.incident_helpers
    WHERE incident_id = target_incident_id
      AND status IN ('offered', 'accepted');

    UPDATE public.incidents
    SET helper_count = active_helpers_count,
        status = CASE 
            WHEN current_status IN ('resolved', 'cancelled') THEN current_status
            WHEN active_helpers_count > 0 THEN 'helping'
            ELSE 'open'
        END,
        updated_at = timezone('utc'::text, now())
    WHERE id = target_incident_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_incident_helper_changed ON public.incident_helpers;
CREATE TRIGGER on_incident_helper_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.incident_helpers
  FOR EACH ROW EXECUTE PROCEDURE public.handle_incident_helper_change();

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_helpers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Incidents are viewable by everyone" ON public.incidents
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create incidents" ON public.incidents
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_banned = true)
  );

CREATE POLICY "Owners, helpers and admins can update incidents" ON public.incidents
  FOR UPDATE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.incident_helpers WHERE incident_id = public.incidents.id AND helper_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Owners and admins can delete incidents" ON public.incidents
  FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Incident helpers are viewable by everyone" ON public.incident_helpers
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can offer help" ON public.incident_helpers
  FOR INSERT WITH CHECK (
    auth.uid() = helper_id AND
    NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_banned = true)
  );

CREATE POLICY "Helpers, incident owners and admins can update help offer" ON public.incident_helpers
  FOR UPDATE USING (
    auth.uid() = helper_id OR
    EXISTS (SELECT 1 FROM public.incidents WHERE id = public.incident_helpers.incident_id AND user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Helpers and admins can delete help offer" ON public.incident_helpers
  FOR DELETE USING (
    auth.uid() = helper_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Buckets cho Incident Photos và Warehouse Images
INSERT INTO storage.buckets (id, name, public)
VALUES ('incident-photos', 'incident-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('warehouse-images', 'warehouse-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Read for incident-photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'incident-photos');

CREATE POLICY "Authenticated users can upload incident photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'incident-photos' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Public Read for warehouse-images" ON storage.objects
  FOR SELECT USING (bucket_id = 'warehouse-images');

CREATE POLICY "Authenticated users can upload warehouse images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'warehouse-images' AND
    auth.uid() IS NOT NULL
  );

-- 12. Gán quyền Quản Trị Viên (Admin) cho tài khoản quản lý
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'hashdotlee@gmail.com';

-- 13. Bảng Location Order Ratings (Đánh giá tình hình nổ đơn theo giờ thực tế)
CREATE TABLE IF NOT EXISTS public.location_order_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rating TEXT NOT NULL CHECK (rating IN ('ngon', 'tam', 'khe', 'mom')),
    score INT NOT NULL CHECK (score BETWEEN 1 AND 4),
    hour_of_day INT NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_ratings_wh_hour 
ON public.location_order_ratings (warehouse_id, hour_of_day);

CREATE INDEX IF NOT EXISTS idx_order_ratings_created 
ON public.location_order_ratings (warehouse_id, created_at DESC);

ALTER TABLE public.location_order_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Order ratings are viewable by everyone" 
ON public.location_order_ratings
FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create order ratings" 
ON public.location_order_ratings
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND
  NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_banned = true)
);

CREATE POLICY "Users and admins can delete order ratings" 
ON public.location_order_ratings
FOR DELETE USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);


