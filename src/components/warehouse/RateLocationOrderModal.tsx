'use client';

import { useState } from 'react';
import type { Warehouse, OrderRatingLevel, LocationOrderRating } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import {
  ORDER_RATING_CONFIG,
  submitOrderRating,
  calculateOrderPrediction,
} from '@/lib/utils/orderRatings';
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
} from 'lucide-react';

interface RateLocationOrderModalProps {
  warehouse: Warehouse | null;
  existingRatings?: LocationOrderRating[];
  onClose: () => void;
  onRatingSubmitted?: (newRating: LocationOrderRating) => void;
}

export function RateLocationOrderModal({
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

  const supabase = createClient();
  const currentHour = new Date().getHours();
  const currentMinutes = String(new Date().getMinutes()).padStart(2, '0');

  if (!warehouse) return null;

  const prediction = calculateOrderPrediction(existingRatings, currentHour);

  const quickTags = [
    'Đang xả đơn liên tục',
    'Đơn nổ ầm ầm',
    'Đơn vừa phải, túc tắc',
    'Trưa hơi vắng khách',
    'Chờ 20-30p chưa có đơn',
    'Kho đông, lấy hàng nhanh',
    'Móm hẳn, nên chuyển điểm',
  ];

  async function handleSubmit() {
    if (!warehouse) return;
    setLoading(true);
    setErrorMsg(null);

    const res = await submitOrderRating(supabase, {
      warehouseId: warehouse.id,
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
            <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-600 block">
                Báo tình hình nổ đơn theo giờ
              </span>
              <h2 className="text-base font-black text-slate-900 truncate">
                {warehouse.name}
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
          {/* Current Hour Prediction pill */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-orange-600" />
                <span>Dự báo khả năng nổ đơn lúc {currentHour}h:</span>
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
                Cảm ơn bác tài đã báo tình hình đơn!
              </h3>
              <p className="text-xs text-emerald-700">
                Đã cộng <strong className="font-extrabold">+2 điểm cống hiến ⭐</strong>. Thông tin sẽ giúp anh em tài xế khác chọn điểm đứng phù hợp.
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
                  Tình hình nhận đơn lúc này thế nào?
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
                  placeholder="VD: Cổng 2 đang dồn nhiều đơn, lấy nhanh..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              {/* Submit Button */}
              <button
                type="button"
                disabled={loading}
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
                    <span>Gửi Báo Đơn Ngay (+2đ ⭐)</span>
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
