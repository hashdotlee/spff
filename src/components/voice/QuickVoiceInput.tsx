'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Trash2, CheckCircle2, Volume2, AlertCircle } from 'lucide-react';

interface QuickVoiceInputProps {
  label?: string;
  helperText?: string;
  maxSeconds?: number;
  onAudioChange: (blob: Blob | null, durationSeconds: number) => void;
  accentColor?: 'orange' | 'red';
}

export function QuickVoiceInput({
  label = 'Ghi âm chỉ dẫn bằng giọng nói',
  helperText = 'Bác tài chỉ cần nói tên ngõ, số nhà, cổng vào hoặc tình trạng cần cứu hộ.',
  maxSeconds = 60,
  onAudioChange,
  accentColor = 'orange',
}: QuickVoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const isRed = accentColor === 'red';

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
        onAudioChange(blob, recordingSeconds || 1);

        // Turn off mic stream immediately
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= maxSeconds - 1) {
            stopRecording();
            return maxSeconds;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: unknown) {
      console.error('Microphone error:', err);
      setErrorMsg('Không thể truy cập Microphone. Vui lòng cấp quyền ghi âm.');
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
    onAudioChange(null, 0);
  }

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Mic className={`w-3.5 h-3.5 ${isRed ? 'text-red-600' : 'text-orange-600'} shrink-0`} />
          <span>{label}</span>
        </label>
        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
          <span>(Tùy chọn)</span>
          <span>•</span>
          <span>Tối đa {maxSeconds}s</span>
        </div>
        {helperText && !audioBlob && !isRecording && (
          <p className="text-[11px] text-slate-500 leading-tight pt-0.5">{helperText}</p>
        )}
      </div>

      {errorMsg && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* State 1: Chưa thu âm & Đang thu âm */}
      {!audioBlob ? (
        <div>
          {isRecording ? (
            <div className="p-3.5 bg-red-50/90 border-2 border-red-300 rounded-2xl flex flex-col items-center gap-2.5 animate-in fade-in">
              <div className="flex items-center gap-2 font-mono text-xl font-black text-red-600">
                <span className="w-3 h-3 rounded-full bg-red-600 animate-ping" />
                <span>{formatTimer(recordingSeconds)}</span>
                <span className="text-xs text-slate-400 font-normal">/ 01:00</span>
              </div>

              {/* Sound wave bars */}
              <div className="flex items-center gap-1.5 h-6">
                {[...Array(9)].map((_, i) => (
                  <span
                    key={i}
                    className="w-1 bg-red-500 rounded-full animate-wave-bar"
                    style={{ animationDelay: `${(i * 0.12).toFixed(2)}s` }}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={stopRecording}
                className="w-full min-h-[44px] py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition active:scale-95 text-xs cursor-pointer"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>Dừng & Nghe Lại</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              className={`w-full min-h-[48px] py-3 px-4 border-2 border-dashed rounded-2xl flex items-center justify-center gap-2.5 transition active:scale-98 cursor-pointer ${
                isRed
                  ? 'border-red-200 hover:border-red-400 bg-red-50/40 hover:bg-red-50/80 text-red-700'
                  : 'border-orange-200 hover:border-orange-400 bg-orange-50/40 hover:bg-orange-50/80 text-orange-700'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-xs ${
                  isRed ? 'bg-red-600' : 'bg-orange-600'
                }`}
              >
                <Mic className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-xs font-bold block">Chạm Để Thu Âm Chỉ Dẫn</span>
                <span className="text-[10px] text-slate-500 block -mt-0.5">
                  Nói bằng giọng nói sẽ nhanh hơn gõ chữ
                </span>
              </div>
            </button>
          )}
        </div>
      ) : (
        /* State 2: Đã có file âm thanh preview */
        <div
          className={`p-3 rounded-2xl border flex items-center justify-between gap-2.5 ${
            isRed ? 'bg-red-50/60 border-red-200' : 'bg-orange-50/60 border-orange-200'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={togglePlayPreview}
              className={`w-9 h-9 rounded-full text-white flex items-center justify-center shadow-xs shrink-0 active:scale-95 transition cursor-pointer ${
                isRed ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'
              }`}
              title={isPlayingPreview ? 'Tạm dừng' : 'Nghe thử'}
            >
              {isPlayingPreview ? (
                <Pause className="w-4 h-4 fill-white" />
              ) : (
                <Play className="w-4 h-4 fill-white ml-0.5" />
              )}
            </button>

            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Đã có lời nhắn ({formatTimer(recordingSeconds)})</span>
              </span>
              <span className="text-[10px] text-slate-500 block truncate">
                {isPlayingPreview ? 'Đang phát...' : 'Bấm nút để nghe lại lời nhắn'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={resetRecording}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition active:scale-95 shrink-0 cursor-pointer"
            title="Xóa và thu âm lại"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {audioUrl && (
            <audio
              ref={previewAudioRef}
              src={audioUrl}
              onEnded={() => setIsPlayingPreview(false)}
              className="hidden"
            />
          )}
        </div>
      )}
    </div>
  );
}
