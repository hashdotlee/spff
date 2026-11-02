'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed } from 'lucide-react';

interface LocationPickerProps {
  initialLat?: number;
  initialLng?: number;
  onLocationChange: (lat: number, lng: number) => void;
}

export default function LocationPicker({
  initialLat = 21.0285,
  initialLng = 105.8542,
  onLocationChange,
}: LocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [currentCoord, setCurrentCoord] = useState<{ lat: number; lng: number }>({
    lat: initialLat,
    lng: initialLng,
  });
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if ((mapContainerRef.current as any)._leaflet_id && !mapInstanceRef.current) {
      (mapContainerRef.current as any)._leaflet_id = null;
    }

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
      }).setView([initialLat, initialLng], 15);

      L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: ['a', 'b'],
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: 'bottomleft' }).addTo(map);

      const pickerIcon = L.divIcon({
        className: 'picker-pin-container',
        html: `
          <div style="background-color: #ea580c; width: 36px; height: 36px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 3px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
            <div style="transform: rotate(45deg); width: 10px; height: 10px; background: white; border-radius: 50%;"></div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      const marker = L.marker([initialLat, initialLng], {
        icon: pickerIcon,
        draggable: true,
      }).addTo(map);

      marker.on('dragend', (e) => {
        const markerPos = e.target.getLatLng();
        setCurrentCoord({ lat: markerPos.lat, lng: markerPos.lng });
        onLocationChange(markerPos.lat, markerPos.lng);
      });

      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        setCurrentCoord({ lat: e.latlng.lat, lng: e.latlng.lng });
        onLocationChange(e.latlng.lat, e.latlng.lng);
      });

      markerRef.current = marker;
      mapInstanceRef.current = map;

      setTimeout(() => {
        if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
      }, 100);
      setTimeout(() => {
        if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
      }, 350);
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (mapContainerRef.current) {
        (mapContainerRef.current as any)._leaflet_id = null;
      }
    };
  }, []);

  function handleGetCurrentLocation() {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      alert('Trình duyệt không hỗ trợ định vị GPS');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCurrentCoord({ lat, lng });
        onLocationChange(lat, lng);

        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setView([lat, lng], 17);
          mapInstanceRef.current.invalidateSize();
          markerRef.current.setLatLng([lat, lng]);
        }
        setLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err.message || err.code || err);
        alert('Không thể lấy vị trí GPS chính xác. Bạn có thể kéo thả ghim màu cam trực tiếp trên bản đồ để chọn vị trí.');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative isolate z-0 h-64 sm:h-72 w-full rounded-2xl overflow-hidden border border-slate-300 shadow-inner">
        <div
          ref={mapContainerRef}
          className="h-full w-full isolate z-0"
          style={{ minHeight: '256px', width: '100%', height: '100%' }}
        />

        <button
          type="button"
          onClick={handleGetCurrentLocation}
          disabled={locating}
          className="absolute top-3 right-3 z-10 bg-white text-slate-800 px-2.5 sm:px-3 py-1.5 rounded-xl shadow-md border border-slate-200 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 transition active:scale-95"
        >
          <LocateFixed className={`w-4 h-4 text-orange-600 ${locating ? 'animate-spin' : ''}`} />
          <span>{locating ? 'Đang tìm...' : 'Vị trí GPS của tôi'}</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-600 bg-slate-100 p-2.5 rounded-xl gap-1">
        <span>Chạm bản đồ hoặc kéo ghim để chọn cổng vào:</span>
        <span className="font-mono font-bold text-slate-800">
          {currentCoord.lat.toFixed(5)}, {currentCoord.lng.toFixed(5)}
        </span>
      </div>
    </div>
  );
}
