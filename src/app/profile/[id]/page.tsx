'use client';

import { Suspense, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Profile, UserBadge, VoiceNote, Report, Warehouse } from '@/types/database';
import { VietQRModal } from '@/components/donation/VietQRModal';
import {
  Award,
  CreditCard,
  Edit,
  ShieldCheck,
  Compass,
  Navigation,
  Calendar,
  Volume2,
  ThumbsUp,
  ArrowLeft,
  Flag,
  Clock,
  CheckCircle2,
  XCircle,
  MapPin,
  ExternalLink,
  User,
  AlertCircle,
  LogOut,
  Building2,
  UtensilsCrossed,
  Home,
  Lock,
  Globe,
} from 'lucide-react';

function ProfileContent({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  const { id: profileId } = use(paramsPromise);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userBadges, setUserBadges] = useState<UserBadge[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [myReports, setMyReports] = useState<Report[]>([]);
  const [activeTab, setActiveTab] = useState<'warehouses' | 'contributions' | 'reports'>('warehouses');
  const [loading, setLoading] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        let viewerRole: string | null = null;
        if (user) {
          setCurrentUserId(user.id);
          const { data: viewerProf } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          viewerRole = viewerProf?.role || null;
        }

        const isOwnerOrAdmin = (user && user.id === profileId) || viewerRole === 'admin';

        const { data: profData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', profileId)
          .maybeSingle();

        if (profData) {
          setProfile(profData);
        } else if (user && user.id === profileId) {
          setProfile({
            id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Tài xế',
            phone: null,
            avatar_url: null,
            role: 'user',
            is_banned: false,
            bank_name: null,
            bank_account_no: null,
            bank_account_name: null,
            reputation_score: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        const { data: badgesData } = await supabase
          .from('user_badges')
          .select('*, badge:badges(*)')
          .eq('user_id', profileId);

        if (badgesData) {
          setUserBadges(badgesData);
        }

        // Load warehouses pinned by this user
        const { data: whData } = await supabase
          .from('warehouses')
          .select('*, voice_notes:voice_notes(count)')
          .eq('created_by', profileId)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        let userWhList: Warehouse[] = [];
        if (whData) {
          // Chỉ người sở hữu hoặc admin mới xem được điểm ghim riêng tư
          const visibleWhData = whData.filter((wh: any) => isOwnerOrAdmin || !wh.is_private);
          userWhList = visibleWhData.map((wh: any) => ({
            ...wh,
            voice_notes_count: wh.voice_notes?.[0]?.count || 0,
          }));
          setWarehouses(userWhList);
        }

        const { data: notesData } = await supabase
          .from('voice_notes')
          .select('*')
          .eq('user_id', profileId)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (notesData) {
          setVoiceNotes(notesData);
          if (userWhList.length === 0 && notesData.length > 0) {
            setActiveTab('contributions');
          }
        }

        // If the viewer is the owner of this profile, load their reports
        if (user && user.id === profileId) {
          const { data: repData } = await supabase
            .from('reports')
            .select(`
              *,
              warehouse:warehouses(id, name, address),
              voice_note:voice_notes(id, note_text, duration_seconds),
              reported_user:profiles!reported_user_id(id, full_name)
            `)
            .eq('reporter_id', profileId)
            .order('created_at', { ascending: false });

          if (repData) {
            setMyReports(repData as Report[]);
          }
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [profileId, supabase]);

  async function handleLogout() {
    if (!confirm('Bạn có chắc chắn muốn đăng xuất tài khoản khỏi thiết bị này?')) return;
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-8 text-center text-slate-500">
        <h2 className="text-lg font-bold text-slate-800">Không tìm thấy tài xế</h2>
        <Link href="/" className="mt-4 inline-block text-orange-600 font-semibold underline">
          Quay lại trang chủ
        </Link>
      </div>
    );
  }

  const isOwner = currentUserId === profile.id;

  const badgeIcons: Record<string, React.ReactNode> = {
    Award: <Award className="w-5 h-5 text-amber-500" />,
    Navigation: <Navigation className="w-5 h-5 text-blue-500" />,
    Compass: <Compass className="w-5 h-5 text-emerald-500" />,
    ShieldCheck: <ShieldCheck className="w-5 h-5 text-purple-500" />,
  };

  return (
    <div className="p-3 sm:p-6 max-w-2xl mx-auto w-full space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="p-2 -ml-1.5 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition active:scale-95 flex items-center gap-1 text-xs sm:text-sm font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Trang chủ</span>
        </Link>
        {isOwner && (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/profile/edit"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition active:scale-95"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Sửa hồ sơ</span>
            </Link>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-xl transition active:scale-95 border border-red-200"
              title="Đăng xuất tài khoản"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đăng xuất</span>
            </button>
          </div>
        )}
      </div>

      {/* Driver Card */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3.5 sm:gap-4">
          <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-slate-200 border-2 border-orange-500/30 flex items-center justify-center text-slate-700 text-xl sm:text-2xl font-black shadow-inner overflow-hidden shrink-0">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                className="w-full h-full object-cover"
              />
            ) : (
              profile.full_name?.[0]?.toUpperCase() || 'TX'
            )}
          </div>

          <div className="flex-1 text-center sm:text-left min-w-0 w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-center sm:justify-start gap-1.5 sm:gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 truncate">
                {profile.full_name}
              </h1>
              {profile.role === 'admin' && (
                <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded-md self-center sm:self-auto">
                  Admin
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1 font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 text-[11px] sm:text-xs">
                <Award className="w-4 h-4 shrink-0" />
                <span>{profile.reputation_score} điểm cống hiến</span>
              </span>
              <span className="flex items-center gap-1 text-[11px] sm:text-xs">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>{new Date(profile.created_at).toLocaleDateString('vi-VN')}</span>
              </span>
            </div>

            {/* VietQR Donate Button */}
            <div className="mt-3.5 flex flex-wrap items-center gap-2 justify-center sm:justify-start">
              <button
                onClick={() => setShowQRModal(true)}
                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl text-xs font-bold shadow-md transition active:scale-95"
              >
                <CreditCard className="w-4 h-4" />
                <span>Mời cà phê / Quét VietQR Donate</span>
              </button>

              {profile.bank_account_no && profile.bank_name ? (
                <span className="text-[11px] text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 inline-flex items-center gap-1 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{profile.bank_name} • {profile.bank_account_no}</span>
                </span>
              ) : isOwner ? (
                <Link
                  href="/profile/edit"
                  className="text-[11px] text-orange-700 bg-orange-50 hover:bg-orange-100 px-2.5 py-1.5 rounded-xl border border-orange-200 inline-flex items-center gap-1 font-medium transition"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <span>Chưa cài VietQR • Thêm ngay</span>
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Badges Section */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
        <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Award className="w-4 h-4 text-orange-600" />
          <span>Huy Hiệu Đạt Được</span>
        </h2>

        {userBadges.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {userBadges.map((ub) => {
              const b = ub.badge;
              if (!b) return null;
              return (
                <div
                  key={ub.id}
                  className="p-3 rounded-xl bg-orange-50/50 border border-orange-100 flex flex-col items-center text-center"
                >
                  <div className="w-10 h-10 rounded-full bg-white shadow-xs flex items-center justify-center mb-1.5 border border-orange-200">
                    {badgeIcons[b.icon_name] || <Award className="w-5 h-5 text-amber-500" />}
                  </div>
                  <h3 className="text-xs font-bold text-slate-900">{b.title}</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">
                    {b.description}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic py-2">
            Chưa có huy hiệu. Hãy ghim định vị bến bãi hoặc chia sẻ chỉ đường để tích lũy điểm cống hiến!
          </p>
        )}
      </div>

      {/* Navigation Tabs between Pinned Locations, Voice Notes & Reports */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-4 text-xs font-bold overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('warehouses')}
          className={`pb-2.5 sm:pb-3 px-2 sm:px-1 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'warehouses'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Điểm Ghim Định Vị ({warehouses.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('contributions')}
          className={`pb-2.5 sm:pb-3 px-2 sm:px-1 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'contributions'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Volume2 className="w-4 h-4" />
          <span>Chỉ Dẫn Voice ({voiceNotes.length})</span>
        </button>

        {isOwner && (
          <button
            onClick={() => setActiveTab('reports')}
            className={`pb-2.5 sm:pb-3 px-2 sm:px-1 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'reports'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Flag className="w-4 h-4" />
            <span>Báo Cáo Của Tôi ({myReports.length})</span>
            {myReports.some((r) => r.status === 'pending') && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>
        )}
      </div>

      {/* Warehouses contributed tab */}
      {activeTab === 'warehouses' && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-600" />
              <span>Điểm Ghim Định Vị Đã Đóng Góp ({warehouses.length})</span>
            </h2>
          </div>

          {warehouses.length > 0 ? (
            <div className="space-y-2.5 sm:space-y-3">
              {warehouses.map((wh) => (
                <div
                  key={wh.id}
                  className="p-3 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col xs:flex-row items-stretch xs:items-center justify-between gap-2.5 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {wh.image_url ? (
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-slate-200 bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={wh.image_url}
                          alt={wh.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 border border-orange-200">
                        <MapPin className="w-6 h-6" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-slate-900 truncate">
                          {wh.name}
                        </p>
                        {wh.category === 'eatery' ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 inline-flex items-center gap-0.5">
                            <UtensilsCrossed className="w-2.5 h-2.5 text-emerald-600" />
                            <span>Quán ăn</span>
                          </span>
                        ) : wh.category === 'customer' ? (
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200 inline-flex items-center gap-0.5">
                            <Home className="w-2.5 h-2.5 text-blue-600" />
                            <span>Nhà khách</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.2 rounded border border-orange-200 inline-flex items-center gap-0.5">
                            <Building2 className="w-2.5 h-2.5 text-orange-600" />
                            <span>Kho hàng</span>
                          </span>
                        )}

                        {/* Privacy Badge */}
                        {wh.is_private ? (
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200 inline-flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5 text-purple-600" />
                            <span>Riêng tư</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200 inline-flex items-center gap-0.5">
                            <Globe className="w-2.5 h-2.5 text-sky-600" />
                            <span>Công khai</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span>{wh.voice_notes_count || 0} voice chỉ dẫn</span>
                        <span>•</span>
                        <span>{new Date(wh.created_at).toLocaleDateString('vi-VN')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between xs:justify-end gap-2 shrink-0">
                    {wh.is_private ? (
                      <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded-lg border border-purple-200 inline-flex items-center gap-1">
                        <Lock className="w-3 h-3 text-purple-600" />
                        <span>Riêng tư</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                        +10đ
                      </span>
                    )}

                    <Link
                      href={`/warehouse/${wh.id}`}
                      className="min-h-[34px] px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold text-[11px] transition flex items-center justify-center active:scale-95"
                    >
                      Xem kho
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 space-y-2">
              <p className="text-xs text-slate-500 italic">
                {isOwner
                  ? 'Bạn chưa ghim điểm bến bãi nào. Hãy ghim các địa chỉ thực tế để nhận ngay +10 điểm cống hiến mỗi điểm!'
                  : 'Tài xế này chưa ghim điểm bến bãi nào.'}
              </p>
              {isOwner && (
                <Link
                  href="/warehouse/new"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Ghim Địa Chỉ Ngay (+10đ)</span>
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* Voice notes contributed tab */}
      {activeTab === 'contributions' && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
          <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-orange-600" />
            <span>Chỉ Dẫn Voice Đã Đóng Góp ({voiceNotes.length})</span>
          </h2>

          {voiceNotes.length > 0 ? (
            <div className="space-y-2.5 sm:space-y-3">
              {voiceNotes.map((vn) => (
                <div
                  key={vn.id}
                  className="p-3 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col xs:flex-row items-stretch xs:items-center justify-between gap-2.5 text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 line-clamp-2">
                      {vn.note_text || 'Chỉ đường chi tiết bằng giọng nói'}
                    </p>
                    <span className="text-[11px] text-slate-400 mt-0.5 block">
                      Thời lượng: {vn.duration_seconds}s •{' '}
                      {new Date(vn.created_at).toLocaleDateString('vi-VN')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between xs:justify-end gap-2 shrink-0">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                      +5đ
                    </span>

                    <div className="flex items-center gap-1 font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>+{vn.upvotes_count}</span>
                    </div>

                    <Link
                      href={`/warehouse/${vn.warehouse_id}`}
                      className="min-h-[34px] px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold text-[11px] transition flex items-center justify-center active:scale-95"
                    >
                      Xem kho
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-2">
              {isOwner
                ? 'Bạn chưa ghi chú chỉ đường nào. Hãy đến một kho hàng và thu âm chỉ đường để hỗ trợ đồng nghiệp và nhận ngay +5 điểm cống hiến mỗi voice!'
                : 'Tài xế này chưa ghi chú chỉ đường nào.'}
            </p>
          )}
        </div>
      )}

      {/* Reports submitted tab (Owner only) */}
      {isOwner && activeTab === 'reports' && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Flag className="w-4 h-4 text-red-600" />
              <span>Tiến Độ Báo Cáo Vi Phạm Của Bạn</span>
            </h2>
            <span className="text-[11px] text-slate-400">
              Tổng số: {myReports.length}
            </span>
          </div>

          <p className="text-xs text-slate-500">
            Trạng thái xử lý của các nội dung kho hoặc chỉ dẫn bất thường bạn đã gửi cho Quản trị viên.
          </p>

          {myReports.length > 0 ? (
            <div className="space-y-3 pt-1">
              {myReports.map((r) => {
                return (
                  <div
                    key={r.id}
                    className={`p-3.5 sm:p-4 rounded-xl border transition text-xs space-y-2.5 ${
                      r.status === 'pending'
                        ? 'bg-amber-50/40 border-amber-200'
                        : r.status === 'resolved'
                        ? 'bg-emerald-50/30 border-emerald-200'
                        : 'bg-slate-50 border-slate-200 opacity-80'
                    }`}
                  >
                    {/* Header: Date + Status Badge */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <span className="text-[11px] text-slate-400">
                        Gửi lúc: {new Date(r.created_at).toLocaleString('vi-VN')}
                      </span>

                      {/* Status Badges */}
                      {r.status === 'pending' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1 border border-amber-200">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Chờ Quản Trị Viên xử lý</span>
                        </span>
                      )}

                      {r.status === 'resolved' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Đã xử lý thành công</span>
                        </span>
                      )}

                      {r.status === 'dismissed' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 flex items-center gap-1 border border-slate-200">
                          <XCircle className="w-3.5 h-3.5 text-slate-500" />
                          <span>Đã xem xét (Bỏ qua)</span>
                        </span>
                      )}
                    </div>

                    {/* Reason */}
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                      <span className="font-bold text-slate-800 block text-[11px] mb-0.5">
                        Lý do bạn báo cáo:
                      </span>
                      <p className="text-xs text-slate-700 font-medium">
                        &ldquo;{r.reason}&rdquo;
                      </p>
                    </div>

                    {/* Target reported */}
                    <div className="flex items-center gap-2 text-xs text-slate-600 pt-0.5">
                      {r.warehouse && (
                        <div className="flex items-center justify-between gap-2 w-full bg-blue-50/60 p-2 rounded-lg border border-blue-100 text-blue-800">
                          <div className="flex items-center gap-1.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">Kho: {r.warehouse.name}</span>
                          </div>
                          <Link
                            href={`/warehouse/${r.warehouse.id}`}
                            className="text-[11px] font-bold underline hover:text-blue-900 shrink-0"
                          >
                            Xem kho
                          </Link>
                        </div>
                      )}

                      {r.voice_note && (
                        <div className="flex items-center gap-1.5 w-full bg-orange-50/60 p-2 rounded-lg border border-orange-100 text-orange-800">
                          <Volume2 className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                          <span className="truncate">
                            Chỉ dẫn voice: {r.voice_note.note_text || 'Ghi âm chỉ đường'} ({r.voice_note.duration_seconds}s)
                          </span>
                        </div>
                      )}

                      {r.reported_user && !r.warehouse && !r.voice_note && (
                        <div className="flex items-center gap-1.5 w-full bg-slate-100 p-2 rounded-lg border border-slate-200 text-slate-700">
                          <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">Tài xế: {r.reported_user.full_name}</span>
                        </div>
                      )}
                    </div>

                    {/* Status explanation */}
                    <div className="text-[11px] text-slate-500 pt-0.5">
                      {r.status === 'pending' && (
                        <span className="text-amber-700">
                          ⏳ Quản trị viên đang xem xét báo cáo. Nếu có sai phạm, kho hoặc chỉ dẫn sẽ bị gỡ bỏ ngay.
                        </span>
                      )}
                      {r.status === 'resolved' && (
                        <span className="text-emerald-700 font-medium">
                          ✓ Quản trị viên đã kiểm tra và xử lý vi phạm này (gỡ bỏ nội dung sai lệch hoặc xử lý tài khoản).
                        </span>
                      )}
                      {r.status === 'dismissed' && (
                        <span className="text-slate-500">
                          ℹ️ Quản trị viên đã xác minh lại và ghi nhận nội dung hợp lệ hoặc đã được điều chỉnh.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <Flag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-bold text-slate-700">Bạn chưa gửi báo cáo vi phạm nào.</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Khi phát hiện kho bãi sai tọa độ hoặc chỉ dẫn giọng nói gây lạc đường, bạn có thể bấm nút báo cáo để ban quản trị kiểm tra.
              </p>
            </div>
          )}
        </div>
      )}

      {isOwner && (
        <div className="pt-2 pb-6 flex justify-center">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition active:scale-95 border border-red-200 shadow-2xs"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất tài khoản khỏi thiết bị</span>
          </button>
        </div>
      )}

      <VietQRModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        driverName={profile.full_name}
        bankName={profile.bank_name}
        bankAccountNo={profile.bank_account_no}
        bankAccountName={profile.bank_account_name}
      />
    </div>
  );
}

export default function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ProfileContent paramsPromise={params} />
    </Suspense>
  );
}
