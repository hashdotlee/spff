'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { getVietQRImageUrl, cleanAccountNumber } from '@/lib/utils/vietqr';
import { Copy, Check, X, Heart, CreditCard, AlertCircle } from 'lucide-react';

interface VietQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverName: string;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  title?: string;
  subtitle?: ReactNode;
  transferMessage?: string;
}

export function VietQRModal({
  isOpen,
  onClose,
  driverName,
  bankName,
  bankAccountNo,
  bankAccountName,
  title = 'Ủng Hộ & Cảm Ơn Tài Xế',
  subtitle,
  transferMessage = 'Cam on bac tai SPFF',
}: VietQRModalProps) {
  const [copied, setCopied] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | undefined>(undefined);
  const [qrLoading, setQrLoading] = useState(true);
  const [qrError, setQrError] = useState(false);

  const cleanAccount = bankAccountNo ? cleanAccountNumber(bankAccountNo) : '';
  const hasBank = !!(bankName && cleanAccount && cleanAccount.length >= 3);

  const qrUrl = hasBank
    ? getVietQRImageUrl({
        bankName: bankName!,
        accountNo: cleanAccount,
        accountName: bankAccountName || undefined,
        amount: selectedAmount,
        message: transferMessage,
      })
    : '';

  useEffect(() => {
    if (qrUrl) {
      setQrLoading(true);
      setQrError(false);
    }
  }, [qrUrl]);

  if (!isOpen) return null;

  function handleCopy() {
    if (!bankAccountNo) return;
    navigator.clipboard.writeText(bankAccountNo);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const amounts = [
    { label: 'Tùy tâm', value: undefined },
    { label: '10.000đ', value: 10000 },
    { label: '20.000đ', value: 20000 },
    { label: '50.000đ', value: 50000 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white w-full max-w-sm rounded-2xl p-4 sm:p-5 shadow-2xl border border-slate-200 relative animate-in zoom-in-95 duration-200 max-h-[92dvh] overflow-y-auto no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-3.5 pt-1">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600 mb-2 shadow-xs">
            <Heart className="w-5 h-5 fill-red-600" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900">
            {title}
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            {subtitle || (
              <>
                Gửi chút cà phê / nước mía cho đồng nghiệp{' '}
                <strong className="text-orange-600">{driverName}</strong>
              </>
            )}
          </p>
        </div>

        {hasBank ? (
          <div className="space-y-3.5">
            {/* Amount selectors */}
            <div className="grid grid-cols-4 gap-1.5">
              {amounts.map((item) => (
                <button
                  key={item.label}
                  onClick={() => setSelectedAmount(item.value)}
                  className={`min-h-[36px] py-1.5 px-1 text-xs font-semibold rounded-xl border transition active:scale-95 ${
                    selectedAmount === item.value
                      ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* QR Code Container */}
            <div className="p-2.5 sm:p-3 bg-gradient-to-b from-orange-50 to-white rounded-xl border border-orange-200 text-center">
              <div className="inline-block p-2 bg-white rounded-xl shadow-xs border border-orange-100 relative min-w-[200px] min-h-[200px]">
                {qrLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 rounded-xl z-10 p-4">
                    <div className="w-7 h-7 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mb-2" />
                    <span className="text-xs text-slate-500 font-medium">Đang tải mã VietQR...</span>
                  </div>
                )}
                {qrError ? (
                  <div className="p-4 text-center text-red-600 text-xs">
                    <AlertCircle className="w-6 h-6 mx-auto mb-1 text-red-500" />
                    <p className="font-semibold">Không thể tải ảnh mã QR</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Bạn có thể copy số tài khoản bên dưới để chuyển khoản thủ công.
                    </p>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={qrUrl}
                    alt={`VietQR ${driverName}`}
                    onLoad={() => setQrLoading(false)}
                    onError={() => {
                      setQrLoading(false);
                      setQrError(true);
                    }}
                    className={`w-48 sm:w-52 h-auto object-contain mx-auto transition-opacity duration-200 ${
                      qrLoading ? 'opacity-0' : 'opacity-100'
                    }`}
                  />
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-2 font-medium">
                Mở app ngân hàng bất kỳ để quét mã chuyển tiền
              </p>
            </div>

            {/* Account Details & Copy */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between items-center gap-2 text-slate-600">
                <span className="shrink-0">Ngân hàng:</span>
                <span className="font-bold text-slate-900 text-right truncate">{bankName}</span>
              </div>
              {bankAccountName && (
                <div className="flex justify-between items-center gap-2 text-slate-600">
                  <span className="shrink-0">Chủ tài khoản:</span>
                  <span className="font-bold text-slate-900 uppercase text-right truncate">
                    {bankAccountName}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 gap-2">
                <span className="text-slate-600 shrink-0">Số tài khoản:</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono font-bold text-sm text-orange-600 truncate">
                    {bankAccountNo}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="p-1 text-slate-600 hover:text-orange-600 rounded-md hover:bg-slate-200 transition active:scale-95 shrink-0"
                    title="Sao chép số tài khoản"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleCopy}
              className="w-full min-h-[44px] py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Đã sao chép số tài khoản!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Sao chép số tài khoản ngân hàng</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="py-7 text-center text-slate-500 space-y-1">
            <CreditCard className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-800">Tài xế này chưa cập nhật thông tin VietQR</p>
            <p className="text-xs text-slate-500">
              Đồng nghiệp có thể gửi lời cảm ơn bằng cách nhấn đánh giá hữu ích hoặc gửi lời nhắn trực tiếp!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
