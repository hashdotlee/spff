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
  RefreshCw,
  Send,
  AlertCircle,
  Loader2,
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
} from 'lucide-react';

const INCIDENT_TYPES: { type: IncidentType; label: string; icon: any }[] = [
  { type: 'broken_vehicle', label: 'Hỏng xe', icon: Wrench },
  { type: 'out_of_gas', label: 'Hết xăng/dầu', icon: Fuel },
  { type: 'flat_tire', label: 'Thủng/nổ lốp', icon: Disc },
  { type: 'battery_dead', label: 'Hết ắc quy', icon: Zap },
  { type: 'accident', label: 'Va chạm sự cố', icon: AlertTriangle },
  { type: 'other', label: 'Sự cố khác', icon: HelpCircle },
];

export default function NewIncidentPage() {
  const router = useRouter();
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [incidentType, setIncidentType] = useState<IncidentType>('broken_vehicle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [phone, setPhone] = useState('');
  const [hasAccountPhone, setHasAccountPhone] = useState<boolean | null>(null);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [lat, setLat] = useState(21.0285);
  const [lng, setLng] = useState(105.8542);
  const [gpsReady, setGpsReady] = useState(false);
  const [autoReverseAddress, setAutoReverseAddress] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  // 1. Tự động kiểm tra đăng nhập, nạp SĐT từ tài khoản & lấy GPS ngầm
  useEffect(() => {
    supabase.auth.getUser().then(async (res: any) => {
      const user = res.data?.user;
      if (!user) {
        router.push('/login?redirectTo=/incidents/new');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.phone && profile.phone.trim().length >= 8) {
        setPhone(profile.phone.trim());
        setHasAccountPhone(true);
      } else {
        setHasAccountPhone(false);
        setIsEditingPhone(true);
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

  // 2. Xử lý ảnh hiện trường
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
    setIncidentType('broken_vehicle');
    setAudioBlob(null);
    setAudioDuration(0);
    setNoteText('');
    setLoading(false);
    setStatusText(null);
    setErrorMsg(null);
  }

  // 3. Phát tín hiệu SOS cứu hộ
  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.replace(/\D/g, '').length < 9) {
      setErrorMsg('Vui lòng nhập số điện thoại hợp lệ (9-11 số) để đồng nghiệp gọi khi đến cứu trợ.');
      setIsEditingPhone(true);
      return;
    }

    if (!photoBlob) {
      setErrorMsg('Vui lòng chụp ảnh hiện trường xe gặp sự cố để đồng nghiệp chuẩn bị dụng cụ.');
      return;
    }

    setLoading(true);
    setStatusText('Đang nén ảnh hiện trường...');

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMsg('Vui lòng đăng nhập để phát tín hiệu SOS.');
        setLoading(false);
        return;
      }

      // Lưu / cập nhật SĐT vào profile tài xế để lần sau tự động dùng
      await supabase
        .from('profiles')
        .update({ phone: cleanPhone })
        .eq('id', user.id);

      // A. Upload ảnh hiện trường
      setStatusText('Đang tải ảnh hiện trường lên...');
      const photoFileName = `${user.id}_${Date.now()}.jpg`;
      const uploadedPhotoUrl = await uploadImageToSupabase(supabase, photoBlob, {
        primaryBucket: 'incident-photos',
        fileName: photoFileName,
        fallbackBucket: 'avatars',
        compress: true,
      });

      // B. Upload file âm thanh nếu có
      let uploadedAudioUrl: string | null = null;
      if (audioBlob) {
        try {
          setStatusText('Đang lưu lời nhắn âm thanh...');
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

      // Tiêu đề & Mô tả tự động chuẩn hóa
      const typeObj = INCIDENT_TYPES.find((t) => t.type === incidentType);
      const typeLabel = typeObj ? typeObj.label : 'Sự cố xe';
      const now = new Date();
      const timeStr = `${now.getHours()}h${String(now.getMinutes()).padStart(2, '0')}`;
      const title = `SOS: Xe gặp sự cố ${typeLabel.toLowerCase()} (${timeStr})`;

      let description = noteText.trim();
      if (!description) {
        description = uploadedAudioUrl
          ? 'Tài xế đã gửi ảnh hiện trường và ghi âm chỉ dẫn cứu hộ.'
          : 'Tài xế đang gặp sự cố trên đường cần anh em đồng nghiệp hỗ trợ.';
      }

      // C. Insert vào bảng incidents
      setStatusText('Đang phát tín hiệu SOS khẩn cấp...');
      const insertPayload: any = {
        user_id: user.id,
        title,
        incident_type: incidentType,
        description,
        address: autoReverseAddress || null,
        latitude: lat,
        longitude: lng,
        photo_url: uploadedPhotoUrl,
        phone: cleanPhone,
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
        const createdIncidentId = data.id;
        resetForm();
        router.push(`/incidents/${createdIncidentId}`);
      }
    } catch (err: any) {
      console.error('Lỗi phát tín hiệu SOS:', err);
      setErrorMsg(err?.message || 'Đã có lỗi xảy ra khi phát SOS. Vui lòng thử lại.');
      setLoading(false);
      setStatusText(null);
    }
  }

  return (
    <div className="p-3 sm:p-5 max-w-lg mx-auto w-full">
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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link
            href="/incidents"
            className="p-1.5 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition active:scale-95"
            title="Quay lại danh sách sự cố"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-1.5">
            <Siren className="w-4 h-4 text-red-600" />
            <span>Cứu Hộ Khẩn Cấp (SOS)</span>
          </h1>
        </div>

        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
          <MapPin className={`w-3 h-3 ${gpsReady ? 'text-emerald-600' : 'text-amber-500 animate-pulse'}`} />
          <span>{gpsReady ? 'GPS Sẵn sàng' : 'Lấy GPS...'}</span>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Form Container: Liền mạch, tối giản, gọn gàng */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3.5 shadow-2xs">
        {/* 1. Phân loại sự cố */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Phân loại sự cố
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

        {/* 2. Số điện thoại liên hệ (Mặc định lấy từ tài khoản, nếu chưa có thì nhắc bổ sung) */}
        <div>
          {hasAccountPhone && !isEditingPhone ? (
            <div className="flex items-center justify-between py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-2 text-xs">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-500 font-medium">SĐT liên hệ:</span>
                <span className="font-bold text-slate-900">{phone}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingPhone(true)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
              >
                <Edit2 className="w-3 h-3" />
                <span>Đổi số</span>
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-red-600" />
                  <span>Số điện thoại gọi cứu hộ *</span>
                </label>
                {!hasAccountPhone && (
                  <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                    Chưa có SĐT
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Nhập số điện thoại của bạn..."
                  className="w-full px-3 py-2 pr-12 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                />
                {hasAccountPhone && (
                  <button
                    type="button"
                    onClick={() => setIsEditingPhone(false)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-800 font-semibold"
                  >
                    Xong
                  </button>
                )}
              </div>
              {!hasAccountPhone && (
                <p className="text-[10px] text-amber-600">
                  💡 Nhập 1 lần, hệ thống sẽ tự động lưu vào tài khoản cho các lần sau.
                </p>
              )}
            </div>
          )}
        </div>

        {/* 3. Ảnh hiện trường */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Camera className="w-3.5 h-3.5 text-slate-500" />
            <span>Ảnh hiện trường *</span>
          </label>

          {!photoBlob ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="py-3 px-2 rounded-xl border border-dashed border-red-300 bg-red-50/50 hover:bg-red-50 text-red-700 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Chụp ảnh ngay</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-3 px-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
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
                  <span>Đã chụp ảnh hiện trường</span>
                </span>
              </div>
              <button
                type="button"
                onClick={handleRetakePhoto}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shrink-0 transition active:scale-95"
              >
                Đổi ảnh
              </button>
            </div>
          )}
        </div>

        {/* 4. Voice mô tả */}
        <div>
          <QuickVoiceInput
            label="Thu âm mô tả tình trạng"
            helperText="Nói nhanh vị trí làn đường, cần hỗ trợ đồ gì..."
            accentColor="red"
            onAudioChange={(blob, duration) => {
              setAudioBlob(blob);
              setAudioDuration(duration);
            }}
          />
        </div>

        {/* 5. Ghi chú nếu có */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Ghi chú thêm <span className="text-slate-400 font-normal normal-case">(Tùy chọn)</span>
          </label>
          <input
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="VD: Chết máy chân cầu vượt, cần mượn kích gầm..."
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        {/* 6. Nút phát tín hiệu SOS */}
        <button
          type="button"
          disabled={loading}
          onClick={() => handleSubmit()}
          className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer mt-2"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{statusText || 'Đang phát tín hiệu...'}</span>
            </div>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Phát Tín Hiệu SOS 🚨</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
