import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Xóa kho hàng:
 * 1. Thử xóa vĩnh viễn (Hard Delete) từ DB.
 * 2. Nếu RLS chưa mở DELETE policy, fallback sang Ẩn kho (Soft Delete - status = 'hidden').
 */
export async function deleteWarehouse(
  supabase: SupabaseClient,
  warehouseId: string
): Promise<{ success: boolean; type: 'hard' | 'soft' }> {
  try {
    // 1. Thử Hard delete trước
    const { data, error } = await supabase
      .from('warehouses')
      .delete()
      .eq('id', warehouseId)
      .select();

    if (!error && data && data.length > 0) {
      return { success: true, type: 'hard' };
    }

    // 2. Fallback sang Soft delete (ẩn kho khỏi bản đồ và danh sách)
    const { error: updateError } = await supabase
      .from('warehouses')
      .update({ status: 'hidden' })
      .eq('id', warehouseId);

    if (updateError) {
      throw updateError;
    }

    // Đồng thời ẩn các voice notes của kho này
    await supabase
      .from('voice_notes')
      .update({ status: 'hidden' })
      .eq('warehouse_id', warehouseId);

    return { success: true, type: 'soft' };
  } catch (err) {
    console.error('Lỗi khi xóa kho:', err);
    throw err;
  }
}

/**
 * Xóa lời nhắn chỉ đường (Voice note):
 * 1. Thử xóa file ghi âm trong Storage (nếu có audioUrl).
 * 2. Thử xóa vĩnh viễn (Hard Delete) trong DB.
 * 3. Nếu RLS chưa mở DELETE policy, fallback sang Ẩn voice (Soft Delete - status = 'hidden').
 */
export async function deleteVoiceNote(
  supabase: SupabaseClient,
  noteId: string,
  audioUrl?: string | null
): Promise<{ success: boolean; type: 'hard' | 'soft' }> {
  try {
    // 1. Dọn dẹp storage file nếu có
    if (audioUrl) {
      try {
        const parts = audioUrl.split('/voice-notes/');
        if (parts[1]) {
          const filePath = decodeURIComponent(parts[1]);
          await supabase.storage.from('voice-notes').remove([filePath]);
        }
      } catch (storageErr) {
        console.warn('Không thể xóa file audio trong storage:', storageErr);
      }
    }

    // 2. Thử Hard delete
    const { data, error } = await supabase
      .from('voice_notes')
      .delete()
      .eq('id', noteId)
      .select();

    if (!error && data && data.length > 0) {
      return { success: true, type: 'hard' };
    }

    // 3. Fallback sang Soft delete (ẩn khỏi app)
    const { error: updateError } = await supabase
      .from('voice_notes')
      .update({ status: 'hidden' })
      .eq('id', noteId);

    if (updateError) {
      throw updateError;
    }

    return { success: true, type: 'soft' };
  } catch (err) {
    console.error('Lỗi khi xóa voice note:', err);
    throw err;
  }
}

/**
 * Chuyển đổi trạng thái kho hàng giữa 'active' và 'hidden'
 */
export async function toggleWarehouseStatus(
  supabase: SupabaseClient,
  warehouseId: string,
  newStatus: 'active' | 'hidden'
) {
  const { error } = await supabase
    .from('warehouses')
    .update({ status: newStatus })
    .eq('id', warehouseId);

  if (error) throw error;
}

/**
 * Chuyển đổi trạng thái voice note giữa 'active' và 'hidden'
 */
export async function toggleVoiceNoteStatus(
  supabase: SupabaseClient,
  noteId: string,
  newStatus: 'active' | 'hidden'
) {
  const { error } = await supabase
    .from('voice_notes')
    .update({ status: newStatus })
    .eq('id', noteId);

  if (error) throw error;
}
