'use client';

import { useState } from 'react';
import type { Incident } from '@/types/database';
import { HeartHandshake, Clock, MessageSquare, X, Check, Phone } from 'lucide-react';
import { formatDistance } from '@/lib/utils/distance';

interface OfferHelpModalProps {
  incident: Incident | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (etaMinutes: number, message: string) => Promise<void>;
}

export function OfferHelpModal({
  incident,
  isOpen,
  onClose,
  onSubmit,
}: OfferHelpModalProps) {
  const [eta, setEta] = useState<number>(10);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !incident) return null;

  const quickMessages = [
    'Tôi đang chạy qua ngay!',
    'Tôi có xăng / dầu hỗ trợ bạn.',
    'Tôi có bơm & đồ vá lốp.',
    'Tôi có dây câu bình ắc quy.',
    'Tôi có kích nâng và cờ lê.',
  ];

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onSubmit(eta, message.trim());
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi xảy ra khi gửi xác nhận trợ giúp.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div
        className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-red-600 to-orange-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
              <HeartHandshake className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight leading-snug">
                Xác Nhận Hỗ Trợ Đồng Nghiệp
              </h2>
              <p className="text-xs text-white/80">Tinh thần tương trợ cộng đồng tài xế</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Incident Summary Card */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={incident.photo_url}
            alt="Hiện trường"
            className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              {incident.title}
            </h3>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              Tài xế: <strong className="text-slate-700">{incident.user?.full_name || 'Đồng nghiệp'}</strong>
            </p>
            {incident.distance_km !== undefined && (
              <span className="text-[11px] font-extrabold text-red-600 mt-0.5 block">
                Cách bạn: {formatDistance(incident.distance_km)}
              </span>
            )}
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleConfirm} className="p-4 sm:p-5 space-y-4">
          {/* Estimated Arrival Time */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-orange-600" />
              <span>Dự kiến bạn đến sau bao lâu?</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[5, 10, 15, 30].map((mins) => (
                <button
                  type="button"
                  key={mins}
                  onClick={() => setEta(mins)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition active:scale-95 ${
                    eta === mins
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                  }`}
                >
                  {mins} phút
                </button>
              ))}
            </div>
          </div>

          {/* Helper Message / Tools available */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-orange-600" />
              <span>Lời nhắn cho bác tài (Bạn có đồ gì?)</span>
            </label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="VD: Em đang mang chai xăng 2L qua / Em có đồ kích..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />

            {/* Quick message suggestions */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quickMessages.map((msg) => (
                <button
                  type="button"
                  key={msg}
                  onClick={() => setMessage(msg)}
                  className="text-[10px] font-medium bg-slate-100 hover:bg-orange-50 hover:text-orange-700 text-slate-600 px-2 py-1 rounded-lg border border-slate-200 transition"
                >
                  + {msg}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons: Confirm or Decline */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-3 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition active:scale-95 text-center"
            >
              Không thể giúp
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="flex-2 py-3 px-4 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white text-xs font-bold rounded-xl shadow-md transition active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Xác Nhận Hỗ Trợ Ngay</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
