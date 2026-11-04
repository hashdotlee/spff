'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { uploadImageToSupabase } from '@/lib/utils/imageUpload';
import { recalculateReputation } from '@/lib/utils/adminActions';
import { QuickVoiceInput } from '@/components/voice/QuickVoiceInput';
import { geocodeAddress, reverseGeocode } from '@/lib/utils/geocoding';
import { useProvince } from '@/lib/contexts/ProvinceContext';
import type { PlaceCategory } from '@/types/database';
import {
  Camera,
  Image as ImageIcon,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Send,
  AlertCircle,
  Loader2,
  MapPin,
  Sparkles,
  Building2,
  UtensilsCrossed,
  Home,
  CircleParking,
  Globe,
  Lock,
  Navigation2,
  Search,
  ChevronDown,
} from 'lucide-react';

export default function NewWarehousePage() {
  const router = useRouter();
  const { province, openPicker } = useProvince();
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [name, setName] = useState('');
  const [exactAddress, setExactAddress] = useState('');
  const [resolvedAddressCoords, setResolvedAddressCoords] = useState<{
    lat: number;
    lng: number;
    displayName: string;
  } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [autoReverseAddress, setAutoReverseAddress] = useState<string | null>(null);
  const [category, setCategory] = useState<PlaceCategory>('warehouse');
  const [isPrivate, setIsPrivate] = useState<boolean>(false);
  const [lat, setLat] = useState(21.0285);
  const [lng, setLng] = useState(105.8542);
  const [gpsReady, setGpsReady] = useState(false);

  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoTriggeredRef = useRef(false);

  const supabase = createClient();

  // 1. Tự động kiểm tra đăng nhập & lấy GPS ngầm
  useEffect(() => {
    supabase.auth.getUser().then((res: any) => {
      if (!res.data?.user) {
        router.push('/login?redirectTo=/warehouse/new');
      }
    });

    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const gLat = pos.coords.latitude;
          const gLng = pos.coords.longitude;
          setLat(gLat);
          setLng(gLng);
          setGpsReady(true);

          try {
            const rev = await reverseGeocode(gLat, gLng);
            if (rev) {
              setAutoReverseAddress(rev);
            }
          } catch (e) {
            console.warn('Lỗi reverse geocode GPS:', e);
          }
        },
        (err) => {
          console.warn('Geolocation error:', err);
          setGpsReady(true); // Vẫn tiếp tục với tọa độ mặc định
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    }
  }, [supabase, router]);

  // Tự động tìm kiếm tọa độ từ địa chỉ chính xác người dùng nhập (Debounce 700ms)
  useEffect(() => {
    const q = exactAddress.trim();
    if (!q || q.length < 3) {
      setResolvedAddressCoords(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsGeocoding(true);
      try {
        const results = await geocodeAddress(q, province);
        if (results && results.length > 0) {
          setResolvedAddressCoords({
            lat: results[0].latitude,
            lng: results[0].longitude,
            displayName: results[0].displayName,
          });
        } else {
          setResolvedAddressCoords(null);
        }
      } catch (err) {
        console.warn('Lỗi tra cứu địa chỉ chính xác:', err);
        setResolvedAddressCoords(null);
      } finally {
        setIsGeocoding(false);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [exactAddress, province]);

  // 2. Tự động bật camera ngay khi mở trang
  useEffect(() => {
    if (!autoTriggeredRef.current && !photoBlob) {
      autoTriggeredRef.current = true;
      const timer = setTimeout(() => {
        cameraInputRef.current?.click();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [photoBlob]);

  // 3. Xử lý khi chụp xong ảnh
  function handlePhotoCaptured(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPhotoBlob(file);
    e.target.value = '';
  }

  function resetForm() {
    if (previewUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch (e) {
        // ignore
      }
    }
    setPhotoBlob(null);
    setPreviewUrl(null);
    setAudioBlob(null);
    setAudioDuration(0);
    setName('');
    setExactAddress('');
    setResolvedAddressCoords(null);
    setIsGeocoding(false);
    setAutoReverseAddress(null);
    setCategory('warehouse');
    setIsPrivate(false);
    setLoading(false);
    setStatusText(null);
    setErrorMsg(null);
    autoTriggeredRef.current = false;
  }

  function handleRetakePhoto() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPhotoBlob(null);
    setTimeout(() => {
      cameraInputRef.current?.click();
    }, 50);
  }

  // 4. Đăng ngay (1 chạm)
  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErrorMsg(null);

    if (!photoBlob) {
      setErrorMsg('Vui lòng chụp ảnh bến bãi hoặc địa chỉ để hoàn tất ghim.');
      return;
    }

    setLoading(true);
    setStatusText('Đang nén ảnh hiện trường...');

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMsg('Vui lòng đăng nhập để ghim địa chỉ.');
        setLoading(false);
        return;
      }

      // Tên địa chỉ: nếu không nhập, tự đặt tên theo phân loại và thời gian
      const now = new Date();
      const timeStr = `${now.getHours()}h${String(now.getMinutes()).padStart(2, '0')}`;
      const defaultName =
        category === 'eatery'
          ? `Quán ăn (${timeStr})`
          : category === 'customer'
          ? `Địa chỉ khách (${timeStr})`
          : category === 'parking'
          ? `Bãi giữ xe (${timeStr})`
          : `Kho bãi (${timeStr})`;
      const finalName = name.trim() || defaultName;

      // A. Tải ảnh lên Storage
      setStatusText('Đang tải ảnh hiện trường lên...');
      const photoFileName = `${user.id}_${Date.now()}.jpg`;
      const uploadedImageUrl = await uploadImageToSupabase(supabase, photoBlob, {
        primaryBucket: 'warehouse-images',
        fileName: photoFileName,
        fallbackBucket: 'avatars',
        compress: true,
      });

      // Xác định tọa độ & địa chỉ: Ưu tiên địa chỉ chính xác nếu người dùng nhập
      let finalLat = lat;
      let finalLng = lng;
      let finalAddress = exactAddress.trim() || autoReverseAddress || null;

      if (exactAddress.trim()) {
        const fullAddr = exactAddress.toLowerCase().includes(province.toLowerCase())
          ? exactAddress.trim()
          : `${exactAddress.trim()}, ${province}`;

        if (resolvedAddressCoords) {
          finalLat = resolvedAddressCoords.lat;
          finalLng = resolvedAddressCoords.lng;
          finalAddress = fullAddr;
        } else {
          // Thử tra cứu geocode lần cuối trước khi insert
          try {
            setStatusText('Đang định vị theo địa chỉ chính xác...');
            const results = await geocodeAddress(exactAddress.trim(), province);
            if (results && results.length > 0) {
              finalLat = results[0].latitude;
              finalLng = results[0].longitude;
              finalAddress = fullAddr;
            }
          } catch (e) {
            console.warn('Lỗi geocode trước khi lưu:', e);
          }
        }
      }

      // B. Insert vào bảng warehouses (kèm category, is_private & address)
      setStatusText('Đang ghim vị trí lên bản đồ...');
      const insertPayload: any = {
        name: finalName,
        address: finalAddress,
        latitude: finalLat,
        longitude: finalLng,
        image_url: uploadedImageUrl,
        created_by: user.id,
        category: category,
        is_private: isPrivate,
        status: 'active',
      };

      let { data: whData, error: whError } = await supabase
        .from('warehouses')
        .insert(insertPayload)
        .select()
        .single();

      if (whError && (whError.code === '42703' || whError.message.includes('image_url') || whError.message.includes('category') || whError.message.includes('is_private') || whError.message.includes('address'))) {
        delete insertPayload.image_url;
        delete insertPayload.category;
        delete insertPayload.is_private;
        delete insertPayload.address;
        const retryResult = await supabase
          .from('warehouses')
          .insert(insertPayload)
          .select()
          .single();
        whData = retryResult.data;
        whError = retryResult.error;
      }

      if (whError || !whData) {
        throw new Error(whError?.message || 'Không thể tạo bản ghi vị trí.');
      }

      // C. Nếu có thu âm chỉ dẫn, tải voice note lên và liên kết ngay
      if (audioBlob) {
        try {
          setStatusText('Đang lưu chỉ dẫn bằng giọng nói...');
          const fileExt = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
          const audioFileName = `${whData.id}/${user.id}_${Date.now()}.${fileExt}`;

          const { data: uploadAudioData, error: uploadAudioError } = await supabase.storage
            .from('voice-notes')
            .upload(audioFileName, audioBlob, {
              contentType: audioBlob.type || 'audio/webm',
              cacheControl: '3600',
              upsert: true,
            });

          if (!uploadAudioError && uploadAudioData) {
            const {
              data: { publicUrl: audioPublicUrl },
            } = supabase.storage.from('voice-notes').getPublicUrl(uploadAudioData.path);

            await supabase.from('voice_notes').insert({
              warehouse_id: whData.id,
              user_id: user.id,
              audio_url: audioPublicUrl,
              duration_seconds: audioDuration || 1,
              note_text: name.trim() || null,
              status: 'active',
            });
          }
        } catch (audioErr) {
          console.warn('Lỗi lưu voice note, vẫn hoàn thành ghim kho:', audioErr);
        }
      }

      // D. Cập nhật lại điểm cống hiến chuẩn xác (+10đ mỗi điểm ghim CÔNG KHAI, +5đ mỗi voice)
      try {
        await recalculateReputation(supabase, user.id);
      } catch (repErr) {
        console.warn('Lỗi cập nhật điểm cống hiến:', repErr);
      }

      const createdWhId = whData.id;

      // Reset form hoàn toàn để lần ghim sau bắt đầu lại từ đầu, không bị dính state cũ hay loading
      resetForm();

      // Hoàn tất -> chuyển thẳng đến trang chi tiết kho vừa tạo
      router.push(`/warehouse/${createdWhId}`);
    } catch (err: any) {
      console.error('Lỗi ghim địa chỉ:', err);
      setErrorMsg(err?.message || 'Đã có lỗi xảy ra. Vui lòng thử lại.');
      setLoading(false);
      setStatusText(null);
    }
  }

  return (
    <div className="p-3 sm:p-6 max-w-lg mx-auto w-full">
      {/* Hidden file inputs for direct camera or file pick */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoCaptured}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoCaptured}
      />

      {/* Top Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-1.5">
              <span>Ghim Địa Chỉ / Bến Bãi</span>
            </h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                ⭐ +10 điểm cống hiến
              </span>
              <span className="text-[11px] text-slate-500">
                Chụp ảnh hiện trường → Thu âm chỉ dẫn → Đăng ngay
              </span>
            </div>
          </div>
        </div>

        {/* GPS Status Indicator */}
        <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200 shrink-0">
          <MapPin className="w-3 h-3 text-emerald-600" />
          <span>{gpsReady ? 'GPS Sẵn sàng' : 'Đang lấy GPS...'}</span>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-red-700 text-xs shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* BƯỚC 1: CHỤP ẢNH (KHI CHƯA CÓ ẢNH)                       */}
      {/* ======================================================== */}
      {!photoBlob ? (
        <div className="space-y-3.5 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm text-center">
          <div className="space-y-1">
            <span className="px-2.5 py-0.5 bg-orange-100 text-orange-800 text-[10px] font-black uppercase tracking-wider rounded-full inline-block">
              Bước 1 / 2: Chụp ảnh hiện trường
            </span>
            <h2 className="text-base sm:text-lg font-black text-slate-900">
              Chụp Cổng Kho / Địa Chỉ
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              Bác tài chụp biển hiệu bến bãi, cổng vào hoặc mốc nhận diện để anh em đến nơi thấy ngay.
            </p>
          </div>

          {/* Large prominent shutter card */}
          <div className="py-4">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="w-full py-8 px-4 rounded-3xl border-2 border-dashed border-orange-400 bg-gradient-to-b from-orange-50/80 to-amber-50/50 hover:bg-orange-100/60 transition active:scale-98 flex flex-col items-center justify-center gap-3 cursor-pointer group shadow-sm"
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/30 group-hover:scale-105 transition">
                <Camera className="w-10 h-10 animate-pulse" />
              </div>
              <div>
                <span className="text-sm font-black text-orange-950 block">
                  BẬT CAMERA CHỤP NGAY 📸
                </span>
                <span className="text-[11px] text-orange-700/80 mt-0.5 block">
                  Chạm vào đây để mở máy ảnh điện thoại
                </span>
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 p-2 rounded-xl transition cursor-pointer"
          >
            <ImageIcon className="w-4 h-4 text-slate-400" />
            <span>Hoặc chọn ảnh có sẵn trong máy</span>
          </button>
        </div>
      ) : (
        /* ======================================================== */
        /* BƯỚC 2: CHỈ DẪN & ĐĂNG NGAY (KHI ĐÃ CÓ ẢNH)              */
        /* ======================================================== */
        <div className="space-y-4 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
          {/* Photo Preview Strip */}
          <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
            <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-900 shrink-0 border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl!}
                alt="Ảnh hiện trường"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Đã chụp ảnh hiện trường</span>
              </span>
              <span className="text-[11px] text-slate-500 block truncate">
                Tọa độ GPS đã tự động lưu
              </span>
            </div>
            <button
              type="button"
              onClick={handleRetakePhoto}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition active:scale-95 flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Chụp lại</span>
            </button>
          </div>

          {/* Quick Voice Recorder */}
          <div className="pt-1">
            <QuickVoiceInput
              label="Ghi âm chỉ dẫn đường vào"
              helperText="Thu âm bằng giọng nói: Tên ngõ, cổng phụ, biển hiệu hoặc lưu ý xe tải..."
              accentColor="orange"
              onAudioChange={(blob, duration) => {
                setAudioBlob(blob);
                setAudioDuration(duration);
              }}
            />
          </div>

          {/* Phân loại địa chỉ */}
          <div className="pt-1 border-t border-slate-100">
            <div className="mb-2 space-y-0.5">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                Phân loại địa điểm
              </label>
              <span className="text-[10px] text-slate-500 font-medium block">
                Mặc định là Kho hàng. Bấm chọn nếu là Quán ăn hoặc Địa chỉ khách.
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setCategory('warehouse')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer ${
                  category === 'warehouse'
                    ? 'border-orange-500 bg-orange-50 text-orange-800 ring-2 ring-orange-500/20 shadow-xs'
                    : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Building2 className={`w-5 h-5 ${category === 'warehouse' ? 'text-orange-600' : 'text-slate-400'}`} />
                <span>Kho hàng</span>
              </button>

              <button
                type="button"
                onClick={() => setCategory('eatery')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer ${
                  category === 'eatery'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <UtensilsCrossed className={`w-5 h-5 ${category === 'eatery' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>Quán ăn</span>
              </button>

              <button
                type="button"
                onClick={() => setCategory('customer')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer ${
                  category === 'customer'
                    ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20 shadow-xs'
                    : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Home className={`w-5 h-5 ${category === 'customer' ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>Nhà khách</span>
              </button>

              <button
                type="button"
                onClick={() => setCategory('parking')}
                className={`py-2.5 px-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer ${
                  category === 'parking'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <CircleParking className={`w-5 h-5 ${category === 'parking' ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>Bãi giữ xe</span>
              </button>
            </div>
          </div>

          {/* Quyền riêng tư địa điểm (Mặc định: Công khai) */}
          <div className="pt-2 border-t border-slate-100">
            <div className="mb-2 space-y-0.5">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                <span>Quyền riêng tư ghim</span>
                <span className="text-[10px] font-semibold text-slate-400 normal-case">
                  {isPrivate ? 'Riêng tư' : 'Mặc định: Công khai'}
                </span>
              </label>
              <span className="text-[10px] text-slate-500 font-medium block">
                Bạn có thể giữ ghim này cho riêng mình hoặc chia sẻ cho cả cộng đồng tài xế.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsPrivate(false)}
                className={`p-3 rounded-2xl border text-left transition active:scale-[0.98] cursor-pointer flex flex-col justify-between ${
                  !isPrivate
                    ? 'border-orange-500 bg-orange-50/80 ring-2 ring-orange-500/20 shadow-xs'
                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold flex items-center gap-1.5 ${!isPrivate ? 'text-orange-950' : 'text-slate-700'}`}>
                    <Globe className={`w-4 h-4 ${!isPrivate ? 'text-orange-600' : 'text-slate-400'}`} />
                    <span>Công khai</span>
                  </span>
                  <span className="w-3.5 h-3.5 rounded-full border border-orange-500 flex items-center justify-center bg-white shrink-0">
                    {!isPrivate && <span className="w-2 h-2 rounded-full bg-orange-600" />}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Ai cũng có thể xem & dẫn đường. <strong className="text-orange-700 font-bold">+10đ ⭐</strong> cống hiến.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIsPrivate(true)}
                className={`p-3 rounded-2xl border text-left transition active:scale-[0.98] cursor-pointer flex flex-col justify-between ${
                  isPrivate
                    ? 'border-purple-500 bg-purple-50/80 ring-2 ring-purple-500/20 shadow-xs'
                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold flex items-center gap-1.5 ${isPrivate ? 'text-purple-950' : 'text-slate-700'}`}>
                    <Lock className={`w-4 h-4 ${isPrivate ? 'text-purple-600' : 'text-slate-400'}`} />
                    <span>Riêng tư</span>
                  </span>
                  <span className="w-3.5 h-3.5 rounded-full border border-purple-500 flex items-center justify-center bg-white shrink-0">
                    {isPrivate && <span className="w-2 h-2 rounded-full bg-purple-600" />}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Chỉ mình bạn thấy điểm này trên bản đồ & hồ sơ. Hoàn toàn bí mật.
                </p>
              </button>
            </div>
          </div>

          {/* Optional Text Input */}
          <div className="pt-1 border-t border-slate-100">
            <div className="mb-2 space-y-0.5">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                Tên kho hoặc ghi chú
              </label>
              <span className="text-[10px] text-slate-400 font-medium block">
                (nếu có)
              </span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                category === 'eatery'
                  ? 'VD: Quán Cơm Xe Tải 79, Phở Bò Bác Ba...'
                  : category === 'customer'
                  ? 'VD: Nhà riêng anh Hùng, Cty Nhựa Tiến Đạt...'
                  : category === 'parking'
                  ? 'VD: Bãi đỗ xe tải BigC, Bãi xe bến xe Miền Đông...'
                  : 'VD: Cổng 2 Kho Shopee Nam An Khánh...'
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
          </div>

          {/* Địa chỉ chính xác (nếu có bổ sung cho định vị) */}
          <div className="pt-2 border-t border-slate-100">
            <div className="mb-1.5">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-orange-600" />
                <span>Địa chỉ chính xác</span>
                <span className="text-[10px] text-slate-400 font-medium normal-case">(nếu có)</span>
              </label>
            </div>

            <div className="relative">
              <input
                type="text"
                value={exactAddress}
                onChange={(e) => setExactAddress(e.target.value)}
                placeholder={
                  autoReverseAddress
                    ? `VD: ${autoReverseAddress}`
                    : `VD: Số 25 ngõ 102 đường Nguyễn Hoàng, Mỹ Đình (ở ${province})...`
                }
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {isGeocoding && <Loader2 className="w-4 h-4 animate-spin text-orange-600" />}
                {exactAddress && !isGeocoding && (
                  <button
                    type="button"
                    onClick={() => {
                      setExactAddress('');
                      setResolvedAddressCoords(null);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                    title="Xóa địa chỉ"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Gợi ý dùng tên đường từ GPS hiện tại */}
            {autoReverseAddress && !exactAddress && (
              <button
                type="button"
                onClick={() => setExactAddress(autoReverseAddress)}
                className="mt-1.5 text-[11px] text-slate-500 hover:text-orange-600 flex items-center gap-1 text-left transition active:scale-95 cursor-pointer flex-wrap"
              >
                <span>💡 Gợi ý theo GPS:</span>
                <span className="text-orange-700 underline font-semibold truncate max-w-[240px] xs:max-w-[300px]">
                  {autoReverseAddress}
                </span>
                <span className="text-[10px] bg-orange-100 text-orange-800 px-1.5 py-0.2 rounded font-bold">
                  Sử dụng
                </span>
              </button>
            )}
          </div>

          {/* Submit Button (Đăng luôn) */}
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSubmit()}
            className={`w-full min-h-[50px] py-3.5 px-4 active:scale-[0.99] text-white font-extrabold rounded-2xl shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer mt-2 ${
              isPrivate
                ? 'bg-gradient-to-r from-purple-700 to-indigo-600 hover:from-purple-800 hover:to-indigo-700 shadow-purple-500/25'
                : 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 shadow-orange-500/25'
            }`}
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{statusText || 'Đang lưu địa chỉ...'}</span>
              </div>
            ) : isPrivate ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Lưu Ghim Riêng Tư 🔒 (Chỉ Mình Tôi)</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Đăng Ghim Công Khai (+10đ ⭐)</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
