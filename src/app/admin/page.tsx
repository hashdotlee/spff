'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Report, Profile, Warehouse, VoiceNote } from '@/types/database';
import {
  deleteWarehouse,
  deleteVoiceNote,
  toggleWarehouseStatus,
  toggleVoiceNoteStatus,
  banUser,
  unbanUser,
  recalculateReputation,
} from '@/lib/utils/adminActions';
import {
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Volume2,
  MapPin,
  User,
  Trash2,
  Search,
  ExternalLink,
  Play,
  Pause,
  Building2,
  RefreshCw,
  Users,
  Phone,
  Truck,
  Calendar,
  Edit3,
  RotateCcw,
  Award,
} from 'lucide-react';

export default function AdminPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [bannedUsers, setBannedUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'reports' | 'warehouses' | 'voice_notes' | 'users'>('reports');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Search & Filter states
  const [searchWarehouse, setSearchWarehouse] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState<'all' | 'active' | 'hidden'>('all');
  const [searchVoice, setSearchVoice] = useState('');
  const [voiceFilter, setVoiceFilter] = useState<'all' | 'active' | 'hidden'>('all');
  const [searchUser, setSearchUser] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'active' | 'banned' | 'admin'>('all');

  // Audio preview playback in admin
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const adminAudioRef = useRef<HTMLAudioElement | null>(null);

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

      // 1. Load reports
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

      // 2. Load all warehouses (including active, hidden, reported)
      const { data: whData } = await supabase
        .from('warehouses')
        .select(`
          *,
          creator:profiles(*),
          voice_notes:voice_notes(count)
        `)
        .order('created_at', { ascending: false });

      if (whData) {
        const parsed = whData.map((wh: any) => ({
          ...wh,
          voice_notes_count: wh.voice_notes?.[0]?.count || 0,
        }));
        setWarehouses(parsed);
      }

      // 3. Load all voice notes
      const { data: vnData } = await supabase
        .from('voice_notes')
        .select(`
          *,
          user:profiles(*),
          warehouse:warehouses(id, name)
        `)
        .order('created_at', { ascending: false });

      if (vnData) setVoiceNotes(vnData as any);

      // 4. Load all user profiles
      const { data: usersData } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersData) {
        setAllUsers(usersData as Profile[]);
        setBannedUsers((usersData as Profile[]).filter((u: Profile) => u.is_banned));
      }
    } catch (err) {
      console.error('Admin load error:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkAdminAndLoad();
  }, [supabase, router]);

  // Audio player helper
  function togglePlayAudio(noteId: string, audioUrl: string) {
    if (playingVoiceId === noteId) {
      adminAudioRef.current?.pause();
      setPlayingVoiceId(null);
    } else {
      if (adminAudioRef.current) {
        adminAudioRef.current.src = audioUrl;
        adminAudioRef.current.play();
        setPlayingVoiceId(noteId);
      }
    }
  }

  // --- ACTIONS ---

  // Xóa vĩnh viễn kho hàng
  async function handleDeleteWarehouseAction(warehouseId: string, warehouseName: string) {
    if (!confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN kho "${warehouseName}" không?\n(Nếu phát hiện bất thường, kho này sẽ bị loại bỏ khỏi hệ thống)`)) {
      return;
    }

    try {
      const res = await deleteWarehouse(supabase, warehouseId);
      setMessage({
        text: res.type === 'hard'
          ? `Đã xóa vĩnh viễn kho "${warehouseName}" thành công!`
          : `Đã gỡ bỏ kho "${warehouseName}" khỏi toàn bộ người dùng!`,
        type: 'success',
      });
      checkAdminAndLoad();
    } catch (err) {
      console.error('Lỗi khi xóa kho:', err);
      setMessage({ text: 'Có lỗi xảy ra khi xóa kho hàng.', type: 'error' });
    }
  }

  // Xóa vĩnh viễn chỉ dẫn (Voice note)
  async function handleDeleteVoiceNoteAction(noteId: string, audioUrl?: string | null, noteText?: string | null) {
    if (!confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN chỉ dẫn này không?\n(Chỉ dẫn có dấu hiệu bất thường hoặc sai lệch)`)) {
      return;
    }

    try {
      const res = await deleteVoiceNote(supabase, noteId, audioUrl);
      setMessage({
        text: res.type === 'hard'
          ? 'Đã xóa vĩnh viễn chỉ dẫn thành công!'
          : 'Đã gỡ bỏ chỉ dẫn vi phạm khỏi hệ thống!',
        type: 'success',
      });
      if (playingVoiceId === noteId) {
        adminAudioRef.current?.pause();
        setPlayingVoiceId(null);
      }
      checkAdminAndLoad();
    } catch (err) {
      console.error('Lỗi khi xóa chỉ dẫn:', err);
      setMessage({ text: 'Có lỗi xảy ra khi xóa chỉ dẫn.', type: 'error' });
    }
  }

  // Bật/tắt Ẩn kho hàng
  async function handleToggleWarehouse(warehouseId: string, currentStatus: string) {
    const newStatus = currentStatus === 'hidden' ? 'active' : 'hidden';
    try {
      await toggleWarehouseStatus(supabase, warehouseId, newStatus);
      setMessage({
        text: newStatus === 'hidden' ? 'Đã ẩn kho hàng!' : 'Đã hiển thị lại kho hàng!',
        type: 'success',
      });
      checkAdminAndLoad();
    } catch {
      setMessage({ text: 'Lỗi cập nhật trạng thái kho.', type: 'error' });
    }
  }

  // Bật/tắt Ẩn voice note
  async function handleToggleVoiceNote(noteId: string, currentStatus: string) {
    const newStatus = currentStatus === 'hidden' ? 'active' : 'hidden';
    try {
      await toggleVoiceNoteStatus(supabase, noteId, newStatus);
      setMessage({
        text: newStatus === 'hidden' ? 'Đã ẩn voice note!' : 'Đã hiển thị lại voice note!',
        type: 'success',
      });
      checkAdminAndLoad();
    } catch {
      setMessage({ text: 'Lỗi cập nhật trạng thái chỉ dẫn.', type: 'error' });
    }
  }

  // Khóa tài khoản
  async function handleBanUser(userId: string) {
    if (!confirm('Bạn có chắc chắn muốn KHÓA tài khoản này không?\nToàn bộ điểm cống hiến sẽ bị xóa và các kho/voice của tài khoản sẽ bị ẩn.')) return;

    try {
      await banUser(supabase, userId);
      setMessage({ text: 'Đã khóa tài khoản, xóa điểm và ẩn các đóng góp thành công!', type: 'success' });
      checkAdminAndLoad();
    } catch {
      setMessage({ text: 'Lỗi khi khóa tài khoản.', type: 'error' });
    }
  }

  // Mở khóa tài khoản
  async function handleUnbanUser(userId: string) {
    try {
      await unbanUser(supabase, userId);
      setMessage({ text: 'Đã mở khóa tài khoản và tính lại điểm thành công!', type: 'success' });
      checkAdminAndLoad();
    } catch {
      setMessage({ text: 'Lỗi khi mở khóa tài khoản.', type: 'error' });
    }
  }

  // Đổi vai trò (Admin / Driver)
  async function handleToggleRole(userId: string, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'driver' : 'admin';
    if (!confirm(`Bạn có chắc muốn đổi quyền tài khoản này thành "${newRole === 'admin' ? 'Quản trị viên (Admin)' : 'Tài xế'}"?`)) return;

    try {
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
      if (error) throw error;
      setMessage({ text: `Đã đổi vai trò thành ${newRole === 'admin' ? 'Quản trị viên' : 'Tài xế'}!`, type: 'success' });
      checkAdminAndLoad();
    } catch {
      setMessage({ text: 'Lỗi khi cập nhật vai trò người dùng.', type: 'error' });
    }
  }

  // Chỉnh sửa điểm cống hiến thủ công
  async function handleEditReputation(userId: string, currentScore: number) {
    const input = prompt('Nhập điểm cống hiến mới cho tài khoản này:', currentScore.toString());
    if (input === null) return;
    const newScore = parseInt(input.trim(), 10);
    if (isNaN(newScore) || newScore < 0) {
      alert('Điểm cống hiến phải là số nguyên không âm!');
      return;
    }

    try {
      const { error } = await supabase.from('profiles').update({ reputation_score: newScore }).eq('id', userId);
      if (error) throw error;
      setMessage({ text: `Đã cập nhật điểm cống hiến thành ${newScore} điểm!`, type: 'success' });
      checkAdminAndLoad();
    } catch {
      setMessage({ text: 'Lỗi khi cập nhật điểm cống hiến.', type: 'error' });
    }
  }

  // Tính lại điểm cống hiến tự động từ kho và voice thực tế
  async function handleRecalculateReputationAction(userId: string) {
    try {
      await recalculateReputation(supabase, userId);
      setMessage({ text: 'Đã tính toán lại điểm cống hiến theo dữ liệu kho và voice thực tế!', type: 'success' });
      checkAdminAndLoad();
    } catch {
      setMessage({ text: 'Lỗi khi tính lại điểm cống hiến.', type: 'error' });
    }
  }

  // Xử lý báo cáo
  async function handleResolveReport(reportId: string, status: 'resolved' | 'dismissed') {
    try {
      await supabase.from('reports').update({ status }).eq('id', reportId);
      checkAdminAndLoad();
    } catch {
      setMessage({ text: 'Lỗi khi cập nhật trạng thái báo cáo.', type: 'error' });
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Filtered warehouses
  const filteredWarehouses = warehouses.filter((wh) => {
    const matchSearch =
      wh.name.toLowerCase().includes(searchWarehouse.toLowerCase()) ||
      (wh.address && wh.address.toLowerCase().includes(searchWarehouse.toLowerCase()));
    if (warehouseFilter === 'all') return matchSearch;
    return matchSearch && wh.status === warehouseFilter;
  });

  // Filtered voice notes
  const filteredVoiceNotes = voiceNotes.filter((vn: any) => {
    const textMatch = (vn.note_text || '').toLowerCase().includes(searchVoice.toLowerCase());
    const whMatch = (vn.warehouse?.name || '').toLowerCase().includes(searchVoice.toLowerCase());
    const matchSearch = textMatch || whMatch;
    if (voiceFilter === 'all') return matchSearch;
    return matchSearch && vn.status === voiceFilter;
  });

  // Filtered users
  const filteredUsers = allUsers.filter((u: Profile) => {
    const query = searchUser.toLowerCase();
    const matchSearch =
      (u.full_name || '').toLowerCase().includes(query) ||
      (u.email || '').toLowerCase().includes(query) ||
      (u.phone || '').toLowerCase().includes(query) ||
      (u.bank_account_no || '').toLowerCase().includes(query) ||
      (u.bank_name || '').toLowerCase().includes(query);

    if (userFilter === 'active') return matchSearch && !u.is_banned;
    if (userFilter === 'banned') return matchSearch && u.is_banned;
    if (userFilter === 'admin') return matchSearch && u.role === 'admin';
    return matchSearch;
  });

  const pendingReportsCount = reports.filter((r) => r.status === 'pending').length;

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto w-full space-y-4 sm:space-y-5">
      {/* Hidden global audio element for previews */}
      <audio
        ref={adminAudioRef}
        onEnded={() => setPlayingVoiceId(null)}
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shadow-xs shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
              Khu Vực Quản Trị Viên (Admin)
            </h1>
            <p className="text-xs text-slate-500">
              Kiểm duyệt bất thường, quản lý tài khoản, xóa kho và xử lý vi phạm
            </p>
          </div>
        </div>

        <button
          onClick={checkAdminAndLoad}
          className="self-start sm:self-auto px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition flex items-center gap-1.5 active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Stats Quick Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] text-slate-500 font-medium block">Báo cáo chờ xử lý</span>
          <span className={`text-xl font-black ${pendingReportsCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
            {pendingReportsCount}
          </span>
        </div>
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] text-slate-500 font-medium block">Tổng kho bãi</span>
          <span className="text-xl font-black text-slate-800">{warehouses.length}</span>
        </div>
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] text-slate-500 font-medium block">Tổng chỉ dẫn (Voice)</span>
          <span className="text-xl font-black text-slate-800">{voiceNotes.length}</span>
        </div>
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] text-slate-500 font-medium block">Tổng tài khoản</span>
          <span className="text-xl font-black text-slate-900">
            {allUsers.length}
            {bannedUsers.length > 0 && (
              <span className="text-xs text-red-600 font-bold ml-1.5">({bannedUsers.length} khóa)</span>
            )}
          </span>
        </div>
      </div>

      {/* Message Alert */}
      {message && (
        <div
          className={`p-3 rounded-xl flex items-center justify-between text-xs font-semibold border ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="p-1 active:scale-95">
            <CheckCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-4 text-xs font-bold overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('reports')}
          className={`pb-2.5 sm:pb-3 px-2 sm:px-1 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'reports'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Báo cáo vi phạm</span>
          {pendingReportsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px]">
              {pendingReportsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('warehouses')}
          className={`pb-2.5 sm:pb-3 px-2 sm:px-1 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'warehouses'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Quản lý Kho hàng ({warehouses.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('voice_notes')}
          className={`pb-2.5 sm:pb-3 px-2 sm:px-1 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'voice_notes'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Volume2 className="w-4 h-4" />
          <span>Quản lý Chỉ dẫn Voice ({voiceNotes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`pb-2.5 sm:pb-3 px-2 sm:px-1 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'users'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Quản lý Tài khoản ({allUsers.length})</span>
          {bannedUsers.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[10px]">
              {bannedUsers.length} khóa
            </span>
          )}
        </button>
      </div>

      {/* ===================== TAB 1: REPORTS ===================== */}
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
                        Lý do báo cáo: &ldquo;{r.reason}&rdquo;
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
                      <div className="flex items-center justify-between gap-2 text-orange-600 pt-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <Volume2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Voice Note: {r.voice_note.note_text || 'Chỉ đường bằng âm thanh'}</span>
                        </div>
                        {r.voice_note.audio_url && (
                          <button
                            onClick={() => togglePlayAudio(r.voice_note!.id, r.voice_note!.audio_url)}
                            className="px-2 py-0.5 rounded-lg bg-orange-100 text-orange-700 text-[11px] font-bold flex items-center gap-1 shrink-0"
                          >
                            {playingVoiceId === r.voice_note.id ? (
                              <>
                                <Pause className="w-3 h-3" />
                                <span>Tạm dừng</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 ml-0.5" />
                                <span>Nghe thử</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {r.warehouse && (
                      <div className="flex items-center justify-between gap-2 text-blue-600 pt-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Kho: {r.warehouse.name}</span>
                        </div>
                        <Link
                          href={`/warehouse/${r.warehouse.id}`}
                          className="px-2 py-0.5 rounded-lg bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center gap-1 shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Xem kho</span>
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Admin Action Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-2 border-t border-slate-100">
                    {/* XÓA KHO BẤT THƯỜNG */}
                    {r.warehouse_id && (
                      <button
                        onClick={() =>
                          handleDeleteWarehouseAction(r.warehouse_id!, r.warehouse?.name || 'Kho vi phạm')
                        }
                        className="min-h-[34px] px-3 py-1 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                        title="Xóa kho hàng nếu phát hiện bất thường"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa Kho</span>
                      </button>
                    )}

                    {/* XÓA CHỈ DẪN BẤT THƯỜNG */}
                    {r.voice_note_id && (
                      <button
                        onClick={() =>
                          handleDeleteVoiceNoteAction(
                            r.voice_note_id!,
                            r.voice_note?.audio_url,
                            r.voice_note?.note_text
                          )
                        }
                        className="min-h-[34px] px-3 py-1 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                        title="Xóa chỉ dẫn sai lệch bất thường"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa Chỉ Dẫn</span>
                      </button>
                    )}

                    {/* ẨN KHO / ẨN VOICE */}
                    {r.warehouse_id && (
                      <button
                        onClick={() => handleToggleWarehouse(r.warehouse_id!, r.warehouse?.status || 'active')}
                        className="min-h-[34px] px-2.5 py-1 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white rounded-xl text-xs font-medium transition flex items-center gap-1"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Ẩn Kho</span>
                      </button>
                    )}

                    {r.voice_note_id && (
                      <button
                        onClick={() => handleToggleVoiceNote(r.voice_note_id!, r.voice_note?.status || 'active')}
                        className="min-h-[34px] px-2.5 py-1 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white rounded-xl text-xs font-medium transition flex items-center gap-1"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Ẩn Voice</span>
                      </button>
                    )}

                    {/* KHÓA TÀI KHOẢN */}
                    {r.reported_user_id && (
                      <button
                        onClick={() => handleBanUser(r.reported_user_id!)}
                        className="min-h-[34px] px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 active:scale-95 rounded-xl text-xs font-bold transition flex items-center gap-1"
                      >
                        <ShieldBan className="w-3.5 h-3.5" />
                        <span>Khóa TK</span>
                      </button>
                    )}

                    {/* TRẠNG THÁI REPORT */}
                    {r.status === 'pending' && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          onClick={() => handleResolveReport(r.id, 'resolved')}
                          className="min-h-[34px] px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 active:scale-95 text-emerald-800 rounded-xl text-xs font-semibold transition flex items-center gap-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Đã xử lý</span>
                        </button>

                        <button
                          onClick={() => handleResolveReport(r.id, 'dismissed')}
                          className="min-h-[34px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 rounded-xl text-xs font-semibold transition flex items-center gap-1"
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

      {/* ===================== TAB 2: WAREHOUSES ===================== */}
      {activeTab === 'warehouses' && (
        <div className="space-y-3">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kho theo tên hoặc địa chỉ..."
                value={searchWarehouse}
                onChange={(e) => setSearchWarehouse(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-1.5 text-xs font-semibold">
              {(['all', 'active', 'hidden'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setWarehouseFilter(st)}
                  className={`px-3 py-2 rounded-xl transition capitalize ${
                    warehouseFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {st === 'all' ? 'Tất cả' : st === 'active' ? 'Đang hiện' : 'Đã ẩn'}
                </button>
              ))}
            </div>
          </div>

          {filteredWarehouses.length > 0 ? (
            filteredWarehouses.map((wh) => (
              <div
                key={wh.id}
                className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-xs space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900">{wh.name}</h3>

                      {wh.category === 'eatery' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          🍜 Quán ăn
                        </span>
                      ) : wh.category === 'customer' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          🏠 Nhà khách
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-800 border border-orange-200">
                          🏢 Kho hàng
                        </span>
                      )}

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          wh.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {wh.status === 'active' ? 'Hoạt động' : 'Đã ẩn'}
                      </span>
                    </div>

                    {wh.address && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{wh.address}</p>
                    )}

                    <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                      <span>Tọa độ: {wh.latitude.toFixed(4)}, {wh.longitude.toFixed(4)}</span>
                      <span>•</span>
                      <span>Chỉ dẫn voice: {wh.voice_notes_count || 0}</span>
                      <span>•</span>
                      <span>Tạo bởi: {wh.creator?.full_name || 'Hệ thống'}</span>
                    </div>
                  </div>

                  <Link
                    href={`/warehouse/${wh.id}`}
                    className="p-2 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition active:scale-95 shrink-0"
                    title="Xem chi tiết kho"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>

                {wh.description && (
                  <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl">
                    {wh.description}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handleToggleWarehouse(wh.id, wh.status)}
                    className="min-h-[34px] px-3 py-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    {wh.status === 'hidden' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>{wh.status === 'hidden' ? 'Hiện lại kho' : 'Ẩn kho'}</span>
                  </button>

                  <button
                    onClick={() => handleDeleteWarehouseAction(wh.id, wh.name)}
                    className="min-h-[34px] px-3 py-1 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                    title="Xóa kho vĩnh viễn"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa Kho</span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 text-xs">
              Không tìm thấy kho hàng nào.
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 3: VOICE NOTES ===================== */}
      {activeTab === 'voice_notes' && (
        <div className="space-y-3">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm chỉ dẫn theo ghi chú hoặc tên kho..."
                value={searchVoice}
                onChange={(e) => setSearchVoice(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-1.5 text-xs font-semibold">
              {(['all', 'active', 'hidden'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setVoiceFilter(st)}
                  className={`px-3 py-2 rounded-xl transition capitalize ${
                    voiceFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {st === 'all' ? 'Tất cả' : st === 'active' ? 'Đang hiện' : 'Đã ẩn'}
                </button>
              ))}
            </div>
          </div>

          {filteredVoiceNotes.length > 0 ? (
            filteredVoiceNotes.map((vn: any) => (
              <div
                key={vn.id}
                className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-xs space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/warehouse/${vn.warehouse_id}`}
                        className="text-xs sm:text-sm font-bold text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>{vn.warehouse?.name || 'Kho hàng'}</span>
                      </Link>

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          vn.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {vn.status === 'active' ? 'Hoạt động' : 'Đã ẩn'}
                      </span>
                    </div>

                    {vn.note_text ? (
                      <p className="text-xs text-slate-800 font-medium bg-slate-50 p-2 rounded-xl border border-slate-100">
                        &ldquo;{vn.note_text}&rdquo;
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">Không có ghi chú chữ</p>
                    )}

                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span>Người thu âm: {vn.user?.full_name || 'Tài xế'}</span>
                      <span>•</span>
                      <span>Thời lượng: {vn.duration_seconds}s</span>
                      <span>•</span>
                      <span className="text-emerald-600 font-bold">+{vn.upvotes_count || 0}</span>
                      <span className="text-red-600 font-bold">-{vn.downvotes_count || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  {/* Play audio button */}
                  {vn.audio_url && (
                    <button
                      onClick={() => togglePlayAudio(vn.id, vn.audio_url)}
                      className="min-h-[34px] px-3 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 active:scale-95 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                    >
                      {playingVoiceId === vn.id ? (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          <span>Tạm dừng</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 ml-0.5" />
                          <span>Nghe voice ({vn.duration_seconds}s)</span>
                        </>
                      )}
                    </button>
                  )}

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={() => handleToggleVoiceNote(vn.id, vn.status)}
                      className="min-h-[34px] px-3 py-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
                    >
                      {vn.status === 'hidden' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>{vn.status === 'hidden' ? 'Hiện lại' : 'Ẩn'}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteVoiceNoteAction(vn.id, vn.audio_url, vn.note_text)}
                      className="min-h-[34px] px-3 py-1 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                      title="Xóa chỉ dẫn vĩnh viễn"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa Chỉ Dẫn</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 text-xs">
              Không tìm thấy chỉ dẫn voice nào.
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 4: USER ACCOUNTS ===================== */}
      {activeTab === 'users' && (
        <div className="space-y-3">
          {/* Search & Filter Controls */}
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                placeholder="Tìm tài xế theo họ tên, SĐT, biển số xe, loại xe..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setUserFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
                  userFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tất cả ({allUsers.length})
              </button>
              <button
                onClick={() => setUserFilter('active')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
                  userFilter === 'active'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Đang hoạt động ({allUsers.filter((u) => !u.is_banned).length})
              </button>
              <button
                onClick={() => setUserFilter('banned')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
                  userFilter === 'banned'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Đã bị khóa ({bannedUsers.length})
              </button>
              <button
                onClick={() => setUserFilter('admin')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
                  userFilter === 'admin'
                    ? 'bg-rose-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Quản trị viên ({allUsers.filter((u) => u.role === 'admin').length})
              </button>
            </div>
          </div>

          {/* User List */}
          {filteredUsers.length > 0 ? (
            <div className="space-y-2.5">
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className={`bg-white rounded-2xl p-3.5 sm:p-4 border transition shadow-xs space-y-3 ${
                    u.is_banned ? 'border-red-300 bg-red-50/20' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Avatar & User Info */}
                    <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                      <Link
                        href={`/profile/${u.id}`}
                        className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-black text-sm shrink-0 overflow-hidden active:scale-95 transition"
                      >
                        {u.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.avatar_url} alt={u.full_name} className="w-full h-full object-cover" />
                        ) : (
                          u.full_name?.[0]?.toUpperCase() || 'TX'
                        )}
                      </Link>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <Link
                            href={`/profile/${u.id}`}
                            className="text-sm sm:text-base font-bold text-slate-900 hover:text-orange-600 transition truncate"
                          >
                            {u.full_name || 'Bác tài chưa đặt tên'}
                          </Link>

                          {u.role === 'admin' ? (
                            <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3 text-rose-600" />
                              <span>Quản trị viên</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                              Tài xế
                            </span>
                          )}

                          {u.is_banned ? (
                            <span className="text-[10px] font-bold text-red-700 bg-red-100 border border-red-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <ShieldBan className="w-3 h-3 text-red-600" />
                              <span>Đã bị khóa</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 text-emerald-600" />
                              <span>Hoạt động</span>
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
                          {u.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{u.phone}</span>
                            </span>
                          )}

                          {u.bank_account_no && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                              <span>{u.bank_name || 'Bank'}: {u.bank_account_no}</span>
                            </span>
                          )}

                          <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 text-[11px]">
                            <Award className="w-3.5 h-3.5 text-amber-600" />
                            <span>{u.reputation_score}đ cống hiến</span>
                          </span>

                          <span className="text-slate-400 text-[11px]">
                            Tham gia: {new Date(u.created_at).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <Link
                        href={`/profile/${u.id}`}
                        target="_blank"
                        className="min-h-[34px] px-2.5 py-1 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1 active:scale-95"
                        title="Xem trang cá nhân"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden xs:inline">Hồ sơ</span>
                      </Link>

                      <button
                        onClick={() => handleRecalculateReputationAction(u.id)}
                        className="min-h-[34px] px-2.5 py-1 text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1 active:scale-95"
                        title="Tính lại điểm cống hiến theo kho và voice thực tế"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                        <span className="hidden xs:inline">Tính lại</span>
                      </button>

                      <button
                        onClick={() => handleEditReputation(u.id, u.reputation_score || 0)}
                        className="min-h-[34px] px-2.5 py-1 text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1 active:scale-95"
                        title="Chỉnh sửa điểm cống hiến"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                        <span>Sửa điểm</span>
                      </button>

                      <button
                        onClick={() => handleToggleRole(u.id, u.role)}
                        className="min-h-[34px] px-2.5 py-1 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1 active:scale-95"
                        title={u.role === 'admin' ? 'Hạ quyền xuống Tài xế' : 'Cấp quyền Quản trị viên'}
                      >
                        <span>{u.role === 'admin' ? 'Hạ TX' : 'Lên Admin'}</span>
                      </button>

                      {u.is_banned ? (
                        <button
                          onClick={() => handleUnbanUser(u.id)}
                          className="min-h-[34px] px-3 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1 shadow-xs"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>Mở khóa</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBanUser(u.id)}
                          className="min-h-[34px] px-3 py-1 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1 shadow-xs"
                          title="Khóa tài khoản (xóa điểm và ẩn tất cả kho/voice)"
                        >
                          <ShieldBan className="w-4 h-4" />
                          <span>Khóa</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 text-xs">
              Không tìm thấy tài khoản nào phù hợp với bộ lọc.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
