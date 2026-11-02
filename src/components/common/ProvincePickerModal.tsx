'use client';

import { useState } from 'react';
import { useProvince } from '@/lib/contexts/ProvinceContext';
import { VIETNAM_PROVINCES } from '@/lib/constants/provinces';
import { X, Search, Check, MapPin, Sparkles } from 'lucide-react';

export function ProvincePickerModal() {
  const { province, setProvince, isPickerOpen, closePicker } = useProvince();
  const [search, setSearch] = useState('');

  if (!isPickerOpen) return null;

  const popularProvinces = [
    'Hà Nội',
    'TP. Hồ Chí Minh',
    'Bình Dương',
    'Đồng Nai',
    'Đà Nẵng',
    'Hải Phòng',
    'Bắc Ninh',
    'Cần Thơ',
  ];

  const filteredProvinces = VIETNAM_PROVINCES.filter((p) => {
    if (!search.trim()) return true;
    const cleanSearch = search.toLowerCase().trim();
    return p.toLowerCase().includes(cleanSearch);
  });

  function handleSelect(p: string) {
    setProvince(p);
    closePicker();
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
      onClick={closePicker}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh] animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-orange-50/70 to-amber-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-xs">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900">
                Chọn Tỉnh / Thành Phố
              </h2>
              <span className="text-[11px] text-slate-500 font-medium block">
                Khu vực hoạt động & ưu tiên định vị của bác tài
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={closePicker}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition active:scale-95 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-3 sm:p-4 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm tỉnh thành (VD: Hà Nội, Bình Dương...)"
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Quick Popular Provinces */}
          {!search.trim() && (
            <div className="mt-3">
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600 mb-1.5">
                <Sparkles className="w-3 h-3 text-orange-500" />
                <span>Khu vực phổ biến:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {popularProvinces.map((p) => {
                  const isSelected = province === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleSelect(p)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer ${
                        isSelected
                          ? 'bg-orange-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Province List */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-3 divide-y divide-slate-100">
          {filteredProvinces.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Không tìm thấy tỉnh thành nào khớp với &quot;{search}&quot;.
            </div>
          ) : (
            filteredProvinces.map((p) => {
              const isSelected = province === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSelect(p)}
                  className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between transition cursor-pointer text-xs sm:text-sm ${
                    isSelected
                      ? 'bg-orange-50 font-bold text-orange-900'
                      : 'hover:bg-slate-50 text-slate-700 font-medium'
                  }`}
                >
                  <span className="truncate">{p}</span>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
