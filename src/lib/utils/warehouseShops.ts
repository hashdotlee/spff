import type { SupabaseClient } from '@supabase/supabase-js';
import type { Warehouse, WarehouseShop, PlaceCategory } from '@/types/database';

export const SHOPS_META_PREFIX = '__SHOPS_META__:';

/**
 * Trích xuất danh sách shop thuộc một địa chỉ:
 * 1. Ưu tiên đọc từ cột `wh.shops` (JSONB)
 * 2. Fallback đọc từ metadata được encode trong `wh.description` (nếu cột DB chưa được migrate)
 */
export function extractWarehouseShops(wh: Warehouse | any): WarehouseShop[] {
  if (!wh) return [];

  // 1. Kiểm tra trường shops trực tiếp
  if (wh.shops && Array.isArray(wh.shops) && wh.shops.length > 0) {
    return wh.shops
      .map((item: any) => {
        if (typeof item === 'string') {
          const trimmed = item.trim();
          return trimmed ? { name: trimmed } : null;
        }
        if (item && typeof item === 'object' && item.name) {
          return {
            id: item.id || undefined,
            name: String(item.name).trim(),
            note: item.note ? String(item.note).trim() : undefined,
            phone: item.phone ? String(item.phone).trim() : undefined,
          };
        }
        return null;
      })
      .filter((s: any): s is WarehouseShop => Boolean(s && s.name));
  }

  // 2. Fallback: Parse từ description nếu có metadata
  if (wh.description && typeof wh.description === 'string' && wh.description.includes(SHOPS_META_PREFIX)) {
    try {
      const match = wh.description.match(new RegExp(`${SHOPS_META_PREFIX}(.*?)(\n|$)`));
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1]);
        const parsed = JSON.parse(decoded);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item: any) => ({
              id: item.id || undefined,
              name: String(item.name || '').trim(),
              note: item.note ? String(item.note).trim() : undefined,
              phone: item.phone ? String(item.phone).trim() : undefined,
            }))
            .filter((s: any): s is WarehouseShop => Boolean(s && s.name));
        }
      }
    } catch (e) {
      console.warn('Lỗi parse fallback shops metadata từ description:', e);
    }
  }

  return [];
}

/**
 * Lấy mô tả sạch loại bỏ chuỗi metadata shops
 */
export function getCleanDescription(description?: string | null): string {
  if (!description) return '';
  return description
    .replace(new RegExp(`\n?${SHOPS_META_PREFIX}.*?(\n|$)`, 'g'), '')
    .trim();
}

/**
 * Định dạng danh sách shop thành chuỗi hiển thị ngắn gọn
 * Ví dụ: "Shop Quần Áo A (Tầng 1), Tiệm Trà B, Mỹ Phẩm C"
 */
export function formatWarehouseShopsText(shops: WarehouseShop[], maxCount = 3): string {
  if (!shops || shops.length === 0) return '';
  const displayShops = shops.slice(0, maxCount).map((s) => {
    return s.note ? `${s.name} (${s.note})` : s.name;
  });
  const remaining = shops.length - maxCount;
  if (remaining > 0) {
    return `${displayShops.join(', ')} và ${remaining} shop khác`;
  }
  return displayShops.join(', ');
}

export interface MergeWarehousesParams {
  targetWarehouseId: string;
  sourceWarehouseIds: string[];
  updatedTargetName?: string;
  updatedTargetAddress?: string;
  updatedCategory?: PlaceCategory;
  shops: WarehouseShop[];
  transferVoiceNotes?: boolean;
  transferRatings?: boolean;
  actionOnSource?: 'hide' | 'delete';
}

export interface MergeResult {
  success: boolean;
  targetId: string;
  mergedCount: number;
  transferredVoiceCount: number;
  transferredRatingsCount: number;
  shopsCount: number;
  message: string;
}

/**
 * THỰC HIỆN GỘP NHIỀU ĐỊA CHỈ THÀNH 1 ĐỊA CHỈ DUY NHẤT:
 * - Dành riêng cho Admin
 * - Địa chỉ đích (Target Warehouse) sẽ đại diện cho tất cả các shop tại vị trí đó
 * - Chuyển toàn bộ voice notes và đánh giá nổ đơn từ các địa chỉ phụ sang địa chỉ đích
 * - Đánh dấu các địa chỉ phụ là `merged_into = target_id` và `status = 'hidden'`
 */
export async function mergeWarehousesAction(
  supabase: SupabaseClient,
  params: MergeWarehousesParams
): Promise<MergeResult> {
  const {
    targetWarehouseId,
    sourceWarehouseIds,
    updatedTargetName,
    updatedTargetAddress,
    updatedCategory,
    shops,
    transferVoiceNotes = true,
    transferRatings = true,
    actionOnSource = 'hide',
  } = params;

  // 1. Kiểm tra quyền Admin
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Vui lòng đăng nhập để thực hiện tính năng này.');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    throw new Error('Chỉ có Quản trị viên (Admin) mới có quyền gộp địa chỉ.');
  }

  // 2. Validate danh sách ID
  const validSourceIds = Array.from(new Set(sourceWarehouseIds)).filter(
    (id) => id && id !== targetWarehouseId
  );

  if (validSourceIds.length === 0) {
    throw new Error('Cần chọn ít nhất một địa chỉ phụ để gộp vào địa chỉ chính.');
  }

  // 3. Lấy thông tin kho đích
  const { data: targetWh, error: targetErr } = await supabase
    .from('warehouses')
    .select('*')
    .eq('id', targetWarehouseId)
    .single();

  if (targetErr || !targetWh) {
    throw new Error('Không tìm thấy thông tin địa chỉ đích.');
  }

  let transferredVoiceCount = 0;
  let transferredRatingsCount = 0;

  // 4. Chuyển Voice Notes từ các địa chỉ phụ sang địa chỉ chính
  if (transferVoiceNotes) {
    const { count } = await supabase
      .from('voice_notes')
      .select('id', { count: 'exact', head: true })
      .in('warehouse_id', validSourceIds);

    transferredVoiceCount = count || 0;

    const { error: voiceMoveErr } = await supabase
      .from('voice_notes')
      .update({ warehouse_id: targetWarehouseId })
      .in('warehouse_id', validSourceIds);

    if (voiceMoveErr) {
      console.warn('Lỗi khi chuyển voice notes sang địa chỉ chính:', voiceMoveErr);
    }
  }

  // 5. Chuyển Đánh giá nổ đơn (Location Order Ratings) sang địa chỉ chính
  if (transferRatings) {
    try {
      const { count } = await supabase
        .from('location_order_ratings')
        .select('id', { count: 'exact', head: true })
        .in('warehouse_id', validSourceIds);

      transferredRatingsCount = count || 0;

      await supabase
        .from('location_order_ratings')
        .update({ warehouse_id: targetWarehouseId })
        .in('warehouse_id', validSourceIds);
    } catch (e) {
      console.warn('Bảng location_order_ratings chưa hỗ trợ hoặc lỗi chuyển rating:', e);
    }
  }

  // 6. Chuyển Báo cáo vi phạm (Reports) nếu có sang địa chỉ chính
  try {
    await supabase
      .from('reports')
      .update({ warehouse_id: targetWarehouseId })
      .in('warehouse_id', validSourceIds);
  } catch (e) {
    console.warn('Lỗi khi cập nhật reports sang kho đích:', e);
  }

  // 7. Cập nhật Địa chỉ Đích (Target Warehouse)
  const cleanDesc = getCleanDescription(targetWh.description);
  const shopsFormattedSummary = shops.length > 0
    ? `Các shop tại địa chỉ này: ${shops.map((s) => (s.note ? `${s.name} (${s.note})` : s.name)).join(', ')}`
    : '';

  const fallbackMetaDesc = shops.length > 0
    ? `${cleanDesc}${cleanDesc ? '\n\n' : ''}🏪 ${shopsFormattedSummary}\n${SHOPS_META_PREFIX}${encodeURIComponent(
        JSON.stringify(shops)
      )}`
    : cleanDesc;

  const targetPayload: any = {
    name: updatedTargetName || targetWh.name,
    address: updatedTargetAddress || targetWh.address,
    status: 'active',
  };

  if (updatedCategory) {
    targetPayload.category = updatedCategory;
  }

  // Thử cập nhật cột `shops` native
  targetPayload.shops = shops;

  let updateTargetError = null;
  const { error: updateNativeErr } = await supabase
    .from('warehouses')
    .update(targetPayload)
    .eq('id', targetWarehouseId);

  if (updateNativeErr) {
    console.warn('Không thể update trực tiếp cột shops (có thể chưa chạy migration), fallback qua description:', updateNativeErr);
    // Fallback: xóa shops khỏi payload và lưu vào description
    delete targetPayload.shops;
    targetPayload.description = fallbackMetaDesc;

    const { error: fallbackErr } = await supabase
      .from('warehouses')
      .update(targetPayload)
      .eq('id', targetWarehouseId);

    if (fallbackErr) {
      updateTargetError = fallbackErr;
    }
  } else {
    // Cập nhật thành công cột shops, đồng thời dọn dẹp metadata cũ trong description nếu có
    if (cleanDesc !== targetWh.description) {
      await supabase
        .from('warehouses')
        .update({ description: cleanDesc })
        .eq('id', targetWarehouseId);
    }
  }

  if (updateTargetError) {
    throw new Error('Lỗi khi cập nhật địa chỉ chính: ' + (updateTargetError as any).message);
  }

  // 8. Xử lý các địa chỉ phụ (Sources)
  if (actionOnSource === 'delete') {
    // Hard delete nếu admin chọn xóa hẳn
    await supabase.from('warehouses').delete().in('id', validSourceIds);
  } else {
    // Ẩn và liên kết merged_into tới địa chỉ chính
    const sourcePayload: any = {
      status: 'hidden',
      merged_into: targetWarehouseId,
    };

    const { error: sourceNativeErr } = await supabase
      .from('warehouses')
      .update(sourcePayload)
      .in('id', validSourceIds);

    if (sourceNativeErr) {
      console.warn('Không thể update merged_into (chưa chạy migration), fallback ẩn thông thường:', sourceNativeErr);
      await supabase
        .from('warehouses')
        .update({ status: 'hidden' })
        .in('id', validSourceIds);
    }
  }

  return {
    success: true,
    targetId: targetWarehouseId,
    mergedCount: validSourceIds.length,
    transferredVoiceCount,
    transferredRatingsCount,
    shopsCount: shops.length,
    message: `Đã gộp thành công ${validSourceIds.length} địa chỉ vào "${updatedTargetName || targetWh.name}". Địa chỉ này hiện đại diện cho ${shops.length} shop!`,
  };
}

/**
 * ADMIN: Cập nhật danh sách shop cho 1 địa chỉ bất kỳ
 */
export async function updateWarehouseShopsAction(
  supabase: SupabaseClient,
  warehouseId: string,
  shops: WarehouseShop[]
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Vui lòng đăng nhập.');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    throw new Error('Chỉ có Quản trị viên mới được sửa danh sách shop.');
  }

  const { data: wh } = await supabase
    .from('warehouses')
    .select('description')
    .eq('id', warehouseId)
    .single();

  // Thử cập nhật cột `shops`
  const { error } = await supabase
    .from('warehouses')
    .update({ shops })
    .eq('id', warehouseId);

  if (error) {
    console.warn('Lỗi update cột shops, fallback qua description:', error);
    const cleanDesc = getCleanDescription(wh?.description);
    const shopsFormattedSummary = shops.length > 0
      ? `Các shop tại địa chỉ này: ${shops.map((s) => (s.note ? `${s.name} (${s.note})` : s.name)).join(', ')}`
      : '';
    const fallbackDesc = shops.length > 0
      ? `${cleanDesc}${cleanDesc ? '\n\n' : ''}🏪 ${shopsFormattedSummary}\n${SHOPS_META_PREFIX}${encodeURIComponent(
          JSON.stringify(shops)
        )}`
      : cleanDesc;

    const { error: fallbackErr } = await supabase
      .from('warehouses')
      .update({ description: fallbackDesc })
      .eq('id', warehouseId);

    if (fallbackErr) throw fallbackErr;
  }

  return true;
}

/**
 * ADMIN: Hủy gộp địa chỉ (khôi phục lại địa chỉ phụ thành độc lập)
 */
export async function unmergeWarehouseAction(
  supabase: SupabaseClient,
  warehouseId: string
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Vui lòng đăng nhập.');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    throw new Error('Chỉ có Quản trị viên mới có quyền hủy gộp.');
  }

  const { error } = await supabase
    .from('warehouses')
    .update({
      status: 'active',
      merged_into: null,
    })
    .eq('id', warehouseId);

  if (error) throw error;
  return true;
}
