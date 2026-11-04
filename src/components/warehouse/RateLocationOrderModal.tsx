'use client';

import { useState, useEffect } from 'react';
import type { Warehouse, OrderRatingLevel, LocationOrderRating } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import {
  ORDER_RATING_CONFIG,
  submitOrderRating,
} from '@/lib/utils/orderRatings';
import {
  X,
  Zap,
  Bike,
  Clock,
  Moon,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface RateLocationOrderModalProps {
  currentLocation?: { lat: number; lng: number } | null;
  currentAddress?: string | null;
  warehouse?: Warehouse | null;
  existingRatings?: LocationOrderRating[];
  onClose: () => void;
  onRatingSubmitted?: (newRating: LocationOrderRating) => void;
}

export function RateLocationOrderModal({
  currentLocation,
  currentAddress,
  warehouse,
  onClose,
  onRatingSubmitted,
}: RateLocationOrderModalProps) {
  const [loadingLevel, setLoadingLevel] = useState<OrderRatingLevel | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [currentHour, setCurrentHour] = useState(12);

  const supabase = createClient();

  useEffect(() => {
    setCurrentHour(new Date().getHours());
  }, []);

  const isWarehouseMode = !!warehouse;
  const targetLat = isWarehouseMode ? warehouse.latitude : currentLocation?.lat;
  const targetLng = isWarehouseMode ? warehouse.longitude : currentLocation?.lng;
  const targetName = isWarehouseMode
    ? warehouse.name
    : 'Vị trí hiện tại của bạn';

  async function handleSelectRating(lvl: OrderRatingLevel) {
    if (!targetLat || !targetLng) {
      setErrorMsg('Không xác định được vị trí GPS. Vui lòng bật định vị thiết bị!');
      return;
    }

    setLoadingLevel(lvl);
    setErrorMsg(null);

    const res = await submitOrderRating(supabase, {
      latitude: targetLat,
      longitude: targetLng,
      address: isWarehouseMode ? warehouse.address : currentAddress || null,
      warehouseId: isWarehouseMode ? warehouse.id : null,
      rating: lvl,
      note: null,
    });

    setLoadingLevel(null);

    if (!res.success || !res.data) {
      setErrorMsg(res.error || 'Có lỗi xảy ra khi lưu đánh giá.');
      return;
    }

    setSuccess(true);
    if (onRatingSubmitted) {
      onRatingSubmitted(res.data);
    }
    setTimeout(() => {
      onClose();
    }, 1000);
  }

  const ratingOptions: { level: OrderRatingLevel; icon: any }[] = [
    { level: 'ngon', icon: Zap },
    { level: 'tam', icon: Bike },
    { level: 'khe', icon: Clock },
    { level: 'mom', icon: Moon },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-orange-50/60 to-amber-50/40">
          <div className="min-w-0 pr-2">
            <h2 className="text-sm sm:text-base font-black text-slate-900 truncate">
              Báo Nổ Đơn ({currentHour}h)
            </h2>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              {targetName}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition active:scale-95 cursor-pointer -mr-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Tối giản - Chỉ chọn 1 trong 4 option */}
        <div className="p-4 space-y-3">
          {success ? (
            <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-1.5 animate-in fade-in">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto animate-bounce" />
              <h3 className="text-sm font-black text-emerald-900">
                Đã ghi nhận báo đơn thành công!
              </h3>
              <p className="text-xs text-emerald-700 font-bold">
                +2 điểm cống hiến ⭐
              </p>
            </div>
          ) : (
            <>
              {errorMsg && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                  {errorMsg}
                </div>
              )}

              <p className="text-xs text-slate-600 font-medium text-center">
                Chọn tình hình nổ đơn lúc này để chia sẻ với anh em:
              </p>

              {/* 4 Lựa chọn nổ đơn (Bấm 1 chạm gửi ngay) */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                {ratingOptions.map(({ level, icon: Icon }) => {
                  const cfg = ORDER_RATING_CONFIG[level];
                  const isLoadingThis = loadingLevel === level;
                  const isAnyLoading = loadingLevel !== null;

                  return (
                    <button
                      key={level}
                      type="button"
                      disabled={isAnyLoading}
                      onClick={() => handleSelectRating(level)}
                      className={`p-3.5 rounded-2xl border text-center transition active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-1.5 min-h-[90px] shadow-2xs ${cfg.bgClass} ${cfg.borderClass} hover:ring-2 hover:ring-orange-400/30 disabled:opacity-50`}
                    >
                      {isLoadingThis ? (
                        <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
                      ) : (
                        <Icon className={`w-6 h-6 ${level === 'ngon' ? 'fill-current text-emerald-600' : level === 'tam' ? 'text-amber-600' : level === 'khe' ? 'text-orange-600' : 'text-rose-600'}`} />
                      )}

                      <span className={`text-sm font-black ${cfg.textClass}`}>
                        {cfg.label}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {cfg.sublabel}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-1 text-center">
                <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  ⚡ Chạm 1 lần là gửi ngay (+2đ ⭐)
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
