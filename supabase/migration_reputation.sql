-- ============================================================
-- MIGRATION: Hệ thống điểm cống hiến cho Ghim Định Vị & Voice Note
-- Điểm cống hiến được cộng tự động:
--   +10 điểm: Cho mỗi điểm ghim bến bãi / kho hàng (warehouses)
--   +5 điểm: Cho mỗi voice chỉ dẫn đường đã đóng góp (voice_notes)
--   +5 điểm: Cho mỗi lượt upvote từ cộng đồng bác tài (voice_votes)
--   -2 điểm: Cho mỗi lượt downvote
-- ============================================================

-- 1. Hàm tính toán và cập nhật điểm cống hiến tự động cho một tài xế
CREATE OR REPLACE FUNCTION public.recalculate_user_reputation(target_user_id UUID)
RETURNS void AS $$
DECLARE
    warehouse_pts INT := 0;
    voice_pts INT := 0;
    vote_pts INT := 0;
    total_pts INT := 0;
BEGIN
    IF target_user_id IS NULL THEN
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

    -- C. Điểm từ đánh giá cộng đồng (+5 mỗi upvote, -2 mỗi downvote)
    SELECT COALESCE(SUM(CASE WHEN vv.vote_value = 1 THEN 5 ELSE -2 END), 0) INTO vote_pts
    FROM public.voice_notes vn
    JOIN public.voice_votes vv ON vn.id = vv.voice_note_id
    WHERE vn.user_id = target_user_id
      AND vn.status = 'active';

    -- Tổng điểm cống hiến (không âm)
    total_pts := GREATEST(0, warehouse_pts + voice_pts + vote_pts);

    -- Cập nhật vào bảng profiles
    UPDATE public.profiles
    SET reputation_score = total_pts,
        updated_at = timezone('utc'::text, now())
    WHERE id = target_user_id;

    -- Tự động gán huy hiệu theo thang điểm cống hiến
    INSERT INTO public.user_badges (user_id, badge_id)
    SELECT target_user_id, b.id
    FROM public.badges b
    WHERE total_pts >= b.min_points
    ON CONFLICT (user_id, badge_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger khi thêm / sửa / xóa điểm ghim định vị (warehouses)
CREATE OR REPLACE FUNCTION public.handle_warehouse_reputation_change()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.recalculate_user_reputation(OLD.created_by);
    ELSIF TG_OP = 'UPDATE' THEN
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

-- 3. Trigger khi thêm / sửa / xóa voice note (voice_notes)
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

-- 4. Cập nhật Trigger Vote (voice_votes) sử dụng hàm recalculate_user_reputation
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

    -- Tính toán lại số upvotes và downvotes trên voice note
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

    -- Tự động tính lại toàn bộ điểm cho tác giả
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

-- 5. Backfill: Cập nhật lại điểm cống hiến cho toàn bộ tài xế hiện có
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.profiles LOOP
        PERFORM public.recalculate_user_reputation(r.id);
    END LOOP;
END $$;
