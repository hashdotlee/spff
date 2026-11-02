'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { POPULAR_BANKS, getVietQRImageUrl, cleanAccountNumber } from '@/lib/utils/vietqr';
import type { Profile } from '@/types/database';
import {
  User,
  Phone,
  CreditCard,
  Building2,
  CheckCircle2,
  AlertCircle,
  Save,
  QrCode,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

export default function EditProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      try {
        setLoading(true);
        setErrorMsg(null);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (isMounted) {
            setLoading(false);
            router.push('/login?redirectTo=/profile/edit');
          }
          return;
        }

        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.warn('Lỗi tải dữ liệu profile:', profileError);
        }

        if (!isMounted) return;

        const userProfile: Profile = (data as Profile) || {
          id: user.id,
          email: user.email || '',
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Tài xế',
          phone: null,
          avatar_url: null,
          role: 'user',
          is_banned: false,
          bank_name: 'MB',
          bank_account_no: null,
          bank_account_name: null,
          reputation_score: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        setProfile(userProfile);
        setFullName(userProfile.full_name || '');
        setPhone(userProfile.phone || '');
        setBankName(userProfile.bank_name || 'MB');
        setBankAccountNo(userProfile.bank_account_no || '');
        setBankAccountName(userProfile.bank_account_name || '');
        setAvatarUrl(userProfile.avatar_url || '');
      } catch (err: any) {
        console.error('Lỗi khi tải thông tin tài xế:', err);
        if (isMounted) {
          setErrorMsg('Không thể tải thông tin hồ sơ. Vui lòng thử lại.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [supabase, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: profile.id,
          email: profile.email || '',
          full_name: fullName.trim() || 'Tài xế',
          phone: phone.trim() || null,
          bank_name: bankName.trim() || null,
          bank_account_no: bankAccountNo.trim() || null,
          bank_account_name: bankAccountName.trim().toUpperCase() || null,
          avatar_url: avatarUrl.trim() || null,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg('Đã lưu thông tin thành công!');
      setTimeout(() => {
        router.push(`/profile/${profile.id}`);
      }, 1000);
    } catch {
      setErrorMsg('Đã xảy ra lỗi khi lưu thông tin.');
    } finally {
      setSaving(false);
    }
  }

  const cleanAccount = cleanAccountNumber(bankAccountNo);
  const previewQR =
    bankName && cleanAccount.length >= 3
      ? getVietQRImageUrl({
          bankName,
          accountNo: cleanAccount,
          accountName: bankAccountName,
          message: 'Cam on dong nghiep',
        })
      : null;

  useEffect(() => {
    if (previewQR) {
      setQrLoading(true);
      setQrError(false);
    }
  }, [previewQR]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4 sm:p-8 max-w-md mx-auto w-full text-center space-y-4">
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <AlertCircle className="w-10 h-10 text-orange-500 mx-auto" />
          <h2 className="text-base font-bold text-slate-800">Chưa đăng nhập</h2>
          <p className="text-xs text-slate-500">
            Vui lòng đăng nhập tài khoản tài xế để cài đặt thông tin cá nhân và mã VietQR nhận tiền cảm ơn.
          </p>
          <Link
            href="/login?redirectTo=/profile/edit"
            className="inline-block px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition active:scale-95 shadow-xs"
          >
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-xl mx-auto w-full">
      <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-6">
        <Link
          href={profile ? `/profile/${profile.id}` : '/'}
          className="p-2 -ml-1.5 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
          Cài Đặt Hồ Sơ & VietQR
        </h1>
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
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5 sm:space-y-6 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        {/* Basic Info */}
        <div className="space-y-3.5 sm:space-y-4">
          <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-orange-600" />
            <span>Thông tin cá nhân</span>
          </h2>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Họ và tên *</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span>Số điện thoại</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0912345678"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Bank & VietQR Donate Info */}
        <div className="space-y-3.5 sm:space-y-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-orange-600" />
              <span>Thông tin VietQR Donate</span>
            </h2>
            <span className="text-[10px] sm:text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
              Nhận tiền cảm ơn
            </span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Khi bạn chia sẻ lời nhắn chỉ đường hữu ích, các tài xế khác có thể quét mã VietQR để gửi lời cảm ơn và tiền tip trực tiếp vào tài khoản ngân hàng của bạn.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Ngân hàng thụ hưởng</span>
            </label>
            <select
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white"
            >
              <option value="">-- Chọn ngân hàng --</option>
              {POPULAR_BANKS.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Số tài khoản ngân hàng
            </label>
            <input
              type="text"
              value={bankAccountNo}
              onChange={(e) => setBankAccountNo(e.target.value.replace(/[\s.-]/g, ''))}
              placeholder="VD: 0988888888"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none font-mono"
            />
            {bankAccountNo.trim() && !bankName && (
              <p className="text-[11px] text-amber-600 font-semibold mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Vui lòng chọn ngân hàng thụ hưởng ở trên để tạo mã VietQR</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Tên chủ tài khoản (Không dấu)
            </label>
            <input
              type="text"
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value.toUpperCase())}
              placeholder="VD: NGUYEN VAN A"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none uppercase font-mono"
            />
          </div>

          {previewQR ? (
            <div className="mt-3.5 p-3.5 sm:p-4 bg-orange-50/60 border border-orange-200 rounded-xl text-center">
              <div className="flex items-center justify-center gap-1 text-xs font-bold text-orange-900 mb-2">
                <QrCode className="w-4 h-4" />
                <span>Xem trước mã VietQR tự động</span>
              </div>
              <div className="inline-block p-2 bg-white rounded-lg shadow-xs border border-orange-200 relative min-w-[180px] min-h-[180px]">
                {qrLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 rounded-lg z-10 p-4">
                    <div className="w-6 h-6 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mb-1.5" />
                    <span className="text-[11px] text-slate-500 font-medium">Đang tạo mã QR...</span>
                  </div>
                )}
                {qrError ? (
                  <div className="p-4 text-center text-red-600 text-xs space-y-2">
                    <AlertCircle className="w-6 h-6 mx-auto text-red-500" />
                    <p className="font-semibold">Không thể tải ảnh VietQR</p>
                    <p className="text-[11px] text-slate-500">
                      Vui lòng kiểm tra lại ngân hàng và số tài khoản ({cleanAccount}). Bạn vẫn có thể lưu thông tin bình thường.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setQrError(false);
                        setQrLoading(true);
                      }}
                      className="px-3 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Thử tải lại
                    </button>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={previewQR}
                    alt="VietQR Preview"
                    onLoad={() => setQrLoading(false)}
                    onError={() => {
                      setQrLoading(false);
                      setQrError(true);
                    }}
                    className={`w-44 sm:w-48 h-auto object-contain mx-auto transition-opacity duration-200 ${
                      qrLoading ? 'opacity-0' : 'opacity-100'
                    }`}
                  />
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-2 font-medium">
                Mã sẽ tự động cập nhật khi bạn đổi ngân hàng hoặc số tài khoản.
              </p>
            </div>
          ) : (
            <div className="mt-3.5 p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center space-y-1">
              <QrCode className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-700">Chưa có mã VietQR</p>
              <p className="text-[11px] text-slate-500">
                Nhập số tài khoản ngân hàng ở trên để tự động tạo mã VietQR nhận tiền tip cà phê từ đồng nghiệp.
              </p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full min-h-[48px] py-3.5 px-4 bg-orange-600 hover:bg-orange-700 active:scale-[0.99] text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Đang lưu...' : 'Lưu Thay Đổi'}</span>
        </button>
      </form>
    </div>
  );
}
