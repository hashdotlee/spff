'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MapPin, User, ShieldAlert, Award, Siren, Trophy } from 'lucide-react';
import type { Profile } from '@/types/database';

export function Navbar() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  async function resolveProfile(userId: string, email?: string, metaFullName?: string) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        return data as Profile;
      }

      // If user is authenticated but profile row doesn't exist yet, auto-create it
      const fallbackName = metaFullName || email?.split('@')[0] || 'Tài xế';
      const fallbackProfile: Profile = {
        id: userId,
        email: email || '',
        full_name: fallbackName,
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
      };

      const { data: inserted } = await supabase
        .from('profiles')
        .upsert(fallbackProfile)
        .select()
        .maybeSingle();

      return (inserted as Profile) || fallbackProfile;
    } catch (err) {
      console.warn('Error loading or initializing profile:', err);
      return {
        id: userId,
        email: email || '',
        full_name: metaFullName || email?.split('@')[0] || 'Tài xế',
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
      } as Profile;
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && isMounted) {
          const prof = await resolveProfile(
            user.id,
            user.email,
            user.user_metadata?.full_name
          );
          if (isMounted) setProfile(prof);
        } else if (isMounted) {
          setProfile(null);
        }
      } catch (err) {
        console.error('Error fetching user session:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: any, session: any) => {
      if (!isMounted) return;
      if (session?.user) {
        const prof = await resolveProfile(
          session.user.id,
          session.user.email,
          session.user.user_metadata?.full_name
        );
        if (isMounted) {
          setProfile(prof);
          setLoading(false);
        }
      } else {
        if (isMounted) {
          setProfile(null);
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs pt-[env(safe-area-inset-top,0px)]">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 font-bold text-orange-600 hover:text-orange-700 transition shrink-0">
          <div className="w-8 h-8 rounded-lg bg-orange-600 text-white flex items-center justify-center shadow-xs">
            <MapPin className="w-5 h-5" />
          </div>
          <div className="leading-tight">
            <span className="text-base font-extrabold tracking-tight text-slate-900">SPFF</span>
            <span className="text-[10px] sm:text-xs font-semibold text-orange-600 block -mt-1">Dẫn Đường Tài Xế</span>
          </div>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Bảng vàng vinh danh bác tài */}
          <Link
            href="/leaderboard"
            className="p-1.5 text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100/80 rounded-full transition active:scale-95 shrink-0 flex items-center justify-center border border-amber-200"
            title="Bảng vàng bác tài"
          >
            <Trophy className="w-3.5 h-3.5 fill-amber-500/20" />
          </Link>

          {/* Quick SOS Link */}
          <Link
            href="/incidents/new"
            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-full text-xs font-black transition flex items-center gap-1 active:scale-95 shrink-0"
            title="Cứu hộ SOS khẩn cấp"
          >
            <Siren className="w-3.5 h-3.5 text-red-600 animate-pulse" />
            <span>SOS</span>
          </Link>

          {loading ? (
            <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse" />
          ) : profile ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              {profile.role === 'admin' && (
                <Link
                  href="/admin"
                  className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition flex items-center gap-1"
                  title="Quản trị viên"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Admin</span>
                </Link>
              )}

              <Link
                href={`/profile/${profile.id}`}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-bold text-amber-900 hover:bg-amber-100 transition shrink-0"
              >
                <Award className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{profile.reputation_score}đ</span>
              </Link>

              <Link
                href={`/profile/${profile.id}`}
                className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 font-semibold text-xs overflow-hidden hover:ring-2 hover:ring-orange-500 transition shrink-0"
                title={profile.full_name || 'Hồ sơ'}
              >
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  profile.full_name?.[0]?.toUpperCase() || <User className="w-4 h-4" />
                )}
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href="/login"
                className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition active:scale-95"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 shadow-xs transition active:scale-95"
              >
                Đăng ký
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
