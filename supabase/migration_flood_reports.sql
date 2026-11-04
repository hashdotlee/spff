-- ============================================================
-- MIGRATION: Bổ sung tính năng Báo Điểm Ngập Lụt (flood_reports)
-- Bác tài có thể đánh dấu vị trí ngập hiện tại để cảnh báo đồng nghiệp
-- ============================================================

CREATE TABLE IF NOT EXISTS public.flood_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    note TEXT,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index tọa độ và thời gian tạo
CREATE INDEX IF NOT EXISTS idx_flood_reports_coords 
ON public.flood_reports (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_flood_reports_created 
ON public.flood_reports (created_at DESC);

-- Kích hoạt RLS
ALTER TABLE public.flood_reports ENABLE ROW LEVEL SECURITY;

-- 1. Xem điểm ngập lụt: Công khai cho mọi người
DROP POLICY IF EXISTS "Flood reports are viewable by everyone" ON public.flood_reports;
CREATE POLICY "Flood reports are viewable by everyone" 
ON public.flood_reports
FOR SELECT USING (true);

-- 2. Thêm điểm ngập lụt: Mọi người dùng (đã đăng nhập hoặc ẩn danh)
DROP POLICY IF EXISTS "Anyone can report flood" ON public.flood_reports;
CREATE POLICY "Anyone can report flood" 
ON public.flood_reports
FOR INSERT WITH CHECK (true);

-- 3. Xóa điểm ngập: Bác tài hoặc Admin có thể xóa khi nước đã rút
DROP POLICY IF EXISTS "Users and admins can delete flood reports" ON public.flood_reports;
DROP POLICY IF EXISTS "Anyone can delete flood reports" ON public.flood_reports;
CREATE POLICY "Anyone can delete flood reports" 
ON public.flood_reports
FOR DELETE USING (true);

-- Kích hoạt realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.flood_reports;
