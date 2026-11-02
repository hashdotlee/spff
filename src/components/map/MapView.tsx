'use client';

import { useEffect, useRef } from 'react';
import type { Warehouse, Incident } from '@/types/database';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getGoogleMapsNavigationUrl } from '@/lib/utils/googleMaps';

interface MapViewProps {
  userLocation: { lat: number; lng: number } | null;
  warehouses: Warehouse[];
  incidents?: Incident[];
  selectedWarehouseId?: string | null;
  selectedIncidentId?: string | null;
  onSelectWarehouse?: (warehouse: Warehouse) => void;
  onSelectIncident?: (incident: Incident) => void;
  className?: string;
}

export default function MapView({
  userLocation,
  warehouses,
  incidents = [],
  selectedWarehouseId,
  selectedIncidentId,
  onSelectWarehouse,
  onSelectIncident,
  className = 'h-80 w-full rounded-2xl overflow-hidden shadow-inner',
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clear stale Leaflet ID on container to prevent "Map container is already initialized" error
    if ((mapContainerRef.current as any)._leaflet_id && !mapInstanceRef.current) {
      (mapContainerRef.current as any)._leaflet_id = null;
    }

    if (!mapInstanceRef.current) {
      // Default to Hanoi center if no user location yet
      const defaultLat = userLocation?.lat || 21.0285;
      const defaultLng = userLocation?.lng || 105.8542;

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
      }).setView([defaultLat, defaultLng], 14);

      L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: ['a', 'b'],
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: 'bottomleft' }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapInstanceRef.current = map;

      // Invalidate size once DOM paint is done
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 100);
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 350);
    }

    // Observe container resize to auto-invalidateSize when banners appear/disappear
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

  // Update center when userLocation is first received or updated
  useEffect(() => {
    if (
      mapInstanceRef.current &&
      userLocation &&
      typeof userLocation.lat === 'number' &&
      typeof userLocation.lng === 'number' &&
      !isNaN(userLocation.lat) &&
      !isNaN(userLocation.lng)
    ) {
      mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 14);
      mapInstanceRef.current.invalidateSize();
    }
  }, [userLocation]);

  // Update Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    // 1. User Location Pulse Marker
    if (
      userLocation &&
      typeof userLocation.lat === 'number' &&
      typeof userLocation.lng === 'number' &&
      !isNaN(userLocation.lat) &&
      !isNaN(userLocation.lng)
    ) {
      const userIcon = L.divIcon({
        className: 'user-location-marker-container',
        html: `
          <div class="user-location-marker">
            <div class="user-location-pulse"></div>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(markersLayer)
        .bindPopup(
          `<div class="text-xs font-semibold text-slate-800 p-1">Vị trí của bạn</div>`
        );
    }

    // 2. Warehouse Markers (numbered 1..5 for the nearest or default pin)
    warehouses.forEach((wh, index) => {
      if (
        typeof wh.latitude !== 'number' ||
        typeof wh.longitude !== 'number' ||
        isNaN(wh.latitude) ||
        isNaN(wh.longitude)
      ) {
        return;
      }

      const isSelected = selectedWarehouseId === wh.id;
      const numberLabel = index < 5 ? `${index + 1}` : '•';
      const bgColor = isSelected ? '#b91c1c' : '#ea580c';

      const pinIcon = L.divIcon({
        className: 'custom-warehouse-pin-container',
        html: `
          <div style="background-color: ${bgColor}" class="warehouse-pin ${
          isSelected ? 'scale-125 ring-2 ring-white' : ''
        }">
            <span class="warehouse-pin-number">${numberLabel}</span>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });

      const navUrl = getGoogleMapsNavigationUrl(wh.latitude, wh.longitude);

      const marker = L.marker([wh.latitude, wh.longitude], { icon: pinIcon }).addTo(
        markersLayer
      );

      marker.bindPopup(`
        <div class="p-1 max-w-[210px]">
          ${
            wh.image_url
              ? `<img src="${wh.image_url}" alt="${wh.name}" class="w-full h-20 object-cover rounded-lg mb-1.5 border border-slate-200" />`
              : ''
          }
          <strong class="text-sm font-bold text-slate-900 block truncate">${wh.name}</strong>
          ${
            wh.distance_km !== undefined
              ? `<span class="text-xs font-semibold text-orange-600 block mt-0.5">Cách bạn: ${
                  wh.distance_km < 1
                    ? Math.round(wh.distance_km * 1000) + ' m'
                    : wh.distance_km.toFixed(1) + ' km'
                }</span>`
              : ''
          }
          <p class="text-[11px] text-slate-500 mt-1 line-clamp-2">${wh.address || ''}</p>
          ${
            wh.creator?.full_name
              ? `<span class="text-[10px] text-slate-500 block mt-0.5">Ghim bởi: <strong class="text-slate-700">${wh.creator.full_name}</strong></span>`
              : ''
          }
          <div class="mt-2.5 flex items-center gap-1.5">
            <a href="${navUrl}" target="_blank" rel="noopener noreferrer" 
               class="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-bold inline-flex items-center justify-center hover:bg-blue-700 active:scale-95 transition">
               Đi ngay 🚀
            </a>
            <a href="/warehouse/${wh.id}" 
               class="px-2.5 py-1.5 bg-orange-600 text-white rounded-lg text-[11px] font-bold inline-flex items-center justify-center hover:bg-orange-700 active:scale-95 transition">
               Nghe chỉ dẫn 🎧
            </a>
          </div>
        </div>
      `);

      marker.on('click', () => {
        if (onSelectWarehouse) {
          onSelectWarehouse(wh);
        }
      });
    });

    // 3. SOS Incident Markers (Flashing Red Pin 🚨)
    incidents.forEach((inc) => {
      if (
        typeof inc.latitude !== 'number' ||
        typeof inc.longitude !== 'number' ||
        isNaN(inc.latitude) ||
        isNaN(inc.longitude)
      ) {
        return;
      }

      const isSelected = selectedIncidentId === inc.id;
      const navUrl = getGoogleMapsNavigationUrl(inc.latitude, inc.longitude);

      const sosIcon = L.divIcon({
        className: 'custom-sos-pin-container',
        html: `
          <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; inset: -4px; border-radius: 50%; background: rgba(239, 68, 68, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="background-color: #dc2626; width: 34px; height: 34px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid #ffffff; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.6); ${
              isSelected ? 'scale: 1.25;' : ''
            }">
              <div style="transform: rotate(45deg); font-size: 15px; line-height: 1;">🚨</div>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36],
      });

      const marker = L.marker([inc.latitude, inc.longitude], { icon: sosIcon }).addTo(
        markersLayer
      );

      marker.bindPopup(`
        <div class="p-1 max-w-[220px]">
          ${
            inc.photo_url
              ? `<img src="${inc.photo_url}" alt="${inc.title}" class="w-full h-24 object-cover rounded-lg mb-1.5 border border-red-200" />`
              : ''
          }
          <div class="flex items-center gap-1">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-red-600 text-white uppercase">Cứu hộ SOS</span>
            ${
              inc.distance_km !== undefined
                ? `<span class="text-[11px] font-bold text-red-600">Cách ${
                    inc.distance_km < 1
                      ? Math.round(inc.distance_km * 1000) + 'm'
                      : inc.distance_km.toFixed(1) + 'km'
                  }</span>`
                : ''
            }
          </div>
          <strong class="text-xs font-black text-slate-900 block mt-1 line-clamp-1">${inc.title}</strong>
          <p class="text-[11px] text-slate-600 line-clamp-2 mt-0.5">${inc.description}</p>
          <div class="mt-2.5 flex items-center gap-1.5">
            <a href="/incidents/${inc.id}" 
               class="px-2.5 py-1.5 bg-red-600 text-white rounded-lg text-[11px] font-bold inline-flex items-center justify-center hover:bg-red-700 active:scale-95 transition">
               Ứng cứu ngay 🤝
            </a>
            <a href="${navUrl}" target="_blank" rel="noopener noreferrer" 
               class="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-bold inline-flex items-center justify-center hover:bg-blue-700 active:scale-95 transition">
               Chỉ đường 🚀
            </a>
          </div>
        </div>
      `);

      marker.on('click', () => {
        if (onSelectIncident) {
          onSelectIncident(inc);
        }
      });
    });
  }, [userLocation, warehouses, incidents, selectedWarehouseId, selectedIncidentId, onSelectWarehouse, onSelectIncident]);

  return (
    <div
      ref={mapContainerRef}
      className={`isolate z-0 ${className}`}
      style={{ minHeight: '320px', width: '100%' }}
    />
  );
}
