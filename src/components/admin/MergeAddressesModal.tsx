'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Warehouse, WarehouseShop, PlaceCategory } from '@/types/database';
import { extractWarehouseShops, mergeWarehousesAction } from '@/lib/utils/warehouseShops';
import { createClient } from '@/lib/supabase/client';
import {
  GitMerge,
  X,
  Search,
  CheckCircle,
  Building2,
  MapPin,
  Volume2,
  Plus,
  Trash2,
  AlertCircle,
  Sparkles,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react';

interface MergeAddressesModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouses: Warehouse[];
  initialSelectedIds?: string[];
  onMergeSuccess?: (resultMessage: string) => void;
}

export function MergeAddressesModal({
  isOpen,
  onClose,
  warehouses,
  initialSelectedIds = [],
  onMergeSuccess,
}: MergeAddressesModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [targetId, setTargetId] = useState<string>('');
  const [targetName, setTargetName] = useState('');
  const [targetAddress, setTargetAddress] = useState('');
  const [targetCategory, setTargetCategory] = useState<PlaceCategory>('warehouse');
  const [shops, setShops] = useState<WarehouseShop[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [transferVoice, setTransferVoice] = useState(true);
  const [transferRatings, setTransferRatings] = useState(true);
  const [actionOnSource, setActionOnSource] = useState<'hide' | 'delete'>('hide');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  // Reset or initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      const initial = initialSelectedIds.length > 0 ? initialSelectedIds : [];
      setSelectedIds(initial);
      if (initial.length > 0) {
        setTargetId(initial[0]);
      } else {
        setTargetId('');
      }
      setErrorMsg(null);
    }
  }, [isOpen, initialSelectedIds]);

  // Selected warehouse objects (theo đúng thứ tự đã chọn)
  const selectedWarehouses = useMemo(() => {
    return selectedIds
      .map((id) => warehouses.find((w) => w.id === id))
      .filter((w): w is Warehouse => Boolean(w));
  }, [selectedIds, warehouses]);

  // Quy tắc theo yêu cầu người dùng: Địa chỉ và tọa độ định vị LUÔN LẤY THEO SHOP ĐẦU TIÊN
  const firstWarehouse = selectedWarehouses[0] || null;
  const targetWarehouse = firstWarehouse;

  // Khi shop đầu tiên thay đổi, tự động cập nhật thông tin địa chỉ đích
  useEffect(() => {
    if (firstWarehouse) {
      setTargetId(firstWarehouse.id);
      setTargetName(firstWarehouse.name);
      setTargetAddress(firstWarehouse.address || '');
      setTargetCategory(firstWarehouse.category || 'warehouse');
    }
  }, [firstWarehouse?.id]);

  function handleMakeFirst(whId: string) {
    const next = [whId, ...selectedIds.filter((id) => id !== whId)];
    setSelectedIds(next);
    setTargetId(whId);
  }

  // Auto-generate aggregated shops list from selected warehouses
  useEffect(() => {
    if (selectedWarehouses.length === 0) return;

    const aggregated: WarehouseShop[] = [];
    const seenNames = new Set<string>();

    selectedWarehouses.forEach((wh) => {
      // 1. Existing shops from warehouse
      const existingShops = extractWarehouseShops(wh);
      if (existingShops.length > 0) {
        existingShops.forEach((s) => {
          const key = s.name.toLowerCase().trim();
          if (!seenNames.has(key)) {
            seenNames.add(key);
            aggregated.push({ ...s });
          }
        });
      } else {
        // 2. Use warehouse name as a shop name
        const key = wh.name.toLowerCase().trim();
        if (!seenNames.has(key)) {
          seenNames.add(key);
          aggregated.push({
            name: wh.name,
            note: wh.address ? `Địa chỉ gốc: ${wh.address.slice(0, 30)}` : undefined,
          });
        }
      }
    });

    setShops(aggregated);
  }, [selectedIds]);

  // Search filter for picking more warehouses
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return warehouses
      .filter(
        (wh) =>
          !selectedIds.includes(wh.id) &&
          (wh.name.toLowerCase().includes(q) ||
            (wh.address && wh.address.toLowerCase().includes(q)))
      )
      .slice(0, 8);
  }, [searchQuery, warehouses, selectedIds]);

  function handleAddWarehouse(whId: string) {
    if (!selectedIds.includes(whId)) {
      const next = [...selectedIds, whId];
      setSelectedIds(next);
      if (!targetId) {
        setTargetId(whId);
      }
    }
    setSearchQuery('');
    setIsSearching(false);
  }

  function handleRemoveWarehouse(whId: string) {
    const next = selectedIds.filter((id) => id !== whId);
    setSelectedIds(next);
    if (targetId === whId) {
      setTargetId(next[0] || '');
    }
  }

  // Shop item management
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

  // Submit Merge
  async function handleSubmit() {
    setErrorMsg(null);

    if (selectedIds.length < 2) {
      setErrorMsg('Vui lòng chọn ít nhất 2 địa chỉ để thực hiện gộp.');
      return;
    }

    if (!targetId) {
      setErrorMsg('Vui lòng chọn 1 địa chỉ làm địa chỉ chính (Target).');
      return;
    }

    if (!targetName.trim()) {
      setErrorMsg('Vui lòng nhập tên hiển thị cho địa chỉ sau khi gộp.');
      return;
    }

    const validShops = shops
      .map((s) => ({
        name: s.name.trim(),
        note: s.note?.trim() || undefined,
        phone: s.phone?.trim() || undefined,
      }))
      .filter((s) => Boolean(s.name));

    if (validShops.length === 0) {
      setErrorMsg('Vui lòng nhập ít nhất 1 tên Shop đại diện tại địa chỉ này.');
      return;
    }

    const sourceIds = selectedIds.filter((id) => id !== targetId);

    setIsSubmitting(true);
    try {
      const res = await mergeWarehousesAction(supabase, {
        targetWarehouseId: targetId,
        sourceWarehouseIds: sourceIds,
        updatedTargetName: targetName.trim(),
        updatedTargetAddress: targetAddress.trim(),
        updatedCategory: targetCategory,
        shops: validShops,
        transferVoiceNotes: transferVoice,
        transferRatings: transferRatings,
        actionOnSource: actionOnSource,
      });

      onMergeSuccess?.(res.message);
      onClose();
    } catch (err: any) {
      console.error('Lỗi khi gộp địa chỉ:', err);
      setErrorMsg(err.message || 'Có lỗi xảy ra khi gộp địa chỉ.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-orange-50 via-white to-amber-50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900">Gộp Địa Chỉ (Đa Shop)</h2>
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-extrabold uppercase">
                  Admin Only
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Gộp nhiều shop cùng vị trí thành 1 địa chỉ duy nhất đại diện cho nhiều shop
              </p>
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

        {/* Content Scrollable */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-700 flex-1">
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: SELECT WAREHOUSES */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-bold flex items-center justify-center">
                  1
                </span>
                <span>Chọn các địa chỉ cần gộp ({selectedIds.length} đã chọn)</span>
              </label>
              <span className="text-[11px] text-slate-400 font-medium">Tối thiểu 2 địa điểm</span>
            </div>

            {/* List of selected warehouses */}
            <div className="space-y-2">
              {selectedWarehouses.map((wh, idx) => {
                const isFirst = idx === 0;
                return (
                  <div
                    key={wh.id}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isFirst
                        ? 'border-orange-500 bg-orange-50/40 ring-2 ring-orange-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center mt-0.5 shrink-0 text-xs font-bold ${
                          isFirst ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {idx + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                            {wh.name}
                          </span>
                          {isFirst ? (
                            <span className="px-2 py-0.5 rounded-full bg-orange-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              <span>Shop đầu tiên (Lấy định vị & địa chỉ này)</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleMakeFirst(wh.id)}
                              className="px-2 py-0.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 text-[10px] font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer"
                              title="Chọn địa chỉ và định vị của shop này làm gốc"
                            >
                              <ArrowRight className="w-2.5 h-2.5 rotate-[-90deg]" />
                              <span>Đưa lên đầu (Lấy làm định vị chính)</span>
                            </button>
                          )}
                          <span className="text-[10px] text-slate-400">
                            • Tạo bởi: {wh.creator?.full_name || 'Hệ thống'}
                          </span>
                        </div>
                        {wh.address && (
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            📍 {wh.address}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                          <span>Tọa độ: {wh.latitude.toFixed(5)}, {wh.longitude.toFixed(5)}</span>
                          <span>•</span>
                          <span>Chỉ dẫn voice: {wh.voice_notes_count || 0}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveWarehouse(wh.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition shrink-0"
                      title="Bỏ địa chỉ này khỏi danh sách gộp"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Search to add more */}
            <div className="relative pt-1">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm và thêm địa chỉ khác cần gộp..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearching(true);
                  }}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {/* Search dropdown results */}
              {isSearching && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {searchResults.map((wh) => (
                    <button
                      key={wh.id}
                      type="button"
                      onClick={() => handleAddWarehouse(wh.id)}
                      className="w-full p-2.5 text-left hover:bg-orange-50 transition flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-xs truncate">{wh.name}</p>
                        {wh.address && (
                          <p className="text-[11px] text-slate-500 truncate">{wh.address}</p>
                        )}
                      </div>
                      <Plus className="w-4 h-4 text-orange-600 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* STEP 2: CONSOLIDATED LOCATION DETAILS */}
          {targetWarehouse && (
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <label className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-bold flex items-center justify-center">
                  2
                </span>
                <span>Thông tin địa chỉ chính sau khi gộp</span>
              </label>

              {/* Thông báo định vị lấy theo shop đầu tiên */}
              <div className="p-3 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/90 rounded-2xl flex items-start gap-2.5 text-xs text-orange-950">
                <MapPin className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">
                    Vị trí định vị & địa chỉ sẽ lấy theo shop đầu tiên: <span className="text-orange-700 font-black">{targetWarehouse.name}</span>
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    📍 Địa chỉ gốc: <strong>{targetWarehouse.address || 'Chưa có địa chỉ chữ'}</strong> • Tọa độ: {targetWarehouse.latitude.toFixed(6)}, {targetWarehouse.longitude.toFixed(6)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-700">
                    Tên hiển thị chính của địa điểm
                  </label>
                  <input
                    type="text"
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    placeholder="VD: Tòa Nhà Bitexco, Kho Tổng 48 An Trạch..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <p className="text-[10px] text-slate-400">
                    Địa chỉ này sẽ dùng tọa độ của địa chỉ chính để định vị trên bản đồ.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">Địa chỉ cụ thể</label>
                  <input
                    type="text"
                    value={targetAddress}
                    onChange={(e) => setTargetAddress(e.target.value)}
                    placeholder="Số nhà, tên đường, phường, quận..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">Phân loại địa điểm</label>
                  <select
                    value={targetCategory}
                    onChange={(e) => setTargetCategory(e.target.value as PlaceCategory)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  >
                    <option value="warehouse">🏢 Kho hàng</option>
                    <option value="eatery">🍜 Quán ăn / Cửa hàng ăn uống</option>
                    <option value="customer">🏠 Nhà khách / Khu dân cư</option>
                    <option value="parking">🅿️ Bãi giữ xe</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: LIST OF REPRESENTED SHOPS */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <label className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-bold flex items-center justify-center">
                    3
                  </span>
                  <span>Danh sách các Shop tại địa chỉ này ({shops.length})</span>
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tài xế tìm kiếm bất kỳ tên shop nào dưới đây đều sẽ dẫn đến địa chỉ này
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

            {/* Shops rows */}
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
                      placeholder="Tên Shop (VD: Shop Quần Áo A)..."
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
                  Chưa có shop nào được thêm. Hãy bấm &ldquo;Thêm Shop&rdquo; ở trên.
                </div>
              )}
            </div>
          </div>

          {/* STEP 4: MERGE OPTIONS */}
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <label className="font-black text-slate-900 text-sm flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-bold flex items-center justify-center">
                4
              </span>
              <span>Tùy chọn xử lý dữ liệu sau khi gộp</span>
            </label>

            <div className="space-y-2 pl-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={transferVoice}
                  onChange={(e) => setTransferVoice(e.target.checked)}
                  className="rounded text-orange-600 focus:ring-orange-500 w-4 h-4"
                />
                <span className="text-xs text-slate-800 font-medium">
                  Chuyển toàn bộ <strong>Chỉ dẫn Voice</strong> của các địa chỉ được gộp về địa chỉ chính
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={transferRatings}
                  onChange={(e) => setTransferRatings(e.target.checked)}
                  className="rounded text-orange-600 focus:ring-orange-500 w-4 h-4"
                />
                <span className="text-xs text-slate-800 font-medium">
                  Chuyển lịch sử <strong>Đánh giá nổ đơn</strong> về địa chỉ chính
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={actionOnSource === 'hide'}
                  onChange={(e) => setActionOnSource(e.target.checked ? 'hide' : 'delete')}
                  className="rounded text-orange-600 focus:ring-orange-500 w-4 h-4"
                />
                <span className="text-xs text-slate-800 font-medium">
                  Ẩn các địa chỉ phụ và lưu liên kết gộp (Khuyên dùng: giữ an toàn điểm số & lịch sử đóng góp)
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-white text-xs font-bold transition active:scale-95"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || selectedIds.length < 2 || !targetId}
            className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-md shadow-orange-500/20 transition flex items-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <span>Đang thực hiện gộp...</span>
            ) : (
              <>
                <GitMerge className="w-4 h-4" />
                <span>Xác nhận Gộp {selectedIds.length} Địa Chỉ</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
