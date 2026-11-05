'use client';

import { useState, useEffect } from 'react';
import type { Warehouse, WarehouseShop } from '@/types/database';
import { extractWarehouseShops, updateWarehouseShopsAction } from '@/lib/utils/warehouseShops';
import { createClient } from '@/lib/supabase/client';
import {
  Store,
  X,
  Plus,
  Trash2,
  AlertCircle,
  Building2,
  CheckCircle,
} from 'lucide-react';

interface EditWarehouseShopsModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouse: Warehouse | null;
  onSuccess?: () => void;
}

export function EditWarehouseShopsModal({
  isOpen,
  onClose,
  warehouse,
  onSuccess,
}: EditWarehouseShopsModalProps) {
  const [shops, setShops] = useState<WarehouseShop[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (warehouse) {
      const extracted = extractWarehouseShops(warehouse);
      if (extracted.length > 0) {
        setShops(extracted);
      } else {
        // Mặc định tạo 1 shop từ tên kho hiện tại nếu chưa có
        setShops([{ name: warehouse.name, note: '' }]);
      }
      setErrorMsg(null);
    }
  }, [warehouse, isOpen]);

  function handleAddShop() {
    setShops([...shops, { name: '', note: '' }]);
  }

  function handleUpdateShop(index: number, field: keyof WarehouseShop, val: string) {
    const updated = [...shops];
    updated[index] = { ...updated[index], [field]: val };
    setShops(updated);
  }

  function handleRemoveShop(index: number) {
    setShops(shops.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!warehouse) return;
    setErrorMsg(null);

    const validShops = shops
      .map((s) => ({
        name: s.name.trim(),
        note: s.note?.trim() || undefined,
        phone: s.phone?.trim() || undefined,
      }))
      .filter((s) => Boolean(s.name));

    setIsSubmitting(true);
    try {
      await updateWarehouseShopsAction(supabase, warehouse.id, validShops);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Lỗi cập nhật danh sách shop:', err);
      setErrorMsg(err.message || 'Có lỗi xảy ra khi lưu danh sách shop.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen || !warehouse) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-orange-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900">Quản Lý Shop Tại Địa Chỉ</h2>
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-extrabold uppercase">
                  Admin
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate max-w-xs">{warehouse.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-700 flex-1">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
            <p className="font-bold text-slate-900 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-orange-600" />
              <span>{warehouse.name}</span>
            </p>
            {warehouse.address && (
              <p className="text-[11px] text-slate-500">📍 {warehouse.address}</p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 text-xs sm:text-sm">
                  Danh sách Shop / Cửa hàng tại đây ({shops.length})
                </h3>
                <p className="text-[11px] text-slate-400">
                  Thêm hoặc chỉnh sửa các shop kinh doanh tại cùng địa chỉ này
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddShop}
                className="px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-xl text-xs font-bold transition flex items-center gap-1 active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm Shop</span>
              </button>
            </div>

            <div className="space-y-2">
              {shops.map((shop, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-2"
                >
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                    <input
                      type="text"
                      placeholder="Tên Shop..."
                      value={shop.name}
                      onChange={(e) => handleUpdateShop(idx, 'name', e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <input
                      type="text"
                      placeholder="Vị trí / Tầng / Ghi chú (VD: Tầng 2, P201)..."
                      value={shop.note || ''}
                      onChange={(e) => handleUpdateShop(idx, 'note', e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveShop(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0"
                    title="Xóa shop này"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {shops.length === 0 && (
                <div className="p-4 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  Chưa có shop nào. Bấm &ldquo;Thêm Shop&rdquo; để bắt đầu.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-white text-xs font-bold transition active:scale-95"
          >
            Hủy
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-md shadow-orange-500/20 transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Đang lưu...</span>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Lưu Danh Sách Shop</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
