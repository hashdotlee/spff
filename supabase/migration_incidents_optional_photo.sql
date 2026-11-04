-- ============================================================
-- MIGRATION: Cho phép ảnh hiện trường sự cố cứu hộ là tùy chọn (optional)
-- ============================================================

ALTER TABLE public.incidents ALTER COLUMN photo_url DROP NOT NULL;
