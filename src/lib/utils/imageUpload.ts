import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Nén ảnh bằng Canvas trước khi upload để tiết kiệm băng thông 4G của tài xế.
 * Giữ kích thước tối đa 1280px và nén JPEG chất lượng 0.82 (~100-250KB).
 */
export async function compressImage(
  file: File | Blob,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.82
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // If running server-side or FileReader not available, return original
    if (typeof window === 'undefined' || typeof FileReader === 'undefined') {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('File không phải là định dạng ảnh hợp lệ'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Tính tỉ lệ co giãn
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(file);
        }

        // Vẽ ảnh lên canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Xuất blob JPEG
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Upload ảnh lên Supabase Storage với cơ chế tự động chuyển vùng bucket fallback
 * nếu bucket chính chưa được tạo trên dashboard.
 */
export async function uploadImageToSupabase(
  supabase: SupabaseClient,
  blob: Blob,
  options: {
    primaryBucket: string;
    fileName: string;
    fallbackBucket?: string;
  }
): Promise<string> {
  const { primaryBucket, fileName, fallbackBucket = 'avatars' } = options;

  // 1. Thử upload vào primary bucket
  try {
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(primaryBucket)
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: true,
      });

    if (!uploadError && uploadData) {
      const {
        data: { publicUrl },
      } = supabase.storage.from(primaryBucket).getPublicUrl(uploadData.path);
      return publicUrl;
    }

    // Nếu gặp lỗi bucket chưa tạo hoặc không có quyền, thử fallback sang avatars
    console.warn(`Lỗi upload ${primaryBucket}:`, uploadError?.message, '- Thử bucket fallback:', fallbackBucket);
  } catch (err) {
    console.warn(`Catch upload ${primaryBucket}:`, err);
  }

  // 2. Thử upload vào fallback bucket (mặc định 'avatars' đã có sẵn và public)
  const fallbackPath = `${primaryBucket}/${fileName}`;
  const { data: fbData, error: fbError } = await supabase.storage
    .from(fallbackBucket)
    .upload(fallbackPath, blob, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: true,
    });

  if (fbError || !fbData) {
    throw new Error(
      fbError?.message ||
        `Không thể tải ảnh lên hệ thống lưu trữ. Vui lòng kiểm tra kết nối mạng.`
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(fallbackBucket).getPublicUrl(fbData.path);
  return publicUrl;
}
