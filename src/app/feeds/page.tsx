'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Post, PostTag, Profile } from '@/types/database';
import { useProvince } from '@/lib/contexts/ProvinceContext';
import { DriverAvatar, DriverRankBadge } from '@/components/common/DriverAvatar';
import {
  MessageSquareText,
  Send,
  ThumbsUp,
  ThumbsDown,
  Trophy,
  MapPin,
  Clock,
  Trash2,
  AlertTriangle,
  ChevronRight,
  Flame,
  Globe,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';

const TAG_CONFIG: Record<
  PostTag,
  { label: string; icon: string; badgeClass: string; bgClass: string }
> = {
  ket_xe: {
    label: 'Kẹt xe',
    icon: '🚨',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    bgClass: 'border-l-red-500',
  },
  chot_gt: {
    label: 'Chốt CSGT',
    icon: '👮',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    bgClass: 'border-l-amber-500',
  },
  canh_bao: {
    label: 'Cảnh báo',
    icon: '⚠️',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
    bgClass: 'border-l-orange-500',
  },
  tam_su: {
    label: 'Tâm sự',
    icon: '☕',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    bgClass: 'border-l-blue-500',
  },
  quan_ngon: {
    label: 'Quán ngon',
    icon: '🍜',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bgClass: 'border-l-emerald-500',
  },
  khac: {
    label: 'Khác',
    icon: '📍',
    badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
    bgClass: 'border-l-slate-400',
  },
};

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return new Date(dateString).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
  });
}

export default function FeedsPage() {
  const { province } = useProvince();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [topDrivers, setTopDrivers] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filters & State
  const [selectedTag, setSelectedTag] = useState<PostTag | 'all'>('all');
  const [scope, setScope] = useState<'province' | 'all'>('province');
  const [content, setContent] = useState('');
  const [tag, setTag] = useState<PostTag>('tam_su');
  const [expandedNegativePosts, setExpandedNegativePosts] = useState<Record<string, boolean>>({});

  const supabase = createClient();

  // 1. Tải thông tin tài xế hiện tại
  useEffect(() => {
    async function loadAuth() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
          if (data) setCurrentUser(data as Profile);
        }
      } catch (err) {
        console.warn('Lỗi kiểm tra auth:', err);
      }
    }
    loadAuth();
  }, []);

  // 2. Tải Top 6 tài xế tiêu biểu cho thanh Vinh Danh trên cùng
  useEffect(() => {
    async function loadTopDrivers() {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('is_banned', false)
          .gt('reputation_score', 0)
          .order('reputation_score', { ascending: false })
          .limit(6);
        if (data) setTopDrivers(data as Profile[]);
      } catch (err) {
        console.warn('Lỗi load top drivers:', err);
      }
    }
    loadTopDrivers();
  }, []);

  // 3. Tải danh sách bài đăng
  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('posts')
        .select(`
          *,
          user:profiles(*)
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(50);

      // Lọc theo tỉnh nếu chọn tab "Tại [Tỉnh]"
      if (scope === 'province' && province) {
        query = query.or(`province.eq.${province},province.is.null`);
      }

      if (selectedTag !== 'all') {
        query = query.eq('tag', selectedTag);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Lỗi tải bài viết:', error);
        return;
      }

      if (data) {
        // Tải danh sách lượt vote của user hiện tại
        const {
          data: { user },
        } = await supabase.auth.getUser();

        let userVotesMap: Record<string, number> = {};
        if (user && data.length > 0) {
          const postIds = data.map((p: any) => p.id);
          const { data: votesData } = await supabase
            .from('post_votes')
            .select('post_id, vote_value')
            .eq('user_id', user.id)
            .in('post_id', postIds);

          if (votesData) {
            votesData.forEach((v: any) => {
              userVotesMap[v.post_id] = v.vote_value;
            });
          }
        }

        const parsedPosts: Post[] = data.map((p: any) => ({
          ...p,
          user_vote: userVotesMap[p.id] || null,
          net_score: (p.upvotes_count || 0) - (p.downvotes_count || 0),
        }));

        setPosts(parsedPosts);
      }
    } catch (err) {
      console.warn('Lỗi loadPosts:', err);
    } finally {
      setLoading(false);
    }
  }, [scope, province, selectedTag]);

  useEffect(() => {
    loadPosts();

    // Lắng nghe realtime các bài đăng mới
    const channel = supabase
      .channel('feeds_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          loadPosts();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_votes' },
        () => {
          loadPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPosts]);

  // 4. Đăng bài viết mới
  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) {
      alert('Vui lòng đăng nhập để đăng bài lên bảng tin!');
      return;
    }

    const trimmed = content.trim();
    if (!trimmed) return;
    if (trimmed.length > 280) {
      alert('Nội dung tối đa 280 ký tự!');
      return;
    }

    try {
      setSubmitting(true);
      const postPayload = {
        user_id: currentUser.id,
        content: trimmed,
        tag,
        province: province || null,
        status: 'active',
      };

      const { data, error } = await supabase
        .from('posts')
        .insert(postPayload)
        .select(`*, user:profiles(*)`)
        .single();

      if (error) {
        console.error('Lỗi khi đăng bài:', error);
        alert('Không thể đăng bài: ' + error.message);
        return;
      }

      if (data) {
        const newPost: Post = {
          ...data,
          user_vote: null,
          net_score: 0,
          upvotes_count: 0,
          downvotes_count: 0,
        };
        setPosts((prev) => [newPost, ...prev]);
        setContent('');
      }
    } catch (err) {
      console.error('Lỗi handleCreatePost:', err);
    } finally {
      setSubmitting(false);
    }
  }

  // 5. Xử lý Vote (Upvote / Downvote)
  async function handleVote(post: Post, intendedValue: 1 | -1) {
    if (!currentUser) {
      alert('Vui lòng đăng nhập để bình chọn bài viết!');
      return;
    }

    const currentVote = post.user_vote;
    let nextVote: number | null = intendedValue;

    // Bấm lại cùng nút -> Hủy vote
    if (currentVote === intendedValue) {
      nextVote = null;
    }

    // Tính toán lạc quan (Optimistic update)
    let deltaUp = 0;
    let deltaDown = 0;

    if (currentVote === 1) deltaUp -= 1;
    if (currentVote === -1) deltaDown -= 1;

    if (nextVote === 1) deltaUp += 1;
    if (nextVote === -1) deltaDown += 1;

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== post.id) return p;
        const newUp = Math.max(0, (p.upvotes_count || 0) + deltaUp);
        const newDown = Math.max(0, (p.downvotes_count || 0) + deltaDown);
        return {
          ...p,
          user_vote: nextVote,
          upvotes_count: newUp,
          downvotes_count: newDown,
          net_score: newUp - newDown,
        };
      })
    );

    try {
      if (nextVote === null) {
        await supabase
          .from('post_votes')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', currentUser.id);
      } else {
        await supabase.from('post_votes').upsert(
          {
            post_id: post.id,
            user_id: currentUser.id,
            vote_value: nextVote,
          },
          { onConflict: 'post_id,user_id' }
        );
      }
    } catch (err) {
      console.error('Lỗi khi gửi vote:', err);
      // Revert if error
      loadPosts();
    }
  }

  // 6. Xóa bài viết
  async function handleDeletePost(postId: string) {
    if (!window.confirm('Bạn có chắc muốn xóa bài đăng này không?')) return;

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) {
        alert('Không thể xóa bài viết: ' + error.message);
        return;
      }

      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      console.error('Lỗi handleDeletePost:', err);
    }
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-2xl mx-auto w-full">
      {/* 1. Header & Vinh danh Bác tài tiêu biểu */}
      <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border border-amber-200/80 rounded-2xl p-3.5 sm:p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <Trophy className="w-4 h-4 fill-amber-100" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                <span>Bác Tài Tiêu Biểu</span>
              </h2>
              <p className="text-[10px] text-slate-500 font-medium">
                Ngôi sao vinh danh theo số điểm cống hiến
              </p>
            </div>
          </div>
          <Link
            href="/leaderboard"
            className="px-2.5 py-1 text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-xl transition flex items-center gap-1 shrink-0 active:scale-95"
            title="Xem toàn bộ bảng vàng bác tài"
          >
            <span>Bảng vàng</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Carousel / Row Top Drivers with stars under avatar */}
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
          {topDrivers.length === 0 ? (
            <div className="text-[11px] text-slate-500 italic py-2">Đang tải danh sách bác tài...</div>
          ) : (
            topDrivers.map((driver, index) => (
              <Link
                key={driver.id}
                href={`/profile/${driver.id}`}
                className="flex flex-col items-center gap-1 group shrink-0 active:scale-95 transition"
              >
                <div className="relative pt-1 pb-1">
                  <DriverAvatar profile={driver} size="md" showStars={true} />
                  {index < 3 && (
                    <span
                      className={`absolute -top-1 -right-1 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white shadow-2xs ${
                        index === 0
                          ? 'bg-amber-400 text-slate-900'
                          : index === 1
                          ? 'bg-slate-300 text-slate-900'
                          : 'bg-amber-700 text-white'
                      }`}
                    >
                      {index + 1}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-bold text-slate-800 max-w-[68px] truncate text-center">
                  {driver.full_name?.split(' ').slice(-1)[0] || 'Bác tài'}
                </span>
                <span className="text-[9px] font-extrabold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded-full border border-amber-200">
                  {driver.reputation_score}đ
                </span>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* 2. Hộp Đăng Tin Nhanh (Twitt Composer) */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquareText className="w-4 h-4 text-orange-600" />
            <h1 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight">
              Bảng Tin Bác Tài
            </h1>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            {content.length}/280 ký tự
          </span>
        </div>

        {currentUser ? (
          <form onSubmit={handleCreatePost} className="space-y-3">
            <div className="flex gap-2.5 items-start">
              <DriverAvatar profile={currentUser} size="sm" showStars={true} />
              <div className="flex-1 min-w-0">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Bác tài ơi, đường sá hôm nay thế nào? Kẹt xe, ngập nước, chốt CSGT..."
                  rows={2}
                  maxLength={280}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition resize-none placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Chọn nhanh Tag */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Chọn chủ đề:
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {(Object.keys(TAG_CONFIG) as PostTag[]).map((t) => {
                  const cfg = TAG_CONFIG[t];
                  const isSelected = tag === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTag(t)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer active:scale-95 ${
                        isSelected
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <span>{cfg.icon}</span>
                      <span>{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Bar của Form: Vị trí + Nút Đăng */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
              <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                <MapPin className="w-3.5 h-3.5 text-orange-600" />
                <span>
                  Đăng tại: <strong className="text-slate-700">{province}</strong>
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting || !content.trim()}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Đăng tin</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-center space-y-2">
            <p className="text-xs text-orange-950 font-medium">
              Đăng nhập để đăng trạng thái chia sẻ đường sá và bình chọn bài viết cho đồng nghiệp.
            </p>
            <Link
              href="/login"
              className="inline-block px-4 py-1.5 bg-orange-600 text-white text-xs font-bold rounded-xl hover:bg-orange-700 transition active:scale-95 shadow-2xs"
            >
              Đăng nhập ngay &rarr;
            </Link>
          </div>
        )}
      </div>

      {/* 3. Thanh Bộ Lọc: Tỉnh thành & Tags */}
      <div className="space-y-2">
        {/* Toggle Scope: Tại Tỉnh vs Toàn quốc */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center bg-slate-200/70 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setScope('province')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                scope === 'province'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-orange-600" />
              <span>Tại {province}</span>
            </button>
            <button
              onClick={() => setScope('all')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                scope === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              <span>Toàn quốc</span>
            </button>
          </div>

          <span className="text-[11px] text-slate-500 font-medium">
            {posts.length} bài đăng
          </span>
        </div>

        {/* Lọc theo Tag */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => setSelectedTag('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              selectedTag === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Tất cả
          </button>
          {(Object.keys(TAG_CONFIG) as PostTag[]).map((t) => {
            const cfg = TAG_CONFIG[t];
            const isSelected = selectedTag === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTag(t)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Danh Sách Bài Viết (Feed Cards) */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 mx-auto flex items-center justify-center">
            <MessageSquareText className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Chưa có bài đăng nào</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Hãy là bác tài đầu tiên chia sẻ thông tin đường sá hoặc chào hỏi anh em hôm nay!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const tagCfg = TAG_CONFIG[post.tag] || TAG_CONFIG.tam_su;
            const isAuthor = Boolean(currentUser && post.user_id === currentUser.id);
            const isAdmin = currentUser?.role === 'admin';
            const isNegative = (post.net_score ?? 0) <= -5;
            const isExpanded = expandedNegativePosts[post.id];

            return (
              <div
                key={post.id}
                className={`bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-xs hover:shadow-md transition duration-200 space-y-3 ${tagCfg.bgClass} border-l-4`}
              >
                {/* Header Card: Avatar + Sao + Tên + Tag + Thời gian */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <DriverAvatar
                      profile={post.user}
                      size="md"
                      showStars={true}
                      linkToProfile={true}
                    />

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link
                          href={`/profile/${post.user_id}`}
                          className="font-bold text-xs sm:text-sm text-slate-900 hover:text-orange-600 transition truncate"
                        >
                          {post.user?.full_name || 'Bác tài'}
                        </Link>
                        {post.user?.reputation_score !== undefined && (
                          <DriverRankBadge
                            reputationScore={post.user.reputation_score}
                            showTitle={false}
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{formatRelativeTime(post.created_at)}</span>
                        {post.province && (
                          <>
                            <span>•</span>
                            <span className="text-slate-600 font-semibold truncate max-w-[110px]">
                              📍 {post.province}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Tag badge */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 ${tagCfg.badgeClass}`}
                    >
                      <span>{tagCfg.icon}</span>
                      <span>{tagCfg.label}</span>
                    </span>

                    {/* Delete button (only author or admin) */}
                    {(isAuthor || isAdmin) && (
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded-lg transition active:scale-90 cursor-pointer"
                        title="Xóa bài đăng"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Content text */}
                {isNegative && !isExpanded ? (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-2 text-xs text-rose-800">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Bài viết này bị nhiều anh em đánh giá tiêu cực / sai lệch.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedNegativePosts((prev) => ({ ...prev, [post.id]: true }))
                      }
                      className="font-bold underline shrink-0 hover:text-rose-950 flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Xem</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
                    {post.content}
                  </p>
                )}

                {/* Bottom Row: Upvote / Score / Downvote */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1 shadow-2xs">
                    {/* Upvote Button */}
                    <button
                      type="button"
                      onClick={() => handleVote(post, 1)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95 ${
                        post.user_vote === 1
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                      }`}
                      title="Hữu ích / Upvote (+2 điểm cho tác giả)"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{post.upvotes_count || 0}</span>
                    </button>

                    {/* Net Score Indicator */}
                    <span
                      className={`px-1.5 py-0.5 text-xs font-black rounded-md ${
                        (post.net_score ?? 0) > 0
                          ? 'text-emerald-700 font-extrabold'
                          : (post.net_score ?? 0) < 0
                          ? 'text-rose-700 font-extrabold'
                          : 'text-slate-500'
                      }`}
                    >
                      {(post.net_score ?? 0) > 0
                        ? `+${post.net_score}`
                        : post.net_score ?? 0}
                    </span>

                    {/* Downvote Button */}
                    <button
                      type="button"
                      onClick={() => handleVote(post, -1)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95 ${
                        post.user_vote === -1
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                      }`}
                      title="Không chuẩn / Downvote"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>{post.downvotes_count || 0}</span>
                    </button>
                  </div>

                  {/* Cảm ơn / Cộng điểm cống hiến badge */}
                  <span className="text-[10px] text-slate-400 font-medium hidden xs:inline">
                    👍 Upvote cộng điểm uy tín cho bác tài
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
