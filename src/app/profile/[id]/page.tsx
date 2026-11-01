'use client';

import { Suspense, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Profile, UserBadge, VoiceNote } from '@/types/database';
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
} from 'lucide-react';

function ProfileContent({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  const { id: profileId } = use(paramsPromise);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userBadges, setUserBadges] = useState<UserBadge[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) setCurrentUserId(user.id);

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

        const { data: notesData } = await supabase
          .from('voice_notes')
          .select('*')
          .eq('user_id', profileId)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (notesData) {
          setVoiceNotes(notesData);
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [profileId, supabase]);

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
          <Link
            href="/profile/edit"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition active:scale-95"
          >
            <Edit className="w-3.5 h-3.5" />
            <span>Sửa hồ sơ & VietQR</span>
          </Link>
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
            <div className="mt-3.5 flex flex-wrap gap-2 justify-center sm:justify-start">
              <button
                onClick={() => setShowQRModal(true)}
                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl text-xs font-bold shadow-md transition active:scale-95"
              >
                <CreditCard className="w-4 h-4" />
                <span>Mời cà phê / Quét VietQR Donate</span>
              </button>
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
            Chưa có huy hiệu. Hãy chia sẻ chỉ đường để tích lũy điểm cống hiến!
          </p>
        )}
      </div>

      {/* Voice notes contributed */}
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
            Tài xế này chưa ghi chú chỉ đường nào.
          </p>
        )}
      </div>

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
