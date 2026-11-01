'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Report, Profile } from '@/types/database';
import {
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  EyeOff,
  CheckCircle,
  XCircle,
  Volume2,
  MapPin,
  User,
  AlertCircle,
} from 'lucide-react';

export default function AdminPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [bannedUsers, setBannedUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'reports' | 'banned'>('reports');
  const [message, setMessage] = useState<string | null>(null);

  const supabase = createClient();

  async function checkAdminAndLoad() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login?redirectTo=/admin');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        router.push('/');
        return;
      }

      // Load reports
      const { data: repData } = await supabase
        .from('reports')
        .select(`
          *,
          reporter:profiles!reporter_id(*),
          reported_user:profiles!reported_user_id(*),
          warehouse:warehouses(*),
          voice_note:voice_notes(*)
        `)
        .order('created_at', { ascending: false });

      if (repData) setReports(repData as Report[]);

      // Load banned users
      const { data: bannedData } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_banned', true)
        .order('updated_at', { ascending: false });

      if (bannedData) setBannedUsers(bannedData);
    } catch (err) {
      console.error('Admin load error:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkAdminAndLoad();
  }, [supabase, router]);

  async function handleBanUser(userId: string) {
    if (!confirm('Bạn có chắc chắn muốn KHÓA tài khoản này không?')) return;

    try {
      await supabase.from('profiles').update({ is_banned: true }).eq('id', userId);
      setMessage('Đã khóa tài khoản thành công!');
      checkAdminAndLoad();
    } catch {
      alert('Lỗi khi khóa tài khoản.');
    }
  }

  async function handleUnbanUser(userId: string) {
    try {
      await supabase.from('profiles').update({ is_banned: false }).eq('id', userId);
      setMessage('Đã mở khóa tài khoản thành công!');
      checkAdminAndLoad();
    } catch {
      alert('Lỗi khi mở khóa tài khoản.');
    }
  }

  async function handleHideVoiceNote(noteId: string) {
    if (!confirm('Bạn có chắc muốn ẨN voice note này khỏi cộng đồng?')) return;

    try {
      await supabase
        .from('voice_notes')
        .update({ status: 'hidden' })
        .eq('id', noteId);
      setMessage('Đã ẩn voice note vi phạm!');
      checkAdminAndLoad();
    } catch {
      alert('Lỗi khi ẩn voice note.');
    }
  }

  async function handleHideWarehouse(warehouseId: string) {
    if (!confirm('Bạn có chắc muốn ẨN kho này?')) return;

    try {
      await supabase
        .from('warehouses')
        .update({ status: 'hidden' })
        .eq('id', warehouseId);
      setMessage('Đã ẩn kho hàng vi phạm!');
      checkAdminAndLoad();
    } catch {
      alert('Lỗi khi ẩn kho.');
    }
  }

  async function handleResolveReport(reportId: string, status: 'resolved' | 'dismissed') {
    try {
      await supabase
        .from('reports')
        .update({ status })
        .eq('id', reportId);
      checkAdminAndLoad();
    } catch {
      alert('Lỗi khi cập nhật trạng thái báo cáo.');
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl mx-auto w-full space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shadow-xs shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
              Khu Vực Quản Trị Viên (Admin)
            </h1>
            <p className="text-xs text-slate-500">
              Kiểm duyệt báo cáo, xử lý nội dung độc hại và quản lý khóa tài khoản
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 text-xs font-semibold">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="p-1 active:scale-95">
            <CheckCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-4 text-xs font-bold overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('reports')}
          className={`pb-2.5 sm:pb-3 px-2 sm:px-1 border-b-2 transition flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 ${
            activeTab === 'reports'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Danh sách Báo cáo ({reports.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('banned')}
          className={`pb-2.5 sm:pb-3 px-2 sm:px-1 border-b-2 transition flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 ${
            activeTab === 'banned'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldBan className="w-4 h-4" />
          <span>Tài khoản đã khóa ({bannedUsers.length})</span>
        </button>
      </div>

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-3">
          {reports.length > 0 ? (
            reports.map((r) => {
              const isResolved = r.status !== 'pending';

              return (
                <div
                  key={r.id}
                  className={`bg-white rounded-2xl p-3.5 sm:p-4 border transition shadow-xs space-y-3 ${
                    isResolved ? 'border-slate-200 opacity-60' : 'border-red-200 bg-red-50/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            r.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : r.status === 'resolved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {r.status === 'pending'
                            ? 'Chờ xử lý'
                            : r.status === 'resolved'
                            ? 'Đã xử lý'
                            : 'Bỏ qua'}
                        </span>

                        <span className="text-[11px] text-slate-400">
                          {new Date(r.created_at).toLocaleString('vi-VN')}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-slate-900 mt-1">
                        Lý do: &ldquo;{r.reason}&rdquo;
                      </p>
                    </div>
                  </div>

                  {/* Context Info */}
                  <div className="p-2.5 bg-slate-50 rounded-xl text-xs space-y-1 text-slate-600 border border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">Người báo cáo: {r.reporter?.full_name || r.reporter_id}</span>
                    </div>

                    {r.voice_note && (
                      <div className="flex items-center gap-1.5 text-orange-600">
                        <Volume2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Voice Note bị báo: {r.voice_note.note_text || 'Chỉ đường bằng âm thanh'}</span>
                      </div>
                    )}

                    {r.warehouse && (
                      <div className="flex items-center gap-1.5 text-blue-600">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Kho bị báo: {r.warehouse.name}</span>
                      </div>
                    )}
                  </div>

                  {/* Admin 1-Click Action Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-2 border-t border-slate-100">
                    {r.reported_user_id && (
                      <button
                        onClick={() => handleBanUser(r.reported_user_id!)}
                        className="min-h-[36px] px-3 py-1.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                      >
                        <ShieldBan className="w-3.5 h-3.5" />
                        <span>Khóa tài khoản</span>
                      </button>
                    )}

                    {r.voice_note_id && (
                      <button
                        onClick={() => handleHideVoiceNote(r.voice_note_id!)}
                        className="min-h-[36px] px-3 py-1.5 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Ẩn Voice</span>
                      </button>
                    )}

                    {r.warehouse_id && (
                      <button
                        onClick={() => handleHideWarehouse(r.warehouse_id!)}
                        className="min-h-[36px] px-3 py-1.5 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Ẩn Kho</span>
                      </button>
                    )}

                    {r.status === 'pending' && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          onClick={() => handleResolveReport(r.id, 'resolved')}
                          className="min-h-[36px] px-2.5 py-1.5 bg-emerald-100 hover:bg-emerald-200 active:scale-95 text-emerald-800 rounded-xl text-xs font-semibold transition flex items-center gap-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Đã xử lý</span>
                        </button>

                        <button
                          onClick={() => handleResolveReport(r.id, 'dismissed')}
                          className="min-h-[36px] px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 rounded-xl text-xs font-semibold transition flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Bỏ qua</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
              Không có báo cáo vi phạm nào cần xử lý.
            </div>
          )}
        </div>
      )}

      {/* Banned Users Tab */}
      {activeTab === 'banned' && (
        <div className="space-y-2.5 sm:space-y-3">
          {bannedUsers.length > 0 ? (
            bannedUsers.map((u) => (
              <div
                key={u.id}
                className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 flex flex-col xs:flex-row items-stretch xs:items-center justify-between gap-3 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-sm shrink-0">
                    {u.full_name?.[0]?.toUpperCase() || 'TX'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{u.full_name}</h3>
                    <p className="text-xs text-slate-400 truncate">{u.email || u.id}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleUnbanUser(u.id)}
                  className="min-h-[40px] px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Mở khóa tài khoản</span>
                </button>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
              Hiện không có tài khoản nào bị khóa.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
