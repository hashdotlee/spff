'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { uploadImageToSupabase } from '@/lib/utils/imageUpload';
import { recalculateReputation } from '@/lib/utils/adminActions';
import { geocodeAddress } from '@/lib/utils/geocoding';
import { useProvince } from '@/lib/contexts/ProvinceContext';
import {
  downloadWarehouseExcelTemplate,
  parseWarehouseExcel,
  PROVINCE_COORDINATES,
} from '@/lib/utils/excelImport';
import type { PlaceCategory } from '@/types/database';
import {
  ArrowLeft,
  FileSpreadsheet,
  Download,
  Plus,
  Trash2,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  X,
  Sparkles,
  Zap,
  Building2,
  CircleParking,
  UtensilsCrossed,
  Home,
  Globe,
  Lock,
  MapPin,
  RefreshCw,
} from 'lucide-react';

export interface BatchRowItem {
  id: string;
  name: string;
  address: string;
  imageFile?: File | Blob | null;
  imageUrl?: string;
  imagePreviewUrl?: string;
}

export default function BatchWarehousePage() {
  const router = useRouter();
  const { province, openPicker } = useProvince();
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<BatchRowItem[]>([
    { id: 'row-1', name: '', address: '', imageUrl: '' },
    { id: 'row-2', name: '', address: '', imageUrl: '' },
    { id: 'row-3', name: '', address: '', imageUrl: '' },
  ]);

  const [category, setCategory] = useState<PlaceCategory>('warehouse');
  const [isPrivate, setIsPrivate] = useState<boolean>(false);

  // Trạng thái nhập hàng loạt
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentProgressText, setCurrentProgressText] = useState('');
  const [completedCount, setCompletedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successTotal, setSuccessTotal] = useState(0);

  // File upload input ref
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingExcel, setIsDraggingExcel] = useState(false);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);

  // 1. Kiểm tra đăng nhập
  useEffect(() => {
    supabase.auth.getUser().then((res: any) => {
      if (!res.data?.user) {
        router.push('/login?redirectTo=/warehouse/batch');
      } else {
        setUser(res.data.user);
      }
    });
  }, [supabase, router]);

  // Thêm dòng mới
  function handleAddRow() {
    setRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: '',
        address: '',
        imageUrl: '',
      },
    ]);
  }

  // Xóa 1 dòng
  function handleDeleteRow(id: string) {
    if (rows.length <= 1) {
      setRows([{ id: `row-${Date.now()}`, name: '', address: '', imageUrl: '' }]);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  // Cập nhật giá trị trường trong dòng
  function handleUpdateRow(id: string, field: 'name' | 'address', value: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  // Chọn ảnh cho dòng từ thiết bị
  function handleSelectRowImage(id: string, file: File) {
    const previewUrl = URL.createObjectURL(file);
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              imageFile: file,
              imagePreviewUrl: previewUrl,
              imageUrl: '',
            }
          : r
      )
    );
  }

  // Xóa ảnh của dòng
  function handleRemoveRowImage(id: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          if (r.imagePreviewUrl && r.imagePreviewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(r.imagePreviewUrl);
          }
          return {
            ...r,
            imageFile: null,
            imagePreviewUrl: undefined,
            imageUrl: '',
          };
        }
        return r;
      })
    );
  }

  // Nạp 3 dòng dữ liệu mẫu
  function handleLoadSampleRows() {
    setRows([
      {
        id: `sample-1-${Date.now()}`,
        name: 'Kho Shopee Express Tân Bình',
        address: `123 Cộng Hòa, Phường 13, Quận Tân Bình, ${province}`,
        imageUrl: '',
      },
      {
        id: `sample-2-${Date.now()}`,
        name: 'Bến bãi Giao Hàng Tiết Kiệm Cầu Giấy',
        address: `25 Ngõ 102 Nguyễn Hoàng, Mỹ Đình 2, Nam Từ Liêm, ${province}`,
        imageUrl: '',
      },
      {
        id: `sample-3-${Date.now()}`,
        name: 'Bãi xe & Kho Viettel Post Bến Cát',
        address: `Đường DT744, Phường An Tây, Thị xã Bến Cát, ${province}`,
        imageUrl: '',
      },
    ]);
  }

  // Xóa sạch bảng
  function handleClearAllRows() {
    if (confirm('Bạn có chắc muốn xóa tất cả các dòng đang nhập?')) {
      setRows([
        { id: `row-1-${Date.now()}`, name: '', address: '', imageUrl: '' },
        { id: `row-2-${Date.now()}`, name: '', address: '', imageUrl: '' },
        { id: `row-3-${Date.now()}`, name: '', address: '', imageUrl: '' },
      ]);
      setExcelFileName(null);
    }
  }

  // Xử lý upload file Excel
  async function handleExcelFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await processExcelFile(file);
    e.target.value = '';
  }

  async function processExcelFile(file: File) {
    setErrorMsg(null);
    try {
      setExcelFileName(file.name);
      const parsed = await parseWarehouseExcel(file);

      const newRows: BatchRowItem[] = parsed.map((item, idx) => ({
        id: `excel-${Date.now()}-${idx}`,
        name: item.name,
        address: item.address,
        imageUrl: item.imageUrl || '',
        imagePreviewUrl: item.imageUrl || undefined,
      }));

      // Nếu đang có các dòng trống thì ghi đè, nếu không thì ghép thêm
      const hasNonEmptyCurrent = rows.some((r) => r.name.trim() || r.address.trim());
      if (hasNonEmptyCurrent) {
        if (confirm(`Đã tìm thấy ${newRows.length} kho từ file Excel. Bạn muốn thay thế bảng hiện tại (OK) hay gộp thêm vào bảng (Cancel)?`)) {
          setRows(newRows);
        } else {
          setRows((prev) => [...prev.filter((r) => r.name.trim() || r.address.trim()), ...newRows]);
        }
      } else {
        setRows(newRows);
      }
    } catch (err: any) {
      console.error('Lỗi đọc file Excel:', err);
      setErrorMsg(err?.message || 'Không thể đọc file Excel. Vui lòng kiểm tra định dạng.');
    }
  }

  // Kéo thả file Excel
  function handleDropExcel(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingExcel(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processExcelFile(file);
    }
  }

  // Số lượng dòng hợp lệ (có cả tên và địa chỉ)
  const validRows = rows.filter((r) => r.name.trim() && r.address.trim());

  // Thực hiện Nhập hàng loạt
  async function handleBatchSubmit() {
    setErrorMsg(null);

    // 1. Kiểm tra tài khoản
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
      setErrorMsg('Vui lòng đăng nhập để nhập danh sách kho.');
      return;
    }

    // 2. Validate dữ liệu
    const rowsWithData = rows.filter((r) => r.name.trim() || r.address.trim());
    if (rowsWithData.length === 0) {
      setErrorMsg('Vui lòng nhập ít nhất 1 kho hàng (có đủ Tên kho và Địa chỉ).');
      return;
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.name.trim() && !r.address.trim()) {
        setErrorMsg(`Dòng #${i + 1} (${r.name}) đang thiếu Địa chỉ.`);
        return;
      }
      if (!r.name.trim() && r.address.trim()) {
        setErrorMsg(`Dòng #${i + 1} đang thiếu Tên kho.`);
        return;
      }
    }

    const itemsToImport = validRows;
    if (itemsToImport.length === 0) {
      setErrorMsg('Chưa có kho nào có đầy đủ Tên và Địa chỉ để nhập.');
      return;
    }

    // 3. Bắt đầu tiến trình nhập hàng loạt
    setIsSubmitting(true);
    setProgressPercent(0);
    setCompletedCount(0);
    setCurrentProgressText(`Chuẩn bị nhập ${itemsToImport.length} kho...`);

    const total = itemsToImport.length;
    let successCount = 0;

    // Tọa độ fallback theo tỉnh thành
    const fallbackCoords = PROVINCE_COORDINATES[province] || {
      lat: 10.8231,
      lng: 106.6297,
    };

    try {
      for (let i = 0; i < total; i++) {
        const item = itemsToImport[i];
        const stepNum = i + 1;
        const currentItemName = item.name.trim();

        // Bước A: Tải ảnh (nếu có)
        let finalImageUrl: string | null = null;

        if (item.imageFile) {
          setCurrentProgressText(
            `[${stepNum}/${total}] Đang nén và tải ảnh: ${currentItemName}...`
          );
          try {
            const fileName = `batch_${currentUser.id}_${Date.now()}_${i}.jpg`;
            finalImageUrl = await uploadImageToSupabase(supabase, item.imageFile, {
              primaryBucket: 'warehouse-images',
              fileName,
              fallbackBucket: 'avatars',
              compress: true,
            });
          } catch (imgErr) {
            console.warn(`Lỗi tải ảnh cho kho ${currentItemName}, bỏ qua ảnh:`, imgErr);
            finalImageUrl = null;
          }
        } else if (item.imageUrl && item.imageUrl.trim().startsWith('http')) {
          finalImageUrl = item.imageUrl.trim();
        }

        // Bước B: Tra cứu tọa độ Geocode
        setCurrentProgressText(
          `[${stepNum}/${total}] Đang định vị GPS: ${currentItemName}...`
        );

        let finalLat = fallbackCoords.lat + (Math.random() - 0.5) * 0.004;
        let finalLng = fallbackCoords.lng + (Math.random() - 0.5) * 0.004;

        try {
          const geocodeRes = await geocodeAddress(item.address.trim(), province);
          if (geocodeRes && geocodeRes.length > 0) {
            finalLat = geocodeRes[0].latitude;
            finalLng = geocodeRes[0].longitude;
          }
        } catch (geoErr) {
          console.warn(`Lỗi geocode cho ${item.address}:`, geoErr);
        }

        // Bước C: Chèn vào bảng warehouses
        setCurrentProgressText(
          `[${stepNum}/${total}] Đang lưu cơ sở dữ liệu: ${currentItemName}...`
        );

        const insertPayload: any = {
          name: currentItemName,
          address: item.address.trim(),
          latitude: finalLat,
          longitude: finalLng,
          image_url: finalImageUrl,
          created_by: currentUser.id,
          category: category,
          is_private: isPrivate,
          status: 'active',
        };

        let { error: insertError } = await supabase
          .from('warehouses')
          .insert(insertPayload);

        // Fallback tương thích cột cũ nếu có lỗi
        if (
          insertError &&
          (insertError.code === '42703' ||
            insertError.message.includes('category') ||
            insertError.message.includes('is_private') ||
            insertError.message.includes('image_url') ||
            insertError.message.includes('address'))
        ) {
          delete insertPayload.category;
          delete insertPayload.is_private;
          delete insertPayload.image_url;
          delete insertPayload.address;
          const retryRes = await supabase.from('warehouses').insert(insertPayload);
          insertError = retryRes.error;
        }

        if (insertError) {
          console.error(`Lỗi khi insert kho #${stepNum}:`, insertError);
        } else {
          successCount++;
        }

        // Cập nhật tiến độ
        const currentPercent = Math.round(((i + 1) / total) * 100);
        setProgressPercent(currentPercent);
        setCompletedCount(i + 1);

        // Nghỉ nhẹ 150ms để tránh rate-limit API tra cứu địa chỉ
        if (i < total - 1) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }

      // Bước D: Cập nhật điểm cống hiến cho tài xế
      try {
        await recalculateReputation(supabase, currentUser.id);
      } catch (repErr) {
        console.warn('Lỗi cập nhật điểm:', repErr);
      }

      // Hoàn tất
      setSuccessTotal(successCount);
      setIsSubmitting(false);
      setShowSuccessModal(true);
    } catch (err: any) {
      console.error('Lỗi nhập hàng loạt kho:', err);
      setErrorMsg(err?.message || 'Đã có lỗi trong quá trình nhập hàng loạt.');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto w-full pb-20">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4">
        <Link
          href="/"
          className="p-2 -ml-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition inline-flex items-center gap-1.5 text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Về bản đồ</span>
        </Link>

        {/* Nút chọn Tỉnh thành hoạt động */}
        <button
          type="button"
          onClick={openPicker}
          className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-slate-200 shadow-2xs active:scale-95 cursor-pointer"
          title="Tỉnh thành tra cứu tọa độ mặc định"
        >
          <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0" />
          <span className="font-bold text-slate-900">{province}</span>
        </button>
      </div>

      {/* Tabs chuyển đổi giữa Thêm Nhanh và Thêm Nhiều */}
      <div className="flex items-center gap-2 mb-6 p-1 bg-slate-200/70 rounded-2xl">
        <Link
          href="/warehouse/new"
          className="flex-1 py-2 px-3 text-slate-600 hover:text-slate-900 font-semibold text-xs rounded-xl text-center flex items-center justify-center gap-1.5 transition"
        >
          <Zap className="w-3.5 h-3.5 text-orange-500" />
          <span>Thêm nhanh (1 điểm GPS)</span>
        </Link>
        <div className="flex-1 py-2 px-3 bg-white text-emerald-700 font-bold text-xs rounded-xl shadow-xs text-center flex items-center justify-center gap-1.5 border border-emerald-100">
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          <span>Thêm nhiều (Excel & Bảng)</span>
        </div>
      </div>

      {/* Title & Introduction */}
      <div className="mb-6 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
              Nhập Hàng Loạt Kho / Bến Bãi
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wider">
                Hàng loạt
              </span>
            </h1>
            <p className="text-xs text-emerald-50 mt-1 leading-relaxed">
              Tải lên file Excel có sẵn hoặc nhập danh sách trực tiếp vào bảng bên dưới với 3 trường: <strong>Tên</strong>, <strong>Địa chỉ</strong> và <strong>Ảnh (nếu có)</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Thông báo lỗi nếu có */}
      {errorMsg && (
        <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl flex items-start gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Chưa thể nhập: </span>
            {errorMsg}
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-400 hover:text-red-700 p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KHỐI 1: TẢI FILE EXCEL */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-emerald-600" />
              Cách 1: Tải lên File Excel (.xlsx, .xls, .csv)
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Hệ thống sẽ tự nhận diện 3 cột: Tên kho, Địa chỉ và Ảnh
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={downloadWarehouseExcelTemplate}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 active:scale-95 cursor-pointer"
              title="Tải file mẫu Excel chuẩn để điền"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tải file mẫu Excel</span>
            </button>
          </div>
        </div>

        {/* Khu vực Dropzone Excel */}
        <input
          ref={excelInputRef}
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleExcelFileChange}
          className="hidden"
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingExcel(true);
          }}
          onDragLeave={() => setIsDraggingExcel(false)}
          onDrop={handleDropExcel}
          onClick={() => excelInputRef.current?.click()}
          className={`mt-4 border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
            isDraggingExcel
              ? 'border-emerald-500 bg-emerald-50/60'
              : excelFileName
              ? 'border-emerald-400 bg-emerald-50/30'
              : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50/70'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
            <FileSpreadsheet className="w-6 h-6" />
          </div>

          {excelFileName ? (
            <div>
              <div className="text-xs sm:text-sm font-bold text-emerald-800 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Đã nạp file: {excelFileName}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Bấm vào đây để chọn lại file Excel khác
              </p>
            </div>
          ) : (
            <div>
              <div className="text-xs sm:text-sm font-bold text-slate-800">
                Kéo thả file Excel vào đây hoặc <span className="text-emerald-600 underline">bấm để chọn file</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Hỗ trợ định dạng file .xlsx, .xls hoặc .csv
              </p>
            </div>
          )}
        </div>
      </div>

      {/* KHỐI 2: CHỈNH SỬA BẢNG 3 TRƯỜNG NGAY TRONG APP */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Cách 2: Nhập & Chỉnh Sửa Trực Tiếp Trong App
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                {validRows.length}/{rows.length} kho hợp lệ
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Bảng gồm 3 trường: <strong>Tên</strong>, <strong>Địa chỉ</strong> và <strong>Ảnh (nếu có)</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoadSampleRows}
              className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl transition flex items-center gap-1 active:scale-95 cursor-pointer"
              title="Điền sẵn 3 kho mẫu để thử nghiệm nhanh"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Điền mẫu thử</span>
            </button>
            <button
              type="button"
              onClick={handleClearAllRows}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700 font-bold text-xs rounded-xl transition flex items-center gap-1 active:scale-95 cursor-pointer"
              title="Xóa trắng bảng"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa bảng</span>
            </button>
          </div>
        </div>

        {/* Bảng nhập liệu (Responsive Table với horizontal scroll trên mobile) */}
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80">
          <table className="w-full text-left border-collapse min-w-[620px]">
            <thead>
              <tr className="bg-slate-50/90 text-slate-700 text-xs font-bold border-b border-slate-200/80">
                <th className="py-2.5 px-3 w-12 text-center text-slate-400">#</th>
                <th className="py-2.5 px-3 min-w-[180px]">
                  Tên kho / Bến bãi <span className="text-red-500">*</span>
                </th>
                <th className="py-2.5 px-3 min-w-[260px]">
                  Địa chỉ cụ thể <span className="text-red-500">*</span>
                </th>
                <th className="py-2.5 px-3 w-40">Ảnh (nếu có)</th>
                <th className="py-2.5 px-2 w-12 text-center">Xóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {rows.map((row, index) => {
                const hasName = Boolean(row.name.trim());
                const hasAddress = Boolean(row.address.trim());
                const isComplete = hasName && hasAddress;
                const fileInputId = `row-photo-input-${row.id}`;

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      isComplete ? 'bg-white hover:bg-slate-50/60' : 'bg-amber-50/20 hover:bg-amber-50/40'
                    }`}
                  >
                    {/* Số thứ tự */}
                    <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                      {index + 1}
                    </td>

                    {/* Trường 1: Tên kho */}
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => handleUpdateRow(row.id, 'name', e.target.value)}
                        placeholder="VD: Kho Shopee Express..."
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-medium text-slate-900 placeholder:text-slate-400"
                      />
                    </td>

                    {/* Trường 2: Địa chỉ */}
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={row.address}
                        onChange={(e) => handleUpdateRow(row.id, 'address', e.target.value)}
                        placeholder={`VD: 123 Đường Cộng Hòa, ${province}...`}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-800 placeholder:text-slate-400"
                      />
                    </td>

                    {/* Trường 3: Ảnh (nếu có) */}
                    <td className="py-2.5 px-3">
                      <input
                        id={fileInputId}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleSelectRowImage(row.id, file);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />

                      {row.imagePreviewUrl || row.imageUrl ? (
                        <div className="flex items-center gap-1.5">
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-slate-200 shrink-0 bg-slate-100 shadow-2xs">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={row.imagePreviewUrl || row.imageUrl}
                              alt="Ảnh xem trước"
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveRowImage(row.id)}
                              className="absolute top-0 right-0 p-0.5 bg-red-600/90 text-white rounded-bl hover:bg-red-700 transition"
                              title="Xóa ảnh"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          <label
                            htmlFor={fileInputId}
                            className="text-[10px] text-emerald-700 font-semibold hover:underline cursor-pointer"
                          >
                            Đổi ảnh
                          </label>
                        </div>
                      ) : (
                        <label
                          htmlFor={fileInputId}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-600 hover:text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50/30 transition text-[11px] font-medium cursor-pointer"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                          <span>+ Chọn ảnh</span>
                        </label>
                      )}
                    </td>

                    {/* Xóa dòng */}
                    <td className="py-2.5 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                        title="Xóa dòng này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Nút thêm dòng */}
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={handleAddRow}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl transition flex items-center gap-1.5 active:scale-95 cursor-pointer border border-emerald-200"
          >
            <Plus className="w-4 h-4 text-emerald-600" />
            <span>+ Thêm dòng mới</span>
          </button>

          <span className="text-[11px] text-slate-500">
            Tổng cộng: <strong>{rows.length}</strong> dòng ({validRows.length} dòng đủ điều kiện nhập)
          </span>
        </div>
      </div>

      {/* KHỐI 3: CÀI ĐẶT CHUNG CHO ĐỢT NHẬP */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 mb-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2.5">
          Cài Đặt Chung Cho Đợt Nhập
        </h2>

        {/* Phân loại địa điểm */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">
            Phân loại danh sách kho:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setCategory('warehouse')}
              className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                category === 'warehouse'
                  ? 'border-orange-500 bg-orange-50 text-orange-800 ring-2 ring-orange-500/20'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <Building2 className="w-4 h-4 text-orange-600" />
              <span>Kho hàng</span>
            </button>
            <button
              type="button"
              onClick={() => setCategory('parking')}
              className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                category === 'parking'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <CircleParking className="w-4 h-4 text-indigo-600" />
              <span>Bãi giữ xe</span>
            </button>
            <button
              type="button"
              onClick={() => setCategory('eatery')}
              className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                category === 'eatery'
                  ? 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <UtensilsCrossed className="w-4 h-4 text-amber-600" />
              <span>Quán ăn</span>
            </button>
            <button
              type="button"
              onClick={() => setCategory('customer')}
              className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                category === 'customer'
                  ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <Home className="w-4 h-4 text-blue-600" />
              <span>Khách hàng</span>
            </button>
          </div>
        </div>

        {/* Quyền riêng tư */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">
            Quyền riêng tư:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsPrivate(false)}
              className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                !isPrivate
                  ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Globe className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Đăng Công Khai (+10đ ⭐ mỗi kho)
                </span>
                <span className="text-[11px] text-slate-500">
                  Chia sẻ cho toàn bộ anh em tài xế tìm đường dễ dàng.
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsPrivate(true)}
              className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                isPrivate
                  ? 'border-slate-700 bg-slate-50 ring-2 ring-slate-400/20'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Lock className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Riêng Tư 🔒 (Chỉ Mình Tôi)
                </span>
                <span className="text-[11px] text-slate-500">
                  Chỉ bạn mới có thể nhìn thấy danh sách các kho này.
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* NÚT THỰC HIỆN NHẬP HÀNG LOẠT */}
      <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xl flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-slate-900">
            Sẵn sàng nhập {validRows.length} kho bãi
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold">
            {!isPrivate && validRows.length > 0
              ? `⭐ Sẽ nhận ngay +${validRows.length * 10} điểm cống hiến!`
              : 'Lưu vào danh sách cá nhân'}
          </div>
        </div>

        <button
          type="button"
          onClick={handleBatchSubmit}
          disabled={validRows.length === 0 || isSubmitting}
          className="px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs sm:text-sm rounded-xl transition shadow-md flex items-center gap-2 active:scale-95 cursor-pointer shrink-0"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang nhập...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Bấm Nhập Hàng Loạt ({validRows.length})</span>
            </>
          )}
        </button>
      </div>

      {/* MODAL TIẾN TRÌNH NHẬP (PROGRESS MODAL) */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Loader2 className="w-7 h-7 animate-spin" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Đang Nhập Hàng Loạt Kho...
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Vui lòng không đóng trình duyệt trong khi đang xử lý
              </p>
            </div>

            {/* Thanh tiến độ */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
                <span>Tiến độ hoàn thành:</span>
                <span className="text-orange-600">{progressPercent}%</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Chi tiết bước đang thực hiện */}
            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600 font-medium">
              <p className="truncate">{currentProgressText}</p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL THÔNG BÁO THÀNH CÔNG */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <h3 className="text-lg font-black text-slate-900">
              Nhập Hàng Loạt Thành Công!
            </h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Đã ghim thành công <strong>{successTotal} kho bãi</strong> lên hệ thống bản đồ SPFF.
            </p>

            {!isPrivate && successTotal > 0 && (
              <div className="mt-4 p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <span>+{successTotal * 10} Điểm cống hiến đã được cộng vào tài khoản!</span>
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row items-center gap-2.5">
              <Link
                href="/"
                className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition text-center shadow-sm"
              >
                Xem Trên Bản Đồ
              </Link>
              <button
                type="button"
                onClick={() => {
                  setShowSuccessModal(false);
                  setRows([
                    { id: `row-1-${Date.now()}`, name: '', address: '', imageUrl: '' },
                    { id: `row-2-${Date.now()}`, name: '', address: '', imageUrl: '' },
                    { id: `row-3-${Date.now()}`, name: '', address: '', imageUrl: '' },
                  ]);
                  setExcelFileName(null);
                }}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition text-center cursor-pointer"
              >
                Nhập Thêm Đợt Khác
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
