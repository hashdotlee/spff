'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { UserPlus, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const supabase = createClient();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (password.length < 6) {
      setErrorMsg('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim() || 'Tài xế mới',
          },
        },
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data.user) {
        if (phone.trim()) {
          await supabase
            .from('profiles')
            .update({ phone: phone.trim() })
            .eq('id', data.user.id);
        }

        if (data.session) {
          window.location.href = redirectTo;
          return;
        }

        setSuccessMsg(
          'Đăng ký thành công! Bạn có thể đăng nhập ngay hoặc kiểm tra hòm thư nếu có yêu cầu xác thực.'
        );
      }
    } catch {
      setErrorMsg('Đã xảy ra lỗi khi tạo tài khoản. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md bg-white rounded-2xl p-5 sm:p-8 shadow-xs border border-slate-200">
      <div className="text-center mb-5 sm:mb-6">
        <div className="inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-orange-100 text-orange-600 mb-2.5 shadow-xs">
          <UserPlus className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Gia Nhập Cộng Đồng</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Đăng ký tài khoản để đóng góp chỉ dẫn và nhận donate cảm ơn
        </p>
      </div>

      {errorMsg && (
        <div className="mb-4 sm:mb-5 p-3 sm:p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-xs sm:text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 sm:mb-5 p-3 sm:p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-800 text-xs sm:text-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{successMsg}</p>
            <Link
              href="/login"
              className="mt-2 inline-block font-bold text-emerald-900 underline p-1"
            >
              Chuyển tới màn hình đăng nhập &rarr;
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Họ & Tên hiển thị *
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="VD: Nguyễn Văn Nam (Tài xế Hà Nội)"
            className="w-full px-3.5 sm:px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-base sm:text-sm bg-slate-50 focus:bg-white transition"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Email *
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
            Mật khẩu (tối thiểu 6 ký tự) *
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

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Số điện thoại liên hệ (không bắt buộc)
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0912345678"
            className="w-full px-3.5 sm:px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-base sm:text-sm bg-slate-50 focus:bg-white transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 min-h-[48px] py-3.5 px-4 bg-orange-600 hover:bg-orange-700 active:scale-[0.99] text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
        >
          {loading ? (
            <span>Đang tạo tài khoản...</span>
          ) : (
            <>
              <span>Hoàn tất đăng ký</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-slate-100 text-center text-sm text-slate-600">
        Đã có tài khoản?{' '}
        <Link
          href={`/login${redirectTo !== '/' ? `?redirectTo=${redirectTo}` : ''}`}
          className="font-bold text-orange-600 hover:underline"
        >
          Đăng nhập ngay
        </Link>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-xs text-slate-500">Đang tải biểu mẫu...</div>}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
