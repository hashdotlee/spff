'use client';

import Link from 'next/link';
import { Star, User } from 'lucide-react';
import type { Profile } from '@/types/database';
import { getDriverRank } from '@/lib/utils/reputation';

interface DriverAvatarProps {
  profile?:
    | Profile
    | {
        id?: string;
        full_name?: string | null;
        avatar_url?: string | null;
        reputation_score?: number;
      }
    | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showStars?: boolean;
  linkToProfile?: boolean;
  className?: string;
}

export function DriverAvatar({
  profile,
  size = 'md',
  showStars = true,
  linkToProfile = false,
  className = '',
}: DriverAvatarProps) {
  const reputation = profile?.reputation_score ?? 0;
  const rank = getDriverRank(reputation);
  const fullName = profile?.full_name || 'Bác tài';
  const initial = fullName.trim()[0]?.toUpperCase() || 'T';

  const sizeClasses = {
    xs: {
      circle: 'w-7 h-7 text-[10px]',
      pill: 'px-1 py-0.2 -bottom-1 text-[8px]',
      starIcon: 'w-2 h-2',
      badgeText: 'text-[8px]',
    },
    sm: {
      circle: 'w-8 h-8 text-xs',
      pill: 'px-1 py-0.2 -bottom-1 text-[8px]',
      starIcon: 'w-2 h-2',
      badgeText: 'text-[8px]',
    },
    md: {
      circle: 'w-11 h-11 text-sm',
      pill: 'px-1.5 py-0.5 -bottom-1.5 text-[9px]',
      starIcon: 'w-2.5 h-2.5',
      badgeText: 'text-[9px]',
    },
    lg: {
      circle: 'w-14 h-14 text-base',
      pill: 'px-2 py-0.5 -bottom-2 text-[10px]',
      starIcon: 'w-3 h-3',
      badgeText: 'text-[10px]',
    },
    xl: {
      circle: 'w-20 h-20 text-xl',
      pill: 'px-2.5 py-0.5 -bottom-2.5 text-xs',
      starIcon: 'w-3.5 h-3.5',
      badgeText: 'text-xs',
    },
  }[size];

  const avatarContent = (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      {/* Avatar Circle */}
      <div
        className={`${sizeClasses.circle} rounded-full overflow-hidden bg-gradient-to-tr from-slate-200 to-slate-100 border border-slate-300 text-slate-700 font-black flex items-center justify-center shadow-2xs select-none`}
      >
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={fullName}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>

      {/* Star Rating Badge immediately under the avatar */}
      {showStars && (
        <div
          className={`absolute ${sizeClasses.pill} left-1/2 -translate-x-1/2 bg-slate-900/95 text-amber-400 rounded-full border border-white/90 shadow-xs flex items-center justify-center gap-0.5 whitespace-nowrap z-10 pointer-events-none`}
          title={`${rank.title} (${rank.stars} sao - ${reputation}đ)`}
        >
          {size === 'xs' || size === 'sm' ? (
            // Dành cho size nhỏ: hiện 1 sao kèm số lượng sao (ví dụ: ⭐3)
            <div className="flex items-center gap-0.5 px-0.5">
              <Star className={`${sizeClasses.starIcon} fill-amber-400 text-amber-400 shrink-0`} />
              <span className={`font-black text-amber-300 leading-none ${sizeClasses.badgeText}`}>
                {rank.stars}
              </span>
            </div>
          ) : (
            // Dành cho size md, lg, xl: hiện hàng sao vàng đầy đủ
            <div className="flex items-center gap-0.5 px-0.5">
              {Array.from({ length: rank.stars }).map((_, i) => (
                <Star
                  key={i}
                  className={`${sizeClasses.starIcon} fill-amber-400 text-amber-400 shrink-0`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (linkToProfile && profile?.id) {
    return (
      <Link
        href={`/profile/${profile.id}`}
        className="transition active:scale-95 inline-block shrink-0"
        title={`Xem hồ sơ của ${fullName}`}
      >
        {avatarContent}
      </Link>
    );
  }

  return avatarContent;
}

/**
 * Huy hiệu danh hiệu bác tài đi kèm tên (ví dụ: [⭐⭐⭐ Thổ Địa Bến Bãi])
 */
export function DriverRankBadge({
  reputationScore = 0,
  showTitle = true,
}: {
  reputationScore?: number;
  showTitle?: boolean;
}) {
  const rank = getDriverRank(reputationScore);

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${rank.badgeBg}`}
      title={`${rank.title} - ${rank.description}`}
    >
      <span className="flex items-center gap-0.2">
        {Array.from({ length: rank.stars }).map((_, i) => (
          <Star key={i} className="w-2.5 h-2.5 fill-amber-500 text-amber-500 shrink-0" />
        ))}
      </span>
      {showTitle && <span>{rank.title}</span>}
    </span>
  );
}
