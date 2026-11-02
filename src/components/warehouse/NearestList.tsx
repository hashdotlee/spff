'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Warehouse } from '@/types/database';
import { formatDistance } from '@/lib/utils/distance';
import { getGoogleMapsNavigationUrl } from '@/lib/utils/googleMaps';
import { VietQRModal } from '@/components/donation/VietQRModal';
import { ReportWarehouseModal } from '@/components/warehouse/ReportWarehouseModal';
import {
  Navigation2,
  Volume2,
  MapPin,
  ChevronRight,
  Heart,
  Camera,
  Flag,
  Building2,
  UtensilsCrossed,
  Home,
} from 'lucide-react';

interface NearestListProps {
  warehouses: Warehouse[];
  selectedWarehouseId?: string | null;
  onSelectWarehouse?: (warehouse: Warehouse) => void;
}

export function NearestList({
  warehouses,
  selectedWarehouseId,
  onSelectWarehouse,
}: NearestListProps) {
  const router = useRouter();
  const [thankWh, setThankWh] = useState<Warehouse | null>(null);
  const [reportWh, setReportWh] = useState<Warehouse | null>(null);

  if (warehouses.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center text-slate-500">
        <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-semibold">Chưa có kho nào được ghim trong khu vực này</p>
        <Link
          href="/warehouse/new"
          className="mt-3 inline-block px-4 py-2 bg-orange-600 text-white text-xs font-bold rounded-xl hover:bg-orange-700 transition"
        >
          Ghim kho đầu tiên ngay &rarr;
        </Link>
      </div>
    );
  }

  // Show up to 5 closest warehouses
  const topWarehouses = warehouses.slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-600 animate-pulse" />
          <span>Top Điểm Gần Bạn Nhất</span>
        </h2>
        <span className="text-[11px] sm:text-xs text-slate-500 font-medium">Theo khoảng cách</span>
      </div>

      <div className="space-y-2 sm:space-y-2.5">
        {topWarehouses.map((wh, index) => {
          const isSelected = selectedWarehouseId === wh.id;
          const navUrl = getGoogleMapsNavigationUrl(wh.latitude, wh.longitude);
          const cat = wh.category || 'warehouse';

          return (
            <div
              key={wh.id}
              onClick={() => {
                onSelectWarehouse?.(wh);
                router.push(`/warehouse/${wh.id}`);
              }}
              className={`bg-white rounded-2xl p-3.5 sm:p-4 border transition-all duration-200 shadow-xs cursor-pointer hover:shadow-md hover:border-orange-400 group active:scale-[0.99] ${
                isSelected
                  ? 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/20'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5 sm:gap-3 flex-1 min-w-0">
                  {/* Pin number 1 to 5 styled by category */}
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center shrink-0 border shadow-xs ${
                      cat === 'eatery'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : cat === 'customer'
                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                        : 'bg-orange-100 text-orange-700 border-orange-200'
                    }`}
                  >
                    {index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-orange-600 transition truncate">
                        {wh.name}
                      </h3>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReportWh(wh);
                        }}
                        className="py-1 px-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition active:scale-95 shrink-0 flex items-center gap-1 text-[11px] font-semibold border border-transparent hover:border-red-200"
                        title="Báo cáo sai vị trí hoặc đã dời đi"
                      >
                        <Flag className="w-3.5 h-3.5" />
                        <span>Báo cáo</span>
                      </button>
                    </div>

                    {wh.address && (
                      <p className="text-xs text-slate-600 line-clamp-2 mt-0.5 leading-relaxed">
                        {wh.address}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs">
                      {/* Category Badge */}
                      {cat === 'eatery' ? (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px] font-bold inline-flex items-center gap-1">
                          <UtensilsCrossed className="w-3 h-3 text-emerald-600" />
                          <span>Quán ăn</span>
                        </span>
                      ) : cat === 'customer' ? (
                        <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 text-[11px] font-bold inline-flex items-center gap-1">
                          <Home className="w-3 h-3 text-blue-600" />
                          <span>Nhà khách</span>
                        </span>
                      ) : (
                        <span className="text-orange-700 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200 text-[11px] font-bold inline-flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-orange-600" />
                          <span>Kho hàng</span>
                        </span>
                      )}

                      {wh.distance_km !== undefined && (
                        <span className="font-extrabold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200/80 text-[11px]">
                          {formatDistance(wh.distance_km)}
                        </span>
                      )}

                      {wh.image_url && (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-[11px] font-bold border border-emerald-200 inline-flex items-center gap-1">
                          <Camera className="w-3 h-3 text-emerald-600" />
                          <span>Ảnh thực tế</span>
                        </span>
                      )}

                      <span className="text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200 text-[11px] inline-flex items-center gap-1">
                        <Volume2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{wh.voice_notes_count || 0} voice chỉ đường</span>
                      </span>
                    </div>

                    {wh.creator && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-col xs:flex-row xs:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] text-slate-400 block font-medium">Ghim bởi:</span>
                          <span className="text-xs font-bold text-slate-800 truncate block">
                            {wh.creator.full_name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setThankWh(wh);
                          }}
                          className="w-full xs:w-auto min-h-[32px] px-3 py-1 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition text-xs font-bold inline-flex items-center justify-center gap-1.5 border border-rose-200 active:scale-95 shrink-0"
                          title="Gửi cà phê cảm ơn người ghim kho qua VietQR"
                        >
                          <Heart className="w-3.5 h-3.5 fill-rose-600 text-rose-600 shrink-0" />
                          <span>Cảm ơn người ghim</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons: 1-click Nav & Voice Notes */}
              <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100">
                <a
                  href={navUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="min-h-[42px] py-2 px-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs text-center"
                >
                  <Navigation2 className="w-3.5 h-3.5 fill-white shrink-0" />
                  <span className="truncate">Đi ngay</span>
                </a>

                <Link
                  href={`/warehouse/${wh.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="min-h-[42px] py-2 px-2.5 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs text-center"
                >
                  <Volume2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Chi tiết & Voice</span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-80 shrink-0 hidden xs:inline" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {thankWh && thankWh.creator && (
        <VietQRModal
          isOpen={!!thankWh}
          onClose={() => setThankWh(null)}
          driverName={thankWh.creator.full_name}
          bankName={thankWh.creator.bank_name}
          bankAccountNo={thankWh.creator.bank_account_no}
          bankAccountName={thankWh.creator.bank_account_name}
          title="Cảm Ơn Người Ghim Kho"
          subtitle={
            <>
              Gửi chút cà phê cảm ơn bác tài{' '}
              <strong className="text-orange-600">{thankWh.creator.full_name}</strong> đã ghim kho {thankWh.name}!
            </>
          }
          transferMessage="Cam on bac tai ghim kho"
        />
      )}
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
