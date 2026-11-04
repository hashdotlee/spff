import type { Post, Profile } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

let cachedPosts: Post[] = [];
let cachedTopDrivers: Profile[] = [];
let isPreloading = false;
let lastPreloadedAt = 0;

// Khởi tạo từ sessionStorage nếu có (an toàn môi trường browser)
if (typeof window !== 'undefined') {
  try {
    const storedPosts = sessionStorage.getItem('spff_cached_posts');
    if (storedPosts) {
      cachedPosts = JSON.parse(storedPosts);
    }
    const storedDrivers = sessionStorage.getItem('spff_cached_drivers');
    if (storedDrivers) {
      cachedTopDrivers = JSON.parse(storedDrivers);
    }
  } catch (_) {}
}

export function getFeedsCache() {
  return {
    posts: cachedPosts,
    topDrivers: cachedTopDrivers,
    hasCache: cachedPosts.length > 0,
  };
}

export function setFeedsCache(posts: Post[], topDrivers?: Profile[]) {
  cachedPosts = posts;
  if (topDrivers && topDrivers.length > 0) {
    cachedTopDrivers = topDrivers;
  }
  lastPreloadedAt = Date.now();

  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem('spff_cached_posts', JSON.stringify(posts));
      if (topDrivers && topDrivers.length > 0) {
        sessionStorage.setItem('spff_cached_drivers', JSON.stringify(topDrivers));
      }
    } catch (_) {}
  }
}

/**
 * Preload feeds dữ liệu trước khi người dùng bấm vào tab Bảng Tin.
 * Chạy ngầm khi vào app hoặc khi người dùng ở bất kỳ trang nào.
 */
export async function preloadFeedsData(supabase: SupabaseClient) {
  // Tránh gọi trùng lặp liên tục trong vòng 15 giây
  if (isPreloading || (cachedPosts.length > 0 && Date.now() - lastPreloadedAt < 15000)) return;
  isPreloading = true;

  try {
    const [postsRes, driversRes] = await Promise.all([
      supabase
        .from('posts')
        .select(`*, user:profiles(*)`)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(60),
      supabase
        .from('profiles')
        .select('*')
        .eq('is_banned', false)
        .gt('reputation_score', 0)
        .order('reputation_score', { ascending: false })
        .limit(8),
    ]);

    let reversedPosts: Post[] = cachedPosts;
    if (postsRes.data) {
      // Đảo ngược thứ tự cho giao diện chat (tin cũ ở trên, tin mới ở dưới)
      reversedPosts = postsRes.data
        .slice()
        .reverse()
        .map((p: any) => ({
          ...p,
          user_vote: null,
          net_score: (p.upvotes_count || 0) - (p.downvotes_count || 0),
        }));
    }

    let drivers: Profile[] = cachedTopDrivers;
    if (driversRes.data) {
      drivers = driversRes.data as Profile[];
    }

    setFeedsCache(reversedPosts, drivers);
  } catch (err) {
    console.warn('Lỗi preload feeds:', err);
  } finally {
    isPreloading = false;
  }
}
