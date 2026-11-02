'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Warehouse } from '@/types/database';
import { AlertTriangle, Check, X, Loader2 } from 'lucide-react';

interface ReportWarehouseModalProps {
  warehouse: Warehouse | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const COMMON_REASONS = [
  'Kho đã giải tỏa / không còn tồn tại',
  'Sai vị trí định vị trên bản đồ',
  'Tên hoặc địa chỉ kho không chính xác',
  'Kho bị ghim trùng lặp',
  'Khác (nhập chi tiết bên dưới)',
];

export function ReportWarehouseModal({
  warehouse,
  isOpen,
  onClose,
  onSuccess,
}: ReportWarehouseModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  if (!isOpen || !warehouse) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!warehouse) return;
    setErrorMsg(null);

    const reason =
      selectedPreset === 'Khác (nhập chi tiết bên dưới)'
        ? customReason.trim()
        : customReason.trim()
          ? `${selectedPreset}: ${customReason.trim()}`
          : selectedPreset;

    if (!reason) {
      setErrorMsg('Vui lòng chọn hoặc nhập lý do báo cáo.');
      return;
    }

    setSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert('Vui lòng đăng nhập để gửi báo cáo kiểm tra kho!');
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.from('reports').insert({
        reporter_id: user.id,
        warehouse_id: warehouse.id,
        reported_user_id: warehouse.created_by || null,
        reason: reason,
        status: 'pending',
      });

      if (error) {
        throw error;
      }

      setSuccess(true);
      if (onSuccess) onSuccess();

      setTimeout(() => {
        setSuccess(false);
        setCustomReason('');
        setSelectedPreset(COMMON_REASONS[0]);
        onClose();
      }, 2000);
    } catch (err: unknown) {
      console.error('Lỗi khi gửi báo cáo kho:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Đã có lỗi xảy ra khi gửi báo cáo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-sm rounded-2xl p-4 sm:p-5 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h3 className="font-bold text-sm text-slate-900">Báo Cáo Kho Không Đúng</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3">
          <p className="text-xs text-slate-600 mb-2">
            Kho: <strong className="text-slate-900">{warehouse.name}</strong>
          </p>

          {success ? (
            <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-xs space-y-1 my-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 font-bold text-emerald-700">
                <Check className="w-4 h-4 shrink-0" />
                <span>Đã gửi báo cáo cho quản trị viên kiểm tra!</span>
              </div>
              <p className="text-[11px] text-emerald-600 pl-6 leading-relaxed">
                Quản trị viên sẽ rà soát và ẩn kho nếu thông tin sai lệch. Bạn có thể theo dõi tiến độ tại trang Hồ sơ.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 mt-3">
              {errorMsg && (
                <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
                  Chọn lý do chính:
                </label>
                <div className="space-y-1.5">
                  {COMMON_REASONS.map((reason) => (
                    <label
                      key={reason}
                      className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition ${
                        selectedPreset === reason
                          ? 'bg-red-50/70 border-red-300 text-red-900 font-semibold'
                          : 'bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="presetReason"
                        checked={selectedPreset === reason}
                        onChange={() => setSelectedPreset(reason)}
                        className="text-red-600 focus:ring-red-500 w-3.5 h-3.5"
                      />
                      <span>{reason}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1 uppercase tracking-wider">
                  Mô tả thêm (nếu có):
                </label>
                <textarea
                  rows={2}
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Ví dụ: Kho đã chuyển sang địa chỉ mới ở số..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none placeholder:text-slate-400"
                />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 active:scale-95 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[36px] px-4 py-1.5 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 active:scale-95 transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang gửi...</span>
                    </>
                  ) : (
                    <span>Gửi báo cáo</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
