'use client';

import { useState, useEffect } from 'react';
import type { Warehouse, OrderRatingLevel, LocationOrderRating } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import {
  ORDER_RATING_CONFIG,
  submitOrderRating,
  calculateOrderPrediction,
  filterRatingsNearLocation,
} from '@/lib/utils/orderRatings';
import { geocodeAddress, reverseGeocode } from '@/lib/utils/geocoding';
import {
  X,
  Zap,
  Bike,
  Clock,
  Moon,
  Send,
  Loader2,
  CheckCircle2,
  MapPin,
  TrendingUp,
  Building2,
  UtensilsCrossed,
  Home,
  Navigation,
} from 'lucide-react';

interface RateLocationOrderModalProps {
  // Mode 1: Báo tại vị trí GPS hiện tại của tài xế
  currentLocation?: { lat: number; lng: number } | null;
  currentAddress?: string | null;

  // Mode 2: Báo theo kho / địa điểm cụ thể
  warehouse?: Warehouse | null;

  existingRatings?: LocationOrderRating[];
  onClose: () => void;
  onRatingSubmitted?: (newRating: LocationOrderRating) => void;
}

export function RateLocationOrderModal({
  currentLocation,
  currentAddress,
  warehouse,
  existingRatings = [],
  onClose,
  onRatingSubmitted,
}: RateLocationOrderModalProps) {
  const [selectedLevel, setSelectedLevel] = useState<OrderRatingLevel>('ngon');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [timeInfo, setTimeInfo] = useState({ hour: 12, minutes: '00' });
  const [customAddress, setCustomAddress] = useState('');
  const [resolvedCoords, setResolvedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [autoAddress, setAutoAddress] = useState<string | null>(currentAddress || null);

  const supabase = createClient();

  useEffect(() => {
    const now = new Date();
    setTimeInfo({
      hour: now.getHours(),
      minutes: String(now.getMinutes()).padStart(2, '0'),
    });
  }, []);

  const currentHour = timeInfo.hour;
  const currentMinutes = timeInfo.minutes;

  // Xác định tọa độ và ngữ cảnh báo đơn
  const isWarehouseMode = !!warehouse;
  const whCat = warehouse?.category || 'warehouse';
  const isAllowedCategory = !isWarehouseMode || whCat === 'warehouse' || whCat === 'eatery';
  const targetLat = isWarehouseMode ? warehouse.latitude : currentLocation?.lat;
  const targetLng = isWarehouseMode ? warehouse.longitude : currentLocation?.lng;
  const targetName = isWarehouseMode
    ? warehouse.name
    : 'Vị trí định vị hiện tại';
  const targetAddress = isWarehouseMode
    ? warehouse.address || 'Địa chỉ được chọn'
    : autoAddress || currentAddress || (targetLat && targetLng ? `Tọa độ GPS: ${targetLat.toFixed(5)}, ${targetLng.toFixed(5)}` : 'Đang định vị GPS...');

  // Tự động tìm tên địa chỉ cho GPS khi báo đơn ở vị trí hiện tại
  useEffect(() => {
    if (!isWarehouseMode && currentLocation?.lat && currentLocation?.lng && !currentAddress) {
      reverseGeocode(currentLocation.lat, currentLocation.lng).then((res) => {
        if (res) setAutoAddress(res);
      });
    }
  }, [isWarehouseMode, currentLocation, currentAddress]);

  // Tra cứu địa chỉ chính xác nếu người dùng tự nhập (Debounce 700ms)
  useEffect(() => {
    const q = customAddress.trim();
    if (!q || q.length < 3) {
      setResolvedCoords(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsGeocoding(true);
      try {
        const results = await geocodeAddress(q);
        if (results && results.length > 0) {
          setResolvedCoords({
            lat: results[0].latitude,
            lng: results[0].longitude,
          });
        } else {
          setResolvedCoords(null);
        }
      } catch (err) {
        console.warn('Lỗi tra cứu địa chỉ báo đơn:', err);
        setResolvedCoords(null);
      } finally {
        setIsGeocoding(false);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [customAddress]);

  // Tính toán dự báo nổ đơn theo ngữ cảnh
  let relevantRatings: LocationOrderRating[] = [];
  if (isWarehouseMode && isAllowedCategory) {
    // Đánh giá trực tiếp cho kho này hoặc quanh kho này
    relevantRatings = existingRatings.filter(
      (r) =>
        r.warehouse_id === warehouse.id ||
        (typeof r.latitude === 'number' &&
          typeof r.longitude === 'number' &&
          Math.abs(r.latitude - warehouse.latitude) < 0.005 &&
          Math.abs(r.longitude - warehouse.longitude) < 0.005)
    );
  } else if (targetLat && targetLng) {
    // Đánh giá trong bán kính 2km quanh vị trí GPS hiện tại của người dùng
    relevantRatings = filterRatingsNearLocation(existingRatings, targetLat, targetLng, 2);
  }

  const prediction = calculateOrderPrediction(
    relevantRatings,
    currentHour,
    isWarehouseMode ? `${whCat === 'eatery' ? 'quán' : 'kho'} ${warehouse.name}` : 'quanh vị trí hiện tại'
  );

  const quickTags = [
    'Đang xả đơn liên tục 🔥',
    'Đơn nổ ầm ầm',
    'Đơn vừa phải, túc tắc 🛵',
    'Chờ 20-30p chưa có đơn ⏳',
    'Móm hẳn, đói đơn 🦗',
    'Trưa hơi vắng khách',
    'Lấy hàng nhanh, đi liền',
  ];

  async function handleSubmit() {
    if (!isAllowedCategory) {
      setErrorMsg('Báo nổ đơn chỉ áp dụng cho Kho hàng, Quán ăn hoặc Vị trí định vị của bạn.');
      return;
    }

    if (!targetLat || !targetLng) {
      setErrorMsg('Không xác định được vị trí GPS hiện tại. Vui lòng bật định vị thiết bị.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    let finalLat = targetLat;
    let finalLng = targetLng;
    let finalAddress = isWarehouseMode ? warehouse.address : autoAddress || targetAddress;

    if (!isWarehouseMode && customAddress.trim()) {
      if (resolvedCoords) {
        finalLat = resolvedCoords.lat;
        finalLng = resolvedCoords.lng;
        finalAddress = customAddress.trim();
      } else {
        try {
          const results = await geocodeAddress(customAddress.trim());
          if (results && results.length > 0) {
            finalLat = results[0].latitude;
            finalLng = results[0].longitude;
            finalAddress = customAddress.trim();
          }
        } catch (e) {
          console.warn('Lỗi geocode trước khi lưu:', e);
        }
      }
    }

    const res = await submitOrderRating(supabase, {
      latitude: finalLat,
      longitude: finalLng,
      address: finalAddress,
      warehouseId: isWarehouseMode ? warehouse.id : null,
      rating: selectedLevel,
      note,
    });

    setLoading(false);

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
    }, 1500);
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between bg-gradient-to-r from-orange-50/50 to-amber-50/30">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-2xl ${isWarehouseMode ? 'bg-orange-600' : 'bg-blue-600'} text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5`}>
              {isWarehouseMode ? <Zap className="w-5 h-5 fill-current" /> : <Navigation className="w-5 h-5 fill-current" />}
            </div>
            <div className="min-w-0">
              <span className={`text-[10px] font-black uppercase tracking-wider block ${isWarehouseMode ? 'text-orange-600' : 'text-blue-600'}`}>
                {isWarehouseMode
                  ? whCat === 'eatery'
                    ? 'Báo nổ đơn theo quán ăn'
                    : 'Báo nổ đơn theo kho hàng'
                  : 'Báo nổ đơn tại vị trí GPS hiện tại'}
              </span>
              <h2 className="text-base font-black text-slate-900 truncate">
                {targetName}
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  Hiện tại: <strong>{currentHour}:{currentMinutes}</strong> (Khung giờ {currentHour}h)
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition active:scale-95 cursor-pointer -mr-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Vị trí định vị chi tiết */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="min-w-0 text-xs flex-1">
              <span className="text-[10px] text-slate-400 block font-bold uppercase">
                {isWarehouseMode ? 'Địa chỉ kho:' : 'Vị trí định vị của bạn:'}
              </span>
              <span className="text-slate-700 font-medium truncate block">
                {targetAddress}
              </span>
            </div>
          </div>

          {/* Bổ sung địa chỉ chính xác khi ở chế độ định vị GPS */}
          {!isWarehouseMode && (
            <div className="space-y-1 bg-slate-50/60 p-2.5 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-700">
                  Địa chỉ chính xác (Tùy chọn):
                </label>
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                  Ưu tiên số 1 🎯
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={customAddress}
                  onChange={(e) => setCustomAddress(e.target.value)}
                  placeholder={autoAddress ? `VD: ${autoAddress}` : 'VD: Số 25 ngõ 102 Nguyễn Hoàng...'}
                  className="w-full px-3 py-2 pr-8 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                {isGeocoding && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 absolute right-2.5 top-1/2 -translate-y-1/2" />
                )}
              </div>
              {resolvedCoords && (
                <span className="text-[10px] text-emerald-700 font-semibold block">
                  ✓ Đã tìm thấy tọa độ theo địa chỉ chính xác (Ưu tiên dùng tọa độ này)
                </span>
              )}
            </div>
          )}

          {/* Current Hour Prediction pill */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-orange-600" />
                <span>Tình hình lúc {currentHour}h:</span>
              </span>
              {prediction.hasData ? (
                <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${prediction.bgClass}`}>
                  {prediction.badgeText} ({prediction.avgScore}/4⭐)
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                  Chưa có dữ liệu
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {prediction.description}
            </p>
          </div>

          {/* Success Notification */}
          {success ? (
            <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-2 animate-in fade-in">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h3 className="text-sm font-bold text-emerald-900">
                Cảm ơn bác tài đã báo tình hình nổ đơn!
              </h3>
              <p className="text-xs text-emerald-700">
                Đã cộng <strong className="font-extrabold">+2 điểm cống hiến ⭐</strong>. Thông tin đánh giá tại vị trí này sẽ giúp anh em tài xế khác biết giờ này có đơn hay không.
              </p>
            </div>
          ) : (
            <>
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                  {errorMsg}
                </div>
              )}

              {/* 4 Rating Buttons */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Khả năng nhận đơn tại vị trí này thế nào?
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  {(['ngon', 'tam', 'khe', 'mom'] as const).map((lvl) => {
                    const cfg = ORDER_RATING_CONFIG[lvl];
                    const isSelected = selectedLevel === lvl;

                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setSelectedLevel(lvl)}
                        className={`p-3 rounded-2xl border text-left transition active:scale-[0.98] cursor-pointer relative flex flex-col justify-between min-h-[76px] ${
                          isSelected
                            ? `${cfg.bgClass} ${cfg.borderClass} ring-2 ring-orange-500/20 shadow-xs`
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-black flex items-center gap-1.5 ${isSelected ? cfg.textClass : 'text-slate-800'}`}>
                            {lvl === 'ngon' && <Zap className="w-4 h-4 text-emerald-600 fill-current" />}
                            {lvl === 'tam' && <Bike className="w-4 h-4 text-amber-600" />}
                            {lvl === 'khe' && <Clock className="w-4 h-4 text-orange-600" />}
                            {lvl === 'mom' && <Moon className="w-4 h-4 text-rose-600" />}
                            <span>{cfg.label}</span>
                          </span>

                          <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-orange-600 bg-white' : 'border-slate-300'}`}>
                            {isSelected && <span className="w-2 h-2 rounded-full bg-orange-600" />}
                          </span>
                        </div>

                        <span className="text-[11px] text-slate-500 font-medium leading-tight">
                          {cfg.sublabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Tags */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-700">
                  Gợi ý nhanh (chạm để chọn):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {quickTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setNote((prev) => (prev ? `${prev}, ${tag}` : tag))}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition active:scale-95 cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note input */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800">
                  Ghi chú thêm (Tùy chọn):
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="VD: Cổng 2 đang dồn nhiều đơn, chờ khoảng 5 phút..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              {/* Submit Button */}
              <button
                type="button"
                disabled={loading || (!targetLat && !targetLng)}
                onClick={handleSubmit}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 active:scale-[0.99] text-white font-extrabold rounded-2xl shadow-lg shadow-orange-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50 text-xs cursor-pointer mt-2"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang lưu đánh giá...</span>
                  </div>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>
                      Gửi Báo Đơn {isWarehouseMode ? 'Tại Kho' : 'Tại Vị Trí Hiện Tại'} (+2đ ⭐)
                    </span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
