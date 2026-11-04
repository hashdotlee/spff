'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Post, Profile } from '@/types/database';
import { DriverAvatar, DriverRankBadge } from '@/components/common/DriverAvatar';
import {
  Send,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Loader2,
  MessageSquare,
} from 'lucide-react';

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
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState('');

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

  // 2. Tải toàn bộ danh sách tin nhắn (Không lọc, hiển thị luồng chat chung)
  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          user:profiles(*)
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) {
        console.error('Lỗi tải bài viết:', error);
        return;
      }

      if (data) {
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
  }, []);

  useEffect(() => {
    loadPosts();

    // Lắng nghe realtime các tin nhắn mới
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

  // 3. Gửi tin nhắn mới lên bảng tin
  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) {
      alert('Vui lòng đăng nhập để gửi tin nhắn!');
      return;
    }

    const trimmed = content.trim();
    if (!trimmed) return;
    if (trimmed.length > 300) {
      alert('Nội dung tối đa 300 ký tự!');
      return;
    }

    try {
      setSubmitting(true);
      const postPayload = {
        user_id: currentUser.id,
        content: trimmed,
        tag: 'tam_su',
        status: 'active',
      };

      const { data, error } = await supabase
        .from('posts')
        .insert(postPayload)
        .select(`*, user:profiles(*)`)
        .single();

      if (error) {
        console.error('Lỗi khi gửi tin nhắn:', error);
        alert('Không thể gửi tin: ' + error.message);
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

  // 4. Xử lý Vote (Upvote / Downvote)
  async function handleVote(post: Post, intendedValue: 1 | -1) {
    if (!currentUser) {
      alert('Vui lòng đăng nhập để bình chọn tin nhắn!');
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
      loadPosts();
    }
  }

  // 5. Xóa tin nhắn
  async function handleDeletePost(postId: string) {
    if (!window.confirm('Bạn có chắc muốn xóa tin nhắn này không?')) return;

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) {
        alert('Không thể xóa: ' + error.message);
        return;
      }

      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      console.error('Lỗi handleDeletePost:', err);
    }
  }

  return (
    <div className="p-3 sm:p-4 space-y-3 max-w-xl mx-auto w-full">
      {/* 1. Header tinh gọn */}
      <div className="flex items-center justify-between px-1">
        <h1 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4 text-orange-600" />
          <span>Bảng Tin Anh Em</span>
        </h1>
        <span className="text-[11px] text-slate-400 font-medium">
          {posts.length} tin nhắn
        </span>
      </div>

      {/* 2. Khung nhập tin nhắn phong cách Chat (Clear & Minimal) */}
      <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200 shadow-xs">
        {currentUser ? (
          <form onSubmit={handleCreatePost} className="flex items-center gap-2">
            <DriverAvatar profile={currentUser} size="sm" showStars={true} />
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nhập tin nhắn..."
              maxLength={300}
              className="flex-1 min-w-0 bg-slate-50 focus:bg-white border border-slate-200 focus:border-orange-500 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none transition placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="p-2 sm:px-3.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 active:scale-95 shadow-2xs cursor-pointer"
              title="Gửi tin nhắn"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Gửi</span>
            </button>
          </form>
        ) : (
          <div className="py-2 px-3 bg-orange-50 rounded-xl flex items-center justify-between text-xs text-orange-950">
            <span>Đăng nhập để nhắn tin và bình chọn.</span>
            <Link
              href="/login"
              className="font-bold underline text-orange-700 hover:text-orange-900"
            >
              Đăng nhập &rarr;
            </Link>
          </div>
        )}
      </div>

      {/* 3. Luồng Tin Nhắn (Chat Messages Stream) */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-7 h-7 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-1">
          <p className="text-xs font-bold text-slate-700">Chưa có tin nhắn nào</p>
          <p className="text-[11px] text-slate-400">
            Hãy là người đầu tiên gửi tin nhắn chào anh em!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => {
            const isAuthor = Boolean(currentUser && post.user_id === currentUser.id);
            const isAdmin = currentUser?.role === 'admin';

            return (
              <div
                key={post.id}
                className="bg-white rounded-2xl p-3 border border-slate-200/90 shadow-2xs hover:border-slate-300 transition duration-150 space-y-2"
              >
                {/* Header: Avatar với sao + Tên + Thời gian + Xóa */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
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
                      <span className="text-[10px] text-slate-400 font-medium block">
                        {formatRelativeTime(post.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Nút xóa (chỉ tác giả hoặc admin) */}
                  {(isAuthor || isAdmin) && (
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded-lg transition active:scale-90 cursor-pointer"
                      title="Xóa tin nhắn"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Nội dung tin nhắn */}
                <p className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words pl-0.5">
                  {post.content}
                </p>

                {/* Footer: Cụm nút Upvote / Downvote */}
                <div className="flex items-center justify-end pt-1">
                  <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-0.5 shadow-2xs">
                    {/* Upvote Button */}
                    <button
                      type="button"
                      onClick={() => handleVote(post, 1)}
                      className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95 ${
                        post.user_vote === 1
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                      }`}
                      title="Upvote (+2 điểm cho tác giả)"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{post.upvotes_count || 0}</span>
                    </button>

                    {/* Net Score */}
                    <span
                      className={`px-1 text-xs font-black ${
                        (post.net_score ?? 0) > 0
                          ? 'text-emerald-700 font-extrabold'
                          : (post.net_score ?? 0) < 0
                          ? 'text-rose-700 font-extrabold'
                          : 'text-slate-400'
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
                      className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95 ${
                        post.user_vote === -1
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                      }`}
                      title="Downvote"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>{post.downvotes_count || 0}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
