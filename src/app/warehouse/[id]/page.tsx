'use client';

import { Suspense, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Warehouse, VoiceNote, UserRole } from '@/types/database';
import { getGoogleMapsNavigationUrl } from '@/lib/utils/googleMaps';
import { deleteWarehouse } from '@/lib/utils/adminActions';
import { AudioRecorder } from '@/components/voice/AudioRecorder';
import { VoiceNoteCard } from '@/components/voice/VoiceNoteCard';
import { VietQRModal } from '@/components/donation/VietQRModal';
import {
  Navigation2,
  MapPin,
  Volume2,
  ArrowLeft,
  Share2,
  Flag,
  AlertTriangle,
  Check,
  Trash2,
  ShieldAlert,
  Heart,
  Camera,
  Maximize2,
  X,
} from 'lucide-react';

function WarehouseDetailContent({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: warehouseId } = use(paramsPromise);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [isDeletingWh, setIsDeletingWh] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showReportWarehouse, setShowReportWarehouse] = useState(false);
  const [showPinnerQRModal, setShowPinnerQRModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);

  const supabase = createClient();

  async function loadData() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profile) setCurrentUserRole(profile.role);
      }

      // Load warehouse
      const { data: whData } = await supabase
        .from('warehouses')
        .select('*, creator:profiles(*)')
        .eq('id', warehouseId)
        .single();

      if (whData) setWarehouse(whData);

      // Load voice notes with user profile and votes
      const { data: notesData } = await supabase
        .from('voice_notes')
        .select('*, user:profiles(*)')
        .eq('warehouse_id', warehouseId)
        .eq('status', 'active')
        .order('upvotes_count', { ascending: false });

      if (notesData) {
        if (user) {
          const { data: votesData } = await supabase
            .from('voice_votes')
            .select('*')
            .eq('user_id', user.id)
            .in(
              'voice_note_id',
              notesData.map((n: any) => n.id)
            );

          const votesMap = new Map(votesData?.map((v: any) => [v.voice_note_id, v.vote_value]));
          const mappedNotes = notesData.map((n: any) => ({
            ...n,
            user_vote: votesMap.get(n.id) || null,
          }));
          setVoiceNotes(mappedNotes);
        } else {
          setVoiceNotes(notesData);
        }
      }
    } catch (err) {
      console.error('Error loading warehouse:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteWarehouse() {
    const confirmMsg =
      currentUserRole === 'admin'
        ? `Bạn có chắc chắn muốn XÓA kho "${warehouse?.name}" với quyền Quản trị viên (Admin)?`
        : `Bạn có chắc chắn muốn xóa kho "${warehouse?.name}" của mình?`;
    if (!confirm(confirmMsg)) return;

    setIsDeletingWh(true);
    try {
      await deleteWarehouse(supabase, warehouseId);
      alert('Đã xóa kho thành công!');
      router.push('/');
    } catch (err) {
      console.error('Lỗi khi xóa kho:', err);
      alert('Có lỗi xảy ra khi xóa kho. Vui lòng thử lại!');
    } finally {
      setIsDeletingWh(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [warehouseId]);

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: warehouse?.name || 'Kho Vận SPFF',
        text: `Vị trí và ghi chú chỉ đường kho: ${warehouse?.name}`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  }

  async function handleReportWarehouse(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId) {
      alert('Vui lòng đăng nhập để báo cáo vi phạm!');
      return;
    }

    try {
      await supabase.from('reports').insert({
        reporter_id: currentUserId,
        warehouse_id: warehouseId,
        reason: reportReason.trim() || 'Kho không tồn tại hoặc sai vị trí',
        status: 'pending',
      });
      setReportSuccess(true);
      setTimeout(() => {
        setShowReportWarehouse(false);
        setReportSuccess(false);
        setReportReason('');
      }, 2200);
    } catch (err) {
      console.error('Error reporting warehouse:', err);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!warehouse) {
    return (
      <div className="p-8 text-center text-slate-500">
        <h2 className="text-lg font-bold text-slate-800">Không tìm thấy thông tin kho này</h2>
        <Link href="/" className="mt-4 inline-block text-orange-600 font-semibold underline">
          Quay lại bản đồ
        </Link>
      </div>
    );
  }

  const navUrl = getGoogleMapsNavigationUrl(warehouse.latitude, warehouse.longitude);

  return (
    <div className="p-3 sm:p-6 max-w-2xl mx-auto w-full space-y-4 sm:space-y-5">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="p-2 -ml-1.5 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition active:scale-95 flex items-center gap-1 text-xs sm:text-sm font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Bản đồ kho</span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-1.5">
          <button
            onClick={handleShare}
            className="p-2 text-slate-600 hover:text-orange-600 rounded-xl hover:bg-slate-100 transition active:scale-95 flex items-center gap-1 text-xs font-semibold"
            title="Chia sẻ link kho"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden xs:inline">{copiedLink ? 'Đã copy!' : 'Chia sẻ'}</span>
          </button>

          <button
            onClick={() => setShowReportWarehouse(true)}
            className="p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-red-50 transition active:scale-95"
            title="Báo cáo sai vị trí"
          >
            <Flag className="w-4 h-4" />
          </button>

          {(currentUserRole === 'admin' || currentUserId === warehouse.created_by) && (
            <button
              onClick={handleDeleteWarehouse}
              disabled={isDeletingWh}
              className="px-2.5 py-1.5 text-red-600 hover:bg-red-50 border border-red-200 rounded-xl transition active:scale-95 flex items-center gap-1 text-xs font-bold disabled:opacity-50"
              title={currentUserRole === 'admin' ? 'Quản trị viên xóa kho này' : 'Xóa kho do bạn tạo'}
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden xs:inline">Xóa kho</span>
            </button>
          )}
        </div>
      </div>

      {currentUserRole === 'admin' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-red-800 text-xs font-medium">
          <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
          <span>Quyền Quản trị viên: Bạn có thể xóa kho hoặc xóa bất kỳ chỉ dẫn bất thường nào tại đây.</span>
        </div>
      )}

      {/* Main Info Card */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-xs space-y-3.5 sm:space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 shadow-xs">
            <MapPin className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight leading-snug">
              {warehouse.name}
            </h1>
            {warehouse.address && (
              <p className="text-xs sm:text-sm text-slate-600 mt-1 flex items-start gap-1">
                <span>{warehouse.address}</span>
              </p>
            )}
          </div>
        </div>

        {warehouse.description && (
          <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-200/60 leading-relaxed">
            <strong className="font-semibold text-slate-900 block mb-0.5">
              Ghi chú bến bãi:
            </strong>
            {warehouse.description}
          </div>
        )}

        {/* Warehouse Gate Photo (Ảnh cổng kho do tài xế chụp) */}
        {warehouse.image_url && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-700 font-bold">
              <span className="flex items-center gap-1.5 text-orange-600">
                <Camera className="w-3.5 h-3.5" />
                <span>Ảnh thực tế cổng kho</span>
              </span>
              <button
                type="button"
                onClick={() => setZoomedPhoto(warehouse.image_url || null)}
                className="text-[11px] text-slate-500 hover:text-orange-600 font-semibold flex items-center gap-1 active:scale-95 transition"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Xem ảnh lớn</span>
              </button>
            </div>
            <div
              onClick={() => setZoomedPhoto(warehouse.image_url || null)}
              className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer group shadow-xs"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={warehouse.image_url}
                alt={warehouse.name}
                className="w-full h-48 sm:h-64 object-cover group-hover:scale-102 transition duration-300"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <span className="px-3 py-1.5 bg-black/60 text-white text-xs font-bold rounded-lg backdrop-blur-xs flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Phóng to</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Pinner Info & Thank You Button */}
        {warehouse.creator ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-amber-50/80 rounded-2xl border border-amber-200/80">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href={`/profile/${warehouse.creator.id}`}
                className="w-11 h-11 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-700 font-bold text-xs shrink-0 overflow-hidden active:scale-95 transition shadow-2xs"
              >
                {warehouse.creator.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={warehouse.creator.avatar_url}
                    alt={warehouse.creator.full_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  warehouse.creator.full_name?.[0]?.toUpperCase() || 'TX'
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] text-slate-500 font-medium block">Người đã ghim kho:</span>
                <Link
                  href={`/profile/${warehouse.creator.id}`}
                  className="text-xs sm:text-sm font-bold text-slate-900 hover:text-orange-600 truncate block transition"
                >
                  {warehouse.creator.full_name}
                </Link>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Đã ghim ngày {new Date(warehouse.created_at).toLocaleDateString('vi-VN')}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPinnerQRModal(true)}
              className="w-full sm:w-auto min-h-[42px] px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs shrink-0"
              title="Gửi cà phê cảm ơn người đã ghim kho này qua VietQR"
            >
              <Heart className="w-4 h-4 fill-white shrink-0" />
              <span>
                {currentUserId === warehouse.created_by
                  ? 'Cảm ơn người ghim (Mã của bạn)'
                  : 'Cảm ơn người ghim kho'}
              </span>
            </button>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 px-1 py-1">
            <span>Kho do cộng đồng bác tài SPFF đóng góp</span>
          </div>
        )}

        {/* Big Navigation Button */}
        <a
          href={navUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full min-h-[48px] py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 text-xs sm:text-sm"
        >
          <Navigation2 className="w-4 h-4 sm:w-5 sm:h-5 fill-white shrink-0" />
          <span>Dẫn Đường Trực Tiếp (Google Maps)</span>
        </a>
      </div>

      {/* Audio Recorder section */}
      <AudioRecorder warehouseId={warehouseId} onSuccess={loadData} />

      {/* Voice Notes List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-orange-600" />
            <span>Lời Nhắn Voice Chỉ Đường ({voiceNotes.length})</span>
          </h2>
          <span className="text-[11px] text-slate-500 font-medium">
            Xếp theo độ tin cậy
          </span>
        </div>

        {voiceNotes.length > 0 ? (
          <div className="space-y-3">
            {voiceNotes.map((note) => (
              <VoiceNoteCard
                key={note.id}
                note={note}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                onVoteChange={loadData}
                onDelete={loadData}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center text-slate-500">
            <Volume2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold">
              Chưa có bác tài nào để lại lời nhắn chỉ đường cho kho này.
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Hãy thu âm ở khung phía trên để giúp đồng nghiệp sau không bị lạc!
            </p>
          </div>
        )}
      </div>

      {/* Report Warehouse Modal */}
      {showReportWarehouse && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setShowReportWarehouse(false)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl p-4 sm:p-5 shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-red-600 mb-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="font-bold text-sm">Báo cáo kho không đúng</h4>
            </div>

            {reportSuccess ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-xs space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Đã gửi báo cáo cho quản trị viên kiểm tra!</span>
                </div>
                <p className="text-[11px] text-emerald-700 pl-6">
                  Bạn có thể theo dõi tiến độ xử lý báo cáo tại mục Hồ Sơ cá nhân.
                </p>
              </div>
            ) : (
              <form onSubmit={handleReportWarehouse} className="space-y-3">
                <textarea
                  required
                  rows={3}
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Lý do: Kho đã giải tỏa, sai vị trí bản đồ, trùng lặp..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-base sm:text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                />

                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowReportWarehouse(false)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 active:scale-95 transition"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 active:scale-95 transition"
                  >
                    Gửi báo cáo
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* Thank Pinner VietQR Modal */}
      {warehouse.creator && (
        <VietQRModal
          isOpen={showPinnerQRModal}
          onClose={() => setShowPinnerQRModal(false)}
          driverName={warehouse.creator.full_name}
          bankName={warehouse.creator.bank_name}
          bankAccountNo={warehouse.creator.bank_account_no}
          bankAccountName={warehouse.creator.bank_account_name}
          title="Cảm Ơn Người Ghim Kho"
          subtitle={
            <>
              Gửi chút cà phê cảm ơn bác tài{' '}
              <strong className="text-orange-600">{warehouse.creator.full_name}</strong> đã ghim kho {warehouse.name}!
            </>
          }
          transferMessage="Cam on bac tai ghim kho"
        />
      )}

      {/* Fullscreen Photo Lightbox Modal */}
      {zoomedPhoto && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          onClick={() => setZoomedPhoto(null)}
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setZoomedPhoto(null)}
              className="absolute -top-12 right-0 p-2 text-white hover:text-slate-300 rounded-full bg-white/10 hover:bg-white/20 transition active:scale-95"
            >
              <X className="w-6 h-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomedPhoto}
              alt="Ảnh phóng to"
              className="max-h-[85vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function WarehouseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <WarehouseDetailContent paramsPromise={params} />
    </Suspense>
  );
}
