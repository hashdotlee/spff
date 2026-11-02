'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { IncidentType } from '@/types/database';
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
  Phone,
  Siren,
  Wrench,
  Fuel,
  Disc,
  Zap,
  AlertTriangle,
  HelpCircle,
  MapPin,
  ListOrdered,
} from 'lucide-react';

const INCIDENT_TYPES: { type: IncidentType; label: string; icon: any }[] = [
  { type: 'broken_vehicle', label: 'Hỏng xe', icon: Wrench },
  { type: 'out_of_gas', label: 'Hết xăng / dầu', icon: Fuel },
  { type: 'flat_tire', label: 'Thủng / nổ lốp', icon: Disc },
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
  const [noteText, setNoteText] = useState('');
  const [lat, setLat] = useState(21.0285);
  const [lng, setLng] = useState(105.8542);
  const [gpsReady, setGpsReady] = useState(false);

  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  // 1. Tự động kiểm tra user, nạp SĐT có sẵn & lấy GPS ngầm
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

      if (profile?.phone) {
        setPhone(profile.phone);
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
          setGpsReady(true);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    }
  }, [supabase, router]);

  // 2. Xử lý khi chọn hoặc chụp ảnh hiện trường
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

  // 3. Phát tín hiệu SOS cứu hộ
  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      setErrorMsg('Vui lòng nhập số điện thoại để đồng nghiệp đến nơi còn gọi ứng cứu!');
      return;
    }

    if (cleanPhone.replace(/\D/g, '').length < 9) {
      setErrorMsg('Số điện thoại chưa hợp lệ. Vui lòng nhập số có ít nhất 9-10 chữ số.');
      return;
    }

    if (!photoBlob) {
      setErrorMsg('Vui lòng chụp ảnh hiện trường xe gặp sự cố để đồng nghiệp chuẩn bị đồ hỗ trợ.');
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

      // Lưu / cập nhật SĐT vào profile để các lần sau không cần nhập lại
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

      // B. Upload file âm thanh nếu có thu âm
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
          : 'Tài xế đang gặp sự cố khẩn cấp trên đường cần anh em đồng nghiệp hỗ trợ gấp.';
      }

      // C. Insert vào bảng incidents
      setStatusText('Đang phát tín hiệu SOS khẩn cấp...');
      const insertPayload: any = {
        user_id: user.id,
        title,
        incident_type: incidentType,
        description,
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

      // Nếu cột audio_url chưa có trong DB (lỗi 42703), fallback thêm URL vào mô tả
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

  return (
    <div className="p-3 sm:p-6 max-w-lg mx-auto w-full space-y-4">
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
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Link
            href="/incidents"
            className="p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition active:scale-95 shrink-0 mt-0.5"
            title="Quay lại danh sách sự cố"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-1.5">
              <span className="p-1 bg-red-600 text-white rounded-lg shrink-0">
                <Siren className="w-4 h-4 animate-pulse" />
              </span>
              <span className="truncate">Cứu Hộ Khẩn Cấp (SOS)</span>
            </h1>

            {/* GPS Indicator & Subtitle below title */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
              <div
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                  gpsReady
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-amber-700 bg-amber-50 border-amber-200'
                }`}
              >
                <MapPin className={`w-3 h-3 ${gpsReady ? 'text-emerald-600' : 'text-amber-600 animate-pulse'}`} />
                <span>{gpsReady ? 'GPS Sẵn sàng' : 'Lấy GPS...'}</span>
              </div>
              <span className="text-[11px] text-slate-500">
                Phát tín hiệu cứu trợ anh em đồng nghiệp
              </span>
            </div>
          </div>
        </div>

        {/* View Feed Link */}
        <Link
          href="/incidents"
          className="text-[11px] font-bold text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-xl border border-red-200 transition active:scale-95 flex items-center gap-1 shrink-0 mt-0.5"
        >
          <ListOrdered className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">DS Sự Cố</span>
        </Link>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-red-700 text-xs shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <span className="font-medium">{errorMsg}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. SỐ ĐIỆN THOẠI GỌI CỨU HỘ (ĐỂ NGƯỜI ĐẾN CÒN GỌI)       */}
      {/* ======================================================== */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border-2 border-emerald-300 shadow-sm">
        <div className="mb-2.5 space-y-1">
          <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Số điện thoại gọi cứu hộ *</span>
          </label>
          <div>
            <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300 inline-flex items-center gap-1">
              <span>Để người đến còn gọi</span>
              <span>📞</span>
            </span>
          </div>
        </div>

        <input
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="VD: 0987654321..."
          className="w-full px-4 py-3 rounded-2xl border-2 border-slate-300 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none text-base font-black text-slate-900 bg-emerald-50/20 placeholder:text-slate-400 placeholder:font-normal transition shadow-xs"
        />

        <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
          💡 Đồng nghiệp khi nhìn thấy tin SOS hoặc đến gần hiện trường sẽ bấm nút để gọi trực tiếp vào số này.
        </p>
      </div>

      {/* ======================================================== */}
      {/* 2. LOẠI SỰ CỐ GẶP PHẢI                                    */}
      {/* ======================================================== */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
          Loại sự cố gặp phải
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
                className={`p-2.5 rounded-2xl border text-center transition active:scale-95 flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'border-red-600 bg-red-600 text-white font-black shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-[11px] leading-tight truncate w-full">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. ẢNH HIỆN TRƯỜNG XE GẶP SỰ CỐ                           */}
      {/* ======================================================== */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-red-200/90 shadow-xs">
        <div className="flex items-center justify-between mb-2 gap-2">
          <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5 min-w-0">
            <Camera className="w-4 h-4 text-red-600 shrink-0" />
            <span className="truncate">Ảnh hiện trường sự cố *</span>
          </label>
          {photoBlob ? (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 shrink-0">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Đã có ảnh</span>
            </span>
          ) : (
            <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200 shrink-0">
              Bắt buộc
            </span>
          )}
        </div>

        {!photoBlob ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="w-full py-5 px-4 rounded-2xl border-2 border-dashed border-red-300 bg-gradient-to-b from-red-50/70 to-rose-50/40 hover:bg-red-100/60 transition active:scale-98 flex flex-col items-center justify-center gap-2 cursor-pointer group shadow-2xs"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-red-600 via-rose-600 to-orange-600 text-white flex items-center justify-center shadow-md shadow-red-600/30 group-hover:scale-105 transition">
                <Camera className="w-6 h-6 animate-pulse" />
              </div>
              <div className="text-center">
                <span className="text-xs sm:text-sm font-black text-red-950 block">
                  BẬT CAMERA CHỤP HIỆN TRƯỜNG 📸
                </span>
                <span className="text-[11px] text-red-700/80 block mt-0.5">
                  Chụp lốp, động cơ hoặc xe để đồng nghiệp chuẩn bị dụng cụ
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 text-center text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl border border-slate-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 text-slate-400" />
              <span>Hoặc chọn ảnh có sẵn trong thư viện ảnh</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-2.5 bg-red-50/60 border border-red-200 rounded-2xl">
            <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-900 shrink-0 border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl!}
                alt="Ảnh hiện trường"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 truncate">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Đã chụp ảnh hiện trường</span>
              </span>
              <span className="text-[11px] text-slate-500 block truncate mt-0.5">
                Chạm để chụp lại hoặc đổi ảnh khác
              </span>
            </div>
            <button
              type="button"
              onClick={handleRetakePhoto}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition active:scale-95 flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Đổi ảnh</span>
            </button>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 4. THU ÂM CHỈ DẪN / TÌNH TRẠNG SỰ CỐ                     */}
      {/* ======================================================== */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
        <QuickVoiceInput
          label="Thu âm tình trạng sự cố (Nhanh nhất)"
          helperText="Nói nhanh: Vị trí làn đường, cần mượn đồ gì, cần hỗ trợ gì..."
          accentColor="red"
          onAudioChange={(blob, duration) => {
            setAudioBlob(blob);
            setAudioDuration(duration);
          }}
        />
      </div>

      {/* ======================================================== */}
      {/* 5. GHI CHÚ BẰNG CHỮ (TÙY CHỌN)                           */}
      {/* ======================================================== */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
        <div className="mb-2 space-y-0.5">
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
            Ghi chú thêm bằng chữ
          </label>
          <span className="text-[10px] text-slate-400 font-medium block">
            (Tùy chọn)
          </span>
        </div>
        <input
          type="text"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="VD: Xe tải 2.5T chết máy ở làn ngoài cùng chân cầu..."
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
        />
      </div>

      {/* ======================================================== */}
      {/* 6. NÚT PHÁT TÍN HIỆU SOS                                  */}
      {/* ======================================================== */}
      <button
        type="button"
        disabled={loading}
        onClick={() => handleSubmit()}
        className="w-full min-h-[52px] py-3.5 px-4 bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 hover:from-red-700 hover:to-orange-700 active:scale-[0.99] text-white font-black rounded-2xl shadow-lg shadow-red-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base cursor-pointer"
      >
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{statusText || 'Đang phát tín hiệu SOS...'}</span>
          </div>
        ) : (
          <>
            <Send className="w-5 h-5" />
            <span>Phát Tín Hiệu Cứu Hộ Ngay 🚨</span>
          </>
        )}
      </button>
    </div>
  );
}
