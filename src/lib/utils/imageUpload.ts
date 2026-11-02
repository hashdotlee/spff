import type { SupabaseClient } from '@supabase/supabase-js';

export interface ImageCompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  reductionPercentage: number;
  width: number;
  height: number;
}

export interface UploadImageOptions {
  primaryBucket: string;
  fileName: string;
  fallbackBucket?: string;
  /** Tự động nén ảnh trước khi tải lên (mặc định: true) */
  compress?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

/**
 * Định dạng dung lượng byte thành chuỗi dễ đọc (B, KB, MB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Nén ảnh bằng Canvas với chi tiết thông số kích thước và dung lượng tiết kiệm được.
 * Dùng ObjectURL trực tiếp để tránh tiêu tốn RAM trên thiết bị di động của tài xế.
 */
export async function compressImageWithDetails(
  file: File | Blob,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.82
): Promise<ImageCompressionResult> {
  const originalSize = file.size;

  // Nếu chạy trên server-side hoặc không có Window/Canvas, trả về nguyên bản
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return {
      blob: file,
      originalSize,
      compressedSize: originalSize,
      savedBytes: 0,
      reductionPercentage: 0,
      width: 0,
      height: 0,
    };
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    // Hỗ trợ xử lý orientation chuẩn trên mọi trình duyệt
    img.crossOrigin = 'anonymous';

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('File không phải là định dạng ảnh hợp lệ hoặc bị hỏng'));
    };

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const naturalWidth = img.naturalWidth || img.width;
      const naturalHeight = img.naturalHeight || img.height;

      // Tính tỉ lệ co giãn đều cả 2 chiều, không bao giờ vượt quá maxWidth/maxHeight
      const ratio = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
      const targetWidth = Math.max(1, Math.round(naturalWidth * ratio));
      const targetHeight = Math.max(1, Math.round(naturalHeight * ratio));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return resolve({
          blob: file,
          originalSize,
          compressedSize: originalSize,
          savedBytes: 0,
          reductionPercentage: 0,
          width: naturalWidth,
          height: naturalHeight,
        });
      }

      // Đảm bảo chất lượng làm mịn ảnh khi resize
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // Xuất blob định dạng JPEG với chất lượng được tối ưu
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            return resolve({
              blob: file,
              originalSize,
              compressedSize: originalSize,
              savedBytes: 0,
              reductionPercentage: 0,
              width: targetWidth,
              height: targetHeight,
            });
          }

          // Nếu file gốc vốn đã nhỏ hơn blob nén mới (thường gặp khi ảnh JPEG gốc đã quá nhỏ),
          // ưu tiên giữ nguyên file gốc để không làm tăng dung lượng
          const useOriginal =
            file.type === 'image/jpeg' &&
            file.size <= blob.size &&
            naturalWidth <= maxWidth &&
            naturalHeight <= maxHeight;

          const chosenBlob = useOriginal ? file : blob;
          const compressedSize = chosenBlob.size;
          const savedBytes = Math.max(0, originalSize - compressedSize);
          const reductionPercentage =
            originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0;

          resolve({
            blob: chosenBlob,
            originalSize,
            compressedSize,
            savedBytes,
            reductionPercentage,
            width: targetWidth,
            height: targetHeight,
          });
        },
        'image/jpeg',
        quality
      );
    };

    img.src = objectUrl;
  });
}

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
  const result = await compressImageWithDetails(file, maxWidth, maxHeight, quality);
  return result.blob;
}

/**
 * Upload ảnh lên Supabase Storage với cơ chế tự động nén trước khi gửi
 * và tự chuyển vùng bucket fallback nếu bucket chính chưa được tạo trên dashboard.
 */
export async function uploadImageToSupabase(
  supabase: SupabaseClient,
  fileOrBlob: File | Blob,
  options: UploadImageOptions
): Promise<string> {
  const {
    primaryBucket,
    fileName,
    fallbackBucket = 'avatars',
    compress = true,
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.82,
  } = options;

  let blobToUpload: Blob = fileOrBlob;

  // 1. Tự động kiểm tra và nén ảnh trước khi upload nếu chưa nén hoặc dung lượng lớn (> 150KB)
  if (compress) {
    try {
      if (fileOrBlob.size > 150 * 1024 || fileOrBlob.type !== 'image/jpeg') {
        blobToUpload = await compressImage(fileOrBlob, maxWidth, maxHeight, quality);
      }
    } catch (compressErr) {
      console.warn('Không thể nén ảnh tự động trước khi gửi, tiếp tục với file hiện tại:', compressErr);
      blobToUpload = fileOrBlob;
    }
  }

  // 2. Thử upload vào primary bucket
  try {
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(primaryBucket)
      .upload(fileName, blobToUpload, {
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

  // 3. Thử upload vào fallback bucket (mặc định 'avatars' đã có sẵn và public)
  const fallbackPath = `${primaryBucket}/${fileName}`;
  const { data: fbData, error: fbError } = await supabase.storage
    .from(fallbackBucket)
    .upload(fallbackPath, blobToUpload, {
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
