export interface VietQRParams {
  bankName: string;
  accountNo: string;
  accountName?: string;
  amount?: number;
  message?: string;
  template?: 'compact' | 'compact2' | 'qr_only' | 'print';
}

export const POPULAR_BANKS = [
  { code: 'MB', name: 'MBBank (Quân Đội)' },
  { code: 'VCB', name: 'Vietcombank (Ngoại Thương)' },
  { code: 'ICB', name: 'VietinBank (Công Thương)' },
  { code: 'TCB', name: 'Techcombank (Kỹ Thương)' },
  { code: 'BIDV', name: 'BIDV (Đầu Tư & Phát Triển)' },
  { code: 'ACB', name: 'ACB (Á Châu)' },
  { code: 'VPB', name: 'VPBank (Việt Nam Thịnh Vượng)' },
  { code: 'TPB', name: 'TPBank (Tiên Phong)' },
  { code: 'STB', name: 'Sacombank (Sài Gòn Thương Tín)' },
  { code: 'HDB', name: 'HDBank (Phát Triển TP.HCM)' },
  { code: 'VBA', name: 'Agribank (Nông Nghiệp)' },
  { code: 'VIB', name: 'VIB (Quốc Tế)' },
  { code: 'SHB', name: 'SHB (Sài Gòn - Hà Nội)' },
  { code: 'MSB', name: 'MSB (Hàng Hải)' },
  { code: 'OCB', name: 'OCB (Phương Đông)' },
  { code: 'LPB', name: 'LPBank (Lộc Phát Việt Nam)' },
  { code: 'SEAB', name: 'SeABank (Đông Nam Á)' },
  { code: 'NAB', name: 'NamABank (Nam Á)' },
  { code: 'BAB', name: 'BacABank (Bắc Á)' },
  { code: 'CAKE', name: 'CAKE by VPBank' },
  { code: 'TIMO', name: 'Timo by BVBank' },
];

/**
 * Mapping alias or historical bank codes to official VietQR/NAPAS codes.
 * E.g., VietinBank's stock ticker is CTG but VietQR code is ICB.
 */
const BANK_CODE_ALIASES: Record<string, string> = {
  CTG: 'ICB',
  VIETINBANK: 'ICB',
  VIETCOMBANK: 'VCB',
  TECHCOMBANK: 'TCB',
  AGRIBANK: 'VBA',
  MBBANK: 'MB',
  SACOMBANK: 'STB',
  TIENPHONGBANK: 'TPB',
  VPBANK: 'VPB',
};

/**
 * Strips whitespace, dashes, dots from pasted bank account numbers.
 */
export function cleanAccountNumber(acc: string): string {
  if (!acc) return '';
  return acc.replace(/[\s.-]/g, '').trim();
}

/**
 * Normalizes bank name/code to standard VietQR identifier.
 */
export function normalizeBankCode(bank: string): string {
  if (!bank) return '';
  const upper = bank.trim().toUpperCase();
  return BANK_CODE_ALIASES[upper] || upper;
}

/**
 * Generates dynamic VietQR image URL for instant bank donation/tips.
 */
export function getVietQRImageUrl({
  bankName,
  accountNo,
  accountName,
  amount,
  message = 'Cam on dong nghiep',
  template,
}: VietQRParams): string {
  if (!bankName || !accountNo) return '';

  const cleanBank = normalizeBankCode(bankName);
  const cleanAccount = cleanAccountNumber(accountNo);

  // Require at least 3 alphanumeric characters
  if (cleanAccount.length < 3) return '';

  // Use compact2 if fixed amount is specified, otherwise compact (avoids "0đ" label)
  const chosenTemplate = template || (amount && amount > 0 ? 'compact2' : 'compact');

  const params = new URLSearchParams();
  if (amount && amount > 0) {
    params.set('amount', Math.round(amount).toString());
  }
  if (message && message.trim()) {
    params.set('addInfo', message.trim());
  }
  if (accountName && accountName.trim()) {
    params.set('accountName', accountName.trim().toUpperCase());
  }

  const query = params.toString();
  return `https://img.vietqr.io/image/${cleanBank}-${cleanAccount}-${chosenTemplate}.png${query ? `?${query}` : ''}`;
}
