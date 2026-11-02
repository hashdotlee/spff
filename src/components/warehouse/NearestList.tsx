'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Warehouse } from '@/types/database';
import { formatDistance } from '@/lib/utils/distance';
import { getGoogleMapsNavigationUrl } from '@/lib/utils/googleMaps';
import { VietQRModal } from '@/components/donation/VietQRModal';
import { Navigation2, Volume2, MapPin, ChevronRight, Heart, Camera } from 'lucide-react';

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
  const [thankWh, setThankWh] = useState<Warehouse | null>(null);

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
          <span>Top 5 Kho Gần Nhất</span>
        </h2>
        <span className="text-[11px] sm:text-xs text-slate-500 font-medium">Theo khoảng cách</span>
      </div>

      <div className="space-y-2 sm:space-y-2.5">
        {topWarehouses.map((wh, index) => {
          const isSelected = selectedWarehouseId === wh.id;
          const navUrl = getGoogleMapsNavigationUrl(wh.latitude, wh.longitude);

          return (
            <div
              key={wh.id}
              onClick={() => onSelectWarehouse?.(wh)}
              className={`bg-white rounded-2xl p-3.5 sm:p-4 border transition-all duration-200 shadow-xs cursor-pointer ${
                isSelected
                  ? 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/20'
                  : 'border-slate-200 hover:border-orange-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5 sm:gap-3 flex-1 min-w-0">
                  {/* Pin number 1 to 5 */}
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-orange-100 text-orange-700 font-black text-xs sm:text-sm flex items-center justify-center shrink-0 border border-orange-200 shadow-xs">
                    {index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                        {wh.name}
                      </h3>
                    </div>

                    {wh.address && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {wh.address}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                      {wh.distance_km !== undefined && (
                        <span className="font-extrabold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200/80 text-[11px] sm:text-xs">
                          {formatDistance(wh.distance_km)}
                        </span>
                      )}

                      {wh.image_url && (
                        <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px] font-bold border border-emerald-200 inline-flex items-center gap-1">
                          <Camera className="w-3 h-3 text-emerald-600" />
                          <span>Ảnh thực tế</span>
                        </span>
                      )}

                      <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                        <Volume2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{wh.voice_notes_count || 0} voice chỉ đường</span>
                      </span>

                      {wh.creator && (
                        <span className="text-slate-500 text-[11px] flex items-center gap-1">
                          <span className="text-slate-400">• Ghim bởi:</span>
                          <span className="font-semibold text-slate-700 truncate max-w-[120px]">
                            {wh.creator.full_name}
                          </span>
                        </span>
                      )}
                    </div>

                    {wh.creator && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setThankWh(wh);
                          }}
                          className="min-h-[28px] px-2.5 py-1 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition text-[11px] font-bold inline-flex items-center gap-1.5 border border-rose-200/80 active:scale-95"
                          title="Cảm ơn người ghim kho"
                        >
                          <Heart className="w-3 h-3 fill-rose-600 text-rose-600 shrink-0" />
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
                  <span className="truncate">Chỉ dẫn voice</span>
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
    </div>
  );
}
