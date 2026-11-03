-- ============================================================
-- MIGRATION: Giới hạn 1 người nhận cứu hộ & Mời cafe cảm ơn
-- ============================================================

-- 1. Trigger kiểm tra: Mỗi sự cố chỉ cho phép 1 người nhận giúp (người đến trước nhận trước)
CREATE OR REPLACE FUNCTION public.check_incident_single_helper()
RETURNS trigger AS $$
DECLARE
    existing_helpers_count INT;
    incident_current_status TEXT;
BEGIN
    -- Chỉ kiểm tra khi trạng thái giúp là 'offered' hoặc 'accepted'
    IF NEW.status IN ('offered', 'accepted') THEN
        -- Kiểm tra sự cố còn mở hay đã đóng/hủy
        SELECT status INTO incident_current_status
        FROM public.incidents
        WHERE id = NEW.incident_id;

        IF incident_current_status = 'resolved' THEN
            RAISE EXCEPTION 'Sự cố này đã được cứu hộ xong!';
        ELSIF incident_current_status = 'cancelled' THEN
            RAISE EXCEPTION 'Sự cố này đã bị hủy!';
        END IF;

        -- Đếm số người KHÁC đang nhận giúp sự cố này
        SELECT COUNT(*)
        INTO existing_helpers_count
        FROM public.incident_helpers
        WHERE incident_id = NEW.incident_id
          AND helper_id != NEW.helper_id
          AND status IN ('offered', 'accepted');

        IF existing_helpers_count >= 1 THEN
            RAISE EXCEPTION 'Sự cố này đã có một đồng nghiệp khác nhận hỗ trợ rồi!';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_incident_single_helper ON public.incident_helpers;
CREATE TRIGGER trg_check_incident_single_helper
  BEFORE INSERT OR UPDATE ON public.incident_helpers
  FOR EACH ROW EXECUTE PROCEDURE public.check_incident_single_helper();

-- 2. Đảm bảo trigger đếm và cập nhật trạng thái hoạt động chính xác
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

    -- Lấy trạng thái hiện tại của sự cố
    SELECT status INTO current_status
    FROM public.incidents
    WHERE id = target_incident_id;

    -- Đếm số người đang chủ động giúp (offered / accepted)
    SELECT COUNT(*)
    INTO active_helpers_count
    FROM public.incident_helpers
    WHERE incident_id = target_incident_id
      AND status IN ('offered', 'accepted');

    -- Tự động cập nhật helper_count và trạng thái:
    -- Nếu có người giúp -> 'helping'
    -- Nếu người giúp hủy (active_helpers_count = 0) -> trả về 'open' để người khác nhìn thấy lại
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
