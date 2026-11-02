import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cập nhật/tính toán lại điểm cống hiến cho một tài xế:
 * 1. Thử gọi hàm RPC recalculate_user_reputation (PostgreSQL trigger/function)
 * 2. Fallback tính toán trực tiếp từ cơ sở dữ liệu nếu RPC chưa khả dụng
 */
export async function recalculateReputation(
  supabase: SupabaseClient,
  userId: string
) {
  if (!userId) return;

  try {
    const { error: rpcError } = await supabase.rpc('recalculate_user_reputation', {
      target_user_id: userId,
    });
    if (!rpcError) return;
  } catch {
    // Fallback nếu RPC chưa chạy migration
  }

  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('is_banned, reputation_score')
      .eq('id', userId)
      .maybeSingle();

    if (!prof) return;

    // Nếu tài khoản bị khóa, điểm cống hiến luôn là 0
    if (prof.is_banned) {
      await supabase
        .from('profiles')
        .update({ reputation_score: 0 })
        .eq('id', userId);
      return;
    }

    // Đếm kho công khai active (+10đ mỗi kho công khai)
    let whCount = 0;
    try {
      const { count, error } = await supabase
        .from('warehouses')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', userId)
        .eq('status', 'active')
        .neq('is_private', true);

      if (error) throw error;
      whCount = count || 0;
    } catch {
      // Fallback nếu cột is_private chưa có trong DB
      const { count } = await supabase
        .from('warehouses')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', userId)
        .eq('status', 'active');
      whCount = count || 0;
    }

    // Đếm voice active (+5đ mỗi voice)
    const { count: vnCount } = await supabase
      .from('voice_notes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active');

    const totalPts = Math.max(0, (whCount || 0) * 10 + (vnCount || 0) * 5);

    await supabase
      .from('profiles')
      .update({ reputation_score: totalPts })
      .eq('id', userId);
  } catch (err) {
    console.warn('Lỗi khi tính toán lại điểm cống hiến tài xế:', err);
  }
}

/**
 * Điều chỉnh điểm cống hiến trực tiếp (cộng/trừ)
 */
async function adjustUserReputation(
  supabase: SupabaseClient,
  userId: string,
  deltaPoints: number
) {
  if (!userId) return;

  try {
    // Thử gọi recalculateReputation để đồng bộ chính xác nhất
    await recalculateReputation(supabase, userId);
  } catch {
    // Fallback: cộng/trừ trực tiếp
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('reputation_score, is_banned')
        .eq('id', userId)
        .maybeSingle();

      if (prof) {
        if (prof.is_banned) {
          await supabase
            .from('profiles')
            .update({ reputation_score: 0 })
            .eq('id', userId);
          return;
        }

        const newScore = Math.max(0, (prof.reputation_score || 0) + deltaPoints);
        await supabase
          .from('profiles')
          .update({ reputation_score: newScore })
          .eq('id', userId);
      }
    } catch (err) {
      console.warn('Lỗi adjustUserReputation:', err);
    }
  }
}

/**
 * Xóa kho hàng:
 * 1. Lấy thông tin kho & danh sách voice notes thuộc kho
 * 2. Ẩn tất cả voice notes của kho này (vì kho bị xóa/sai vị trí thì toàn bộ chỉ dẫn cũng sai)
 * 3. Thử xóa vĩnh viễn (Hard Delete) hoặc Ẩn kho (Soft Delete - status = 'hidden')
 * 4. Trừ điểm cống hiến của người ghim kho (-10đ) và của tất cả tác giả voice notes (-5đ/voice)
 */
export async function deleteWarehouse(
  supabase: SupabaseClient,
  warehouseId: string
): Promise<{ success: boolean; type: 'hard' | 'soft' }> {
  try {
    // 1. Lấy thông tin kho và tác giả
    const { data: wh } = await supabase
      .from('warehouses')
      .select('created_by, status, is_private')
      .eq('id', warehouseId)
      .maybeSingle();

    // 2. Lấy danh sách voice notes của kho này
    const { data: voiceNotes } = await supabase
      .from('voice_notes')
      .select('id, user_id, status')
      .eq('warehouse_id', warehouseId);

    // 3. Tự động ẩn toàn bộ voice notes của kho này
    await supabase
      .from('voice_notes')
      .update({ status: 'hidden' })
      .eq('warehouse_id', warehouseId);

    // 4. Thử Hard delete trước
    let deleteType: 'hard' | 'soft' = 'hard';
    const { data, error } = await supabase
      .from('warehouses')
      .delete()
      .eq('id', warehouseId)
      .select();

    if (error || !data || data.length === 0) {
      deleteType = 'soft';
      const { error: updateError } = await supabase
        .from('warehouses')
        .update({ status: 'hidden' })
        .eq('id', warehouseId);

      if (updateError) {
        throw updateError;
      }
    }

    // 5. Trừ điểm tác giả ghim kho nếu kho công khai đang active
    if (wh?.created_by && !wh?.is_private) {
      await adjustUserReputation(supabase, wh.created_by, -10);
    }

    // 6. Trừ điểm các tác giả voice notes bị ẩn cùng kho
    if (voiceNotes && voiceNotes.length > 0) {
      const activeNotes = voiceNotes.filter((vn) => vn.status === 'active');
      const affectedUserIds = Array.from(new Set(activeNotes.map((vn) => vn.user_id).filter(Boolean)));
      for (const uid of affectedUserIds) {
        await recalculateReputation(supabase, uid as string);
      }
    }

    return { success: true, type: deleteType };
  } catch (err) {
    console.error('Lỗi khi xóa kho:', err);
    throw err;
  }
}

/**
 * Xóa lời nhắn chỉ đường (Voice note):
 * 1. Thử xóa file ghi âm trong Storage (nếu có audioUrl).
 * 2. Thử xóa vĩnh viễn (Hard Delete) hoặc Ẩn voice (Soft Delete - status = 'hidden').
 * 3. Trừ điểm cống hiến của tác giả voice note (-5đ).
 */
export async function deleteVoiceNote(
  supabase: SupabaseClient,
  noteId: string,
  audioUrl?: string | null
): Promise<{ success: boolean; type: 'hard' | 'soft' }> {
  try {
    // 1. Lấy thông tin voice note để biết tác giả và trạng thái
    const { data: note } = await supabase
      .from('voice_notes')
      .select('user_id, status')
      .eq('id', noteId)
      .maybeSingle();

    // 2. Dọn dẹp storage file nếu có
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

    // 3. Thử Hard delete
    let deleteType: 'hard' | 'soft' = 'hard';
    const { data, error } = await supabase
      .from('voice_notes')
      .delete()
      .eq('id', noteId)
      .select();

    if (error || !data || data.length === 0) {
      deleteType = 'soft';
      const { error: updateError } = await supabase
        .from('voice_notes')
        .update({ status: 'hidden' })
        .eq('id', noteId);

      if (updateError) {
        throw updateError;
      }
    }

    // 4. Trừ điểm tác giả voice note nếu voice đang active
    if (note?.user_id) {
      await adjustUserReputation(supabase, note.user_id, -5);
    }

    return { success: true, type: deleteType };
  } catch (err) {
    console.error('Lỗi khi xóa voice note:', err);
    throw err;
  }
}

/**
 * Chuyển đổi trạng thái kho hàng giữa 'active' và 'hidden':
 * - Khi ẩn kho ('hidden'): Tự động ẩn toàn bộ voice notes của kho đó,
 *   và trừ điểm của người ghim kho (-10đ) cũng như tất cả tác giả voice notes (-5đ/voice).
 * - Khi hiển thị lại ('active'): Hoàn lại điểm cho người ghim kho (+10đ).
 */
export async function toggleWarehouseStatus(
  supabase: SupabaseClient,
  warehouseId: string,
  newStatus: 'active' | 'hidden'
) {
  // 1. Lấy thông tin kho trước khi đổi
  const { data: wh } = await supabase
    .from('warehouses')
    .select('created_by, status, is_private')
    .eq('id', warehouseId)
    .maybeSingle();

  const prevStatus = wh?.status;

  // 2. Cập nhật trạng thái kho
  const { error } = await supabase
    .from('warehouses')
    .update({ status: newStatus })
    .eq('id', warehouseId);

  if (error) throw error;

  // 3. Xử lý cascade ẩn voice notes và cập nhật điểm
  if (newStatus === 'hidden') {
    // Lấy danh sách voice notes active thuộc kho này
    const { data: voiceNotes } = await supabase
      .from('voice_notes')
      .select('id, user_id, status')
      .eq('warehouse_id', warehouseId)
      .eq('status', 'active');

    // Ẩn toàn bộ voice notes của kho
    await supabase
      .from('voice_notes')
      .update({ status: 'hidden' })
      .eq('warehouse_id', warehouseId);

    // Trừ điểm của người ghim kho nếu trước đó đang active và công khai
    if (wh?.created_by && prevStatus === 'active' && !wh.is_private) {
      await adjustUserReputation(supabase, wh.created_by, -10);
    }

    // Trừ điểm các tác giả voice notes
    if (voiceNotes && voiceNotes.length > 0) {
      const affectedUserIds = Array.from(new Set(voiceNotes.map((vn) => vn.user_id).filter(Boolean)));
      for (const uid of affectedUserIds) {
        await recalculateReputation(supabase, uid as string);
      }
    }
  } else if (newStatus === 'active' && prevStatus === 'hidden') {
    // Hoàn lại điểm cho người ghim kho nếu là công khai
    if (wh?.created_by && !wh?.is_private) {
      await adjustUserReputation(supabase, wh.created_by, 10);
    }
  }
}

/**
 * Chuyển đổi chế độ riêng tư của điểm ghim (is_private):
 * - Nếu chuyển sang Riêng tư (is_private = true): Trừ 10 điểm cống hiến (nếu trước đó là công khai & active)
 * - Nếu chuyển sang Công khai (is_private = false): Cộng 10 điểm cống hiến cho người ghim (nếu đang active)
 */
export async function toggleWarehousePrivacy(
  supabase: SupabaseClient,
  warehouseId: string,
  newIsPrivate: boolean
) {
  // 1. Lấy thông tin kho hiện tại
  const { data: wh } = await supabase
    .from('warehouses')
    .select('created_by, status, is_private')
    .eq('id', warehouseId)
    .maybeSingle();

  const prevIsPrivate = !!wh?.is_private;

  // 2. Cập nhật is_private
  const { error } = await supabase
    .from('warehouses')
    .update({ is_private: newIsPrivate })
    .eq('id', warehouseId);

  if (error) throw error;

  // 3. Cập nhật điểm cống hiến tương ứng nếu kho đang active
  if (wh?.created_by && wh.status === 'active') {
    if (newIsPrivate && !prevIsPrivate) {
      // Công khai -> Riêng tư: trừ 10 điểm
      await adjustUserReputation(supabase, wh.created_by, -10);
    } else if (!newIsPrivate && prevIsPrivate) {
      // Riêng tư -> Công khai: cộng 10 điểm
      await adjustUserReputation(supabase, wh.created_by, 10);
    }
  }
}

/**
 * Chuyển đổi trạng thái voice note giữa 'active' và 'hidden':
 * - Khi ẩn voice ('hidden'): Trừ 5 điểm cống hiến của tác giả.
 * - Khi hiển thị lại ('active'): Cộng lại 5 điểm cống hiến cho tác giả.
 */
export async function toggleVoiceNoteStatus(
  supabase: SupabaseClient,
  noteId: string,
  newStatus: 'active' | 'hidden'
) {
  const { data: note } = await supabase
    .from('voice_notes')
    .select('user_id, status')
    .eq('id', noteId)
    .maybeSingle();

  const prevStatus = note?.status;

  const { error } = await supabase
    .from('voice_notes')
    .update({ status: newStatus })
    .eq('id', noteId);

  if (error) throw error;

  if (note?.user_id) {
    if (newStatus === 'hidden' && prevStatus === 'active') {
      await adjustUserReputation(supabase, note.user_id, -5);
    } else if (newStatus === 'active' && prevStatus === 'hidden') {
      await adjustUserReputation(supabase, note.user_id, 5);
    }
  }
}

/**
 * Khóa tài khoản (Ban):
 * - Xóa sạch điểm cống hiến (reputation_score = 0)
 * - Ẩn tất cả điểm ghim kho bãi do tài khoản này tạo (và cascade ẩn voice notes của các kho đó)
 * - Ẩn tất cả voice notes do tài khoản này đóng góp
 */
export async function banUser(supabase: SupabaseClient, userId: string) {
  // 1. Đặt is_banned = true và xóa trắng điểm cống hiến về 0
  const { error: banError } = await supabase
    .from('profiles')
    .update({ is_banned: true, reputation_score: 0 })
    .eq('id', userId);

  if (banError) throw banError;

  // 2. Ẩn tất cả kho hàng do tài xế này ghim (cascade ẩn các voice notes trên kho)
  const { data: userWarehouses } = await supabase
    .from('warehouses')
    .select('id')
    .eq('created_by', userId)
    .eq('status', 'active');

  if (userWarehouses && userWarehouses.length > 0) {
    for (const wh of userWarehouses) {
      await toggleWarehouseStatus(supabase, wh.id, 'hidden');
    }
  }

  // 3. Ẩn tất cả voice notes do tài xế này tạo
  await supabase
    .from('voice_notes')
    .update({ status: 'hidden' })
    .eq('user_id', userId);
}

/**
 * Mở khóa tài khoản (Unban):
 * - Đặt is_banned = false
 * - Tính toán lại điểm cống hiến hợp lệ
 */
export async function unbanUser(supabase: SupabaseClient, userId: string) {
  const { error: unbanError } = await supabase
    .from('profiles')
    .update({ is_banned: false })
    .eq('id', userId);

  if (unbanError) throw unbanError;

  // Tính lại điểm cống hiến thực tế từ các bài active
  await recalculateReputation(supabase, userId);
}
