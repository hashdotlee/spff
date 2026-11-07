-- ============================================================
-- MIGRATION: Thêm hỗ trợ tải ảnh trong Bảng Tin Bác Tài (Feeds / Posts)
-- Tự động nén ảnh trước khi tải lên và lưu vào Supabase Storage
-- ============================================================

-- 1. Thêm cột image_url vào bảng posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Cho phép content có thể để trống nếu đã có image_url
ALTER TABLE public.posts ALTER COLUMN content DROP NOT NULL;

-- 3. Đảm bảo bài viết hợp lệ phải có ít nhất nội dung chữ hoặc hình ảnh
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'posts_content_or_image_check'
    ) THEN
        ALTER TABLE public.posts
        ADD CONSTRAINT posts_content_or_image_check
        CHECK (
            (content IS NOT NULL AND char_length(trim(content)) > 0)
            OR (image_url IS NOT NULL AND char_length(trim(image_url)) > 0)
        );
    END IF;
END $$;

-- 4. Tạo Storage Bucket cho feed-images (nếu chưa có)
INSERT INTO storage.buckets (id, name, public)
VALUES ('feed-images', 'feed-images', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Thiết lập chính sách bảo mật RLS cho feed-images bucket
DROP POLICY IF EXISTS "Public Read for feed-images" ON storage.objects;
CREATE POLICY "Public Read for feed-images" ON storage.objects
  FOR SELECT USING (bucket_id = 'feed-images');

DROP POLICY IF EXISTS "Authenticated users can upload feed-images" ON storage.objects;
CREATE POLICY "Authenticated users can upload feed-images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'feed-images' AND
    auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Users can update their own feed-images" ON storage.objects;
CREATE POLICY "Users can update their own feed-images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'feed-images' AND
    auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Users can delete their own feed-images" ON storage.objects;
CREATE POLICY "Users can delete their own feed-images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'feed-images' AND
    auth.uid() IS NOT NULL
  );
