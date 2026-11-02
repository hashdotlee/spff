-- ============================================================
-- MIGRATION: Bổ sung chế độ Riêng tư (is_private) cho ghim định vị
-- Mặc định là FALSE (Public / Công khai)
-- Người dùng có thể chọn Private (Riêng tư - chỉ mình họ xem)
-- ============================================================

-- 1. Bổ sung cột is_private vào bảng warehouses (mặc định FALSE)
ALTER TABLE public.warehouses 
ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

-- Cập nhật tất cả bản ghi cũ thành FALSE nếu đang NULL
UPDATE public.warehouses 
SET is_private = FALSE 
WHERE is_private IS NULL;

-- 2. Cập nhật RLS Policy cho bảng warehouses:
-- - Khách & tài xế khác: chỉ xem được các kho công khai (is_private = false AND status = 'active')
-- - Người tạo (created_by): xem được cả kho công khai và kho riêng tư của chính mình
-- - Quản trị viên (admin): xem được tất cả
DROP POLICY IF EXISTS "Active warehouses are viewable by everyone" ON public.warehouses;

CREATE POLICY "Active warehouses are viewable by everyone" ON public.warehouses
  FOR SELECT USING (
    (status = 'active' AND (is_private = false OR created_by = auth.uid())) OR
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. Cập nhật function recalculate_user_reputation:
-- Chỉ tính điểm cống hiến (+10đ) cho các ghim công khai (is_private = false)
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
