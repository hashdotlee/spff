-- ============================================================
-- MIGRATION: Cập nhật đánh giá nổ đơn theo tọa độ GPS định vị của người dùng
-- Thay vì gắn cứng vào kho gần nhất, tài xế báo nổ đơn tại chính vị trí hiện tại (latitude, longitude)
-- ============================================================

-- 1. Cho phép warehouse_id có thể NULL
ALTER TABLE public.location_order_ratings 
ALTER COLUMN warehouse_id DROP NOT NULL;

-- 2. Thêm cột tọa độ GPS & địa chỉ định vị
ALTER TABLE public.location_order_ratings 
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;

ALTER TABLE public.location_order_ratings 
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE public.location_order_ratings 
ADD COLUMN IF NOT EXISTS address TEXT;

-- 3. Điền tọa độ cho các bản ghi cũ từ kho (nếu có)
UPDATE public.location_order_ratings r
SET latitude = w.latitude, longitude = w.longitude, address = w.address
FROM public.warehouses w
WHERE r.warehouse_id = w.id AND r.latitude IS NULL;

-- 4. Index hỗ trợ tìm kiếm nhanh theo tọa độ và khung giờ
CREATE INDEX IF NOT EXISTS idx_order_ratings_coords 
ON public.location_order_ratings (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_order_ratings_hour 
ON public.location_order_ratings (hour_of_day);

CREATE INDEX IF NOT EXISTS idx_order_ratings_created_at 
ON public.location_order_ratings (created_at DESC);
