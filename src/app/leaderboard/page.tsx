'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/database';
import { Trophy, Award, Heart, ArrowRight } from 'lucide-react';
import { VietQRModal } from '@/components/donation/VietQRModal';
import { DriverAvatar, DriverRankBadge } from '@/components/common/DriverAvatar';

export default function LeaderboardPage() {
  const [topDrivers, setTopDrivers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [donateDriver, setDonateDriver] = useState<Profile | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function loadLeaderboard() {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('is_banned', false)
          .gt('reputation_score', 0)
          .order('reputation_score', { ascending: false })
          .limit(10);

        if (data) {
          setTopDrivers(data);
        }
      } catch (err) {
        console.error('Error loading leaderboard:', err);
      } finally {
        setLoading(false);
      }
    }

    loadLeaderboard();
  }, [supabase]);

  const rankBadges = [
    { bg: 'bg-amber-400 text-slate-900 border-amber-300 ring-2 ring-amber-300/50', label: '1' },
    { bg: 'bg-slate-300 text-slate-900 border-slate-200 ring-2 ring-slate-300/50', label: '2' },
    { bg: 'bg-amber-700 text-white border-amber-600 ring-2 ring-amber-700/30', label: '3' },
  ];

  return (
    <div className="p-3 sm:p-6 max-w-2xl mx-auto w-full space-y-4 sm:space-y-5">
      <div className="text-center py-4 bg-gradient-to-b from-orange-50 to-white rounded-2xl border border-orange-100 p-4 sm:p-6 shadow-xs">
        <div className="inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-orange-600 text-white mb-2 shadow-xs">
          <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Bảng Vàng Bác Tài
        </h1>
        <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto leading-relaxed">
          Tôn vinh các bác tài tích cực nhất ghim bến bãi, đóng góp chỉ dẫn ngõ ngách, cứu nguy đồng nghiệp không lo lạc đường
        </p>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : topDrivers.length > 0 ? (
        <div className="space-y-2.5 sm:space-y-3">
          {topDrivers.map((driver, index) => {
            const isTop3 = index < 3;
            const rankStyle = isTop3 ? rankBadges[index] : null;

            return (
              <div
                key={driver.id}
                className={`bg-white rounded-2xl p-3 sm:p-4 border transition flex items-center justify-between gap-2.5 sm:gap-3 shadow-xs ${
                  index === 0
                    ? 'border-amber-400/80 bg-gradient-to-r from-amber-50/40 to-white'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  {/* Rank position */}
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-xs sm:text-sm shrink-0 border ${
                      rankStyle ? rankStyle.bg : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {index + 1}
                  </div>

                  {/* Driver Avatar with Star Rating */}
                  <DriverAvatar
                    profile={driver}
                    size="md"
                    showStars={true}
                    linkToProfile={true}
                  />

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link
                        href={`/profile/${driver.id}`}
                        className="font-bold text-xs sm:text-sm text-slate-900 hover:text-orange-600 transition truncate"
                      >
                        <span className="truncate">{driver.full_name}</span>
                      </Link>
                      <DriverRankBadge reputationScore={driver.reputation_score} />
                      {driver.role === 'admin' && (
                        <span className="text-[9px] px-1 py-0.2 bg-red-100 text-red-700 rounded font-bold shrink-0">
                          Admin
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 text-xs">
                      <span className="font-semibold text-amber-600 flex items-center gap-1 text-[11px] sm:text-xs">
                        <Award className="w-3.5 h-3.5 shrink-0" />
                        <span>{driver.reputation_score} điểm cống hiến</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {driver.bank_account_no && (
                    <button
                      onClick={() => setDonateDriver(driver)}
                      className="min-h-[36px] p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition border border-rose-200 text-xs font-semibold flex items-center gap-1 active:scale-95"
                      title="Cảm ơn bác tài qua VietQR"
                    >
                      <Heart className="w-4 h-4 fill-rose-600 shrink-0" />
                      <span className="hidden xs:inline">Cảm ơn</span>
                    </button>
                  )}

                  <Link
                    href={`/profile/${driver.id}`}
                    className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition active:scale-95"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
          Chưa có dữ liệu bảng xếp hạng. Hãy là người đầu tiên chia sẻ vị trí kho và chỉ đường!
        </div>
      )}

      {donateDriver && (
        <VietQRModal
          isOpen={!!donateDriver}
          onClose={() => setDonateDriver(null)}
          driverName={donateDriver.full_name}
          bankName={donateDriver.bank_name}
          bankAccountNo={donateDriver.bank_account_no}
          bankAccountName={donateDriver.bank_account_name}
        />
      )}
    </div>
  );
}
