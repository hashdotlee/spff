'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Warehouse } from '@/types/database';
import { formatDistance } from '@/lib/utils/distance';
import { getGoogleMapsNavigationUrl } from '@/lib/utils/googleMaps';
import { ReportWarehouseModal } from '@/components/warehouse/ReportWarehouseModal';
import {
  Navigation2,
  Flag,
  Building2,
  UtensilsCrossed,
  Home,
  CircleParking,
  Lock,
  Zap,
  Store,
} from 'lucide-react';
import { extractWarehouseShops } from '@/lib/utils/warehouseShops';

interface NearestListProps {
  warehouses: Warehouse[];
  selectedWarehouseId?: string | null;
  onSelectWarehouse?: (warehouse: Warehouse) => void;
  onRateOrder?: (warehouse: Warehouse) => void;
}

export function NearestList({
  warehouses,
  selectedWarehouseId,
  onSelectWarehouse,
  onRateOrder,
}: NearestListProps) {
  const router = useRouter();
  const [reportWh, setReportWh] = useState<Warehouse | null>(null);

  if (warehouses.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 text-center border border-slate-200">
        <p className="text-xs text-slate-500">Chưa tìm thấy địa điểm nào phù hợp.</p>
        <Link
          href="/warehouse/new"
          className="mt-3 inline-block px-4 py-2 bg-orange-600 text-white text-xs font-bold rounded-xl hover:bg-orange-700 transition"
        >
          Ghim kho đầu tiên ngay &rarr;
        </Link>
      </div>
    );
  }

  // Hiển thị tối đa 5 điểm gần nhất
  const topWarehouses = warehouses.slice(0, 5);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-600 animate-pulse" />
          <span>Top Điểm Gần Bạn Nhất</span>
        </h2>
        <span className="text-[11px] sm:text-xs text-slate-500 font-medium">Theo khoảng cách</span>
      </div>

      <div className="space-y-1.5 sm:space-y-2">
        {topWarehouses.map((wh, index) => {
          const isSelected = selectedWarehouseId === wh.id;
          const navUrl = getGoogleMapsNavigationUrl(wh.latitude, wh.longitude, wh.address);
          const cat = wh.category || 'warehouse';
          const canRateOrders = cat === 'warehouse' || cat === 'eatery';
          const shops = extractWarehouseShops(wh);

          return (
            <div
              key={wh.id}
              onClick={() => {
                onSelectWarehouse?.(wh);
                router.push(`/warehouse/${wh.id}`);
              }}
              className={`bg-white rounded-2xl p-2.5 sm:p-3 border transition-all duration-200 shadow-xs cursor-pointer hover:shadow-md hover:border-orange-400 group active:scale-[0.99] ${
                isSelected
                  ? 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/20'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5 sm:gap-3">
                {/* Pin number 1 to 5 styled by category */}
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center shrink-0 border shadow-xs ${
                    cat === 'eatery'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : cat === 'customer'
                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                      : cat === 'parking'
                      ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                      : 'bg-orange-100 text-orange-700 border-orange-200'
                  }`}
                >
                  {index + 1}
                </div>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                  {/* Name & Creator */}
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-orange-600 transition truncate">
                      {wh.name}
                    </h3>
                    {wh.creator?.full_name && (
                      <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal shrink-0 truncate max-w-[90px] xs:max-w-[130px]">
                        • {wh.creator.full_name}
                      </span>
                    )}
                  </div>

                  {/* Address */}
                  {wh.address && (
                    <p className="text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">
                      {wh.address}
                    </p>
                  )}

                  {/* Tags row: Category, Distance, Order status */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px] sm:text-[11px]">
                    {/* Category Badge */}
                    {cat === 'eatery' ? (
                      <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200 font-bold inline-flex items-center gap-1">
                        <UtensilsCrossed className="w-2.5 h-2.5 text-emerald-600" />
                        <span>Quán ăn</span>
                      </span>
                    ) : cat === 'customer' ? (
                      <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-200 font-bold inline-flex items-center gap-1">
                        <Home className="w-2.5 h-2.5 text-blue-600" />
                        <span>Nhà khách</span>
                      </span>
                    ) : cat === 'parking' ? (
                      <span className="text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-200 font-bold inline-flex items-center gap-1">
                        <CircleParking className="w-2.5 h-2.5 text-indigo-600" />
                        <span>Bãi giữ xe</span>
                      </span>
                    ) : (
                      <span className="text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded-md border border-orange-200 font-bold inline-flex items-center gap-1">
                        <Building2 className="w-2.5 h-2.5 text-orange-600" />
                        <span>Kho hàng</span>
                      </span>
                    )}

                    {/* Riêng tư badge */}
                    {wh.is_private && (
                      <span className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md border border-purple-200 font-bold inline-flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5 text-purple-600" />
                        <span>Riêng tư</span>
                      </span>
                    )}

                    {/* Đa shop badge */}
                    {shops.length > 0 && (
                      <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200 font-bold inline-flex items-center gap-1">
                        <Store className="w-2.5 h-2.5 text-amber-700" />
                        <span>{shops.length} shop</span>
                      </span>
                    )}

                    {/* Distance */}
                    {wh.distance_km !== undefined && (
                      <span className="font-extrabold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-md border border-orange-200/80">
                        {formatDistance(wh.distance_km)}
                      </span>
                    )}

                    {/* Order rating pill (chỉ hiện cho kho hàng hoặc quán ăn) */}
                    {canRateOrders && wh.order_prediction && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRateOrder?.(wh);
                        }}
                        className={`px-1.5 py-0.5 rounded-md font-bold border transition active:scale-95 inline-flex items-center gap-1 cursor-pointer ${
                          wh.order_prediction.hasData
                            ? wh.order_prediction.bgClass
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Bấm để xem hoặc báo tình hình nổ đơn lúc này"
                      >
                        <Zap className="w-2.5 h-2.5 text-orange-500 fill-current shrink-0" />
                        <span>
                          {wh.order_prediction.hasData
                            ? `${wh.order_prediction.badgeText}`
                            : 'Báo đơn'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Right Actions: Report button & Navigation button */}
                <div className="flex items-center gap-1.5 shrink-0 self-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReportWh(wh);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition active:scale-95"
                    title="Báo cáo sai vị trí hoặc đã dời đi"
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </button>

                  <a
                    href={navUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs"
                    title="Dẫn đường qua Google Maps"
                  >
                    <Navigation2 className="w-3.5 h-3.5 fill-white shrink-0" />
                    <span className="hidden xs:inline">Đi ngay</span>
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {reportWh && (
        <ReportWarehouseModal
          warehouse={reportWh}
          isOpen={!!reportWh}
          onClose={() => setReportWh(null)}
        />
      )}
    </div>
  );
}
