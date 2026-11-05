import * as XLSX from 'xlsx';

export interface ParsedWarehouseItem {
  name: string;
  address: string;
  imageUrl?: string;
}

/**
 * Tọa độ trung tâm mặc định của các tỉnh thành Việt Nam (được dùng để fallback nếu không tìm thấy tọa độ cụ thể)
 */
export const PROVINCE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'Hà Nội': { lat: 21.0285, lng: 105.8542 },
  'TP. Hồ Chí Minh': { lat: 10.8231, lng: 106.6297 },
  'Bình Dương': { lat: 10.9804, lng: 106.6519 },
  'Đồng Nai': { lat: 10.9574, lng: 106.8427 },
  'Đà Nẵng': { lat: 16.0544, lng: 108.2022 },
  'Hải Phòng': { lat: 20.8449, lng: 106.6881 },
  'Bắc Ninh': { lat: 21.1861, lng: 106.0763 },
  'Hải Dương': { lat: 20.9397, lng: 106.3163 },
  'Hưng Yên': { lat: 20.6464, lng: 106.0511 },
  'Cần Thơ': { lat: 10.0452, lng: 105.7469 },
  'Long An': { lat: 10.5362, lng: 106.4116 },
  'Bà Rịa - Vũng Tàu': { lat: 10.4114, lng: 107.1362 },
  'Quảng Ninh': { lat: 20.9505, lng: 107.0734 },
  'Thái Nguyên': { lat: 21.5928, lng: 105.8442 },
  'Khánh Hòa': { lat: 12.2388, lng: 109.1967 },
  'Nghệ An': { lat: 18.6737, lng: 105.6813 },
  'Thanh Hóa': { lat: 19.8067, lng: 105.7852 },
  'Thừa Thiên Huế': { lat: 16.4637, lng: 107.5909 },
  'Bắc Giang': { lat: 21.2731, lng: 106.1946 },
  'Vĩnh Phúc': { lat: 21.3089, lng: 105.6049 },
  'Phú Thọ': { lat: 21.3228, lng: 105.4019 },
  'Nam Định': { lat: 20.4344, lng: 106.1773 },
  'Thái Bình': { lat: 20.4463, lng: 106.3365 },
  'Ninh Bình': { lat: 20.2506, lng: 105.9745 },
  'Hà Nam': { lat: 20.5453, lng: 105.9122 },
  'Quảng Nam': { lat: 15.5654, lng: 108.4756 },
  'Bình Định': { lat: 13.7828, lng: 109.2197 },
  'Lâm Đồng': { lat: 11.9404, lng: 108.4583 },
  'Đắk Lắk': { lat: 12.6667, lng: 108.05 },
};

/**
 * Tải file Excel mẫu (.xlsx) xuống máy người dùng với 3 cột chuẩn: Tên kho, Địa chỉ, Ảnh (URL nếu có)
 */
export function downloadWarehouseExcelTemplate() {
  const wsData = [
    ['Tên kho', 'Địa chỉ', 'Ảnh (URL nếu có)'],
    [
      'Kho Shopee Express Tân Bình',
      '123 Cộng Hòa, Phường 13, Quận Tân Bình, TP. Hồ Chí Minh',
      'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600',
    ],
    [
      'Bến bãi Giao Hàng Tiết Kiệm Cầu Giấy',
      '25 Ngõ 102 Nguyễn Hoàng, Mỹ Đình 2, Nam Từ Liêm, Hà Nội',
      '',
    ],
    [
      'Bãi trung chuyển Viettel Post Bến Cát',
      'Đường DT744, Phường An Tây, Thị xã Bến Cát, Bình Dương',
      '',
    ],
    [
      'Kho J&T Express An Sương',
      'QL22, Bà Điểm, Hóc Môn, TP. Hồ Chí Minh',
      '',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  // Cài đặt độ rộng cột dễ nhìn
  ws['!cols'] = [{ wch: 38 }, { wch: 60 }, { wch: 45 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mau_Nhap_Kho');

  XLSX.writeFile(wb, 'mau_nhap_kho_spff.xlsx');
}

/**
 * Hàm phân tích và đọc file Excel (.xlsx, .xls, .csv) do người dùng tải lên
 */
export async function parseWarehouseExcel(
  file: File
): Promise<ParsedWarehouseItem[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('File Excel không có trang tính (sheet) nào.');
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (!rows || rows.length === 0) {
    throw new Error('File Excel trống rỗng, không có dữ liệu.');
  }

  // Tự động dò dòng tiêu đề (header)
  let headerIndex = -1;
  let nameCol = 0;
  let addrCol = 1;
  let imgCol = 2;

  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const rowStr = row.map((cell) =>
      String(cell || '')
        .toLowerCase()
        .trim()
    );

    const foundName = rowStr.findIndex(
      (c) =>
        c.includes('tên') ||
        c.includes('ten') ||
        c.includes('name') ||
        c.includes('kho') ||
        c.includes('bến') ||
        c.includes('bãi')
    );
    const foundAddr = rowStr.findIndex(
      (c) =>
        c.includes('địa chỉ') ||
        c.includes('dia chi') ||
        c.includes('address') ||
        c.includes('vị trí') ||
        c.includes('vi tri') ||
        c.includes('nơi')
    );
    const foundImg = rowStr.findIndex(
      (c) =>
        c.includes('ảnh') ||
        c.includes('anh') ||
        c.includes('image') ||
        c.includes('hình') ||
        c.includes('hinh') ||
        c.includes('photo') ||
        c.includes('url')
    );

    if (foundName !== -1 && foundAddr !== -1) {
      headerIndex = i;
      nameCol = foundName;
      addrCol = foundAddr;
      if (foundImg !== -1) imgCol = foundImg;
      break;
    }
  }

  const startRow = headerIndex !== -1 ? headerIndex + 1 : 0;
  const result: ParsedWarehouseItem[] = [];

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    const name = String(row[nameCol] ?? '').trim();
    const address = String(row[addrCol] ?? '').trim();
    const rawImg = imgCol !== -1 && row[imgCol] !== undefined ? String(row[imgCol]).trim() : '';

    // Bỏ qua dòng trống cả tên lẫn địa chỉ
    if (!name && !address) continue;

    result.push({
      name,
      address,
      imageUrl: rawImg.startsWith('http') ? rawImg : undefined,
    });
  }

  if (result.length === 0) {
    throw new Error(
      'Không tìm thấy dòng dữ liệu hợp lệ trong file Excel. Vui lòng đảm bảo có ít nhất cột Tên kho và cột Địa chỉ.'
    );
  }

  return result;
}
