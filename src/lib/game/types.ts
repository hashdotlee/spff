export type OrderType = 'food' | 'ship';

export interface ZoneInfo {
  id: string;
  name: string;
  shortName: string;
  description: string;
  priceMultiplier: number;
  foodRatio: number; // e.g. 0.7
  batchRatio: number;
  minDist: number;
  maxDist: number;
  minWait: number;
  maxWait: number;
  badgeColor: string;
}

export interface GameOrder {
  id: string;
  code: string;
  type: OrderType;
  itemCount: number; // 1 for single, 2-5 for batch
  zone: ZoneInfo;
  distanceKm: number; // e.g. 5.8
  basePrice: number;
  finalPrice: number;
  travelMinutes: number; // fixed speed: 2 min/km
  potentialWaitMinutes: { min: number; max: number };
  actualWaitMinutes?: number; // determined upon accept (0 for ship, 1-20 for food)
  actualTotalMinutes?: number; // travelMinutes + actualWaitMinutes
  createdAt: number;
  merchantName: string;
  deliveryAddress: string;
  notes: string;
}

export interface ShiftStats {
  totalEarnings: number;
  totalOrdersCompleted: number;
  foodOrdersCount: number;
  shipOrdersCount: number;
  batchOrdersCount: number;
  totalDistanceKm: number;
  totalDriveMinutes: number;
  totalWaitMinutes: number;
  rejectionCount: number;
  penaltiesCount: number; // number of 40-min penalties applied
  penalizedMinutes: number;
  isEndgame: boolean;
  endgameReason?: 'timeout' | 'rejected_9_orders';
  completedOrders: CompletedOrderRecord[];
}

export interface CompletedOrderRecord {
  orderId: string;
  code: string;
  type: OrderType;
  itemCount: number;
  zoneName: string;
  distanceKm: number;
  earnings: number;
  travelMinutes: number;
  waitMinutes: number;
  totalMinutes: number;
  timeRemainingAfter: number;
}
