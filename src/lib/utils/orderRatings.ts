import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocationOrderRating, OrderPredictionResult, OrderRatingLevel } from '@/types/database';
import { calculateHaversineDistance } from '@/lib/utils/distance';

/**
 * Điểm số tương ứng với các mức đánh giá khả năng nổ đơn:
 * - 'ngon': 4 điểm (Nổ đơn ầm ầm / Nhiều đơn)
 * - 'tam':  3 điểm (Đơn túc tắc / Tạm ổn)
 * - 'khe':  2 điểm (Ít đơn / Chờ lâu)
 * - 'mom':  1 điểm (Móm / Không có đơn)
 */
export const ORDER_RATING_SCORES: Record<OrderRatingLevel, number> = {
  ngon: 4,
  tam: 3,
  khe: 2,
  mom: 1,
};

export const ORDER_RATING_CONFIG: Record<
  OrderRatingLevel,
  {
    label: string;
    sublabel: string;
    badgeText: string;
    icon: string;
    color: 'emerald' | 'amber' | 'orange' | 'rose';
    bgClass: string;
    borderClass: string;
    textClass: string;
  }
> = {
  ngon: {
    label: 'Ngon',
    sublabel: 'Nổ đơn ầm ầm 🔥 (Rất nhiều đơn)',
    badgeText: 'Ngon 🔥',
    icon: 'Zap',
    color: 'emerald',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-300',
    textClass: 'text-emerald-700',
  },
  tam: {
    label: 'Tạm',
    sublabel: 'Đơn túc tắc 🛵 (Vừa phải, ổn định)',
    badgeText: 'Tạm 🛵',
    icon: 'Bike',
    color: 'amber',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-300',
    textClass: 'text-amber-800',
  },
  khe: {
    label: 'Khê',
    sublabel: 'Chờ dài cổ ⏳ (Ít đơn, chờ lâu)',
    badgeText: 'Khê ⏳',
    icon: 'Clock',
    color: 'orange',
    bgClass: 'bg-orange-50',
    borderClass: 'border-orange-300',
    textClass: 'text-orange-800',
  },
  mom: {
    label: 'Móm',
    sublabel: 'Đói mốc mồm 🦗 (Không có đơn nào)',
    badgeText: 'Móm 🦗',
    icon: 'Moon',
    color: 'rose',
    bgClass: 'bg-rose-50',
    borderClass: 'border-rose-300',
    textClass: 'text-rose-700',
  },
};

/**
 * Lọc các đánh giá nổ đơn nằm trong bán kính (mặc định 2km) quanh một tọa độ GPS
 */
export function filterRatingsNearLocation(
  ratings: LocationOrderRating[],
  lat: number,
  lon: number,
  radiusKm: number = 2
): LocationOrderRating[] {
  if (!ratings || ratings.length === 0 || !lat || !lon) return [];

  return ratings
    .map((r) => {
      const rLat = r.latitude ?? r.warehouse?.latitude;
      const rLon = r.longitude ?? r.warehouse?.longitude;
      if (typeof rLat !== 'number' || typeof rLon !== 'number') return null;

      const dist = calculateHaversineDistance(lat, lon, rLat, rLon);
      return {
        ...r,
        distance_km: dist,
      };
    })
    .filter((r): r is LocationOrderRating & { distance_km: number } => r !== null && r.distance_km <= radiusKm)
    .sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));
}

/**
 * Tính toán dự báo nổ đơn dựa trên điểm trung bình của các tài xế khác tại khung giờ đó
 */
export function calculateOrderPrediction(
  ratings: LocationOrderRating[],
  targetHour?: number,
  contextText: string = 'khu vực này'
): OrderPredictionResult {
  const currentHour = targetHour !== undefined ? targetHour : new Date().getHours();

  if (!ratings || ratings.length === 0) {
    return {
      hasData: false,
      currentHour,
      avgScore: 0,
      totalCount: 0,
      level: null,
      label: 'Chưa có báo đơn',
      badgeText: 'Chưa có dữ liệu',
      color: 'slate',
      bgClass: 'bg-slate-50 text-slate-600 border-slate-200',
      description: `Chưa có bác tài nào báo tình hình nổ đơn tại ${contextText} lúc ${currentHour}h.`,
      recentReportsCount: 0,
    };
  }

  // 1. Lọc đánh giá đúng khung giờ hiện tại
  const exactHourRatings = ratings.filter((r) => r.hour_of_day === currentHour);

  // 2. Lọc đánh giá gần đây nhất (trong 3 giờ qua)
  const now = Date.now();
  const recentRatings = ratings.filter((r) => {
    const diffHours = (now - new Date(r.created_at).getTime()) / (1000 * 60 * 60);
    return diffHours <= 3;
  });

  // Ưu tiên:
  // Nếu có đánh giá đúng khung giờ này -> dùng tất cả đánh giá của khung giờ này (tính điểm trung bình)
  // Nếu chưa có đánh giá đúng khung giờ -> dùng các đánh giá mới nhất gần đây (<=3h)
  const ratingsToUse = exactHourRatings.length > 0 ? exactHourRatings : recentRatings;

  if (ratingsToUse.length === 0) {
    return {
      hasData: false,
      currentHour,
      avgScore: 0,
      totalCount: 0,
      level: null,
      label: 'Chưa có báo đơn giờ này',
      badgeText: 'Chưa có báo đơn',
      color: 'slate',
      bgClass: 'bg-slate-50 text-slate-600 border-slate-200',
      description: `Khung giờ ${currentHour}h chưa có báo cáo tại ${contextText}. Mời bác tài báo nổ đơn đầu tiên!`,
      recentReportsCount: 0,
    };
  }

  const sumScore = ratingsToUse.reduce((sum, r) => sum + r.score, 0);
  const avgScore = sumScore / ratingsToUse.length;
  const roundedScore = Math.round(avgScore * 10) / 10;

  if (avgScore >= 3.3) {
    return {
      hasData: true,
      currentHour,
      avgScore: roundedScore,
      totalCount: ratingsToUse.length,
      level: 'ngon',
      label: 'Nhiều đơn (Ngon)',
      badgeText: 'Ngon 🔥',
      color: 'emerald',
      bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      description: `Khung giờ ${currentHour}h tại ${contextText} thường có nhiều đơn, nổ liên tục (${roundedScore}/4⭐ từ ${ratingsToUse.length} lượt báo).`,
      recentReportsCount: recentRatings.length,
    };
  } else if (avgScore >= 2.3) {
    return {
      hasData: true,
      currentHour,
      avgScore: roundedScore,
      totalCount: ratingsToUse.length,
      level: 'tam',
      label: 'Đơn túc tắc (Tạm)',
      badgeText: 'Tạm 🛵',
      color: 'amber',
      bgClass: 'bg-amber-50 text-amber-800 border-amber-200',
      description: `Khung giờ ${currentHour}h tại ${contextText} thường có đơn vừa phải, chờ vừa sức (${roundedScore}/4⭐ từ ${ratingsToUse.length} lượt báo).`,
      recentReportsCount: recentRatings.length,
    };
  } else if (avgScore >= 1.6) {
    return {
      hasData: true,
      currentHour,
      avgScore: roundedScore,
      totalCount: ratingsToUse.length,
      level: 'khe',
      label: 'Ít đơn (Khê)',
      badgeText: 'Khê ⏳',
      color: 'orange',
      bgClass: 'bg-orange-50 text-orange-800 border-orange-200',
      description: `Khung giờ ${currentHour}h tại ${contextText} thường ít đơn hoặc phải chờ lâu (${roundedScore}/4⭐ từ ${ratingsToUse.length} lượt báo).`,
      recentReportsCount: recentRatings.length,
    };
  } else {
    return {
      hasData: true,
      currentHour,
      avgScore: roundedScore,
      totalCount: ratingsToUse.length,
      level: 'mom',
      label: 'Móm / Không có đơn',
      badgeText: 'Móm 🦗',
      color: 'rose',
      bgClass: 'bg-rose-50 text-rose-800 border-rose-200',
      description: `Khung giờ ${currentHour}h tại ${contextText} thường đói đơn / móm (${roundedScore}/4⭐ từ ${ratingsToUse.length} lượt báo).`,
      recentReportsCount: recentRatings.length,
    };
  }
}

/**
 * Thống kê điểm trung bình theo 24 khung giờ trong ngày
 */
export function getHourlyBreakdown(ratings: LocationOrderRating[]) {
  const breakdown: Array<{
    hour: number;
    avgScore: number;
    count: number;
    level: OrderRatingLevel | null;
  }> = [];

  for (let h = 0; h < 24; h++) {
    const hourRatings = ratings.filter((r) => r.hour_of_day === h);
    if (hourRatings.length === 0) {
      breakdown.push({ hour: h, avgScore: 0, count: 0, level: null });
    } else {
      const avg = hourRatings.reduce((sum, r) => sum + r.score, 0) / hourRatings.length;
      let level: OrderRatingLevel = 'tam';
      if (avg >= 3.3) level = 'ngon';
      else if (avg >= 2.3) level = 'tam';
      else if (avg >= 1.6) level = 'khe';
      else level = 'mom';

      breakdown.push({
        hour: h,
        avgScore: Math.round(avg * 10) / 10,
        count: hourRatings.length,
        level,
      });
    }
  }

  return breakdown;
}

/**
 * Tải danh sách đánh giá từ Supabase
 */
export async function fetchOrderRatings(
  supabase: SupabaseClient,
  warehouseId?: string
): Promise<LocationOrderRating[]> {
  try {
    let query = supabase
      .from('location_order_ratings')
      .select('*, user:profiles(id, full_name, avatar_url), warehouse:warehouses(id, name, address, category, latitude, longitude)')
      .order('created_at', { ascending: false });

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    } else {
      query = query.limit(300);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Bảng location_order_ratings chưa khả dụng hoặc có lỗi:', error.message);
      return [];
    }
    return (data as LocationOrderRating[]) || [];
  } catch (err) {
    console.warn('Lỗi khi tải order ratings:', err);
    return [];
  }
}

/**
 * Gửi đánh giá tình hình nổ đơn mới (tại vị trí GPS hiện tại hoặc theo kho cụ thể)
 */
export async function submitOrderRating(
  supabase: SupabaseClient,
  params: {
    latitude: number;
    longitude: number;
    address?: string | null;
    warehouseId?: string | null;
    rating: OrderRatingLevel;
    note?: string | null;
  }
): Promise<{ success: boolean; data?: LocationOrderRating; error?: string }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Vui lòng đăng nhập để đánh giá tình hình nổ đơn.' };
    }

    if (!params.latitude || !params.longitude) {
      return { success: false, error: 'Thiếu thông tin tọa độ GPS để lưu đánh giá.' };
    }

    const score = ORDER_RATING_SCORES[params.rating];
    const hourOfDay = new Date().getHours();

    const insertPayload: any = {
      user_id: user.id,
      latitude: params.latitude,
      longitude: params.longitude,
      address: params.address?.trim() || null,
      warehouse_id: params.warehouseId || null,
      rating: params.rating,
      score: score,
      hour_of_day: hourOfDay,
      note: params.note?.trim() || null,
    };

    const { data, error } = await supabase
      .from('location_order_ratings')
      .insert(insertPayload)
      .select('*, user:profiles(id, full_name, avatar_url), warehouse:warehouses(id, name, address, category, latitude, longitude)')
      .single();

    if (error) {
      throw error;
    }

    // Tự động cập nhật điểm cống hiến cho tài xế (+2 điểm) khi báo cáo tình hình thực tế
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('reputation_score')
        .eq('id', user.id)
        .maybeSingle();

      if (prof) {
        await supabase
          .from('profiles')
          .update({ reputation_score: (prof.reputation_score || 0) + 2 })
          .eq('id', user.id);
      }
    } catch (e) {
      console.warn('Lỗi cộng điểm cống hiến khi báo đơn:', e);
    }

    return { success: true, data: data as LocationOrderRating };
  } catch (err: any) {
    console.error('Lỗi khi gửi đánh giá nổ đơn:', err);
    return { success: false, error: err?.message || 'Có lỗi xảy ra khi lưu đánh giá.' };
  }
}
