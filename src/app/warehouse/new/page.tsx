'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MapPin, Plus, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { PhotoCapture } from '@/components/common/PhotoCapture';
import { uploadImageToSupabase } from '@/lib/utils/imageUpload';

const LocationPicker = dynamic(() => import('@/components/map/LocationPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full rounded-2xl bg-slate-100 border border-slate-200 animate-pulse flex flex-col items-center justify-center text-xs text-slate-500 gap-2">
      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      <span>Đang tải bản đồ chọn vị trí...</span>
    </div>
  ),
});

export default function NewWarehousePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [lat, setLat] = useState(21.0285);
  const [lng, setLng] = useState(105.8542);
  const [loading, setLoading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    // Check auth
    supabase.auth.getUser().then((res: any) => {
      if (!res.data?.user) {
        router.push('/login?redirectTo=/warehouse/new');
      }
    });

    // Try auto-getting current GPS position on load
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
        },
        () => {},
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, [supabase, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    setUploadStatusText('Đang kiểm tra thông tin...');

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMsg('Vui lòng đăng nhập để ghim kho mới.');
        return;
      }

      // 1. Upload ảnh nếu có chụp
      let uploadedImageUrl: string | null = null;
      if (imageBlob) {
        try {
          setUploadStatusText('Đang tải ảnh cổng kho lên...');
          const fileName = `${user.id}_${Date.now()}.jpg`;
          uploadedImageUrl = await uploadImageToSupabase(supabase, imageBlob, {
            primaryBucket: 'warehouse-images',
            fileName,
            fallbackBucket: 'avatars',
          });
        } catch (imgErr: any) {
          console.warn('Không thể upload ảnh kho:', imgErr?.message);
          // Không chặn tạo kho nếu upload ảnh bị lỗi
        }
      }

      setUploadStatusText('Đang ghim kho lên bản đồ...');

      // 2. Thử insert có image_url
      const insertPayload: any = {
        name: name.trim(),
        address: address.trim() || null,
        latitude: lat,
        longitude: lng,
        description: description.trim() || null,
        created_by: user.id,
        status: 'active',
      };

      if (uploadedImageUrl) {
        insertPayload.image_url = uploadedImageUrl;
      }

      let { data, error } = await supabase
        .from('warehouses')
        .insert(insertPayload)
        .select()
        .single();

      // Nếu cột image_url chưa có trong DB (lỗi 42703), fallback insert không có image_url
      if (error && (error.code === '42703' || error.message.includes('image_url'))) {
        delete insertPayload.image_url;
        const retryResult = await supabase
          .from('warehouses')
          .insert(insertPayload)
          .select()
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data) {
        router.push(`/warehouse/${data.id}`);
      }
    } catch {
      setErrorMsg('Đã xảy ra lỗi khi tạo kho mới. Vui lòng thử lại.');
    } finally {
      setLoading(false);
      setUploadStatusText(null);
    }
  }

  return (
    <div className="p-3 sm:p-6 max-w-xl mx-auto w-full">
      <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-5">
        <Link
          href="/"
          className="p-2 -ml-1.5 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
          Ghim Vị Trí Kho Mới
        </h1>
      </div>

      {errorMsg && (
        <div className="mb-4 sm:mb-5 p-3 sm:p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-xs sm:text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Tên kho hàng / Bến bãi *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Kho Shopee Express Nam An Khánh"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Địa chỉ chi tiết (nếu biết)
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="VD: Cổng số 2, KĐT Nam An Khánh, Hoài Đức, Hà Nội"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-orange-600" />
            <span>Chọn tọa độ cổng vào trên bản đồ *</span>
          </label>
          <LocationPicker
            initialLat={lat}
            initialLng={lng}
            onLocationChange={(newLat, newLng) => {
              setLat(newLat);
              setLng(newLng);
            }}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Lưu ý đường vào & Quy định bãi
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="VD: Xe 5 tấn vào thoải mái, quay đầu trong sân kho. Lưu ý giờ cao điểm 6h30-8h30 sáng hay bị CSGT kiểm tra..."
            className="w-full p-3 rounded-xl border border-slate-300 text-base sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
          />
        </div>

        {/* Chụp ảnh cổng kho / hiện trường */}
        <div className="pt-1 border-t border-slate-100">
          <PhotoCapture
            label="Chụp ảnh cổng kho / Biển hiệu bến bãi"
            helperText="Khuyên dùng: Bác tài chụp ảnh cổng bến bãi hoặc cột mốc dễ nhìn để anh em đồng nghiệp đến nơi nhận diện ngay."
            required={false}
            onPhotoSelected={(blob) => setImageBlob(blob)}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full min-h-[48px] py-3.5 px-4 bg-orange-600 hover:bg-orange-700 active:scale-[0.99] text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>{uploadStatusText || 'Đang ghim kho lên bản đồ...'}</span>
            </div>
          ) : (
            <>
              <Plus className="w-5 h-5" />
              <span>Ghim Kho & Thu Âm Chỉ Dẫn</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
