'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogIn, AlertCircle, ArrowRight } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(
          error.message === 'Invalid login credentials'
            ? 'Email hoặc mật khẩu không chính xác'
            : error.message
        );
        return;
      }

      // Full page redirect ensures freshly set session cookies are recognized by middleware & RootLayout
      window.location.href = redirectTo;
    } catch {
      setErrorMsg('Đã xảy ra lỗi khi đăng nhập. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md bg-white rounded-2xl p-5 sm:p-8 shadow-xs border border-slate-200">
      <div className="text-center mb-5 sm:mb-6">
        <div className="inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-orange-100 text-orange-600 mb-2.5 shadow-xs">
          <LogIn className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Đăng Nhập Tài Xế</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Đăng nhập để chia sẻ vị trí kho bãi và thu âm chỉ dẫn
        </p>
      </div>

      {errorMsg && (
        <div className="mb-4 sm:mb-5 p-3 sm:p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-xs sm:text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="taixe@gmail.com"
            className="w-full px-3.5 sm:px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-base sm:text-sm bg-slate-50 focus:bg-white transition"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Mật khẩu
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3.5 sm:px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-base sm:text-sm bg-slate-50 focus:bg-white transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 min-h-[48px] py-3.5 px-4 bg-orange-600 hover:bg-orange-700 active:scale-[0.99] text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
        >
          {loading ? (
            <span>Đang kiểm tra thông tin...</span>
          ) : (
            <>
              <span>Đăng nhập ngay</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-slate-100 text-center text-xs sm:text-sm text-slate-600">
        Chưa có tài khoản?{' '}
        <Link
          href={`/register${redirectTo !== '/' ? `?redirectTo=${redirectTo}` : ''}`}
          className="font-bold text-orange-600 hover:underline p-1"
        >
          Đăng ký tài xế mới
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-xs text-slate-500">Đang tải biểu mẫu...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
