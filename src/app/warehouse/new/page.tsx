'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { uploadImageToSupabase } from '@/lib/utils/imageUpload';
import { QuickVoiceInput } from '@/components/voice/QuickVoiceInput';
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
} from 'lucide-react';

export default function NewWarehousePage() {
  const router = useRouter();
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [name, setName] = useState('');
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
        (pos) => {
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
          setGpsReady(true);
        },
        (err) => {
          console.warn('Geolocation error:', err);
          setGpsReady(true); // Vẫn tiếp tục với tọa độ mặc định
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    }
  }, [supabase, router]);

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

      // Tên địa chỉ: nếu không nhập, tự đặt tên theo ngày giờ dễ nhận diện
      const now = new Date();
      const timeStr = `${now.getHours()}h${String(now.getMinutes()).padStart(2, '0')}`;
      const finalName = name.trim() || `Điểm ghim bến bãi (${timeStr})`;

      // A. Tải ảnh lên Storage
      setStatusText('Đang tải ảnh hiện trường lên...');
      const photoFileName = `${user.id}_${Date.now()}.jpg`;
      const uploadedImageUrl = await uploadImageToSupabase(supabase, photoBlob, {
        primaryBucket: 'warehouse-images',
        fileName: photoFileName,
        fallbackBucket: 'avatars',
        compress: true,
      });

      // B. Insert vào bảng warehouses
      setStatusText('Đang ghim vị trí lên bản đồ...');
      const insertPayload: any = {
        name: finalName,
        latitude: lat,
        longitude: lng,
        image_url: uploadedImageUrl,
        created_by: user.id,
        status: 'active',
      };

      let { data: whData, error: whError } = await supabase
        .from('warehouses')
        .insert(insertPayload)
        .select()
        .single();

      if (whError && (whError.code === '42703' || whError.message.includes('image_url'))) {
        delete insertPayload.image_url;
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

      // D. Cập nhật điểm cống hiến (+10đ cho ghim định vị, +5đ nếu kèm voice)
      try {
        const bonusPoints = audioBlob ? 15 : 10;
        const { data: prof } = await supabase
          .from('profiles')
          .select('reputation_score')
          .eq('id', user.id)
          .maybeSingle();

        if (prof) {
          await supabase
            .from('profiles')
            .update({
              reputation_score: (prof.reputation_score || 0) + bonusPoints,
            })
            .eq('id', user.id);
        }
      } catch (repErr) {
        console.warn('Lỗi cập nhật điểm cống hiến:', repErr);
      }

      // Hoàn tất -> chuyển thẳng đến trang chi tiết kho vừa tạo
      router.push(`/warehouse/${whData.id}`);
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

          {/* Optional Text Input */}
          <div className="pt-1 border-t border-slate-100">
            <div className="mb-2 space-y-0.5">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                Tên địa chỉ / Ghi chú bằng chữ
              </label>
              <span className="text-[10px] text-slate-400 font-medium block">
                (Tùy chọn)
              </span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Cổng 2 Kho Shopee Nam An Khánh..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
          </div>

          {/* Submit Button (Đăng luôn) */}
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSubmit()}
            className="w-full min-h-[50px] py-3.5 px-4 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 active:scale-[0.99] text-white font-extrabold rounded-2xl shadow-lg shadow-orange-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer mt-2"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{statusText || 'Đang đăng địa chỉ...'}</span>
              </div>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Đăng Ghim Địa Chỉ (+10đ ⭐)</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
