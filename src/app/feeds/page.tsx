'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Post, Profile } from '@/types/database';
import { DriverAvatar } from '@/components/common/DriverAvatar';
import {
  Send,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Trophy,
  ChevronRight,
  Pin,
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
  const [topDrivers, setTopDrivers] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitialScrollDone = useRef(false);

  const supabase = createClient();

  // Lấy các tin nhắn có nhiều upvote nhất (net_score > 0, sắp xếp giảm dần, tối đa 3 tin)
  const pinnedPosts = [...posts]
    .filter((p) => (p.net_score ?? 0) > 0)
    .sort((a, b) => (b.net_score ?? 0) - (a.net_score ?? 0))
    .slice(0, 3);

  const scrollToPost = (postId: string) => {
    const el = document.getElementById(`post-${postId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-orange-500', 'bg-orange-50/50');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-orange-500', 'bg-orange-50/50');
      }, 2000);
    }
  };

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      block: 'end',
    });
  }, []);

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

  // 2. Tải danh sách Bác tài tiêu biểu
  useEffect(() => {
    async function loadTopDrivers() {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('is_banned', false)
          .gt('reputation_score', 0)
          .order('reputation_score', { ascending: false })
          .limit(8);
        if (data) setTopDrivers(data as Profile[]);
      } catch (err) {
        console.warn('Lỗi load top drivers:', err);
      }
    }
    loadTopDrivers();
  }, []);

  // 3. Tải toàn bộ danh sách tin nhắn (Không hiện loading giật màn hình khi re-fetch)
  const loadPosts = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
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

        // Đảo ngược thứ tự để tin cũ ở trên, tin mới ở dưới (chuẩn giao diện chat mobile)
        const parsedPosts: Post[] = data
          .slice()
          .reverse()
          .map((p: any) => ({
            ...p,
            user_vote: userVotesMap[p.id] || null,
            net_score: (p.upvotes_count || 0) - (p.downvotes_count || 0),
          }));

        setPosts(parsedPosts);
      }
    } catch (err) {
      console.warn('Lỗi loadPosts:', err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts(true);

    // Lắng nghe realtime các tin nhắn mới (chạy ngầm hoàn toàn, không loading giật màn hình)
    const channel = supabase
      .channel('feeds_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          loadPosts(false);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_votes' },
        () => {
          loadPosts(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPosts]);

  // Cuộn xuống tin nhắn mới nhất khi tải xong lần đầu
  useEffect(() => {
    if (!loading && posts.length > 0 && !isInitialScrollDone.current) {
      isInitialScrollDone.current = true;
      setTimeout(() => scrollToBottom(false), 80);
    }
  }, [loading, posts.length, scrollToBottom]);

  // 4. Gửi tin nhắn mới lên bảng tin (Tức thời, không hiển thị loading làm mất tập trung)
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

    // Tạo tin nhắn tạm hiện ngay lập tức
    const tempId = `temp-${Date.now()}`;
    const optimisticPost: Post = {
      id: tempId,
      user_id: currentUser.id,
      content: trimmed,
      tag: 'tam_su',
      province: null,
      status: 'active',
      upvotes_count: 0,
      downvotes_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user: currentUser,
      user_vote: null,
      net_score: 0,
    };

    // Đẩy ngay vào luồng chat và xóa ô input ngay lập tức
    setPosts((prev) => [...prev, optimisticPost]);
    setContent('');
    setTimeout(() => scrollToBottom(true), 40);

    try {
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
        setPosts((prev) => prev.filter((p) => p.id !== tempId));
        alert('Không thể gửi tin: ' + error.message);
        return;
      }

      if (data) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === tempId
              ? {
                  ...data,
                  user_vote: null,
                  net_score: 0,
                  upvotes_count: 0,
                  downvotes_count: 0,
                }
              : p
          )
        );
      }
    } catch (err) {
      console.error('Lỗi handleCreatePost:', err);
      setPosts((prev) => prev.filter((p) => p.id !== tempId));
    }
  }

  // 5. Xử lý Vote (Upvote / Downvote - Cập nhật tức thời, chạy ngầm)
  async function handleVote(post: Post, intendedValue: 1 | -1) {
    if (!currentUser) {
      alert('Vui lòng đăng nhập để bình chọn tin nhắn!');
      return;
    }

    const currentVote = post.user_vote;
    let nextVote: number | null = intendedValue;

    if (currentVote === intendedValue) {
      nextVote = null;
    }

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
      loadPosts(false);
    }
  }

  // 6. Xóa tin nhắn
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
    <div className="p-3 sm:p-4 pb-20 sm:pb-24 space-y-3 max-w-xl mx-auto w-full flex-1 flex flex-col justify-between">
      <div className="space-y-3">
        {/* 1. Vinh danh Bác tài tiêu biểu trên đầu */}
        <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border border-amber-200/80 rounded-2xl p-3 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-600 fill-amber-100" />
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-tight">
                Bác Tài Tiêu Biểu
              </h2>
            </div>
            <Link
              href="/leaderboard"
              className="text-[11px] font-bold text-amber-800 hover:text-amber-950 flex items-center gap-0.5 active:scale-95 transition"
            >
              <span>Bảng vàng</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Carousel Top Drivers */}
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
            {topDrivers.length === 0 ? (
              <div className="text-[11px] text-slate-400 italic py-1">Đang tải danh sách...</div>
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

        {/* 2. Tin nhắn được nhiều Upvote nhất được ghim lại ở Top */}
        {pinnedPosts.length > 0 && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50/70 border border-amber-200/90 rounded-2xl p-2.5 sm:p-3 shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between gap-1 text-[11px] font-black text-amber-900">
              <div className="flex items-center gap-1.5">
                <Pin className="w-3.5 h-3.5 text-orange-600 fill-orange-500 -rotate-45 shrink-0" />
                <span className="uppercase tracking-tight text-[10px] sm:text-[11px]">
                  Tin Ghim Nhiều Upvote Nhất
                </span>
              </div>
              <span className="text-[10px] font-extrabold text-amber-800 bg-amber-200/60 px-1.5 py-0.2 rounded-full shrink-0">
                Top {pinnedPosts.length}
              </span>
            </div>

            <div className="space-y-1.5">
              {pinnedPosts.map((post) => (
                <div
                  key={`pinned-${post.id}`}
                  onClick={() => scrollToPost(post.id)}
                  className="flex items-start gap-2 bg-white/95 hover:bg-white border border-amber-200/70 rounded-xl p-2 transition cursor-pointer active:scale-[0.99] shadow-2xs"
                  title="Bấm để cuộn đến tin nhắn này trong đoạn chat"
                >
                  <DriverAvatar profile={post.user} size="xs" showStars={true} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-slate-900 truncate">
                        {post.user?.full_name || 'Bác tài'}
                      </span>
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-0.5 shrink-0">
                        <ThumbsUp className="w-2.5 h-2.5" />
                        <span>+{post.net_score}</span>
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed mt-0.5">
                      {post.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Luồng Tin Nhắn Chat (Từ trên xuống dưới, tin mới nhất ở đáy) */}
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
          <div className="space-y-2.5">
            {posts.map((post) => {
              const isAuthor = Boolean(currentUser && post.user_id === currentUser.id);
              const isAdmin = currentUser?.role === 'admin';
              const isPinned = pinnedPosts.some((p) => p.id === post.id);

              return (
                <div
                  key={post.id}
                  id={`post-${post.id}`}
                  className={`flex items-start gap-2 sm:gap-2.5 group transition duration-300 rounded-2xl p-1 -m-1 ${
                    isPinned ? 'bg-amber-50/30' : ''
                  }`}
                >
                  {/* Avatar kèm sao dưới avatar */}
                  <DriverAvatar
                    profile={post.user}
                    size="sm"
                    showStars={true}
                    linkToProfile={true}
                  />

                  {/* Bong bóng tin nhắn */}
                  <div className="flex-1 min-w-0">
                    {/* Tên bác tài + Thời gian + Nút xóa */}
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <Link
                        href={`/profile/${post.user_id}`}
                        className="font-bold text-xs text-slate-900 hover:text-orange-600 transition truncate"
                      >
                        {post.user?.full_name || 'Bác tài'}
                      </Link>
                      {isPinned && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-amber-800 bg-amber-100 border border-amber-200 rounded px-1 py-0.2 shrink-0">
                          <Pin className="w-2.5 h-2.5 fill-amber-600 -rotate-45" />
                          <span>Ghim Top</span>
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-medium">
                        {formatRelativeTime(post.created_at)}
                      </span>

                      {(isAuthor || isAdmin) && (
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          className="p-0.5 text-slate-300 hover:text-red-500 rounded transition ml-auto opacity-70 group-hover:opacity-100 cursor-pointer"
                          title="Xóa tin nhắn"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Bong bóng nội dung chat + Reaction Upvote/Downvote */}
                    <div
                      className={`inline-block max-w-full sm:max-w-[90%] rounded-2xl rounded-tl-xs px-3 py-2 shadow-2xs border ${
                        isPinned
                          ? 'bg-amber-50/50 border-amber-200'
                          : 'bg-white border-slate-200/90'
                      }`}
                    >
                      <p className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
                        {post.content}
                      </p>

                      {/* Cụm Upvote / Downvote thu gọn như reaction chat */}
                      <div className="flex items-center justify-end gap-1 mt-1 pt-1 border-t border-slate-100/80">
                        <button
                          type="button"
                          onClick={() => handleVote(post, 1)}
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition flex items-center gap-0.5 cursor-pointer active:scale-95 ${
                            post.user_vote === 1
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'text-slate-400 hover:text-emerald-700 hover:bg-slate-50'
                          }`}
                          title="Upvote (+2 điểm)"
                        >
                          <ThumbsUp className="w-2.5 h-2.5" />
                          <span>{post.upvotes_count || 0}</span>
                        </button>

                        <span
                          className={`px-1 text-[10px] font-black ${
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

                        <button
                          type="button"
                          onClick={() => handleVote(post, -1)}
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition flex items-center gap-0.5 cursor-pointer active:scale-95 ${
                            post.user_vote === -1
                              ? 'bg-rose-100 text-rose-800'
                              : 'text-slate-400 hover:text-rose-700 hover:bg-slate-50'
                          }`}
                          title="Downvote"
                        >
                          <ThumbsDown className="w-2.5 h-2.5" />
                          <span>{post.downvotes_count || 0}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Điểm neo tự động cuộn xuống đáy chat */}
            <div ref={messagesEndRef} className="h-1" />
          </div>
        )}
      </div>

      {/* 3. Khung nhập tin nhắn Chat Cố Định Ở Đáy (Trên thanh BottomNavigation) */}
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] sm:bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] p-2 sm:p-3">
        <div className="max-w-xl mx-auto w-full">
          {currentUser ? (
            <form onSubmit={handleCreatePost} className="flex items-center gap-2">
              <DriverAvatar profile={currentUser} size="sm" showStars={true} />
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Nhập tin nhắn..."
                maxLength={300}
                className="flex-1 min-w-0 bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-orange-500 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none transition placeholder:text-slate-400 shadow-2xs"
              />
              <button
                type="submit"
                disabled={!content.trim()}
                className="p-2 sm:px-3.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 active:scale-95 shadow-2xs cursor-pointer"
                title="Gửi tin nhắn"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Gửi</span>
              </button>
            </form>
          ) : (
            <div className="py-2 px-3 bg-orange-50 rounded-xl flex items-center justify-between text-xs text-orange-950 border border-orange-200">
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
      </div>
    </div>
  );
}
