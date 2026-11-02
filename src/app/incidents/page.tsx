'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Incident, IncidentType } from '@/types/database';
import { calculateHaversineDistance } from '@/lib/utils/distance';
import { IncidentCard } from '@/components/incident/IncidentCard';
import { OfferHelpModal } from '@/components/incident/OfferHelpModal';
import {
  Siren,
  PlusCircle,
  LocateFixed,
  AlertCircle,
  Filter,
  CheckCircle2,
  Wrench,
  Fuel,
  Disc,
  Zap,
  AlertTriangle,
  HelpCircle,
  ShieldCheck,
  Search,
} from 'lucide-react';

export default function IncidentsPage() {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'near' | 'mine' | 'helping'>('all');
  const [selectedType, setSelectedType] = useState<IncidentType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Modal offer help state
  const [offeringIncident, setOfferingIncident] = useState<Incident | null>(null);
  const [dbTableMissing, setDbTableMissing] = useState(false);

  const supabase = createClient();

  // 1. Get GPS Location
  function requestLocation() {
    if (typeof window === 'undefined' || !navigator.geolocation) return;

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        setUserLocation({ lat: 21.0285, lng: 105.8542 });
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 6000 }
    );
  }

  // 2. Load Incidents & Helpers
  async function loadIncidents() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);
      }

      // Fetch incidents
      const { data, error } = await supabase
        .from('incidents')
        .select(`
          *,
          user:profiles(*),
          helpers:incident_helpers(*, helper:profiles(*))
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Lỗi tải danh sách sự cố:', error);
        if (error.code === '42P01' || error.message.includes('incidents')) {
          setDbTableMissing(true);
        }
        return;
      }

      if (data) {
        const parsed = data.map((inc: any) => {
          const currentHelper = user
            ? (inc.helpers || []).find((h: any) => h.helper_id === user.id && h.status !== 'cancelled')
            : null;
          return {
            ...inc,
            current_user_helper: currentHelper || null,
          };
        });
        setIncidents(parsed);
      }
    } catch (err) {
      console.error('Lỗi loadIncidents:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    requestLocation();
    loadIncidents();
  }, []);

  // Handle Offer Help Submission
  async function handleOfferHelpSubmit(etaMinutes: number, message: string) {
    if (!offeringIncident || !currentUserId) return;

    const { error } = await supabase.from('incident_helpers').upsert(
      {
        incident_id: offeringIncident.id,
        helper_id: currentUserId,
        eta_minutes: etaMinutes,
        message: message || 'Đang trên đường đến hỗ trợ!',
        status: 'offered',
        created_at: new Date().toISOString(),
      },
      { onConflict: 'incident_id,helper_id' }
    );

    if (error) {
      throw new Error(error.message);
    }

    setOfferingIncident(null);
    await loadIncidents();
  }

  function handleQuickDecline(incidentId: string) {
    setDismissedIds((prev) => new Set(prev).add(incidentId));
  }

  // Compute distances & filter
  const sortedAndFiltered = incidents
    .filter((inc) => !dismissedIds.has(inc.id))
    .map((inc) => {
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
    })
    .sort((a, b) => {
      // Prioritize open incidents, then closest distance
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (b.status === 'open' && a.status !== 'open') return 1;
      return (a.distance_km || 0) - (b.distance_km || 0);
    })
    .filter((inc) => {
      // Tab filter
      if (activeTab === 'near') {
        return (inc.distance_km || 0) <= 15 && inc.status !== 'resolved';
      }
      if (activeTab === 'mine') {
        return inc.user_id === currentUserId;
      }
      if (activeTab === 'helping') {
        return Boolean(inc.current_user_helper);
      }
      // 'all' tab: show non-resolved or recent resolved
      return inc.status !== 'resolved';
    })
    .filter((inc) => {
      // Type filter
      if (selectedType === 'all') return true;
      return inc.incident_type === selectedType;
    })
    .filter((inc) => {
      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        inc.title.toLowerCase().includes(q) ||
        inc.description.toLowerCase().includes(q) ||
        (inc.address && inc.address.toLowerCase().includes(q))
      );
    });

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-2xl mx-auto w-full">
      {/* Top Banner / Hero SOS */}
      <div className="bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 rounded-3xl p-4 sm:p-6 text-white shadow-lg shadow-red-600/20 relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider backdrop-blur-xs inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-300 animate-ping" />
              <span>Mạng Lưới Tương Trợ Xa Lộ</span>
            </span>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-snug">
              Cứu Hộ Sự Cố Khẩn Cấp (SOS)
            </h1>
            <p className="text-xs text-white/90 leading-relaxed max-w-md">
              Hỏng xe, hết xăng, nổ lốp giữa đường? Phát tín hiệu SOS để tìm đồng nghiệp ở gần ứng cứu ngay lập tức.
            </p>
          </div>

          <Link
            href="/incidents/new"
            className="py-3 px-5 bg-white hover:bg-slate-50 text-red-700 font-extrabold rounded-2xl text-xs sm:text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2 shrink-0"
          >
            <Siren className="w-5 h-5 text-red-600 animate-bounce" />
            <span>Phát Tín Hiệu SOS 🚨</span>
          </Link>
        </div>
      </div>

      {/* Migration Notice if database table is missing */}
      {dbTableMissing && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>Cần kích hoạt bảng SQL trên Supabase</span>
          </div>
          <p>
            Vui lòng mở Supabase SQL Editor và chạy nội dung file{' '}
            <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">
              supabase/migration_incidents.sql
            </code>{' '}
            để khởi tạo bảng <code className="font-mono">incidents</code> và quyền truy cập.
          </p>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {[
          { key: 'all', label: 'Tất cả sự cố 🚨' },
          { key: 'near', label: 'Gần tôi (< 15km) 📍' },
          { key: 'helping', label: 'Tôi đang giúp 🤝' },
          { key: 'mine', label: 'Sự cố của tôi 👤' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as any)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 cursor-pointer ${
              activeTab === tab.key
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search & Location Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo sự cố, địa điểm, xe..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-red-500 shadow-2xs"
          />
        </div>

        <button
          onClick={requestLocation}
          disabled={locating}
          className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl transition active:scale-90 flex items-center justify-center shadow-2xs shrink-0"
          title="Lấy lại vị trí GPS"
        >
          <LocateFixed className={`w-4 h-4 text-red-600 ${locating ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Incident Type Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        <button
          onClick={() => setSelectedType('all')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 ${
            selectedType === 'all'
              ? 'bg-slate-800 text-white'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
          }`}
        >
          Tất cả loại
        </button>
        <button
          onClick={() => setSelectedType('out_of_gas')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 flex items-center gap-1 ${
            selectedType === 'out_of_gas'
              ? 'bg-amber-600 text-white'
              : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
          }`}
        >
          <Fuel className="w-3 h-3" />
          <span>Hết xăng</span>
        </button>
        <button
          onClick={() => setSelectedType('broken_vehicle')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 flex items-center gap-1 ${
            selectedType === 'broken_vehicle'
              ? 'bg-orange-600 text-white'
              : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
          }`}
        >
          <Wrench className="w-3 h-3" />
          <span>Hỏng xe</span>
        </button>
        <button
          onClick={() => setSelectedType('flat_tire')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 flex items-center gap-1 ${
            selectedType === 'flat_tire'
              ? 'bg-red-600 text-white'
              : 'bg-red-50 text-red-700 hover:bg-red-100'
          }`}
        >
          <Disc className="w-3 h-3" />
          <span>Thủng lốp</span>
        </button>
        <button
          onClick={() => setSelectedType('battery_dead')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 flex items-center gap-1 ${
            selectedType === 'battery_dead'
              ? 'bg-yellow-600 text-white'
              : 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100'
          }`}
        >
          <Zap className="w-3 h-3" />
          <span>Hết ắc quy</span>
        </button>
        <button
          onClick={() => setSelectedType('accident')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 flex items-center gap-1 ${
            selectedType === 'accident'
              ? 'bg-rose-700 text-white'
              : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
          }`}
        >
          <AlertTriangle className="w-3 h-3" />
          <span>Va chạm</span>
        </button>
      </div>

      {/* Incidents Feed List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sortedAndFiltered.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center text-slate-500 space-y-3 shadow-xs">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto border border-emerald-200">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-800">
              Khu vực hiện tại không có sự cố nào!
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Không có sự cố nào đang cần hỗ trợ trong bộ lọc đã chọn. Chúc các bác tài vạn dặm bình an trên mọi nẻo đường!
            </p>
          </div>
          <Link
            href="/incidents/new"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition"
          >
            <Siren className="w-4 h-4" />
            <span>Bạn đang gặp sự cố? Báo SOS ngay</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedAndFiltered.map((inc) => (
            <IncidentCard
              key={inc.id}
              incident={inc}
              currentUserId={currentUserId}
              onOfferHelp={(incident) => setOfferingIncident(incident)}
              onQuickDecline={(id) => handleQuickDecline(id)}
            />
          ))}
        </div>
      )}

      {/* Offer Help Modal */}
      <OfferHelpModal
        incident={offeringIncident}
        isOpen={Boolean(offeringIncident)}
        onClose={() => setOfferingIncident(null)}
        onSubmit={handleOfferHelpSubmit}
      />
    </div>
  );
}
