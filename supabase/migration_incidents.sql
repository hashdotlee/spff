-- ============================================================
-- MIGRATION: Báo cáo sự cố khẩn cấp (SOS) & Chụp ảnh ghim kho
-- ============================================================

-- 1. Thêm cột image_url cho bảng warehouses (Chụp ảnh cổng kho / hiện trường bến bãi)
ALTER TABLE public.warehouses 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Bảng Incidents (Sự cố cứu hộ xe trên đường: hỏng xe, hết xăng, thủng lốp...)
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    incident_type TEXT NOT NULL CHECK (incident_type IN ('broken_vehicle', 'out_of_gas', 'flat_tire', 'battery_dead', 'accident', 'other')),
    description TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address TEXT,
    photo_url TEXT NOT NULL, -- Ảnh hiện trường bắt buộc để chứng minh
    phone TEXT NOT NULL,     -- SĐT liên hệ khẩn cấp
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'helping', 'resolved', 'cancelled')),
    helper_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Chỉ mục tối ưu truy vấn sự cố gần và trạng thái
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON public.incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_user_id ON public.incidents(user_id);

-- 3. Bảng Incident Helpers (Người nhận trợ giúp sự cố)
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

-- 4. Trigger tự động đếm số người giúp và cập nhật trạng thái sự cố
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

    -- Tự động cập nhật helper_count và trạng thái
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

-- 5. Row Level Security (RLS) Policies
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_helpers ENABLE ROW LEVEL SECURITY;

-- Policy xem: Ai cũng xem được danh sách sự cố
CREATE POLICY "Incidents are viewable by everyone" ON public.incidents
  FOR SELECT USING (true);

-- Policy tạo: Tài xế đã đăng nhập và không bị ban
CREATE POLICY "Authenticated users can create incidents" ON public.incidents
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_banned = true)
  );

-- Policy sửa: Chủ bài hoặc Admin hoặc Helper liên quan
CREATE POLICY "Owners, helpers and admins can update incidents" ON public.incidents
  FOR UPDATE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.incident_helpers WHERE incident_id = public.incidents.id AND helper_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Policy xóa: Chủ bài hoặc Admin
CREATE POLICY "Owners and admins can delete incidents" ON public.incidents
  FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Policy Helpers
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

-- 6. Cấu hình Storage Buckets cho ảnh sự cố và ảnh kho
INSERT INTO storage.buckets (id, name, public)
VALUES ('incident-photos', 'incident-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('warehouse-images', 'warehouse-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
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
