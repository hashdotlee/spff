'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Incident, IncidentType } from '@/types/database';
import { formatDistance } from '@/lib/utils/distance';
import { getGoogleMapsNavigationUrl } from '@/lib/utils/googleMaps';
import {
  Wrench,
  Fuel,
  Disc,
  Zap,
  AlertTriangle,
  HelpCircle,
  MapPin,
  Phone,
  Navigation2,
  Clock,
  UserCheck,
  ChevronRight,
  Maximize2,
  X,
  HeartHandshake,
} from 'lucide-react';

interface IncidentCardProps {
  incident: Incident;
  currentUserId?: string | null;
  onOfferHelp?: (incident: Incident) => void;
  onQuickDecline?: (incidentId: string) => void;
}

export function getIncidentTypeInfo(type: IncidentType) {
  switch (type) {
    case 'out_of_gas':
      return {
        label: 'Hết xăng / dầu',
        icon: Fuel,
        color: 'text-amber-700 bg-amber-50 border-amber-300',
        badgeColor: 'bg-amber-500 text-white',
        borderPulse: 'border-amber-400',
      };
    case 'broken_vehicle':
      return {
        label: 'Hỏng xe / chết máy',
        icon: Wrench,
        color: 'text-orange-700 bg-orange-50 border-orange-300',
        badgeColor: 'bg-orange-600 text-white',
        borderPulse: 'border-orange-400',
      };
    case 'flat_tire':
      return {
        label: 'Thủng / nổ lốp',
        icon: Disc,
        color: 'text-red-700 bg-red-50 border-red-300',
        badgeColor: 'bg-red-600 text-white',
        borderPulse: 'border-red-400',
      };
    case 'battery_dead':
      return {
        label: 'Hết ắc quy',
        icon: Zap,
        color: 'text-yellow-700 bg-yellow-50 border-yellow-300',
        badgeColor: 'bg-yellow-500 text-white',
        borderPulse: 'border-yellow-400',
      };
    case 'accident':
      return {
        label: 'Va chạm / Tai nạn',
        icon: AlertTriangle,
        color: 'text-rose-800 bg-rose-50 border-rose-400',
        badgeColor: 'bg-rose-700 text-white',
        borderPulse: 'border-rose-500',
      };
    default:
      return {
        label: 'Sự cố khác',
        icon: HelpCircle,
        color: 'text-slate-700 bg-slate-50 border-slate-300',
        badgeColor: 'bg-slate-600 text-white',
        borderPulse: 'border-slate-400',
      };
  }
}

export function IncidentCard({
  incident,
  currentUserId,
  onOfferHelp,
  onQuickDecline,
}: IncidentCardProps) {
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const typeInfo = getIncidentTypeInfo(incident.incident_type);
  const IconComponent = typeInfo.icon;
  const navUrl = getGoogleMapsNavigationUrl(incident.latitude, incident.longitude, incident.address);
  const isOwner = currentUserId && incident.user_id === currentUserId;
  const isHelping = Boolean(incident.current_user_helper);

  const formattedTime = new Date(incident.created_at).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const hasAudio = Boolean(incident.audio_url || incident.description?.includes('[Voice]: '));
  const cleanDescription = incident.description?.replace(/\[Voice\]:\s*.+$/, '').trim() || incident.description;

  return (
    <>
      <div className="bg-white rounded-2xl border border-red-200/80 hover:border-red-400 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden">
        {/* Top Header Badge */}
        <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1.5 px-3.5 sm:px-4 py-2.5 bg-gradient-to-r from-red-50 via-amber-50/50 to-white border-b border-red-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs ${typeInfo.badgeColor}`}
            >
              <IconComponent className="w-3.5 h-3.5" />
              <span>{typeInfo.label}</span>
            </span>

            {incident.status === 'helping' ? (
              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-blue-600" />
                <span>Đang có {incident.helper_count || 1} người trợ giúp</span>
              </span>
            ) : incident.status === 'resolved' ? (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Đã giải quyết xong
              </span>
            ) : (
              <span className="text-[11px] font-bold text-red-600 bg-red-100/80 px-2 py-0.5 rounded-full border border-red-200 animate-pulse">
                Đang chờ cứu hộ
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium shrink-0 self-end xs:self-auto">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>{formattedTime}</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-3.5 sm:p-4 space-y-3">
          <div className="flex gap-3">
            {/* On-Site Photo Thumbnail (Mandatory photo proof) */}
            <div
              onClick={() => setShowPhotoModal(true)}
              className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden shrink-0 border border-slate-200 bg-slate-100 cursor-pointer group shadow-2xs"
              title="Xem ảnh hiện trường phóng to"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={incident.photo_url}
                alt={incident.title}
                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <Maximize2 className="w-4 h-4 text-white" />
              </div>
              <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] font-bold px-1 py-0.5 rounded">
                Ảnh hiện trường
              </span>
            </div>

            {/* Info Details */}
            <div className="flex-1 min-w-0">
              <Link
                href={`/incidents/${incident.id}`}
                className="text-sm sm:text-base font-black text-slate-900 hover:text-red-600 line-clamp-1 transition"
              >
                {incident.title}
              </Link>

              <p className="text-xs text-slate-600 line-clamp-2 mt-1 leading-relaxed">
                {cleanDescription}
              </p>

              {/* Distance, Address and Voice Badge */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {hasAudio && (
                  <span className="font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200 text-[11px] flex items-center gap-1">
                    <span>🎙️ Có voice chỉ dẫn</span>
                  </span>
                )}

                {incident.distance_km !== undefined && (
                  <span className="font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-md border border-red-200/80 text-[11px] sm:text-xs">
                    Cách bạn: {formatDistance(incident.distance_km)}
                  </span>
                )}

                {incident.address && (
                  <p className="text-[11px] text-slate-600 flex items-start gap-1 w-full line-clamp-2 mt-1 leading-relaxed">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>{incident.address}</span>
                  </p>
                )}
              </div>

              {/* Driver info */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <span className="text-slate-400">Tài xế:</span>
                <span className="font-bold text-slate-800">
                  {incident.user?.full_name || 'Đồng nghiệp'}
                </span>
                <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[10px]">
                  📞 {incident.phone}
                </span>
                {isOwner && (
                  <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                    (Của bạn)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Row: Direct Call, Navigation & Help Decision */}
          <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 w-full sm:w-auto">
              <a
                href={`tel:${incident.phone}`}
                className="min-h-[38px] px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
                title={`Gọi trực tiếp ${incident.phone}`}
              >
                <Phone className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Gọi ({incident.phone})</span>
              </a>

              <a
                href={navUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[38px] px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
                title="Dẫn đường Google Maps tới vị trí sự cố"
              >
                <Navigation2 className="w-3.5 h-3.5 shrink-0" />
                <span>Chỉ đường</span>
              </a>
            </div>

            {/* "Ai nhìn thấy có thể chọn hỗ trợ hoặc không" */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
              {!isOwner && incident.status !== 'resolved' && (
                <>
                  {isHelping ? (
                    <Link
                      href={`/incidents/${incident.id}`}
                      className="w-full sm:w-auto min-h-[38px] px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs active:scale-95"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Bạn đang giúp</span>
                    </Link>
                  ) : (
                    <>
                      {onQuickDecline && (
                        <button
                          type="button"
                          onClick={() => onQuickDecline(incident.id)}
                          className="min-h-[38px] px-3 py-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold transition active:scale-95"
                          title="Không thể hỗ trợ sự cố này"
                        >
                          Bỏ qua
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onOfferHelp?.(incident)}
                        className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm ring-2 ring-red-500/20"
                      >
                        <HeartHandshake className="w-4 h-4" />
                        <span>Hỗ trợ ngay</span>
                      </button>
                    </>
                  )}
                </>
              )}

              <Link
                href={`/incidents/${incident.id}`}
                className="min-h-[38px] px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl text-xs font-bold transition flex items-center justify-center gap-0.5 active:scale-95 shrink-0"
              >
                <span>Chi tiết</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox for Proof Photo */}
      {showPhotoModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          onClick={() => setShowPhotoModal(false)}
        >
          <div className="relative max-w-3xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setShowPhotoModal(false)}
              className="absolute -top-12 right-0 p-2 text-white hover:text-slate-300 rounded-full bg-white/10 hover:bg-white/20 transition active:scale-95"
            >
              <X className="w-6 h-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={incident.photo_url}
              alt="Ảnh chứng minh hiện trường sự cố"
              className="max-h-[85vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="mt-3 text-white/90 text-xs text-center font-medium">
              Ảnh chụp tại hiện trường bởi: {incident.user?.full_name || 'Bác tài'}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
