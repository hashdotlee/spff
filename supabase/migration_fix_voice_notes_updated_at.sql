-- ==============================================================================
-- MIGRATION: Fix lỗi thiếu cột updated_at trong bảng voice_notes & warehouses
-- Mã lỗi sửa: 42703 (column "updated_at" of relation "voice_notes" does not exist)
-- Nguyên nhân: Trigger handle_warehouse_reputation_change() và handle_profile_ban_change()
-- thực hiện UPDATE status = 'hidden', updated_at = ... trên voice_notes và warehouses,
-- nhưng 2 bảng này ban đầu chưa có cột updated_at.
-- ==============================================================================

-- 1. Thêm cột updated_at vào bảng voice_notes (nếu chưa có)
ALTER TABLE public.voice_notes 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- 2. Thêm cột updated_at vào bảng warehouses (nếu chưa có)
ALTER TABLE public.warehouses 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- 3. Cập nhật trigger function handle_warehouse_reputation_change() an toàn và chuẩn xác
CREATE OR REPLACE FUNCTION public.handle_warehouse_reputation_change()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Cascade ẩn tất cả voice notes của kho bị xóa (nếu còn tồn tại)
        UPDATE public.voice_notes
        SET status = 'hidden',
            updated_at = timezone('utc'::text, now())
        WHERE warehouse_id = OLD.id
          AND status = 'active';

        IF OLD.created_by IS NOT NULL THEN
            PERFORM public.recalculate_user_reputation(OLD.created_by);
        END IF;
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
            IF OLD.created_by IS NOT NULL THEN
                PERFORM public.recalculate_user_reputation(OLD.created_by);
            END IF;
            IF NEW.created_by IS NOT NULL THEN
                PERFORM public.recalculate_user_reputation(NEW.created_by);
            END IF;
        END IF;
    ELSE -- INSERT
        IF NEW.created_by IS NOT NULL THEN
            PERFORM public.recalculate_user_reputation(NEW.created_by);
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Cập nhật trigger function handle_profile_ban_change()
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

-- 5. Đảm bảo các triggers gắn đúng vào bảng
DROP TRIGGER IF EXISTS on_warehouse_reputation_changed ON public.warehouses;
CREATE TRIGGER on_warehouse_reputation_changed
    AFTER INSERT OR UPDATE OR DELETE ON public.warehouses
    FOR EACH ROW EXECUTE PROCEDURE public.handle_warehouse_reputation_change();

DROP TRIGGER IF EXISTS on_profile_ban_changed ON public.profiles;
CREATE TRIGGER on_profile_ban_changed
    AFTER UPDATE OF is_banned ON public.profiles
    FOR EACH ROW EXECUTE PROCEDURE public.handle_profile_ban_change();
