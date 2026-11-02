-- ============================================================
-- MIGRATION: Bổ sung thêm phân loại 'parking' (Bãi giữ xe) cho địa chỉ được ghim
-- Phân loại gồm:
--   'warehouse': Kho hàng (Mặc định)
--   'eatery': Quán ăn
--   'customer': Địa chỉ khách hàng / Nhà khách
--   'parking': Bãi giữ xe / Đỗ xe
-- ============================================================

ALTER TABLE public.warehouses 
DROP CONSTRAINT IF EXISTS warehouses_category_check;

ALTER TABLE public.warehouses 
ADD CONSTRAINT warehouses_category_check 
CHECK (category IN ('warehouse', 'eatery', 'customer', 'parking'));
