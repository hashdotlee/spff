-- ============================================================
-- MIGRATION: Bảng Tin Bác Tài (Feeds / Twitt Ngắn & Upvote/Downvote)
-- Tích hợp hệ thống sao vinh danh dưới Avatar tài xế
-- ============================================================

-- 1. Bảng Posts (Bài đăng trạng thái ngắn của tài xế)
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    tag TEXT NOT NULL DEFAULT 'tam_su' CHECK (tag IN ('ket_xe', 'chot_gt', 'canh_bao', 'tam_su', 'quan_ngon', 'khac')),
    province TEXT,
    upvotes_count INT NOT NULL DEFAULT 0,
    downvotes_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT post_content_length CHECK (char_length(content) <= 300)
);

-- Chỉ mục tối ưu cho truy vấn bảng tin theo thời gian và tỉnh thành
CREATE INDEX IF NOT EXISTS idx_posts_status_created ON public.posts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_province ON public.posts(province);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_tag ON public.posts(tag);

-- 2. Bảng Post Votes (Đánh giá Upvote / Downvote bài đăng)
CREATE TABLE IF NOT EXISTS public.post_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    vote_value SMALLINT NOT NULL CHECK (vote_value IN (1, -1)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_votes_post ON public.post_votes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_votes_user ON public.post_votes(user_id);

-- 3. Nâng cấp hàm recalculate_user_reputation để cộng điểm từ upvote bài đăng
-- Điểm cống hiến:
--   +10đ: Ghim kho bãi
--   +5đ: Voice note
--   +5đ mỗi upvote voice, -2đ mỗi downvote voice
--   +2đ mỗi upvote post, -1đ mỗi downvote post
CREATE OR REPLACE FUNCTION public.recalculate_user_reputation(target_user_id UUID)
RETURNS void AS $$
DECLARE
    warehouse_pts INT := 0;
    voice_pts INT := 0;
    vote_pts INT := 0;
    post_pts INT := 0;
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

    -- A. Điểm từ ghim định vị kho bãi / địa chỉ (+10 điểm mỗi điểm ghim active)
    SELECT COALESCE(COUNT(*) * 10, 0) INTO warehouse_pts
    FROM public.warehouses
    WHERE created_by = target_user_id
      AND status = 'active';

    -- B. Điểm từ voice chỉ dẫn đóng góp (+5 điểm mỗi voice note active)
    SELECT COALESCE(COUNT(*) * 5, 0) INTO voice_pts
    FROM public.voice_notes
    WHERE user_id = target_user_id
      AND status = 'active';

    -- C. Điểm từ đánh giá voice note (+5 mỗi upvote, -2 mỗi downvote)
    SELECT COALESCE(SUM(CASE WHEN vv.vote_value = 1 THEN 5 ELSE -2 END), 0) INTO vote_pts
    FROM public.voice_notes vn
    JOIN public.voice_votes vv ON vn.id = vv.voice_note_id
    WHERE vn.user_id = target_user_id
      AND vn.status = 'active';

    -- D. Điểm từ bài đăng trên Bảng tin (+2 mỗi upvote, -1 mỗi downvote)
    SELECT COALESCE(SUM(CASE WHEN pv.vote_value = 1 THEN 2 ELSE -1 END), 0) INTO post_pts
    FROM public.posts p
    JOIN public.post_votes pv ON p.id = pv.post_id
    WHERE p.user_id = target_user_id
      AND p.status = 'active';

    -- Tổng điểm cống hiến (không âm)
    total_pts := GREATEST(0, warehouse_pts + voice_pts + vote_pts + post_pts);

    -- Cập nhật vào bảng profiles
    UPDATE public.profiles
    SET reputation_score = total_pts,
        updated_at = timezone('utc'::text, now())
    WHERE id = target_user_id;

    -- Tự động gán huy hiệu theo thang điểm cống hiến (nếu bảng badges tồn tại)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_badges') THEN
        INSERT INTO public.user_badges (user_id, badge_id)
        SELECT target_user_id, b.id
        FROM public.badges b
        WHERE total_pts >= b.min_points
        ON CONFLICT (user_id, badge_id) DO NOTHING;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger tự động tính lại upvotes_count, downvotes_count khi vote bài viết
CREATE OR REPLACE FUNCTION public.handle_post_vote_change()
RETURNS trigger AS $$
DECLARE
    target_post_id UUID;
    target_author_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_post_id := OLD.post_id;
    ELSE
        target_post_id := NEW.post_id;
    END IF;

    -- Lấy tác giả bài viết
    SELECT user_id INTO target_author_id
    FROM public.posts
    WHERE id = target_post_id;

    -- Cập nhật số lượng upvotes và downvotes vào bảng posts
    UPDATE public.posts
    SET upvotes_count = COALESCE((SELECT COUNT(*) FROM public.post_votes WHERE post_id = target_post_id AND vote_value = 1), 0),
        downvotes_count = COALESCE((SELECT COUNT(*) FROM public.post_votes WHERE post_id = target_post_id AND vote_value = -1), 0),
        updated_at = timezone('utc'::text, now())
    WHERE id = target_post_id;

    -- Tính lại điểm cống hiến cho tác giả bài viết
    IF target_author_id IS NOT NULL THEN
        PERFORM public.recalculate_user_reputation(target_author_id);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_vote_change ON public.post_votes;
CREATE TRIGGER on_post_vote_change
    AFTER INSERT OR UPDATE OR DELETE ON public.post_votes
    FOR EACH ROW EXECUTE PROCEDURE public.handle_post_vote_change();

-- 5. Row Level Security (RLS) Policies
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_votes ENABLE ROW LEVEL SECURITY;

-- Posts:
DROP POLICY IF EXISTS "Active posts are viewable by everyone" ON public.posts;
CREATE POLICY "Active posts are viewable by everyone" ON public.posts
  FOR SELECT USING (status = 'active');

DROP POLICY IF EXISTS "Authenticated users can insert posts" ON public.posts;
CREATE POLICY "Authenticated users can insert posts" ON public.posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own posts" ON public.posts;
CREATE POLICY "Users can update their own posts" ON public.posts
  FOR UPDATE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Users can delete their own posts" ON public.posts;
CREATE POLICY "Users can delete their own posts" ON public.posts
  FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Post Votes:
DROP POLICY IF EXISTS "Post votes are viewable by everyone" ON public.post_votes;
CREATE POLICY "Post votes are viewable by everyone" ON public.post_votes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can cast votes" ON public.post_votes;
CREATE POLICY "Authenticated users can cast votes" ON public.post_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own votes" ON public.post_votes;
CREATE POLICY "Users can update their own votes" ON public.post_votes
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own votes" ON public.post_votes;
CREATE POLICY "Users can delete their own votes" ON public.post_votes
  FOR DELETE USING (auth.uid() = user_id);

-- 6. Kích hoạt Supabase Realtime cho posts & post_votes (nếu được hỗ trợ)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_votes;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;
