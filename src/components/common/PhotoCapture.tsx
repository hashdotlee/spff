'use client';

import { useState, useRef } from 'react';
import { Camera, Image as ImageIcon, X, Check, RefreshCw, Zap, Loader2 } from 'lucide-react';
import {
  compressImageWithDetails,
  formatBytes,
  type ImageCompressionResult,
} from '@/lib/utils/imageUpload';

interface PhotoCaptureProps {
  label?: string;
  helperText?: string;
  required?: boolean;
  onPhotoSelected: (file: Blob | null, previewUrl: string | null) => void;
  onCompressionComplete?: (result: ImageCompressionResult | null) => void;
  className?: string;
}

export function PhotoCapture({
  label = 'Ảnh chụp hiện trường',
  helperText,
  required = false,
  onPhotoSelected,
  onCompressionComplete,
  className = '',
}: PhotoCaptureProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressionInfo, setCompressionInfo] = useState<ImageCompressionResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      // Nén ảnh bằng Canvas với chi tiết thông số
      const result = await compressImageWithDetails(file, 1280, 1280, 0.82);
      const url = URL.createObjectURL(result.blob);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setPreviewUrl(url);
      setCompressionInfo(result);
      onPhotoSelected(result.blob, url);
      onCompressionComplete?.(result);
    } catch (err) {
      console.error('Lỗi xử lý nén ảnh:', err);
      // Fallback dùng file gốc nếu nén gặp lỗi
      const url = URL.createObjectURL(file);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(url);
      setCompressionInfo(null);
      onPhotoSelected(file, url);
      onCompressionComplete?.(null);
    } finally {
      setIsProcessing(false);
      // Reset input value để có thể chọn lại file cùng tên nếu muốn
      e.target.value = '';
    }
  }

  function handleRemove() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setCompressionInfo(null);
    onPhotoSelected(null, null);
    onCompressionComplete?.(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-orange-600" />
            <span>{label}</span>
            {required && <span className="text-red-500 font-bold">*</span>}
          </span>
          {required && (
            <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
              Bắt buộc
            </span>
          )}
        </label>
      )}

      {helperText && <p className="text-[11px] text-slate-500 leading-tight">{helperText}</p>}

      {/* Hidden inputs: One for direct camera capture, one for gallery picker */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* When Photo is Selected */}
      {previewUrl ? (
        <div className="space-y-1.5">
          <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500/80 bg-slate-900 group shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Ảnh đã chụp"
              className="w-full h-48 sm:h-56 object-cover"
            />

            {/* Status badges */}
            <div className="absolute top-2 left-2 flex flex-col gap-1 z-10 max-w-[85%]">
              <div className="bg-emerald-600/95 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg backdrop-blur-xs flex items-center gap-1.5 shadow-sm w-fit">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>Đã có ảnh hiện trường</span>
              </div>

              {compressionInfo && compressionInfo.reductionPercentage > 0 && (
                <div className="bg-slate-900/90 text-emerald-300 text-[10px] font-medium px-2 py-0.5 rounded-lg backdrop-blur-xs flex items-center gap-1.5 shadow-md border border-emerald-500/30 w-fit">
                  <Zap className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>
                    Đã nén 4G: {formatBytes(compressionInfo.originalSize)} → {formatBytes(compressionInfo.compressedSize)} (-{compressionInfo.reductionPercentage}%)
                  </span>
                </div>
              )}
            </div>

            <div className="absolute bottom-2 right-2 flex items-center gap-2 z-10">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="px-2.5 py-1.5 bg-slate-900/80 hover:bg-slate-900 text-white text-xs font-medium rounded-lg backdrop-blur-xs flex items-center gap-1.5 shadow-md active:scale-95 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Chụp lại</span>
              </button>

              <button
                type="button"
                onClick={handleRemove}
                className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-md active:scale-95 transition"
                title="Xóa ảnh này"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Help notice */}
          {compressionInfo && (
            <p className="text-[11px] text-emerald-700 flex items-center gap-1 font-medium px-1">
              <Zap className="w-3 h-3 text-emerald-600" />
              <span>Ảnh đã được nén tối ưu trước khi gửi lên (tiết kiệm băng thông di động).</span>
            </p>
          )}
        </div>
      ) : (
        /* Action Buttons to capture/pick photo */
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-orange-300 hover:border-orange-500 bg-orange-50/50 hover:bg-orange-50/80 rounded-2xl transition active:scale-98 group cursor-pointer disabled:opacity-60"
            >
              <div className="w-11 h-11 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20 group-hover:scale-105 transition">
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Camera className="w-5 h-5" />
                )}
              </div>
              <span className="text-xs font-bold text-orange-900 mt-2">Chụp ảnh ngay</span>
              <span className="text-[10px] text-orange-700/80 mt-0.5">Bật camera điện thoại</span>
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 rounded-2xl transition active:scale-98 group cursor-pointer disabled:opacity-60"
            >
              <div className="w-11 h-11 rounded-full bg-slate-700 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition">
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ImageIcon className="w-5 h-5" />
                )}
              </div>
              <span className="text-xs font-bold text-slate-800 mt-2">Chọn từ máy</span>
              <span className="text-[10px] text-slate-500 mt-0.5">Thư viện ảnh có sẵn</span>
            </button>
          </div>

          {isProcessing && (
            <div className="flex items-center justify-center gap-2 p-2.5 bg-orange-50 rounded-xl border border-orange-200 text-orange-800 text-xs font-medium animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-600" />
              <span>Đang nén ảnh để tiết kiệm dung lượng 4G trước khi gửi...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
