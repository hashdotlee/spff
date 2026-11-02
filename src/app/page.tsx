'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Warehouse, Incident, PlaceCategory, LocationOrderRating } from '@/types/database';
import { calculateHaversineDistance, formatDistance } from '@/lib/utils/distance';
import { NearestList } from '@/components/warehouse/NearestList';
import { RateLocationOrderModal } from '@/components/warehouse/RateLocationOrderModal';
import { fetchOrderRatings, calculateOrderPrediction, filterRatingsNearLocation } from '@/lib/utils/orderRatings';
import { useProvince } from '@/lib/contexts/ProvinceContext';
import {
  MapPin,
  PlusCircle,
  LocateFixed,
  AlertCircle,
  Search,
  Siren,
  ChevronRight,
  ChevronDown,
  Building2,
  UtensilsCrossed,
  Home,
  CircleParking,
  Zap,
} from 'lucide-react';

const MapView = dynamic(() => import('@/components/map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full rounded-2xl bg-slate-100 border border-slate-200 animate-pulse flex flex-col items-center justify-center text-xs text-slate-500 gap-2">
      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      <span>Đang tải bản đồ kho bãi...</span>
    </div>
  ),
});

export default function HomePage() {
  const { province, openPicker } = useProvince();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({
    lat: 21.0285,
    lng: 105.8542,
  });
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [orderRatings, setOrderRatings] = useState<LocationOrderRating[]>([]);
  const [ratingModalContext, setRatingModalContext] = useState<
    | { mode: 'current_location' }
    | { mode: 'warehouse'; warehouse: Warehouse }
    | null
  >(null);
  const [currentHour, setCurrentHour] = useState(12);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PlaceCategory | 'all'>('warehouse');

  const supabase = createClient();

  // 1. Get GPS Location
  function requestLocation() {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationDenied(true);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocationDenied(false);
        setLocating(false);
      },
      (err) => {
        console.warn('Geolocation denied or error:', err.message || err.code || err);
        setLocationDenied(true);
        // Fallback default: Hanoi center
        setUserLocation((prev) => prev || { lat: 21.0285, lng: 105.8542 });
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
    );
  }

  // 2. Fetch Warehouses and Voice counts from Supabase
  async function loadWarehouses() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let userRole: string | null = null;
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        userRole = prof?.role || null;
      }

      const { data, error } = await supabase
        .from('warehouses')
        .select(`
          *,
          creator:profiles(*),
          voice_notes:voice_notes(count)
        `)
        .eq('status', 'active');

      if (error) {
        console.error('Error fetching warehouses:', error);
        return;
      }

      if (data) {
        // Lọc hiển thị: chỉ hiện kho công khai HOẶC kho riêng tư do chính người dùng hiện tại tạo (hoặc admin)
        const visibleData = data.filter((wh: any) => {
          if (!wh.is_private) return true;
          if (user && wh.created_by === user.id) return true;
          if (userRole === 'admin') return true;
          return false;
        });

        const parsed = visibleData.map((wh: any) => ({
          ...wh,
          voice_notes_count: wh.voice_notes?.[0]?.count || 0,
        }));
        setWarehouses(parsed);
      }
    } catch (err) {
      console.error('Error loading warehouses:', err);
    } finally {
      setLoading(false);
    }
  }

  // 3. Fetch active incidents (sự cố đang cần hỗ trợ)
  async function loadIncidents() {
    try {
      const { data, error } = await supabase
        .from('incidents')
        .select(`*, user:profiles(*)`)
        .in('status', ['open', 'helping'])
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setIncidents(data);
      }
    } catch (err) {
      console.warn('Lỗi loadIncidents trang chủ:', err);
    }
  }

  // 4. Fetch real-time order ratings (Đánh giá nổ đơn theo giờ)
  async function loadOrderRatings() {
    try {
      const ratings = await fetchOrderRatings(supabase);
      setOrderRatings(ratings);
    } catch (err) {
      console.warn('Lỗi loadOrderRatings:', err);
    }
  }

  useEffect(() => {
    setCurrentHour(new Date().getHours());
    requestLocation();
    loadWarehouses();
    loadIncidents();
    loadOrderRatings();
  }, []);

  // 4. Compute distances using Haversine formula and sort
  const computedIncidents = incidents.map((inc) => {
    let distance_km = 0;
    if (userLocation) {
      distance_km = calculateHaversineDistance(
        userLocation.lat,
        userLocation.lng,
        inc.latitude,
        inc.longitude
      );
    }
    return { ...inc, distance_km };
  });

  const nearbyIncidents = computedIncidents.filter((inc) => (inc.distance_km || 0) <= 25);

  // Dự báo khả năng nổ đơn tại vị trí GPS hiện tại của tài xế (dựa trên các đánh giá trong bán kính 2km)
  const currentLocationPrediction = userLocation
    ? calculateOrderPrediction(
        filterRatingsNearLocation(orderRatings, userLocation.lat, userLocation.lng, 2),
        currentHour,
        'quanh vị trí bạn'
      )
    : undefined;

  const sortedWarehouses = warehouses
    .map((wh) => {
      let distance_km = 0;
      if (userLocation) {
        distance_km = calculateHaversineDistance(
          userLocation.lat,
          userLocation.lng,
          wh.latitude,
          wh.longitude
        );
      }
      // Chỉ đánh giá nổ đơn cho kho hàng ('warehouse') hoặc quán ăn ('eatery')
      const whCat = wh.category || 'warehouse';
      const canRateOrders = whCat === 'warehouse' || whCat === 'eatery';

      let order_prediction = undefined;
      if (canRateOrders) {
        const whRatings = orderRatings.filter(
          (r) =>
            r.warehouse_id === wh.id ||
            (typeof r.latitude === 'number' &&
              typeof r.longitude === 'number' &&
              calculateHaversineDistance(wh.latitude, wh.longitude, r.latitude, r.longitude) <= 0.5)
        );
        order_prediction = calculateOrderPrediction(
          whRatings,
          currentHour,
          whCat === 'eatery' ? `quán ${wh.name}` : `kho ${wh.name}`
        );
      }
      return { ...wh, distance_km, order_prediction };
    })
    .sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0))
    .filter((wh) => {
      // Phân loại địa điểm: Mặc định lọc kho hàng
      const whCat = wh.category || 'warehouse';
      if (categoryFilter !== 'all' && whCat !== categoryFilter) {
        return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        wh.name.toLowerCase().includes(q) ||
        (wh.address && wh.address.toLowerCase().includes(q))
      );
    });

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4 max-w-2xl mx-auto w-full">
      {/* Top action bar: Province Picker, Search & Fast Add */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Nút chọn Tỉnh / Thành phố */}
        <button
          type="button"
          onClick={openPicker}
          className="px-2.5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-slate-200 shadow-2xs active:scale-95 shrink-0 cursor-pointer"
          title="Bấm để chọn tỉnh / thành phố hoạt động"
        >
          <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0" />
          <span className="max-w-[75px] xs:max-w-[110px] sm:max-w-[150px] truncate font-bold text-slate-900">
            {province}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
        </button>

        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kho, bến bãi, địa chỉ..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-2xs"
          />
        </div>

        <Link
          href="/warehouse/new"
          className="py-2.5 px-2.5 sm:px-3.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm shrink-0 active:scale-95"
          title="Ghim địa chỉ mới"
        >
          <PlusCircle className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Ghim</span>
        </Link>
      </div>

      {/* Category Filter Buttons: Kho hàng (Mặc định) / Quán ăn / Nhà khách / Tất cả */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        <button
          type="button"
          onClick={() => setCategoryFilter('warehouse')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer ${
            categoryFilter === 'warehouse'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Kho hàng</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              categoryFilter === 'warehouse' ? 'bg-orange-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {warehouses.filter((w) => (w.category || 'warehouse') === 'warehouse').length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setCategoryFilter('eatery')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer ${
            categoryFilter === 'eatery'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <UtensilsCrossed className="w-3.5 h-3.5" />
          <span>Quán ăn</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              categoryFilter === 'eatery' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {warehouses.filter((w) => w.category === 'eatery').length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setCategoryFilter('customer')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer ${
            categoryFilter === 'customer'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Home className="w-3.5 h-3.5" />
          <span>Nhà khách</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              categoryFilter === 'customer' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {warehouses.filter((w) => w.category === 'customer').length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setCategoryFilter('parking')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer ${
            categoryFilter === 'parking'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <CircleParking className="w-3.5 h-3.5" />
          <span>Bãi giữ xe</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              categoryFilter === 'parking' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {warehouses.filter((w) => w.category === 'parking').length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setCategoryFilter('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer ${
            categoryFilter === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span>Tất cả</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              categoryFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {warehouses.length}
          </span>
        </button>
      </div>

      {/* Geolocation Notice if denied */}
      {locationDenied && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span className="leading-tight">Chưa bật định vị GPS. Đang hiển thị khoảng cách theo tọa độ mặc định.</span>
          </div>
          <button
            onClick={requestLocation}
            className="font-bold underline shrink-0 hover:text-amber-900 py-1 px-1.5"
          >
            Bật lại
          </button>
        </div>
      )}

      {/* Emergency SOS Banner if active incidents are nearby */}
      {nearbyIncidents.length > 0 && (
        <Link
          href="/incidents"
          className="p-3 sm:p-3.5 bg-gradient-to-r from-red-600 to-rose-600 rounded-2xl text-white shadow-md shadow-red-600/20 flex items-center justify-between gap-2 group transition active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Siren className="w-4 h-4 text-white animate-pulse" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-black block truncate">
                🚨 Có {nearbyIncidents.length} sự cố cần cứu hộ gần bạn!
              </span>
              <span className="text-[10px] text-white/80 block truncate">
                {nearbyIncidents[0].title} ({formatDistance(nearbyIncidents[0].distance_km || 0)})
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-bold bg-white text-red-700 px-2.5 py-1 rounded-xl shrink-0 group-hover:bg-slate-100">
            <span>Ứng cứu</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </Link>
      )}

      {/* Leaflet OpenStreetMap */}
      <div className="relative isolate z-0">
        <MapView
          userLocation={userLocation}
          warehouses={sortedWarehouses}
          incidents={computedIncidents}
          orderRatings={orderRatings}
          currentLocationPrediction={currentLocationPrediction}
          selectedWarehouseId={selectedWarehouse?.id}
          selectedIncidentId={selectedIncident?.id}
          onSelectWarehouse={(wh) => setSelectedWarehouse(wh)}
          onSelectIncident={(inc) => setSelectedIncident(inc)}
          onRateOrder={(wh) => setRatingModalContext({ mode: 'warehouse', warehouse: wh })}
          onRateCurrentLocation={() => setRatingModalContext({ mode: 'current_location' })}
          className="h-64 sm:h-80 w-full rounded-2xl overflow-hidden shadow-xs border border-slate-200"
        />

        {/* Nút báo nổ đơn tại vị trí định vị GPS hiện tại của tài xế */}
        <button
          onClick={() => {
            if (!userLocation) {
              requestLocation();
              alert('Đang kích hoạt định vị GPS của bạn. Vui lòng cho phép quyền truy cập vị trí và thử lại!');
              return;
            }
            setRatingModalContext({ mode: 'current_location' });
          }}
          className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-xs hover:bg-white text-slate-800 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl shadow-md border border-slate-200 hover:border-blue-400 transition active:scale-95 flex items-center gap-2 cursor-pointer text-xs font-bold group"
          title="Báo tình hình nổ đơn tại vị trí định vị hiện tại của bạn"
        >
          <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition">
            <Zap className="w-3.5 h-3.5 fill-current" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1">
              <span className="text-xs font-black text-slate-900">Báo nổ đơn</span>
              <span className="text-[10px] text-blue-600 font-extrabold px-1 py-0.2 rounded bg-blue-50 border border-blue-200">
                +2đ ⭐
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium block truncate max-w-[140px] xs:max-w-[190px]">
              {currentLocationPrediction?.hasData
                ? `Vị trí bạn: ${currentLocationPrediction.badgeText}`
                : 'Tại vị trí GPS của bạn'}
            </span>
          </div>
        </button>

        {/* Locate me button on Map overlay */}
        <button
          onClick={requestLocation}
          disabled={locating}
          className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-10 bg-white text-slate-800 w-11 h-11 rounded-xl shadow-lg border border-slate-200 hover:bg-slate-50 transition active:scale-90 flex items-center justify-center cursor-pointer"
          title="Định vị vị trí hiện tại"
        >
          <LocateFixed className={`w-5 h-5 text-orange-600 ${locating ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Nearest 5 Warehouses List */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <NearestList
          warehouses={sortedWarehouses}
          selectedWarehouseId={selectedWarehouse?.id}
          onSelectWarehouse={(wh) => setSelectedWarehouse(wh)}
          onRateOrder={(wh) => setRatingModalContext({ mode: 'warehouse', warehouse: wh })}
        />
      )}

      {/* Modal Báo tình hình nổ đơn (Hỗ trợ cả vị trí GPS hiện tại & theo kho cụ thể) */}
      {ratingModalContext && (
        <RateLocationOrderModal
          warehouse={ratingModalContext.mode === 'warehouse' ? ratingModalContext.warehouse : null}
          currentLocation={ratingModalContext.mode === 'current_location' ? userLocation : null}
          existingRatings={orderRatings}
          onClose={() => setRatingModalContext(null)}
          onRatingSubmitted={(newRating) => {
            setOrderRatings((prev) => [newRating, ...prev]);
          }}
        />
      )}
    </div>
  );
}
