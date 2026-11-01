export interface VietQRParams {
  bankName: string;
  accountNo: string;
  accountName?: string;
  amount?: number;
  message?: string;
}

export const POPULAR_BANKS = [
  { code: 'MB', name: 'MBBank (Quân Đội)' },
  { code: 'VCB', name: 'Vietcombank (Ngoại Thương)' },
  { code: 'TCB', name: 'Techcombank (Kỹ Thương)' },
  { code: 'ACB', name: 'ACB (Á Châu)' },
  { code: 'VPB', name: 'VPBank (Việt Nam Thịnh Vượng)' },
  { code: 'TPB', name: 'TPBank (Tiên Phong)' },
  { code: 'BIDV', name: 'BIDV (Đầu Tư & Phát Triển)' },
  { code: 'CTG', name: 'VietinBank (Công Thương)' },
  { code: 'STB', name: 'Sacombank (Sài Gòn Thương Tín)' },
  { code: 'VIB', name: 'VIB (Quốc Tế)' },
  { code: 'HDB', name: 'HDBank (Phát Triển TP.HCM)' },
  { code: 'MSB', name: 'MSB (Hàng Hải)' },
  { code: 'OCB', name: 'OCB (Phương Đông)' },
  { code: 'SHB', name: 'SHB (Sài Gòn - Hà Nội)' },
  { code: 'VBA', name: 'Agribank (Nông Nghiệp)' },
];

/**
 * Generates dynamic VietQR image URL for instant bank donation/tips.
 */
export function getVietQRImageUrl({
  bankName,
  accountNo,
  accountName,
  amount,
  message = 'Cam on dong nghiep',
}: VietQRParams): string {
  if (!bankName || !accountNo) return '';
  const cleanBank = bankName.trim().toUpperCase();
  const cleanAccount = accountNo.trim();
  const encodedMsg = encodeURIComponent(message);
  const amountParam = amount && amount > 0 ? `&amount=${amount}` : '&amount=';
  const nameParam = accountName ? `&accountName=${encodeURIComponent(accountName)}` : '';

  return `https://img.vietqr.io/image/${cleanBank}-${cleanAccount}-compact2.png?${amountParam}&addInfo=${encodedMsg}${nameParam}`;
}
