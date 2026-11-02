'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { recalculateReputation } from '@/lib/utils/adminActions';
import { Mic, Square, Play, Pause, Trash2, Send, AlertCircle, CheckCircle } from 'lucide-react';

interface AudioRecorderProps {
  warehouseId: string;
  onSuccess: () => void;
}

export function AudioRecorder({ warehouseId, onSuccess }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const supabase = createClient();
  const MAX_SECONDS = 60;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function startRecording() {
    setErrorMsg(null);
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '',
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // Stop all audio tracks to turn off mic light
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(250); // Slice every 250ms
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= MAX_SECONDS - 1) {
            stopRecording();
            return MAX_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: unknown) {
      console.error('MediaRecorder error:', err);
      setErrorMsg('Không thể truy cập Microphone. Vui lòng cho phép quyền ghi âm trên trình duyệt.');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsRecording(false);
  }

  function togglePlayPreview() {
    if (!previewAudioRef.current) return;
    if (isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current.play();
      setIsPlayingPreview(true);
    }
  }

  function resetRecording() {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setIsPlayingPreview(false);
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingSeconds(0);
  }

  async function handleSubmit() {
    if (!audioBlob) {
      setErrorMsg('Chưa có đoạn ghi âm nào.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMsg('Vui lòng đăng nhập để gửi lời nhắn chỉ đường.');
        setSubmitting(false);
        return;
      }

      // 1. Upload audio file to Supabase Storage
      const fileExt = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
      const fileName = `${warehouseId}/${user.id}_${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('voice-notes')
        .upload(fileName, audioBlob, {
          contentType: audioBlob.type || 'audio/webm',
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('voice-notes').getPublicUrl(uploadData.path);

      // 2. Insert into voice_notes table
      const { error: dbError } = await supabase.from('voice_notes').insert({
        warehouse_id: warehouseId,
        user_id: user.id,
        audio_url: publicUrl,
        duration_seconds: recordingSeconds || 1,
        note_text: noteText.trim() || null,
        status: 'active',
      });

      if (dbError) {
        throw new Error(dbError.message);
      }

      // 3. Cập nhật lại điểm cống hiến cho tài xế (+5 điểm khi đóng góp voice)
      try {
        await recalculateReputation(supabase, user.id);
      } catch (repErr) {
        console.warn('Lỗi cập nhật điểm cống hiến voice:', repErr);
      }

      // Reset form and notify parent
      resetRecording();
      setNoteText('');
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đã có lỗi xảy ra';
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  }

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3.5 sm:space-y-4">
      <div className="space-y-1">
        <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 sm:gap-2">
          <Mic className="w-4 h-4 text-orange-600 shrink-0" />
          <span>Thu Âm Voice Chỉ Đường</span>
        </h3>
        <p className="text-[10px] sm:text-[11px] font-medium text-slate-400">
          Tối đa 60 giây
        </p>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Hãy nói rõ: Tên cổng phụ, ngõ rẽ, đối diện biển hiệu gì, lưu ý cấm xe tải hoặc giờ cấm đường...
      </p>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Recording Stage */}
      {!audioBlob ? (
        <div className="flex flex-col items-center justify-center py-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          {isRecording ? (
            <div className="flex flex-col items-center gap-3 w-full px-4">
              <div className="flex items-center gap-2 font-mono text-2xl font-black text-red-600">
                <span className="w-3.5 h-3.5 rounded-full bg-red-600 animate-ping" />
                <span>{formatTimer(recordingSeconds)}</span>
                <span className="text-xs text-slate-400 font-normal">/ 01:00</span>
              </div>

              {/* Sound wave simulation */}
              <div className="flex items-center gap-1.5 h-8">
                {[...Array(9)].map((_, i) => (
                  <span
                    key={i}
                    className="w-1 bg-red-500 rounded-full animate-wave-bar"
                    style={{
                      animationDelay: `${(i * 0.15).toFixed(2)}s`,
                    }}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={stopRecording}
                className="mt-2 min-h-[46px] w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 transition active:scale-95 text-xs sm:text-sm"
              >
                <Square className="w-4 h-4 sm:w-5 sm:h-5 fill-white shrink-0" />
                <span>Dừng & Nghe thử</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={startRecording}
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-orange-600 hover:bg-orange-700 text-white shadow-xl shadow-orange-500/30 flex items-center justify-center transition active:scale-90"
                title="Bấm để bắt đầu thu âm"
              >
                <Mic className="w-9 h-9" />
              </button>
              <span className="text-xs font-bold text-slate-700">
                Chạm micro để bắt đầu nói
              </span>
            </div>
          )}
        </div>
      ) : (
        /* Preview & Submit Stage */
        <div className="space-y-3.5 bg-orange-50/50 p-3.5 sm:p-4 rounded-2xl border border-orange-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-orange-900 flex items-center gap-1">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Đã thu xong ({formatTimer(recordingSeconds)})</span>
            </span>

            <button
              type="button"
              onClick={resetRecording}
              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition active:scale-95"
              title="Xóa và thu âm lại"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Audio Player */}
          {audioUrl && (
            <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-orange-200 shadow-xs">
              <button
                type="button"
                onClick={togglePlayPreview}
                className="w-10 h-10 rounded-full bg-orange-600 text-white flex items-center justify-center shadow-sm shrink-0 active:scale-95 transition"
              >
                {isPlayingPreview ? (
                  <Pause className="w-5 h-5 fill-white" />
                ) : (
                  <Play className="w-5 h-5 fill-white ml-0.5" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-slate-800 block truncate">
                  Bản thu âm hướng dẫn ({recordingSeconds}s)
                </span>
                <span className="text-[11px] text-slate-500">
                  {isPlayingPreview ? 'Đang phát...' : 'Bấm để nghe thử'}
                </span>
              </div>

              <audio
                ref={previewAudioRef}
                src={audioUrl}
                onEnded={() => setIsPlayingPreview(false)}
                className="hidden"
              />
            </div>
          )}

          {/* Optional Note Text */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Ghi chú tóm tắt bằng chữ (tùy chọn)
            </label>
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="VD: Cổng vào ngõ số 8, xe 2.5T quay đầu thoải mái"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2 pt-1">
            <button
              type="button"
              onClick={resetRecording}
              className="min-h-[44px] py-2.5 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition active:scale-95 text-center"
            >
              Thu âm lại
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="flex-1 min-h-[44px] py-2.5 px-4 bg-orange-600 hover:bg-orange-700 active:scale-[0.99] text-white rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 text-center"
            >
              {submitting ? (
                <span>Đang tải lên...</span>
              ) : (
                <>
                  <Send className="w-4 h-4 shrink-0" />
                  <span>Chia Sẻ Chỉ Dẫn (+5đ ⭐)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
