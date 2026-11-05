import { GameOrder, OrderType, ZoneInfo, ShiftStats, CompletedOrderRecord } from './types';

export const TOTAL_SHIFT_MINUTES = 8 * 60; // 480 minutes (8 hours)
export const KM_TRAVEL_MINUTES = 2.0; // 30 km/h => 2 minutes per 1 km
export const REJECTION_PENALTY_THRESHOLD = 3;
export const REJECTION_PENALTY_MINUTES = 40;
export const MAX_REJECTIONS_ENDGAME = 9;
export const DECISION_TIMEOUT_SECONDS = 15; // 15s to decide per order

export const ZONES: ZoneInfo[] = [
  {
    id: 'zone_central',
    name: 'Khu 1: Trung Tâm & Phố Cổ (Q.1, Q.3, Hoàn Kiếm)',
    shortName: 'Khu 1 - Trung Tâm',
    description: 'Nhiều quán ăn đông đúc, thời gian chờ quán 5-20p. Giá chuẩn 1.0x.',
    priceMultiplier: 1.0,
    foodRatio: 0.75,
    batchRatio: 0.45,
    minDist: 1.2,
    maxDist: 7.5,
    minWait: 5,
    maxWait: 20,
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  {
    id: 'zone_urban',
    name: 'Khu 2: Đô Thị & Văn Phòng (Bình Thạnh, Q.2, Cầu Giấy)',
    shortName: 'Khu 2 - Văn Phòng',
    description: 'Cước +3% giờ cao điểm. Đơn ghép nhiều, thời gian chờ quán vừa phải 3-15p.',
    priceMultiplier: 1.03,
    foodRatio: 0.6,
    batchRatio: 0.6,
    minDist: 2.0,
    maxDist: 12.0,
    minWait: 3,
    maxWait: 15,
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  {
    id: 'zone_suburb',
    name: 'Khu 3: Ngoại Thành & Kho Vận (Bình Chánh, Hóc Môn, Hà Đông)',
    shortName: 'Khu 3 - Kho Ngoại Thành',
    description: '75% là đơn Ship (0p chờ quán!), cước đường dài 8-30km cực lớn. Hệ số 0.98x.',
    priceMultiplier: 0.98,
    foodRatio: 0.25,
    batchRatio: 0.55,
    minDist: 8.0,
    maxDist: 30.0,
    minWait: 1,
    maxWait: 8,
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    id: 'zone_foodie',
    name: 'Khu 4: Ẩm Thực & Chợ Đêm (Q.5, Q.10, Tây Hồ)',
    shortName: 'Khu 4 - Chợ Ẩm Thực',
    description: 'Cước +5% món nóng ban đêm. Chủ yếu Food ghép, chờ quán hên xui 2-20p.',
    priceMultiplier: 1.05,
    foodRatio: 0.85,
    batchRatio: 0.65,
    minDist: 1.5,
    maxDist: 9.0,
    minWait: 2,
    maxWait: 20,
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
  },
];

const FOOD_MERCHANTS = [
  'Cơm Tấm Phúc Lộc Thọ',
  'Trà Sữa KOI Thé',
  'Phở Thìn Lò Đúc',
  'Bánh Mì Huỳnh Hoa',
  'Bún Bò Huế O Oanh',
  'Gà Rán Jollibee',
  'The Coffee House',
  'Cơm Niêu Singapore',
  'Hủ Tiếu Nam Vang Thành Đạt',
  'Bánh Xèo Tôm Nhảy Cô Ba',
  'Bún Chả Hà Nội Phố',
  'Trà Đào Chi Lăng',
  'Bánh Tráng Cuốn Thịt Heo Hoàng Bèo',
  'Cháo Sườn Chú Chen',
];

const SHIP_MERCHANTS = [
  'Tổng Kho SPX Express',
  'Kho Phân Loại Shopee Hàng Cồng Kềnh',
  'Shop Phụ Kiện Điện Tử Mega',
  'Cửa Hàng Thời Trang Mia',
  'Đại Lý Mỹ Phẩm Nature Skin',
  'Kho Bán Buôn Đồ Gia Dụng Gia Huy',
  'Xưởng May Túi Xách & Phụ Kiện GenZ',
  'Shop Đồ Chơi Mô Hình Anime Hobby',
  'Cửa Hàng Phụ Tùng Xe Máy Thành Đạt',
];

const ADDRESS_DESTINATIONS = [
  'Chung cư Vinhomes Central Park, Tòa Landmark 2',
  'Tòa nhà Keangnam Landmark 72, Mễ Trì',
  'Chung cư Masteri Thảo Điền, Tháp T3',
  'Khu đô thị Ecopark, Phố Trúc',
  'Hẻm 458 Cách Mạng Tháng 8, P.11',
  'Tòa Bitexco Financial Tower, Hải Triều',
  'Đại Học Quốc Gia, KTX Khu B',
  'Khu chế xuất Tân Thuận, Đường Tân Thuận',
  'Chung cư Ngoại Giao Đoàn, Bắc Từ Liêm',
  'Hẻm 214 Nguyễn Trãi, P.3',
  'Chung cư Sunrise City, Nguyễn Hữu Thọ',
  'Khu Công Nghệ Cao, Đường D1',
];

/**
 * Calculates raw price before zone multiplier based on exact empirical ShopeeFood formula
 */
export function calculateBasePrice(type: OrderType, itemCount: number, distanceKm: number): number {
  let price = 0;
  if (type === 'food') {
    if (itemCount === 1) {
      if (distanceKm <= 3) {
        price = 13500;
      } else {
        price = 13500 + (distanceKm - 3) * 4025.64;
      }
    } else {
      // Food batch (2..5)
      const extraBatchFee = (itemCount - 1) * 6500;
      const extraKmRate = itemCount >= 5 ? 2800 : 3200;
      const distExtra = distanceKm > 3 ? (distanceKm - 3) * extraKmRate : 0;
      price = 13500 + extraBatchFee + distExtra;
    }
  } else {
    // Ship
    if (itemCount === 1) {
      if (distanceKm <= 3) {
        price = 15000;
      } else {
        price = 15000 + (distanceKm - 3) * 3800;
      }
    } else {
      // Ship batch (2..5)
      const extraBatchFee = (itemCount - 1) * 25000;
      const distExtra = distanceKm > 3 ? (distanceKm - 3) * 2712 : 0;
      price = 15000 + extraBatchFee + distExtra;
    }
  }
  return Math.round(price);
}

/**
 * Calculates final earnings for driver taking zone multiplier into account
 * Rounded to nearest 100 VND
 */
export function calculateFinalPrice(
  type: OrderType,
  itemCount: number,
  distanceKm: number,
  zone: ZoneInfo
): number {
  const base = calculateBasePrice(type, itemCount, distanceKm);
  const withZone = base * zone.priceMultiplier;
  return Math.round(withZone / 100) * 100;
}

/**
 * Generates an incoming order based on zone and random parameters
 */
export function generateRandomOrder(forcedZoneId?: string): GameOrder {
  // Select zone
  const zone = forcedZoneId
    ? ZONES.find((z) => z.id === forcedZoneId) || ZONES[0]
    : ZONES[Math.floor(Math.random() * ZONES.length)];

  // Determine type (food or ship)
  const isFood = Math.random() < zone.foodRatio;
  const type: OrderType = isFood ? 'food' : 'ship';

  // Determine if batched (1 to 5)
  const isBatch = Math.random() < zone.batchRatio;
  let itemCount = 1;
  if (isBatch) {
    if (type === 'food') {
      // Food batch usually 2 to 5
      const batchWeights = [0.4, 0.3, 0.2, 0.1]; // 2, 3, 4, 5
      const roll = Math.random();
      if (roll < 0.4) itemCount = 2;
      else if (roll < 0.7) itemCount = 3;
      else if (roll < 0.9) itemCount = 4;
      else itemCount = 5;
    } else {
      // Ship batch usually 2 to 4
      const roll = Math.random();
      if (roll < 0.5) itemCount = 2;
      else if (roll < 0.8) itemCount = 3;
      else if (roll < 0.95) itemCount = 4;
      else itemCount = 5;
    }
  }

  // Determine distance
  // Distance scales slightly with batch size
  let distanceMin = zone.minDist;
  let distanceMax = zone.maxDist;
  if (itemCount > 1) {
    distanceMin = Math.max(zone.minDist, zone.minDist * 1.3);
    distanceMax = Math.min(32, zone.maxDist * (1 + (itemCount - 1) * 0.18));
  }

  const rawDist = distanceMin + Math.random() * (distanceMax - distanceMin);
  const distanceKm = Math.round(rawDist * 10) / 10; // Round to 1 decimal place

  // Calculate pricing
  const basePrice = calculateBasePrice(type, itemCount, distanceKm);
  const finalPrice = calculateFinalPrice(type, itemCount, distanceKm, zone);

  // Travel time = constant speed: 2 min/km (30 km/h)
  const travelMinutes = Math.max(2, Math.round(distanceKm * KM_TRAVEL_MINUTES));

  // Potential restaurant wait time range
  const potentialWaitMinutes =
    type === 'ship'
      ? { min: 0, max: 0 }
      : { min: zone.minWait, max: zone.maxWait };

  // Random names
  const merchantPool = type === 'food' ? FOOD_MERCHANTS : SHIP_MERCHANTS;
  const baseMerchant = merchantPool[Math.floor(Math.random() * merchantPool.length)];
  const merchantName =
    itemCount > 1
      ? `${baseMerchant} (+${itemCount - 1} điểm lấy)`
      : baseMerchant;

  const deliveryAddress =
    ADDRESS_DESTINATIONS[Math.floor(Math.random() * ADDRESS_DESTINATIONS.length)] +
    (itemCount > 1 ? ` (+${itemCount - 1} điểm giao)` : '');

  const randomCodeNum = Math.floor(1000 + Math.random() * 9000);
  const code = `${type === 'food' ? 'SPF' : 'SPX'}-${randomCodeNum}`;

  return {
    id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    code,
    type,
    itemCount,
    zone,
    distanceKm,
    basePrice,
    finalPrice,
    travelMinutes,
    potentialWaitMinutes,
    createdAt: Date.now(),
    merchantName,
    deliveryAddress,
    notes:
      type === 'food'
        ? itemCount > 1
          ? `Đơn ghép ${itemCount} món - Quán chế biến ngẫu nhiên`
          : 'Đơn món nóng, vui lòng kiểm tra kỹ đơn hàng'
        : itemCount > 1
        ? `Đơn bưu phẩm ghép ${itemCount} kiện - Nhận hàng đi ngay (0p chờ quán)`
        : 'Giao hàng hỏa tốc - Không cần chờ quán chế biến',
  };
}

/**
 * Rolls actual restaurant wait time when order is accepted
 */
export function rollActualWaitTime(order: GameOrder): number {
  if (order.type === 'ship') {
    return 0; // Ship orders never wait for cooking!
  }
  const min = order.potentialWaitMinutes.min;
  const max = order.potentialWaitMinutes.max;
  // Discrete random minutes between min and max (inclusive)
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Format minutes into "08h 00m" or "45m"
 */
export function formatMinutesToHours(minutes: number): string {
  const safeMin = Math.max(0, Math.floor(minutes));
  const h = Math.floor(safeMin / 60);
  const m = safeMin % 60;
  if (h === 0) return `${m} phút`;
  return `${h}h ${m.toString().padStart(2, '0')}p`;
}

/**
 * Formats currency in Vietnamese style e.g. 47.300 đ or 47.3k
 */
export function formatCurrencyVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
}

export function formatCurrencyShort(amount: number): string {
  if (amount >= 1000) {
    return (amount / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return amount.toString();
}

/**
 * Evaluates driver rank based on total earnings in 8-hour shift
 */
export function getDriverRanking(stats: ShiftStats): {
  rank: 'S+' | 'S' | 'A' | 'B' | 'C' | 'F';
  title: string;
  badgeColor: string;
  comment: string;
} {
  if (stats.rejectionCount >= MAX_REJECTIONS_ENDGAME) {
    return {
      rank: 'F',
      title: 'Tài Xế Bị Khóa Tài Khoản ⛔',
      badgeColor: 'bg-red-600 text-white',
      comment:
        'Bạn đã từ chối đủ 9 đơn và bị hệ thống ShopeeFood khóa app! Lần sau hãy tính toán và nhận đơn hợp lý hơn nhé.',
    };
  }

  const earnings = stats.totalEarnings;

  if (earnings >= 700000) {
    return {
      rank: 'S+',
      title: 'Chiến Thần ShopeeFood Vô Địch 🏆💎',
      badgeColor: 'bg-gradient-to-r from-amber-500 to-yellow-300 text-slate-900',
      comment:
        'Kỷ lục siêu đẳng! Bạn đã tối ưu từng phút di chuyển và lựa đơn ghép cực kỳ chuẩn xác, thu nhập vượt xa 99% tài xế!',
    };
  }
  if (earnings >= 550000) {
    return {
      rank: 'S',
      title: 'Tài Xế Kim Cương Đẳng Cấp 💎',
      badgeColor: 'bg-blue-600 text-white',
      comment:
        'Tuyệt vời! Bạn nắm vững công thức cước từng khu vực và tận dụng đơn ship dài cùng đơn ghép cực kỳ hiệu quả.',
    };
  }
  if (earnings >= 420000) {
    return {
      rank: 'A',
      title: 'Tài Xế Vàng Cần Mẫn 🥇',
      badgeColor: 'bg-amber-500 text-white',
      comment:
        'Rất tốt! Bạn đạt thu nhập chuẩn của một shipper dày dặn kinh nghiệm, cân đối tốt giữa thời gian chờ quán và quãng đường.',
    };
  }
  if (earnings >= 280000) {
    return {
      rank: 'B',
      title: 'Tài Xế Bạc Đang Lên Tay 🥈',
      badgeColor: 'bg-slate-500 text-white',
      comment:
        'Khá ổn! Hãy chú ý né các đơn food quán đông chờ quá lâu hoặc thử nhận thêm các đơn ship không cần chờ quán để bứt phá nhé.',
    };
  }
  return {
    rank: 'C',
    title: 'Tài Xế Tập Sự 🛵',
    badgeColor: 'bg-emerald-600 text-white',
    comment:
      'Bạn cần tích lũy thêm kinh nghiệm: đừng từ chối quá 3 đơn để bị phạt 40 phút oan uổng, hãy tính toán cước/phút trước khi nhận.',
  };
}
