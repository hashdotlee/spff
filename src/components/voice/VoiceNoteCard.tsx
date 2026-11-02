'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import type { VoiceNote, Profile, UserRole } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import { VietQRModal } from '@/components/donation/VietQRModal';
import { deleteVoiceNote } from '@/lib/utils/adminActions';
import {
  Play,
  Pause,
  ThumbsUp,
  ThumbsDown,
  Flag,
  Heart,
  Volume2,
  AlertTriangle,
  Check,
  Trash2,
} from 'lucide-react';

interface VoiceNoteCardProps {
  note: VoiceNote;
  currentUserId?: string | null;
  currentUserRole?: UserRole | null;
  onVoteChange?: () => void;
  onDelete?: (noteId: string) => void | Promise<void>;
}

export function VoiceNoteCard({
  note,
  currentUserId,
  currentUserRole,
  onVoteChange,
  onDelete,
}: VoiceNoteCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [userVote, setUserVote] = useState<number | null>(note.user_vote || null);
  const [upvotes, setUpvotes] = useState(note.upvotes_count || 0);
  const [downvotes, setDownvotes] = useState(note.downvotes_count || 0);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reported, setReported] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const supabase = createClient();

  const author = note.user;

  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }

  function handleTimeUpdate() {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    const dur = audioRef.current.duration || note.duration_seconds || 1;
    setCurrentTime(cur);
    setProgress((cur / dur) * 100);
  }

  function handleEnded() {
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  }

  async function handleVote(voteVal: 1 | -1) {
    if (!currentUserId) {
      alert('Vui lòng đăng nhập để đánh giá chỉ dẫn!');
      return;
    }

    try {
      if (userVote === voteVal) {
        // Remove vote
        await supabase
          .from('voice_votes')
          .delete()
          .eq('voice_note_id', note.id)
          .eq('user_id', currentUserId);

        setUserVote(null);
        if (voteVal === 1) setUpvotes((prev) => Math.max(0, prev - 1));
        else setDownvotes((prev) => Math.max(0, prev - 1));
      } else {
        // Upsert vote
        await supabase.from('voice_votes').upsert(
          {
            voice_note_id: note.id,
            user_id: currentUserId,
            vote_value: voteVal,
          },
          { onConflict: 'voice_note_id,user_id' }
        );

        if (userVote === 1) setUpvotes((prev) => Math.max(0, prev - 1));
        if (userVote === -1) setDownvotes((prev) => Math.max(0, prev - 1));

        if (voteVal === 1) setUpvotes((prev) => prev + 1);
        else setDownvotes((prev) => prev + 1);

        setUserVote(voteVal);
      }

      onVoteChange?.();
    } catch (err) {
      console.error('Error voting:', err);
    }
  }

  async function handleSubmitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId) {
      alert('Vui lòng đăng nhập để báo cáo!');
      return;
    }

    try {
      await supabase.from('reports').insert({
        reporter_id: currentUserId,
        reported_user_id: note.user_id,
        voice_note_id: note.id,
        reason: reportReason.trim() || 'Chỉ đường sai hoặc nội dung phản cảm',
        status: 'pending',
      });
      setReported(true);
      setTimeout(() => {
        setShowReportModal(false);
        setReported(false);
        setReportReason('');
      }, 2200);
    } catch (err) {
      console.error('Error reporting:', err);
    }
  }

  async function handleDelete() {
    const confirmMsg =
      currentUserRole === 'admin'
        ? 'Bạn có chắc chắn muốn XÓA chỉ dẫn này với quyền Quản trị viên (Admin)?'
        : 'Bạn có chắc chắn muốn xóa lời nhắn chỉ đường của mình không?';
    if (!confirm(confirmMsg)) return;

    setIsDeleting(true);
    try {
      await deleteVoiceNote(supabase, note.id, note.audio_url);
      if (onDelete) {
        await onDelete(note.id);
      } else {
        onVoteChange?.();
      }
    } catch (err) {
      console.error('Lỗi khi xóa chỉ dẫn:', err);
      alert('Không thể xóa chỉ dẫn. Vui lòng thử lại!');
    } finally {
      setIsDeleting(false);
    }
  }

  const formatSecs = (secs: number) => {
    const s = Math.floor(secs);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-xs hover:border-orange-200 transition space-y-3">
      {/* Audio Element */}
      <audio
        ref={audioRef}
        src={note.audio_url}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="metadata"
        className="hidden"
      />

      {/* Driver info header */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <Link
            href={author ? `/profile/${author.id}` : '#'}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0 overflow-hidden active:scale-95 transition"
          >
            {author?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={author.avatar_url}
                alt={author.full_name}
                className="w-full h-full object-cover"
              />
            ) : (
              author?.full_name?.[0]?.toUpperCase() || 'TX'
            )}
          </Link>

          <div className="min-w-0">
            <Link
              href={author ? `/profile/${author.id}` : '#'}
              className="text-xs font-bold text-slate-900 hover:text-orange-600 transition truncate block"
            >
              {author?.full_name || 'Đồng nghiệp'}
            </Link>
            <span className="text-[10px] text-slate-400 block -mt-0.5">
              {new Date(note.created_at).toLocaleDateString('vi-VN')}
            </span>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition active:scale-95"
            title="Báo cáo vi phạm"
          >
            <Flag className="w-3.5 h-3.5" />
          </button>

          {(currentUserRole === 'admin' || currentUserId === note.user_id) && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition active:scale-95 disabled:opacity-50"
              title={
                currentUserRole === 'admin'
                  ? 'Quản trị viên xóa chỉ dẫn này'
                  : 'Xóa chỉ dẫn của bạn'
              }
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Note text if any */}
      {note.note_text && (
        <div className="p-2.5 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-100 font-medium leading-relaxed">
          &ldquo;{note.note_text}&rdquo;
        </div>
      )}

      {/* Playback & Progress Bar */}
      <div className="p-2 sm:p-2.5 bg-orange-50/60 rounded-xl border border-orange-100 flex items-center gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center shrink-0 shadow-xs transition active:scale-95"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-white" />
          ) : (
            <Play className="w-4 h-4 fill-white ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          {/* Progress track */}
          <div className="w-full bg-orange-200/70 h-2 rounded-full overflow-hidden cursor-pointer">
            <div
              className="bg-orange-600 h-full rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mt-1">
            <span>{formatSecs(currentTime)}</span>
            <span className="flex items-center gap-1">
              <Volume2 className="w-3 h-3 text-orange-600 shrink-0" />
              <span>{formatSecs(note.duration_seconds)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Upvote & Downvote buttons */}
      <div className="flex items-center justify-between pt-1 gap-2 text-xs">
        <span className="text-[11px] text-slate-500 font-medium truncate">
          Chỉ dẫn chuẩn không?
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleVote(1)}
            className={`min-h-[36px] px-2.5 py-1 rounded-xl border font-bold flex items-center gap-1 transition active:scale-95 ${
              userVote === 1
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'
            }`}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            <span>+{upvotes}</span>
          </button>

          <button
            type="button"
            onClick={() => handleVote(-1)}
            className={`min-h-[36px] px-2.5 py-1 rounded-xl border font-bold flex items-center gap-1 transition active:scale-95 ${
              userVote === -1
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300'
            }`}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
            <span>-{downvotes}</span>
          </button>
        </div>
      </div>

      {/* Thank you button row */}
      {author && (
        <div className="pt-2 border-t border-slate-100 flex flex-col xs:flex-row xs:items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 font-medium">
            Chỉ dẫn hữu ích với chuyến hàng của bạn?
          </span>
          <button
            type="button"
            onClick={() => setShowQRModal(true)}
            className="w-full xs:w-auto min-h-[34px] px-3 py-1.5 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs shrink-0"
            title="Mời cà phê cảm ơn người hướng dẫn qua VietQR"
          >
            <Heart className="w-3.5 h-3.5 fill-rose-600 text-rose-600 shrink-0" />
            <span>
              {currentUserId === note.user_id
                ? 'Cảm ơn người hướng dẫn (Mã của bạn)'
                : 'Cảm ơn người hướng dẫn'}
            </span>
          </button>
        </div>
      )}

      {/* Thank Guide VietQR Modal */}
      {author && (
        <VietQRModal
          isOpen={showQRModal}
          onClose={() => setShowQRModal(false)}
          driverName={author.full_name}
          bankName={author.bank_name}
          bankAccountNo={author.bank_account_no}
          bankAccountName={author.bank_account_name}
          title={
            currentUserId === note.user_id
              ? 'Mã VietQR Của Bạn'
              : 'Cảm Ơn Người Hướng Dẫn'
          }
          subtitle={
            currentUserId === note.user_id ? (
              <>
                Đây là mã VietQR của bạn hiển thị cho các đồng nghiệp khác khi họ cảm ơn.
              </>
            ) : (
              <>
                Gửi chút cà phê cảm ơn bác tài{' '}
                <strong className="text-orange-600">{author.full_name}</strong> vì lời chỉ dẫn hữu ích!
              </>
            )
          }
          transferMessage="Cam on chi dan bac tai"
        />
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setShowReportModal(false)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl p-4 sm:p-5 shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-red-600 mb-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="font-bold text-sm">Báo cáo chỉ dẫn không đúng</h4>
            </div>

            {reported ? (
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
              <form onSubmit={handleSubmitReport} className="space-y-3">
                <textarea
                  required
                  rows={3}
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Lý do: Đường cụt xe không vào được, thông tin sai lệch..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-base sm:text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                />

                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
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
    </div>
  );
}
