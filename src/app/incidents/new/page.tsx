'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { IncidentType } from '@/types/database';
import { uploadImageToSupabase } from '@/lib/utils/imageUpload';
import { QuickVoiceInput } from '@/components/voice/QuickVoiceInput';
import { reverseGeocode } from '@/lib/utils/geocoding';
import {
  Camera,
  Image as ImageIcon,
  ArrowLeft,
  CheckCircle2,
  Phone,
  Siren,
  Wrench,
  Fuel,
  Disc,
  Zap,
  AlertTriangle,
  HelpCircle,
  MapPin,
  Edit2,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';

const INCIDENT_TYPES: { type: IncidentType; label: string; icon: any }[] = [
  { type: 'broken_vehicle', label: 'Hỏng xe', icon: Wrench },
  { type: 'out_of_gas', label: 'Hết xăng/dầu', icon: Fuel },
  { type: 'flat_tire', label: 'Thủng lốp', icon: Disc },
  { type: 'battery_dead', label: 'Hết ắc quy', icon: Zap },
  { type: 'accident', label: 'Va chạm sự cố', icon: AlertTriangle },
  { type: 'other', label: 'Sự cố khác', icon: HelpCircle },
];

export default function NewIncidentPage() {
  const router = useRouter();
  const supabase = createClient();

  // Authentication & Phone check state
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [hasPhone, setHasPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isEditingPhone, setIsEditingPhone] = useState(false);

  // Form Fields (Tất cả đều optional theo yêu cầu)
  const [incidentType, setIncidentType] = useState<IncidentType>('broken_vehicle');
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [noteText, setNoteText] = useState('');

  // GPS Location
  const [lat, setLat] = useState(21.0285);
  const [lng, setLng] = useState(105.8542);
  const [gpsReady, setGpsReady] = useState(false);
  const [autoReverseAddress, setAutoReverseAddress] = useState<string | null>(null);

  // Submission State
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Kiểm tra đăng nhập và số điện thoại của tài xế
  useEffect(() => {
    async function initAuth() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login?redirectTo=/incidents/new');
          return;
        }

        setUserId(user.id);

        const { data: profile } = await supabase
          .from('profiles')
          .select('phone')
          .eq('id', user.id)
          .maybeSingle();

        const cleanDbPhone = profile?.phone ? profile.phone.trim() : '';
        if (cleanDbPhone.replace(/\D/g, '').length >= 9) {
          setPhone(cleanDbPhone);
          setPhoneInput(cleanDbPhone);
          setHasPhone(true);
        } else {
          setHasPhone(false);
        }
      } catch (err) {
        console.warn('Lỗi kiểm tra auth:', err);
      } finally {
        setCheckingAuth(false);
      }
    }

    initAuth();

    // Lấy GPS tọa độ của tài xế ngầm
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
            if (rev) setAutoReverseAddress(rev);
          } catch (e) {
            console.warn('Lỗi reverse geocode sự cố:', e);
          }
        },
        (err) => {
          console.warn('Geolocation error:', err);
          setGpsReady(true);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    }
  }, [supabase, router]);

  // Lưu số điện thoại khi chưa có SĐT
  async function handleSavePhone(e: React.FormEvent) {
    e.preventDefault();
    setPhoneError(null);

    const clean = phoneInput.trim().replace(/\s+/g, '');
    const digitsOnly = clean.replace(/\D/g, '');

    if (digitsOnly.length < 9 || digitsOnly.length > 11) {
      setPhoneError('Vui lòng nhập số điện thoại hợp lệ (từ 9 đến 11 số)');
      return;
    }

    setSavingPhone(true);
    try {
      if (!userId) {
        router.push('/login?redirectTo=/incidents/new');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ phone: clean })
        .eq('id', userId);

      if (error) {
        throw new Error(error.message);
      }

      setPhone(clean);
      setHasPhone(true);
      setIsEditingPhone(false);
    } catch (err: any) {
      setPhoneError(err?.message || 'Không thể lưu số điện thoại. Vui lòng thử lại!');
    } finally {
      setSavingPhone(false);
    }
  }

  // Xử lý ảnh hiện trường
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

  function handleRemovePhoto() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPhotoBlob(null);
  }

  // Phát tín hiệu cứu hộ khẩn cấp ngay tức thì
  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErrorMsg(null);

    if (!phone) {
      setHasPhone(false);
      return;
    }

    setLoading(true);
    setStatusText('Đang phát tín hiệu SOS khẩn cấp...');

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login?redirectTo=/incidents/new');
        return;
      }

      // 1. Upload ảnh nếu có (Tùy chọn)
      let uploadedPhotoUrl: string | null = null;
      if (photoBlob) {
        setStatusText('Đang tải ảnh hiện trường lên...');
        const photoFileName = `${user.id}_${Date.now()}.jpg`;
        uploadedPhotoUrl = await uploadImageToSupabase(supabase, photoBlob, {
          primaryBucket: 'incident-photos',
          fileName: photoFileName,
          fallbackBucket: 'avatars',
          compress: true,
        });
      }

      // 2. Upload file ghi âm nếu có (Tùy chọn)
      let uploadedAudioUrl: string | null = null;
      if (audioBlob) {
        try {
          setStatusText('Đang lưu ghi âm...');
          const fileExt = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
          const audioFileName = `incidents/${user.id}_${Date.now()}.${fileExt}`;

          const { data: uploadAudioData, error: uploadAudioError } = await supabase.storage
            .from('voice-notes')
            .upload(audioFileName, audioBlob, {
              contentType: audioBlob.type || 'audio/webm',
              cacheControl: '3600',
              upsert: true,
            });

          if (!uploadAudioError && uploadAudioData) {
            const {
              data: { publicUrl },
            } = supabase.storage.from('voice-notes').getPublicUrl(uploadAudioData.path);
            uploadedAudioUrl = publicUrl;
          }
        } catch (audioErr) {
          console.warn('Lỗi tải âm thanh sự cố, tiếp tục tạo SOS:', audioErr);
        }
      }

      // 3. Chuẩn hóa tiêu đề và mô tả tự động
      const typeObj = INCIDENT_TYPES.find((t) => t.type === incidentType);
      const typeLabel = typeObj ? typeObj.label : 'Sự cố xe';
      const now = new Date();
      const timeStr = `${now.getHours()}h${String(now.getMinutes()).padStart(2, '0')}`;
      const title = `SOS: Cần cứu hộ ${typeLabel.toLowerCase()} (${timeStr})`;

      let description = noteText.trim();
      if (!description) {
        description = uploadedAudioUrl
          ? 'Tài xế đã gửi ghi âm mô tả sự cố cần đồng nghiệp hỗ trợ.'
          : 'Tài xế đang gặp sự cố trên đường cần anh em đồng nghiệp hỗ trợ gấp.';
      }

      // 4. Insert vào bảng incidents
      setStatusText('Đang gửi đến đồng nghiệp xung quanh...');
      const insertPayload: any = {
        user_id: user.id,
        title,
        incident_type: incidentType || 'other',
        description,
        address: autoReverseAddress || null,
        latitude: lat,
        longitude: lng,
        photo_url: uploadedPhotoUrl || '',
        phone: phone.trim(),
        status: 'open',
        helper_count: 0,
      };

      if (uploadedAudioUrl) {
        insertPayload.audio_url = uploadedAudioUrl;
      }

      let { data, error } = await supabase
        .from('incidents')
        .insert(insertPayload)
        .select()
        .single();

      if (error && (error.code === '42703' || error.message.includes('audio_url'))) {
        delete insertPayload.audio_url;
        if (uploadedAudioUrl) {
          insertPayload.description = `${description}\n[Voice]: ${uploadedAudioUrl}`;
        }
        const retryResult = await supabase
          .from('incidents')
          .insert(insertPayload)
          .select()
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      if (error) {
        throw new Error(error.message);
      }

      if (data) {
        router.push(`/incidents/${data.id}`);
      }
    } catch (err: any) {
      console.error('Lỗi phát tín hiệu SOS:', err);
      setErrorMsg(err?.message || 'Đã có lỗi xảy ra khi phát SOS. Vui lòng thử lại.');
      setLoading(false);
      setStatusText(null);
    }
  }

  // Màn hình đang kiểm tra thông tin
  if (checkingAuth) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[60vh] text-center">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin mb-2" />
        <span className="text-xs text-slate-500 font-medium">Đang kiểm tra thông tin...</span>
      </div>
    );
  }

  // BƯỚC 1: BẮT BUỘC THÊM SỐ ĐIỆN THOẠI NẾU CHƯA CÓ
  if (!hasPhone || isEditingPhone) {
    return (
      <div className="p-4 sm:p-6 max-w-md mx-auto w-full flex-1 flex flex-col justify-center">
        <div className="bg-white rounded-3xl border border-red-200 p-5 sm:p-7 shadow-lg text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto shadow-inner">
            <Phone className="w-8 h-8 animate-pulse" />
          </div>

          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              Thêm Số Điện Thoại Để Tiếp Tục
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
              Khi phát tín hiệu cứu hộ khẩn cấp, số điện thoại là <strong>bắt buộc</strong> để anh em đồng nghiệp có thể gọi trực tiếp và hỗ trợ bạn kịp thời.
            </p>
          </div>

          {phoneError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-xs text-left">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{phoneError}</span>
            </div>
          )}

          <form onSubmit={handleSavePhone} className="space-y-3 pt-1">
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                required
                autoFocus
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="Nhập số điện thoại của bạn..."
                className="w-full pl-10 pr-4 py-3.5 text-base font-bold text-center tracking-wider rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500 bg-slate-50 focus:bg-white transition"
              />
            </div>

            <button
              type="submit"
              disabled={savingPhone}
              className="w-full py-3.5 px-4 bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white font-bold rounded-xl shadow-md shadow-red-600/20 transition flex items-center justify-center gap-2 text-sm cursor-pointer disabled:opacity-50"
            >
              {savingPhone ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang lưu số điện thoại...</span>
                </div>
              ) : (
                <span>Lưu Số & Tiếp Tục ➔</span>
              )}
            </button>

            {hasPhone && (
              <button
                type="button"
                onClick={() => setIsEditingPhone(false)}
                className="text-xs text-slate-500 hover:text-slate-800 font-semibold py-1 block mx-auto cursor-pointer"
              >
                Hủy bỏ (dùng số cũ {phone})
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  // BƯỚC 2: GIAO DIỆN CỨU HỘ TỐI GIẢN (1 CHẠM GỬI NGAY, MỌI THỨ KHÁC OPTIONAL)
  return (
    <div className="p-3 sm:p-5 max-w-lg mx-auto w-full space-y-3.5 pb-24 sm:pb-10">
      {/* Hidden file inputs */}
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/incidents"
            className="p-1.5 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition active:scale-95 shrink-0"
            title="Quay lại danh sách sự cố"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-1.5 truncate">
            <Siren className="w-5 h-5 text-red-600 shrink-0 animate-pulse" />
            <span className="truncate">Cứu Hộ Khẩn Cấp (SOS)</span>
          </h1>
        </div>

        <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full shrink-0 border border-slate-200">
          <MapPin className={`w-3.5 h-3.5 ${gpsReady ? 'text-emerald-600' : 'text-amber-500 animate-pulse'}`} />
          <span>{gpsReady ? 'GPS Sẵn sàng' : 'Lấy GPS...'}</span>
        </div>
      </div>

      {/* Thông tin số điện thoại đã sẵn sàng */}
      <div className="flex items-center justify-between py-2 px-3 bg-red-50/70 border border-red-200/80 rounded-xl">
        <div className="flex items-center gap-2 text-xs">
          <Phone className="w-3.5 h-3.5 text-red-600 shrink-0" />
          <span className="text-slate-600 font-medium">SĐT gọi cứu hộ:</span>
          <span className="font-black text-red-700">{phone}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setPhoneInput(phone);
            setIsEditingPhone(true);
          }}
          className="text-xs font-bold text-slate-600 hover:text-red-700 flex items-center gap-0.5 cursor-pointer"
        >
          <Edit2 className="w-3 h-3" />
          <span>Đổi số</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Card Form Tối Giản */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-3.5 shadow-2xs">
        {/* 1. NÚT GỬI NGAY CẤP BÁCH Ở ĐẦU (Hoặc bấm ở cuối) */}
        <button
          type="button"
          disabled={loading}
          onClick={() => handleSubmit()}
          className="w-full py-4 px-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 active:scale-[0.98] text-white font-black text-base sm:text-lg rounded-2xl shadow-lg shadow-red-600/30 transition flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 ring-2 ring-red-400/40"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{statusText || 'Đang phát tín hiệu SOS...'}</span>
            </div>
          ) : (
            <>
              <Siren className="w-5 h-5 animate-pulse" />
              <span>GỬI YÊU CẦU CỨU HỘ NGAY 🚨</span>
            </>
          )}
        </button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-200 w-full" />
          <span className="bg-white px-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
            Bổ sung thông tin (Tùy chọn)
          </span>
        </div>

        {/* 2. Phân loại sự cố (Tùy chọn) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span>Phân loại sự cố</span>
            <span className="text-[10px] text-slate-400 font-normal normal-case">Tùy chọn</span>
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {INCIDENT_TYPES.map((item) => {
              const Icon = item.icon;
              const isSelected = incidentType === item.type;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setIncidentType(item.type)}
                  className={`py-2 px-1 rounded-xl border text-xs font-medium flex flex-col items-center justify-center gap-1 transition active:scale-95 cursor-pointer ${
                    isSelected
                      ? 'border-red-600 bg-red-50 text-red-700 font-bold shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-red-600' : 'text-slate-400'}`} />
                  <span className="truncate w-full text-center text-[11px]">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Ảnh hiện trường (Tùy chọn) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Camera className="w-3.5 h-3.5 text-slate-500" />
              <span>Ảnh hiện trường</span>
            </span>
            <span className="text-[10px] text-slate-400 font-normal normal-case">Tùy chọn</span>
          </label>

          {!photoBlob ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="py-2.5 px-2 rounded-xl border border-dashed border-slate-300 hover:border-red-400 bg-slate-50 hover:bg-red-50/40 text-slate-700 hover:text-red-700 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-slate-500" />
                <span>Chụp ảnh</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-2.5 px-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-slate-400" />
                <span>Chọn từ máy</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-2 bg-slate-50 border border-slate-200 rounded-xl">
              <img
                src={previewUrl!}
                alt="Hiện trường"
                className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Đã chọn ảnh</span>
                </span>
              </div>
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shrink-0 transition active:scale-95 flex items-center gap-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Bỏ ảnh</span>
              </button>
            </div>
          )}
        </div>

        {/* 4. Ghi âm lời nhắn (Tùy chọn) */}
        <div>
          <QuickVoiceInput
            label="Ghi âm lời nhắn (Tùy chọn)"
            helperText="Nói nhanh vị trí làn đường, cần hỗ trợ đồ gì..."
            accentColor="red"
            onAudioChange={(blob) => {
              setAudioBlob(blob);
            }}
          />
        </div>

        {/* 5. Ghi chú thêm (Tùy chọn) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Ghi chú thêm</span>
            <span className="text-[10px] text-slate-400 font-normal normal-case">Tùy chọn</span>
          </label>
          <input
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="VD: Cần kích gầm, chết máy gần chân cầu..."
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
          />
        </div>
      </div>
    </div>
  );
}
