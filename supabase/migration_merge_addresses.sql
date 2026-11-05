-- ============================================================
-- MIGRATION: Gộp nhiều địa chỉ thành 1 địa chỉ đại diện cho nhiều shop
-- Tính năng chỉ dành riêng cho Quản trị viên (Admin)
-- ============================================================

-- 1. Bổ sung cột shops (JSONB) lưu danh sách các shop tại cùng 1 địa chỉ
-- Cấu trúc: [ { "name": "Shop A", "note": "Tầng 1", "phone": "0912..." }, ... ]
ALTER TABLE public.warehouses 
ADD COLUMN IF NOT EXISTS shops JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Bổ sung cột merged_into (UUID) lưu liên kết địa chỉ đã gộp vào địa chỉ chính nào
ALTER TABLE public.warehouses 
ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

-- 3. Tạo index tăng tốc độ truy vấn
CREATE INDEX IF NOT EXISTS idx_warehouses_merged_into 
ON public.warehouses(merged_into);

CREATE INDEX IF NOT EXISTS idx_warehouses_shops 
ON public.warehouses USING gin (shops);

-- 4. Cập nhật hàm tính điểm cống hiến: 
-- Bảo lưu điểm cống hiến cho tài xế đã ghim kho công khai nếu kho đó được admin gộp địa chỉ (thay vì bị trừ điểm như khi bị xóa do vi phạm)
CREATE OR REPLACE FUNCTION public.recalculate_user_reputation(target_user_id UUID)
RETURNS void AS $$
DECLARE
    warehouse_pts INT := 0;
    voice_pts INT := 0;
    vote_pts INT := 0;
    rating_pts INT := 0;
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
    -- Giữ điểm nếu kho đang active HOẶC kho được gộp hợp lệ vào kho khác (merged_into IS NOT NULL)
    SELECT COALESCE(COUNT(*) * 10, 0) INTO warehouse_pts
    FROM public.warehouses
    WHERE created_by = target_user_id
      AND (status = 'active' OR (status = 'hidden' AND merged_into IS NOT NULL))
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

    -- D. Điểm từ báo tình hình nổ đơn (+2 điểm mỗi lượt báo)
    SELECT COALESCE(COUNT(*) * 2, 0) INTO rating_pts
    FROM public.location_order_ratings
    WHERE user_id = target_user_id;

    total_pts := GREATEST(0, warehouse_pts + voice_pts + vote_pts + rating_pts);

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

-- 5. Cập nhật trigger khi kho thay đổi: Không cascade ẩn voice notes nếu kho được gộp (merged_into IS NOT NULL)
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
        -- Khi kho bị chuyển sang hidden thông thường (không phải do gộp), tự động ẩn toàn bộ voice của kho đó
        IF NEW.status = 'hidden' AND OLD.status IS DISTINCT FROM 'hidden' AND NEW.merged_into IS NULL THEN
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
