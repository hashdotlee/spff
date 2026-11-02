-- ============================================================
-- MIGRATION: Bổ sung tính năng đánh giá khả năng nổ đơn theo thời gian thực
-- Các mức đánh giá:
--   'ngon' (4 điểm) - Nổ đơn ầm ầm / Rất nhiều đơn
--   'tam'  (3 điểm) - Đơn túc tắc / Tạm ổn
--   'khe'  (2 điểm) - Ít đơn / Chờ lâu / Khê
--   'mom'  (1 điểm) - Móm / Không có đơn nào
-- ============================================================

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

-- Index tra cứu theo kho và khung giờ
CREATE INDEX IF NOT EXISTS idx_order_ratings_wh_hour 
ON public.location_order_ratings (warehouse_id, hour_of_day);

CREATE INDEX IF NOT EXISTS idx_order_ratings_created 
ON public.location_order_ratings (warehouse_id, created_at DESC);

-- Kích hoạt RLS
ALTER TABLE public.location_order_ratings ENABLE ROW LEVEL SECURITY;

-- 1. Xem đánh giá: Cho phép tất cả mọi người (công khai)
DROP POLICY IF EXISTS "Order ratings are viewable by everyone" ON public.location_order_ratings;
CREATE POLICY "Order ratings are viewable by everyone" 
ON public.location_order_ratings
FOR SELECT USING (true);

-- 2. Thêm đánh giá: Tài xế đã đăng nhập và không bị cấm
DROP POLICY IF EXISTS "Authenticated users can create order ratings" ON public.location_order_ratings;
CREATE POLICY "Authenticated users can create order ratings" 
ON public.location_order_ratings
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND
  NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_banned = true)
);

-- 3. Xóa đánh giá: Người tạo hoặc Admin
DROP POLICY IF EXISTS "Users and admins can delete order ratings" ON public.location_order_ratings;
CREATE POLICY "Users and admins can delete order ratings" 
ON public.location_order_ratings
FOR DELETE USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
