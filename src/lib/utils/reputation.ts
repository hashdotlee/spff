export interface DriverRank {
  stars: number; // 1 to 5
  title: string;
  minPoints: number;
  nextPoints?: number;
  badgeBg: string;
  badgeTextColor: string;
  starColor: string;
  description: string;
}

/**
 * Tính toán cấp bậc và số sao vinh danh của bác tài dựa trên điểm cống hiến (reputation_score).
 * Thang điểm:
 * - 1 sao ⭐: 0 - 19đ (Tài Xế Mới)
 * - 2 sao ⭐⭐: 20 - 49đ (Bác Tài Tin Cậy)
 * - 3 sao ⭐⭐⭐: 50 - 99đ (Thổ Địa Bến Bãi)
 * - 4 sao ⭐⭐⭐⭐: 100 - 199đ (Hiệp Sĩ Xa Lộ)
 * - 5 sao ⭐⭐⭐⭐⭐: >= 200đ (Huyền Thoại Xa Lộ)
 */
export function getDriverRank(score: number = 0): DriverRank {
  const safeScore = Math.max(0, score || 0);

  if (safeScore >= 200) {
    return {
      stars: 5,
      title: 'Huyền Thoại',
      minPoints: 200,
      badgeBg: 'bg-amber-100 border-amber-300 text-amber-800',
      badgeTextColor: 'text-amber-800',
      starColor: 'fill-amber-400 text-amber-400',
      description: 'Đóng góp xuất sắc nhất cộng đồng',
    };
  }

  if (safeScore >= 100) {
    return {
      stars: 4,
      title: 'Hiệp Sĩ Xa Lộ',
      minPoints: 100,
      nextPoints: 200,
      badgeBg: 'bg-orange-100 border-orange-300 text-orange-800',
      badgeTextColor: 'text-orange-800',
      starColor: 'fill-amber-400 text-amber-400',
      description: 'Chỉ đường & cứu nạn uy tín',
    };
  }

  if (safeScore >= 50) {
    return {
      stars: 3,
      title: 'Thổ Địa Bến Bãi',
      minPoints: 50,
      nextPoints: 100,
      badgeBg: 'bg-purple-100 border-purple-300 text-purple-800',
      badgeTextColor: 'text-purple-800',
      starColor: 'fill-amber-400 text-amber-400',
      description: 'Ghim bến bãi chính xác',
    };
  }

  if (safeScore >= 20) {
    return {
      stars: 2,
      title: 'Bác Tài Tin Cậy',
      minPoints: 20,
      nextPoints: 50,
      badgeBg: 'bg-blue-100 border-blue-300 text-blue-800',
      badgeTextColor: 'text-blue-800',
      starColor: 'fill-amber-400 text-amber-400',
      description: 'Tích cực chia sẻ chỉ dẫn',
    };
  }

  return {
    stars: 1,
    title: 'Tài Xế Mới',
    minPoints: 0,
    nextPoints: 20,
    badgeBg: 'bg-slate-100 border-slate-300 text-slate-700',
    badgeTextColor: 'text-slate-700',
    starColor: 'fill-amber-400 text-amber-400',
    description: 'Thành viên mới gia nhập',
  };
}
