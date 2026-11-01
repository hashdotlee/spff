'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Warehouse } from '@/types/database';
import { calculateHaversineDistance } from '@/lib/utils/distance';
import { NearestList } from '@/components/warehouse/NearestList';
import {
  MapPin,
  PlusCircle,
  LocateFixed,
  AlertCircle,
  Search,
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
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({
    lat: 21.0285,
    lng: 105.8542,
  });
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
        const parsed = data.map((wh: any) => ({
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

  useEffect(() => {
    requestLocation();
    loadWarehouses();
  }, []);

  // 3. Compute distances using Haversine formula and sort
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
      return { ...wh, distance_km };
    })
    .sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0))
    .filter((wh) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        wh.name.toLowerCase().includes(q) ||
        (wh.address && wh.address.toLowerCase().includes(q))
      );
    });

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4 max-w-2xl mx-auto w-full">
      {/* Top action bar: Search & Fast Add */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên kho, bến bãi, địa chỉ..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-xs"
          />
        </div>

        <Link
          href="/warehouse/new"
          className="py-2.5 px-3 sm:px-3.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shrink-0 active:scale-95"
        >
          <PlusCircle className="w-4 h-4" />
          <span className="hidden xs:inline">Ghim kho</span>
        </Link>
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

      {/* Leaflet OpenStreetMap */}
      <div className="relative">
        <MapView
          userLocation={userLocation}
          warehouses={sortedWarehouses}
          selectedWarehouseId={selectedWarehouse?.id}
          onSelectWarehouse={(wh) => setSelectedWarehouse(wh)}
          className="h-64 sm:h-80 w-full rounded-2xl overflow-hidden shadow-xs border border-slate-200"
        />

        {/* Locate me button on Map overlay */}
        <button
          onClick={requestLocation}
          disabled={locating}
          className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-[500] bg-white text-slate-800 w-11 h-11 rounded-xl shadow-lg border border-slate-200 hover:bg-slate-50 transition active:scale-90 flex items-center justify-center"
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
        />
      )}
    </div>
  );
}
