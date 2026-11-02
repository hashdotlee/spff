'use client';

import { useState, useEffect } from 'react';
import { Download, Share, PlusSquare, X, Smartphone, Zap, Sparkles, CheckCircle2 } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [installedSuccessfully, setInstalledSuccessfully] = useState(false);

  useEffect(() => {
    // 1. Đăng ký Service Worker để Chrome kích hoạt tiêu chuẩn PWA
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.warn('PWA ServiceWorker error:', err));
    }

    // 2. Kiểm tra nếu app ĐÃ ĐƯỢC CÀI ĐẶT và đang chạy dạng standalone
    const checkIsStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.startsWith('android-app://');
      return isStandaloneMode;
    };

    if (checkIsStandalone()) {
      setIsStandalone(true);
      return; // Đã cài đặt và đang mở dạng App -> không hiện prompt
    }

    // 3. Nhận diện thiết bị iOS
    const userAgent = window.navigator.userAgent || '';
    const isIOSDevice =
      /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // 4. Bắt sự kiện beforeinstallprompt trên Chromium (Android Chrome, Edge, Cốc Cốc, Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Bắt sự kiện appinstalled khi người dùng đã cài đặt thành công
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setShowPrompt(false);
      setInstalledSuccessfully(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // 5. Nếu chưa cài đặt: Tự động hiển thị prompt sau 1.2s mở app
    const timer = setTimeout(() => {
      if (!checkIsStandalone()) {
        setShowPrompt(true);
      }
    }, 1200);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearTimeout(timer);
    };
  }, []);

  async function handleInstallClick() {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setInstalledSuccessfully(true);
          setShowPrompt(false);
        }
      } catch (err) {
        console.warn('Lỗi khi kích hoạt install prompt:', err);
      } finally {
        setDeferredPrompt(null);
      }
    } else {
      // Nếu không có deferredPrompt (ví dụ đã từ chối trước đó trên trình duyệt hoặc trình duyệt ẩn prompt)
      // Thông báo người dùng bấm menu trình duyệt
      alert('Bác tài vui lòng bấm vào nút Menu (biểu tượng 3 chấm ⋮ ở góc trên trình duyệt) ➔ Chọn "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính" nhé!');
    }
  }

  // Đang chạy dạng standalone app hoặc không kích hoạt hiển thị -> ẩn component
  if (isStandalone || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl p-5 pb-7 sm:p-6 overflow-hidden animate-in slide-in-from-bottom-6 duration-300 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút đóng */}
        <button
          type="button"
          onClick={() => setShowPrompt(false)}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition active:scale-95 cursor-pointer z-10"
          title="Để sau"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header với Icon App */}
        <div className="flex items-center gap-3.5 mb-3.5">
          <div className="relative w-14 h-14 rounded-2xl overflow-hidden shadow-md shrink-0 border border-orange-200 bg-orange-600 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/icon-192.png"
              alt="SPFF Icon"
              className="w-full h-full object-cover"
              onError={(e) => {
                // fallback to svg icon if png not loaded
                (e.target as HTMLImageElement).src = '/icons/icon.svg';
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Cài ứng dụng về máy
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight mt-0.5">
              Cài SPFF Ra Màn Hình
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Dẫn đường kho bãi, nghe chỉ dẫn nhanh như App thật
            </p>
          </div>
        </div>

        {/* Lợi ích khi cài app */}
        <div className="grid grid-cols-2 gap-2 mb-4 p-2.5 bg-gradient-to-r from-orange-50/80 via-amber-50/60 to-orange-50/80 rounded-2xl border border-orange-100 text-xs">
          <div className="flex items-center gap-2 text-slate-800 font-bold">
            <Zap className="w-4 h-4 text-orange-600 shrink-0" />
            <span>Mở 1 chạm tức thì</span>
          </div>
          <div className="flex items-center gap-2 text-slate-800 font-bold">
            <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Toàn màn hình không che</span>
          </div>
        </div>

        {/* Hướng dẫn cài đặt theo hệ điều hành */}
        {isIOS ? (
          /* Hướng dẫn cho iPhone / iPad (Safari) */
          <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 mb-4 text-xs">
            <p className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
              <Share className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Cách cài trên iPhone / iPad (Safari):</span>
            </p>
            <ol className="space-y-2 text-[11.5px] text-slate-700 leading-relaxed list-decimal list-inside font-medium">
              <li>
                Bấm vào nút <strong className="text-slate-950 font-bold">Chia sẻ</strong> (biểu tượng ô vuông có mũi tên lên <Share className="w-3.5 h-3.5 inline text-blue-600" /> ở thanh dưới màn hình Safari).
              </li>
              <li>
                Cuộn xuống và chọn <strong className="text-slate-950 font-bold">"Thêm vào MH chính"</strong> (Add to Home Screen <PlusSquare className="w-3.5 h-3.5 inline text-slate-800" />).
              </li>
              <li>
                Bấm nút <strong className="text-orange-600 font-bold">"Thêm" (Add)</strong> ở góc trên bên phải để hoàn tất.
              </li>
            </ol>
          </div>
        ) : (
          /* Android / Chrome: Nút cài đặt 1 chạm */
          <div className="space-y-2 mb-4">
            <button
              type="button"
              onClick={handleInstallClick}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 active:scale-[0.99] text-white font-black rounded-2xl shadow-lg shadow-orange-500/25 transition flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <Download className="w-5 h-5 animate-bounce shrink-0" />
              <span>CÀI ĐẶT ỨNG DỤNG NGAY (MIỄN PHÍ)</span>
            </button>
            <p className="text-[10px] text-center text-slate-400">
              Không tốn dung lượng máy • Cập nhật tự động
            </p>
          </div>
        )}

        {/* Nút bỏ qua / để sau */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => setShowPrompt(false)}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 py-1 px-3 transition cursor-pointer"
          >
            Để sau (Dùng tiếp trên trình duyệt web)
          </button>
        </div>
      </div>
    </div>
  );
}
