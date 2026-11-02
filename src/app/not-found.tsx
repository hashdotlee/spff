import Link from 'next/link';
import { MapPinOff, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-6 border border-slate-200 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto">
          <MapPinOff className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-black text-slate-900 tracking-tight">
            Không tìm thấy trang (404)
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Đường dẫn không tồn tại hoặc đã được di chuyển.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition active:scale-95 shadow-xs cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Quay lại trang chủ</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
