'use client';

import { ShieldBan } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function BannedPage() {
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div className="flex-1 flex items-center justify-center p-3.5 sm:p-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-5 sm:p-8 shadow-xs border border-red-200 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-100 text-red-600 mb-3.5 shadow-xs">
          <ShieldBan className="w-7 h-7 sm:w-8 sm:h-8" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Tài Khoản Đã Bị Khóa</h1>
        <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
          Tài khoản của bạn đã bị quản trị viên tạm khóa do nhận được nhiều báo cáo vi phạm
          hoặc cung cấp thông tin dẫn đường không chính xác.
        </p>

        <button
          onClick={handleLogout}
          className="w-full min-h-[48px] py-3 px-4 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 active:scale-[0.99] transition text-sm"
        >
          Đăng xuất tài khoản
        </button>
      </div>
    </div>
  );
}
