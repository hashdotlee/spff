'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { IncidentType } from '@/types/database';
import { PhotoCapture } from '@/components/common/PhotoCapture';
import { uploadImageToSupabase } from '@/lib/utils/imageUpload';
import {
  Wrench,
  Fuel,
  Disc,
  Zap,
  AlertTriangle,
  HelpCircle,
  MapPin,
  Phone,
  AlertCircle,
  ArrowLeft,
  Send,
  Siren,
  Check,
} from 'lucide-react';

const LocationPicker = dynamic(() => import('@/components/map/LocationPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full rounded-2xl bg-slate-100 border border-slate-200 animate-pulse flex flex-col items-center justify-center text-xs text-slate-500 gap-2">
      <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      <span>Đang tải bản đồ xác định tọa độ sự cố...</span>
    </div>
  ),
});

const INCIDENT_TYPES: { type: IncidentType; label: string; icon: any; defaultTitle: string; defaultDesc: string }[] = [
  {
    type: 'out_of_gas',
    label: 'Hết xăng / dầu',
    icon: Fuel,
    defaultTitle: 'Hết xăng xe cần mua hộ hoặc chia sẻ xăng',
    defaultDesc: 'Xe mình hết xăng/dầu giữa đường, cần anh em đi ngang qua chia lại ít xăng hoặc mua giúp chai xăng. Mình xin gửi thêm tiền cà phê cảm ơn.',
  },
  {
    type: 'broken_vehicle',
    label: 'Hỏng xe / chết máy',
    icon: Wrench,
    defaultTitle: 'Xe hỏng máy / đứt xích cần hỗ trợ đồ nghề',
    defaultDesc: 'Xe đang chở hàng thì bị chết máy / hỏng hóc, cần bác tài có đồ nghề hoặc biết sửa chữa gần đây ghé qua kiểm tra hỗ trợ.',
  },
  {
    type: 'flat_tire',
    label: 'Thủng / nổ lốp',
    icon: Disc,
    defaultTitle: 'Thủng lốp cần mượn bơm hơi / kích nâng',
    defaultDesc: 'Xe bị cán đinh xẹp lốp, cần mượn bơm điện hoặc kích nâng để thay lốp dự phòng.',
  },
  {
    type: 'battery_dead',
    label: 'Hết ắc quy',
    icon: Zap,
    defaultTitle: 'Chết bình ắc quy cần nhờ câu bình',
    defaultDesc: 'Xe bị hết bình ắc quy đề không lên, bác nào có dây câu bình hoặc bình phụ đi qua hỗ trợ mình với nhé.',
  },
  {
    type: 'accident',
    label: 'Va chạm / Sự cố',
    icon: AlertTriangle,
    defaultTitle: 'Gặp sự cố va chạm trên đường',
    defaultDesc: 'Gặp sự cố va chạm cần anh em đồng nghiệp gần khu vực hỗ trợ làm chứng hoặc hỗ trợ hiện trường.',
  },
  {
    type: 'other',
    label: 'Sự cố khác',
    icon: HelpCircle,
    defaultTitle: 'Cần hỗ trợ sự cố khẩn cấp trên đường',
    defaultDesc: 'Đang gặp sự cố khẩn cấp trên hành trình di chuyển, rất mong nhận được sự trợ giúp từ anh em đồng nghiệp.',
  },
];

export default function NewIncidentPage() {
  const router = useRouter();
  const [incidentType, setIncidentType] = useState<IncidentType>('broken_vehicle');
  const [title, setTitle] = useState(INCIDENT_TYPES[1].defaultTitle);
  const [description, setDescription] = useState(INCIDENT_TYPES[1].defaultDesc);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(21.0285);
  const [lng, setLng] = useState(105.8542);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  // Load user profile & auto-get GPS location
  useEffect(() => {
    supabase.auth.getUser().then(async (res: any) => {
      const user = res.data?.user;
      if (!user) {
        router.push('/login?redirectTo=/incidents/new');
        return;
      }

      // Pre-fill phone if available in profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.phone) {
        setPhone(profile.phone);
      }
    });

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    }
  }, [supabase, router]);

  function handleSelectType(type: IncidentType) {
    setIncidentType(type);
    const item = INCIDENT_TYPES.find((t) => t.type === type);
    if (item) {
      setTitle(item.defaultTitle);
      setDescription(item.defaultDesc);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    // BẮT BUỘC có ảnh tại hiện trường theo yêu cầu!
    if (!photoBlob) {
      setErrorMsg('Báo cáo phải có ảnh chụp tại hiện trường để chứng minh sự cố.');
      return;
    }

    if (!phone.trim()) {
      setErrorMsg('Vui lòng nhập số điện thoại để đồng nghiệp có thể gọi cứu hộ.');
      return;
    }

    setLoading(true);
    setStatusText('Đang tải ảnh hiện trường lên...');

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMsg('Vui lòng đăng nhập để gửi báo cáo sự cố.');
        return;
      }

      // 1. Upload ảnh hiện trường (primary: incident-photos, fallback: avatars)
      const fileName = `${user.id}_${Date.now()}.jpg`;
      const uploadedPhotoUrl = await uploadImageToSupabase(supabase, photoBlob, {
        primaryBucket: 'incident-photos',
        fileName,
        fallbackBucket: 'avatars',
      });

      setStatusText('Đang phát tín hiệu SOS tới đồng nghiệp...');

      // 2. Insert vào bảng incidents
      const { data, error } = await supabase
        .from('incidents')
        .insert({
          user_id: user.id,
          title: title.trim(),
          incident_type: incidentType,
          description: description.trim(),
          latitude: lat,
          longitude: lng,
          address: address.trim() || null,
          photo_url: uploadedPhotoUrl,
          phone: phone.trim(),
          status: 'open',
          helper_count: 0,
        })
        .select()
        .single();

      if (error) {
        console.error('Lỗi tạo sự cố:', error);
        setErrorMsg(
          error.message.includes('incidents')
            ? 'Bảng dữ liệu sự cố chưa được kích hoạt trên hệ thống. Vui lòng chạy file SQL migration.'
            : error.message
        );
        return;
      }

      if (data) {
        router.push(`/incidents/${data.id}`);
      }
    } catch (err: any) {
      console.error('Lỗi gửi báo cáo SOS:', err);
      setErrorMsg(err?.message || 'Đã xảy ra lỗi khi phát tín hiệu SOS. Vui lòng thử lại.');
    } finally {
      setLoading(false);
      setStatusText(null);
    }
  }

  return (
    <div className="p-3 sm:p-6 max-w-xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-5">
        <Link
          href="/incidents"
          className="p-2 -ml-1.5 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span className="p-1.5 bg-red-600 text-white rounded-xl shadow-xs">
              <Siren className="w-5 h-5 animate-pulse" />
            </span>
            <span>Báo Sự Cố Khẩn Cấp (SOS)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Tìm kiếm sự trợ giúp từ đồng nghiệp đang ở gần bạn</p>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 sm:mb-5 p-3 sm:p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-xs sm:text-sm shadow-xs">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 bg-white p-4 sm:p-6 rounded-3xl border border-red-200/80 shadow-sm">
        {/* Step 1: Chọn loại sự cố */}
        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
            1. Bạn đang gặp sự cố gì? *
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {INCIDENT_TYPES.map((item) => {
              const Icon = item.icon;
              const isSelected = incidentType === item.type;
              return (
                <button
                  type="button"
                  key={item.type}
                  onClick={() => handleSelectType(item.type)}
                  className={`p-3 rounded-2xl border text-left transition active:scale-95 flex flex-col justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'border-red-600 bg-red-50/70 ring-2 ring-red-500/20 text-red-950 font-bold'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        isSelected ? 'bg-red-600 text-white shadow-xs' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-red-600 font-bold" />}
                  </div>
                  <span className="text-xs leading-snug">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Ảnh chụp tại hiện trường (BẮT BUỘC) */}
        <div className="p-3.5 bg-red-50/50 border border-red-200 rounded-2xl">
          <PhotoCapture
            label="2. Ảnh chụp tại hiện trường (Bắt buộc)"
            helperText="Yêu cầu chụp ảnh xe gặp sự cố, bình xăng, lốp hỏng... để chứng minh hiện trường thực tế và giúp đồng nghiệp chuẩn bị dụng cụ phù hợp."
            required={true}
            onPhotoSelected={(blob) => setPhotoBlob(blob)}
          />
        </div>

        {/* Step 3: Tiêu đề & Mô tả */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Tiêu đề tóm tắt *
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Xe máy hết xăng đoạn cầu Thăng Long"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Mô tả chi tiết cần hỗ trợ gì *
          </label>
          <textarea
            rows={3}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả cụ thể để đồng nghiệp mang đúng đồ giúp bạn..."
            className="w-full p-3 rounded-xl border border-slate-300 text-base sm:text-sm focus:ring-2 focus:ring-red-500 focus:outline-none leading-relaxed"
          />
        </div>

        {/* Step 4: Số điện thoại liên hệ */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-emerald-600" />
            <span>Số điện thoại liên hệ khẩn cấp *</span>
          </label>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="VD: 0987654321"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm focus:ring-2 focus:ring-red-500 focus:outline-none font-semibold"
          />
          <span className="text-[11px] text-slate-500 mt-1 block">
            Đồng nghiệp ở gần sẽ gọi số này để thông báo ứng cứu.
          </span>
        </div>

        {/* Step 5: Tọa độ & Bản đồ */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-red-600" />
            <span>Vị trí sự cố trên bản đồ *</span>
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
            Mốc đường / Điểm nhận diện (nếu có)
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="VD: Trước cây xăng số 3, đối diện cổng KCN..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full min-h-[50px] py-3.5 px-4 bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 hover:from-red-700 hover:to-orange-700 active:scale-[0.99] text-white font-extrabold rounded-2xl shadow-lg shadow-red-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>{statusText || 'Đang gửi tín hiệu SOS...'}</span>
            </div>
          ) : (
            <>
              <Send className="w-5 h-5" />
              <span>Phát Tín Hiệu Cứu Hộ SOS 🚨</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
