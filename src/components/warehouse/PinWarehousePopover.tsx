'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Zap,
  FileSpreadsheet,
  X,
  ChevronRight,
  MapPin,
  Sparkles,
} from 'lucide-react';

interface PinWarehousePopoverProps {
  isOpen: boolean;
  onClose: () => void;
  /** Vị trí hiển thị: 'dropdown' gắn liền với nút bấm (desktop/header) hoặc 'bottom-sheet' (mobile/bottom nav) */
  mode?: 'dropdown' | 'bottom-sheet' | 'auto';
  className?: string;
}

export function PinWarehousePopover({
  isOpen,
  onClose,
  mode = 'auto',
  className = '',
}: PinWarehousePopoverProps) {
  const router = useRouter();
  const popoverRef = useRef<HTMLDivElement>(null);

  // Lắng nghe phím Escape và click ra ngoài để đóng popover
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    // Delay nhẹ để tránh click mở trùng với click đóng
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDropdown = mode === 'dropdown';
  const isBottomSheet = mode === 'bottom-sheet';

  return (
    <>
      {/* Backdrop mờ phía sau */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Popover / Action Sheet Container */}
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-popover-title"
        className={`z-50 bg-white shadow-2xl transition-all duration-200 ${
          isDropdown
            ? 'absolute right-0 top-full mt-2 w-84 sm:w-92 rounded-2xl border border-slate-200/90 p-4 animate-in fade-in zoom-in-95'
            : isBottomSheet
            ? 'fixed bottom-0 left-0 right-0 max-w-lg mx-auto rounded-t-3xl border-t border-slate-200 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] animate-in slide-in-from-bottom duration-200'
            : /* Auto: dropdown on desktop, bottom-sheet on mobile */
              'fixed sm:absolute bottom-0 sm:bottom-auto left-0 sm:left-auto right-0 sm:right-0 sm:top-full sm:mt-2 w-full sm:w-92 max-w-lg sm:max-w-none mx-auto rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200/90 p-5 sm:p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:pb-4 animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95'
        } ${className}`}
      >
        {/* Handle bar trên mobile */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Header popover */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 id="pin-popover-title" className="text-sm font-bold text-slate-900 leading-tight">
                Ghim Địa Chỉ / Bến Bãi
              </h3>
              <p className="text-[11px] text-slate-500">
                Chọn hình thức thêm điểm ghim phù hợp
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Hai lựa chọn: Thêm nhanh vs Thêm nhiều */}
        <div className="space-y-2.5">
          {/* Lựa chọn 1: Thêm nhanh */}
          <Link
            href="/warehouse/new"
            onClick={onClose}
            className="group flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 hover:border-orange-500 bg-white hover:bg-orange-50/40 transition active:scale-[0.99] cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-orange-600 transition-colors flex items-center gap-1.5">
                  Thêm nhanh (1 điểm)
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">
                    GPS tức thì
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-orange-600 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Chụp ảnh hiện trường, tự lấy GPS hoặc địa chỉ, ghi âm voice chỉ đường ngõ hẹp.
              </p>
            </div>
          </Link>

          {/* Lựa chọn 2: Thêm nhiều */}
          <Link
            href="/warehouse/batch"
            onClick={onClose}
            className="group flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 hover:border-emerald-500 bg-white hover:bg-emerald-50/40 transition active:scale-[0.99] cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors flex items-center gap-1.5">
                  Thêm nhiều (Hàng loạt)
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5" />
                    Excel / Bảng
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Upload file Excel hoặc nhập trực tiếp bảng 3 trường: Tên, Địa chỉ và Ảnh (nếu có).
              </p>
            </div>
          </Link>
        </div>

        {/* Gợi ý cống hiến điểm số */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>⭐ Đóng góp cho cộng đồng</span>
          <span className="font-semibold text-orange-600">+10 điểm / kho công khai</span>
        </div>
      </div>
    </>
  );
}
