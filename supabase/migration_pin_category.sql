-- ============================================================
-- MIGRATION: Bổ sung phân loại cho địa chỉ được ghim
-- Phân loại gồm:
--   'warehouse': Kho hàng (Mặc định)
--   'eatery': Quán ăn
--   'customer': Địa chỉ khách hàng / Nhà khách
-- ============================================================

ALTER TABLE public.warehouses 
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'warehouse';

ALTER TABLE public.warehouses 
DROP CONSTRAINT IF EXISTS warehouses_category_check;

ALTER TABLE public.warehouses 
ADD CONSTRAINT warehouses_category_check 
CHECK (category IN ('warehouse', 'eatery', 'customer'));

-- Cập nhật các bản ghi cũ nếu chưa có category về 'warehouse'
UPDATE public.warehouses 
SET category = 'warehouse' 
WHERE category IS NULL;
