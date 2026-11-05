'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { Warehouse, PlaceCategory } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import { geocodeAddress } from '@/lib/utils/geocoding';
import {
  MapPin,
  LocateFixed,
  X,
  CheckCircle,
  AlertCircle,
  Search,
  Building2,
  UtensilsCrossed,
  Home,
  CircleParking,
  Sparkles,
} from 'lucide-react';

// Dynamic import for Leaflet-based LocationPicker (disable SSR)
const LocationPicker = dynamic(() => import('@/components/map/LocationPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full rounded-2xl bg-slate-100 border border-slate-200 animate-pulse flex flex-col items-center justify-center text-xs text-slate-500 gap-2">
      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      <span>Đang tải bản đồ ghim lại vị trí...</span>
    </div>
  ),
});

interface EditWarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouse: Warehouse;
  onSuccess?: (updatedWarehouse: Warehouse) => void;
}

export function EditWarehouseModal({
  isOpen,
  onClose,
  warehouse,
  onSuccess,
}: EditWarehouseModalProps) {
  const [name, setName] = useState(warehouse.name);
  const [address, setAddress] = useState(warehouse.address || '');
  const [category, setCategory] = useState<PlaceCategory>(warehouse.category || 'warehouse');
  const [latitude, setLatitude] = useState(warehouse.latitude);
  const [longitude, setLongitude] = useState(warehouse.longitude);
  const [description, setDescription] = useState(warehouse.description || '');

  const [isGettingGPS, setIsGettingGPS] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  // 1. Lấy vị trí GPS hiện tại của thiết bị
  function handleGetCurrentGPS() {
    if (!navigator.geolocation) {
      alert('Thiết bị của bạn không hỗ trợ định vị GPS.');
      return;
    }

    setIsGettingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setIsGettingGPS(false);
      },
      (err) => {
        console.warn('Lỗi GPS:', err);
        alert('Không thể lấy vị trí GPS hiện tại. Vui lòng bật định vị trên trình duyệt hoặc kéo ghim trên bản đồ.');
        setIsGettingGPS(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  // 2. Tìm tọa độ theo chuỗi địa chỉ
  async function handleGeocodeFromAddress() {
    if (!address.trim()) {
      alert('Vui lòng nhập địa chỉ trước khi tìm định vị.');
      return;
    }

    setIsGeocoding(true);
    try {
      const results = await geocodeAddress(address.trim());
      if (results && results.length > 0) {
        setLatitude(results[0].latitude);
        setLongitude(results[0].longitude);
      } else {
        alert('Không tìm thấy tọa độ cho địa chỉ này. Bạn có thể kéo ghim trực tiếp trên bản đồ bên dưới.');
      }
    } catch {
      alert('Lỗi tra cứu địa chỉ. Bạn có thể kéo ghim trực tiếp trên bản đồ.');
    } finally {
      setIsGeocoding(false);
    }
  }

  // 3. Submit updates to Supabase
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Vui lòng nhập tên shop hoặc kho hàng.');
      return;
    }

    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      setErrorMsg('Tọa độ định vị không hợp lệ. Vui lòng kéo ghim trên bản đồ.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updatePayload: any = {
        name: name.trim(),
        address: address.trim() || null,
        latitude,
        longitude,
        category,
        description: description.trim() || null,
      };

      const { data, error } = await supabase
        .from('warehouses')
        .update(updatePayload)
        .eq('id', warehouse.id)
        .select()
        .single();

      if (error) throw error;

      onSuccess?.(data as Warehouse);
      onClose();
    } catch (err: any) {
      console.error('Lỗi khi cập nhật kho:', err);
      setErrorMsg(err.message || 'Có lỗi xảy ra khi lưu thay đổi.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-orange-50 via-white to-amber-50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Ghim Lại Định Vị & Sửa Tên Shop
              </h2>
              <p className="text-xs text-slate-500">
                Chỉnh sửa thông tin chính xác hoặc dời vị trí ghim cổng kho/cửa hàng
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

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Tên shop / kho hàng */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-800">
              Tên shop / Tên kho hàng <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Cửa Hàng Thời Trang Eva, Kho Shopee Cổng 2..."
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* 2. Địa chỉ chính xác */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-800">
                Địa chỉ chính xác (Số nhà, tên ngõ, ngách, đường...)
              </label>
              <button
                type="button"
                onClick={handleGeocodeFromAddress}
                disabled={isGeocoding || !address.trim()}
                className="text-[10px] text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1 active:scale-95 disabled:opacity-50"
              >
                <Search className="w-3 h-3" />
                <span>{isGeocoding ? 'Đang tìm...' : 'Tìm tọa độ theo địa chỉ'}</span>
              </button>
            </div>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="VD: Số 18 ngõ 204 Kim Giang, Phường Đại Kim, Quận Hoàng Mai, Hà Nội"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* 3. Phân loại */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-800">Phân loại địa điểm</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: 'warehouse', label: 'Kho hàng', icon: Building2 },
                { id: 'eatery', label: 'Quán ăn', icon: UtensilsCrossed },
                { id: 'customer', label: 'Nhà khách', icon: Home },
                { id: 'parking', label: 'Bãi xe', icon: CircleParking },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = category === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategory(item.id as PlaceCategory)}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50 text-orange-700 ring-2 ring-orange-500/20'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Ghim lại định vị trên bản đồ */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-orange-600" />
                  <span>Ghim lại vị trí chính xác trên bản đồ</span>
                </label>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Bấm vào bản đồ hoặc kéo icon ghim đến đúng cổng vào/cửa shop
                </p>
              </div>

              <button
                type="button"
                onClick={handleGetCurrentGPS}
                disabled={isGettingGPS}
                className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-[11px] font-bold transition flex items-center gap-1 active:scale-95 border border-blue-200 shrink-0"
                title="Lấy tọa độ vị trí hiện tại qua GPS"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>{isGettingGPS ? 'Đang dò GPS...' : 'Lấy GPS hiện tại'}</span>
              </button>
            </div>

            {/* Live Coordinates Display */}
            <div className="flex items-center justify-between text-[11px] bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600">
              <span>Tọa độ hiện tại:</span>
              <strong className="text-slate-900 font-mono">
                {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </strong>
            </div>

            {/* Interactive LocationPicker map */}
            <div className="h-64 w-full rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
              <LocationPicker
                key={`${latitude}-${longitude}`}
                initialLat={latitude}
                initialLng={longitude}
                onLocationChange={(newLat, newLng) => {
                  setLatitude(newLat);
                  setLongitude(newLng);
                }}
              />
            </div>
          </div>

          {/* 5. Ghi chú bến bãi */}
          <div className="space-y-1 pt-2 border-t border-slate-100">
            <label className="text-[11px] font-bold text-slate-800">
              Ghi chú chỉ dẫn vào bến / Cửa kho (Tùy chọn)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="VD: Đi thẳng ngõ 204 tới ngã 3 rẽ phải, bấm chuông cửa cuốn màu ghi..."
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>

          {/* Footer actions inside form */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition active:scale-95"
            >
              Hủy
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-md shadow-orange-500/20 transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Đang lưu...</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Lưu Thay Đổi & Ghim Lại</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
