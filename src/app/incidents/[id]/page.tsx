'use client';

import { Suspense, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Incident, IncidentHelper, UserRole } from '@/types/database';
import { calculateHaversineDistance, formatDistance } from '@/lib/utils/distance';
import { getGoogleMapsNavigationUrl } from '@/lib/utils/googleMaps';
import { getIncidentTypeInfo } from '@/components/incident/IncidentCard';
import { OfferHelpModal } from '@/components/incident/OfferHelpModal';
import {
  ArrowLeft,
  Phone,
  Navigation2,
  Clock,
  MapPin,
  HeartHandshake,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Maximize2,
  X,
  Share2,
  Trash2,
  ShieldAlert,
  MessageSquare,
  Award,
} from 'lucide-react';

function IncidentDetailContent({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: incidentId } = use(paramsPromise);

  const [incident, setIncident] = useState<Incident | null>(null);
  const [helpers, setHelpers] = useState<IncidentHelper[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const supabase = createClient();

  async function loadData() {
    try {
      // 1. Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (profile) setCurrentUserRole(profile.role);
      }

      // 2. Load Incident
      const { data: incData, error: incError } = await supabase
        .from('incidents')
        .select('*, user:profiles(*)')
        .eq('id', incidentId)
        .maybeSingle();

      if (incError || !incData) {
        console.error('Lỗi tải sự cố:', incError);
        setIncident(null);
        return;
      }

      // 3. Load Helpers for this incident
      const { data: helpersData } = await supabase
        .from('incident_helpers')
        .select('*, helper:profiles(*)')
        .eq('incident_id', incidentId)
        .order('created_at', { ascending: false });

      const currentHelper = user
        ? (helpersData || []).find((h: any) => h.helper_id === user.id && h.status !== 'cancelled')
        : null;

      setHelpers(helpersData || []);
      setIncident({
        ...incData,
        current_user_helper: currentHelper || null,
      });
    } catch (err) {
      console.error('Lỗi loadData incident:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    // Get driver GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {},
        { enableHighAccuracy: false, timeout: 6000 }
      );
    }
  }, [incidentId]);

  // Compute distance
  let distanceKm: number | undefined;
  if (userLocation && incident) {
    distanceKm = calculateHaversineDistance(
      userLocation.lat,
      userLocation.lng,
      incident.latitude,
      incident.longitude
    );
  }

  // Handle Offer Help
  async function handleOfferHelpSubmit(etaMinutes: number, message: string) {
    if (!currentUserId) {
      router.push(`/login?redirectTo=/incidents/${incidentId}`);
      return;
    }

    const { error } = await supabase.from('incident_helpers').upsert(
      {
        incident_id: incidentId,
        helper_id: currentUserId,
        eta_minutes: etaMinutes,
        message: message || 'Đang trên đường đến hỗ trợ!',
        status: 'offered',
        created_at: new Date().toISOString(),
      },
      { onConflict: 'incident_id,helper_id' }
    );

    if (error) {
      throw new Error(error.message);
    }

    // Refresh data
    await loadData();
    setStatusMsg('Cảm ơn bạn! Bác tài đã nhận được thông tin bạn đang tới hỗ trợ.');
    setTimeout(() => setStatusMsg(null), 5000);
  }

  // Handle Cancel Help
  async function handleCancelHelp() {
    if (!currentUserId || !confirm('Bạn chắc chắn muốn hủy nhận hỗ trợ sự cố này?')) return;

    setActionLoading(true);
    try {
      await supabase
        .from('incident_helpers')
        .delete()
        .eq('incident_id', incidentId)
        .eq('helper_id', currentUserId);

      await loadData();
    } catch (err) {
      console.error('Lỗi hủy hỗ trợ:', err);
    } finally {
      setActionLoading(false);
    }
  }

  // Handle Mark Resolved
  async function handleMarkResolved() {
    if (!confirm('Xác nhận sự cố đã được cứu hộ / giải quyết xong?')) return;

    setActionLoading(true);
    try {
      await supabase
        .from('incidents')
        .update({ status: 'resolved', updated_at: new Date().toISOString() })
        .eq('id', incidentId);

      // Cập nhật trạng thái người giúp thành completed
      await supabase
        .from('incident_helpers')
        .update({ status: 'completed' })
        .eq('incident_id', incidentId)
        .in('status', ['offered', 'accepted']);

      await loadData();
      setStatusMsg('Chúc mừng! Sự cố đã được xử lý an toàn.');
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (err) {
      console.error('Lỗi đóng sự cố:', err);
    } finally {
      setActionLoading(false);
    }
  }

  // Handle Delete (Admin or Owner)
  async function handleDelete() {
    if (!confirm('Bạn có chắc chắn muốn xóa bản tin cứu hộ này?')) return;

    setActionLoading(true);
    try {
      await supabase.from('incidents').delete().eq('id', incidentId);
      router.push('/incidents');
    } catch (err) {
      console.error('Lỗi xóa sự cố:', err);
      setActionLoading(false);
    }
  }

  function handleShare() {
    if (typeof navigator !== 'undefined') {
      const url = window.location.href;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="p-8 text-center text-slate-500 max-w-md mx-auto">
        <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Không tìm thấy thông tin sự cố này</h2>
        <p className="text-xs text-slate-500 mt-1">Sự cố có thể đã được giải quyết hoặc đã bị gỡ bỏ.</p>
        <Link href="/incidents" className="mt-4 inline-block px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold">
          Quay lại danh sách cứu hộ SOS
        </Link>
      </div>
    );
  }

  const typeInfo = getIncidentTypeInfo(incident.incident_type);
  const IconComponent = typeInfo.icon;
  const isOwner = currentUserId && incident.user_id === currentUserId;
  const isHelper = Boolean(incident.current_user_helper);
  const navUrl = getGoogleMapsNavigationUrl(incident.latitude, incident.longitude);

  return (
    <div className="p-3 sm:p-6 max-w-2xl mx-auto w-full space-y-4">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/incidents"
          className="p-2 -ml-1.5 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition active:scale-95 flex items-center gap-1 text-xs sm:text-sm font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Danh sách cứu hộ</span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={handleShare}
            className="p-2 text-slate-600 hover:text-red-600 rounded-xl hover:bg-slate-100 transition active:scale-95 flex items-center gap-1 text-xs font-semibold"
            title="Chia sẻ link khẩn cấp"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden xs:inline">{copiedLink ? 'Đã copy!' : 'Chia sẻ'}</span>
          </button>

          {(currentUserRole === 'admin' || isOwner) && (
            <button
              onClick={handleDelete}
              disabled={actionLoading}
              className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition active:scale-95 flex items-center gap-1 text-xs font-bold border border-red-200"
              title="Xóa sự cố"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden xs:inline">Xóa</span>
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-emerald-800 text-xs font-bold shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Main Status Header Card */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-red-200 shadow-sm space-y-4">
        {/* Type Badge & Status */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-2xs ${typeInfo.badgeColor}`}
          >
            <IconComponent className="w-4 h-4" />
            <span>{typeInfo.label}</span>
          </span>

          {incident.status === 'resolved' ? (
            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-black flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Đã giải quyết xong</span>
            </span>
          ) : incident.status === 'helping' ? (
            <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-black flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Đang có {incident.helper_count || 1} đồng nghiệp trợ giúp</span>
            </span>
          ) : (
            <span className="px-3 py-1 bg-red-100 text-red-700 border border-red-300 rounded-full text-xs font-black flex items-center gap-1 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-red-600" />
              <span>Đang khẩn cấp chờ cứu hộ</span>
            </span>
          )}
        </div>

        {/* Title & Description */}
        <div>
          <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight leading-snug">
            {incident.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
            {incident.description}
          </p>
        </div>

        {/* Proof Photo (Ảnh chứng minh tại hiện trường) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <span>Ảnh chụp hiện trường sự cố</span>
              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Đã xác thực
              </span>
            </span>
            <button
              onClick={() => setShowPhotoModal(true)}
              className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Phóng to</span>
            </button>
          </div>

          <div
            onClick={() => setShowPhotoModal(true)}
            className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 cursor-pointer group shadow-xs"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={incident.photo_url}
              alt="Ảnh hiện trường"
              className="w-full h-56 sm:h-72 object-cover group-hover:scale-102 transition duration-300"
            />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
              <span className="px-3 py-1.5 bg-black/60 text-white text-xs font-bold rounded-lg backdrop-blur-xs flex items-center gap-1.5">
                <Maximize2 className="w-4 h-4" />
                <span>Bấm để xem ảnh to</span>
              </span>
            </div>
          </div>
        </div>

        {/* Location & Distance Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="p-3 bg-red-50/70 border border-red-200 rounded-2xl">
            <span className="text-[11px] font-bold text-red-800 uppercase tracking-wider block">Khoảng cách tới bạn</span>
            <span className="text-base sm:text-lg font-black text-red-600 mt-0.5 block">
              {distanceKm !== undefined ? formatDistance(distanceKm) : 'Đang tính...'}
            </span>
            <span className="text-[10px] text-red-700/80">Tính theo định vị GPS thời gian thực</span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block flex items-center gap-1">
              <MapPin className="w-3 h-3 text-slate-500" />
              <span>Mốc vị trí</span>
            </span>
            <span className="text-xs font-bold text-slate-800 mt-0.5 block line-clamp-2">
              {incident.address || `${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)}`}
            </span>
          </div>
        </div>

        {/* Action Buttons: Call & Navigation */}
        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <a
            href={`tel:${incident.phone}`}
            className="min-h-[46px] px-4 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-2xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20"
          >
            <Phone className="w-4 h-4" />
            <span>Gọi Cứu Hộ Ngay</span>
          </a>

          <a
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[46px] px-4 py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-2xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-md shadow-blue-600/20"
          >
            <Navigation2 className="w-4 h-4" />
            <span>Chỉ Đường G-Maps</span>
          </a>
        </div>

        {/* Driver Profile Summary */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-700 font-bold text-xs flex items-center justify-center border border-orange-200">
              {incident.user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={incident.user.avatar_url}
                  alt={incident.user.full_name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                incident.user?.full_name?.[0] || 'TX'
              )}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block">
                {incident.user?.full_name || 'Bác tài'}
              </span>
              <span className="text-[10px] text-slate-500">
                SĐT: {incident.phone} • {new Date(incident.created_at).toLocaleTimeString('vi-VN')}
              </span>
            </div>
          </div>

          {incident.user?.reputation_score !== undefined && (
            <div className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
              <Award className="w-3.5 h-3.5" />
              <span>{incident.user.reputation_score} điểm</span>
            </div>
          )}
        </div>
      </div>

      {/* CORE FEATURE: "Ai nhìn thấy có thể chọn hỗ trợ hoặc không" */}
      {!isOwner && incident.status !== 'resolved' && (
        <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 rounded-3xl p-4 sm:p-5 border border-orange-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-xs">
              <HeartHandshake className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">Bạn có thể hỗ trợ đồng nghiệp này không?</h3>
              <p className="text-[11px] text-slate-600">Nếu đang ở gần và có đồ nghề / xăng, hãy tiếp ứng giúp nhau trên đường.</p>
            </div>
          </div>

          {isHelper ? (
            /* User already volunteered to help */
            <div className="p-3.5 bg-white rounded-2xl border border-emerald-300 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-700 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>Bạn đang nhận hỗ trợ sự cố này!</span>
                </span>
                {incident.current_user_helper?.eta_minutes && (
                  <span className="text-[11px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200">
                    Dự kiến đến sau {incident.current_user_helper.eta_minutes}p
                  </span>
                )}
              </div>

              {incident.current_user_helper?.message && (
                <p className="text-xs text-slate-600 italic">
                  &ldquo;{incident.current_user_helper.message}&rdquo;
                </p>
              )}

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelHelp}
                  disabled={actionLoading}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95"
                >
                  Hủy nhận hỗ trợ
                </button>

                <button
                  type="button"
                  onClick={handleMarkResolved}
                  disabled={actionLoading}
                  className="flex-1 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition active:scale-95 flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Đã Hỗ Trợ Xong</span>
                </button>
              </div>
            </div>
          ) : (
            /* User has not yet volunteered */
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => router.push('/incidents')}
                className="flex-1 py-3 px-3 bg-white hover:bg-slate-100 text-slate-600 rounded-2xl text-xs font-bold border border-slate-200 transition active:scale-95 text-center"
              >
                Không thể hỗ trợ
              </button>

              <button
                type="button"
                onClick={() => setShowOfferModal(true)}
                className="flex-2 py-3 px-4 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 active:scale-95 text-white rounded-2xl text-xs sm:text-sm font-black shadow-md shadow-red-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <HeartHandshake className="w-4 h-4" />
                <span>Tôi Muốn Hỗ Trợ 🤝</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Owner Control Actions (Người gặp sự cố) */}
      {isOwner && incident.status !== 'resolved' && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Quản lý yêu cầu cứu hộ của bạn
          </h3>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleMarkResolved}
              disabled={actionLoading}
              className="flex-1 min-h-[46px] py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-2xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Đã Được Cứu Hộ Xong ✅</span>
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={actionLoading}
              className="min-h-[46px] py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              <span>Hủy yêu cầu</span>
            </button>
          </div>
        </div>
      )}

      {/* List of Helpers who volunteered */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span>Danh Sách Người Nhận Giúp ({helpers.length})</span>
          </h3>
          <span className="text-[11px] text-slate-500">Cộng đồng tài xế tương trợ</span>
        </div>

        {helpers.length === 0 ? (
          <div className="p-4 bg-slate-50 rounded-2xl text-center text-slate-500 text-xs">
            Chưa có ai nhận hỗ trợ. Tín hiệu SOS đang được gửi tới các bác tài ở gần!
          </div>
        ) : (
          <div className="space-y-2.5">
            {helpers.map((h) => {
              const helperProfile = h.helper;
              return (
                <div
                  key={h.id}
                  className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center border border-blue-200">
                      {helperProfile?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={helperProfile.avatar_url}
                          alt={helperProfile.full_name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        helperProfile?.full_name?.[0] || 'TX'
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900">
                          {helperProfile?.full_name || 'Bác tài'}
                        </span>
                        {h.eta_minutes && (
                          <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                            Đến sau ~{h.eta_minutes}p
                          </span>
                        )}
                      </div>
                      {h.message && (
                        <p className="text-[11px] text-slate-600 mt-0.5 italic flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-slate-400" />
                          <span>{h.message}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {helperProfile?.phone && (
                    <a
                      href={`tel:${helperProfile.phone}`}
                      className="self-end sm:self-center px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 active:scale-95 shadow-2xs"
                    >
                      <Phone className="w-3 h-3" />
                      <span>Gọi ngay ({helperProfile.phone})</span>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Offer Help Modal */}
      <OfferHelpModal
        incident={incident}
        isOpen={showOfferModal}
        onClose={() => setShowOfferModal(false)}
        onSubmit={handleOfferHelpSubmit}
      />

      {/* Fullscreen Photo Lightbox */}
      {showPhotoModal && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          onClick={() => setShowPhotoModal(false)}
        >
          <div className="relative max-w-3xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setShowPhotoModal(false)}
              className="absolute -top-12 right-0 p-2 text-white hover:text-slate-300 rounded-full bg-white/10 hover:bg-white/20 transition active:scale-95"
            >
              <X className="w-6 h-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={incident.photo_url}
              alt="Ảnh phóng to"
              className="max-h-[85vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <IncidentDetailContent paramsPromise={params} />
    </Suspense>
  );
}
