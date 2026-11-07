'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Post, Profile, Warehouse } from '@/types/database';
import { DriverAvatar } from '@/components/common/DriverAvatar';
import { getFeedsCache, setFeedsCache } from '@/lib/utils/feedsCache';
import { reverseGeocode } from '@/lib/utils/geocoding';
import {
  Send,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Trophy,
  ChevronRight,
  ChevronDown,
  MapPin,
  Building2,
  Search,
  X,
  Loader2,
  Camera,
  Zap,
  ZoomIn,
} from 'lucide-react';
import {
  compressImageWithDetails,
  formatBytes,
  uploadImageToSupabase,
  type ImageCompressionResult,
} from '@/lib/utils/imageUpload';

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

function renderMessageContent(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      const isMap =
        part.includes('maps.google.com') ||
        part.includes('google.com/maps') ||
        part.includes('goo.gl/maps');
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-orange-600 hover:text-orange-700 underline font-bold break-all inline-flex items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {isMap ? '📍 Xem trên bản đồ' : part}
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export default function FeedsPage() {
  const initialCache = getFeedsCache();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [topDrivers, setTopDrivers] = useState<Profile[]>(initialCache.topDrivers);
  const [posts, setPosts] = useState<Post[]>(initialCache.posts);
  const [loading, setLoading] = useState(!initialCache.hasCache);
  const [content, setContent] = useState('');
  const [votingPostId, setVotingPostId] = useState<string | null>(null);
  const [isTopDriversExpanded, setIsTopDriversExpanded] = useState(false);

  // Quick Action States
  const [isLocating, setIsLocating] = useState(false);
  const [isWarehousePickerOpen, setIsWarehousePickerOpen] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [warehouseSearch, setWarehouseSearch] = useState('');

  // Image Upload States
  const [selectedPhoto, setSelectedPhoto] = useState<{
    blob: Blob;
    previewUrl: string;
    compression: ImageCompressionResult | null;
  } | null>(null);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewingImageUrl, setPreviewingImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitialScrollDone = useRef(false);
  const lastVoteTimeRef = useRef<number>(0);

  const supabase = createClient();

  // Dọn dẹp URL object của ảnh khi đổi ảnh hoặc unmount
  useEffect(() => {
    return () => {
      if (selectedPhoto?.previewUrl) {
        URL.revokeObjectURL(selectedPhoto.previewUrl);
      }
    };
  }, [selectedPhoto?.previewUrl]);

  // Đánh dấu đã xem toàn bộ tin nhắn khi ở trang bảng tin
  useEffect(() => {
    try {
      localStorage.setItem('spff_feeds_last_read', new Date().toISOString());
    } catch (_) {}
  }, [posts.length]);

  // Chỉ lấy tối đa 3 tin có nhiều upvote nhất và mới nhất
  const pinnedPosts = [...posts]
    .filter((p) => (p.net_score ?? 0) > 0)
    .sort((a, b) => {
      const scoreDiff = (b.net_score ?? 0) - (a.net_score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
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
        if (data) {
          const list = data as Profile[];
          setTopDrivers(list);
          setFeedsCache(getFeedsCache().posts, list);
        }
      } catch (err) {
        console.warn('Lỗi load top drivers:', err);
      }
    }
    loadTopDrivers();
  }, []);

  // 3. Tải toàn bộ danh sách tin nhắn (Không hiện loading giật màn hình khi re-fetch)
  const loadPosts = useCallback(async (isInitial = false) => {
    try {
      // Chỉ hiện spinner tải nếu bộ nhớ tạm hoàn toàn trống
      if (isInitial && !getFeedsCache().hasCache) {
        setLoading(true);
      }
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
        setFeedsCache(parsedPosts, getFeedsCache().topDrivers);
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
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('feeds_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          // Bỏ qua nếu người dùng vừa mới thực hiện thao tác vote trong vòng 2 giây
          if (Date.now() - lastVoteTimeRef.current < 2000) return;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            loadPosts(false);
          }, 400);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
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

  // Xử lý chọn ảnh & nén bằng Canvas trước khi tải lên
  async function handleImageFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp định dạng hình ảnh!');
      return;
    }

    setIsCompressingPhoto(true);
    try {
      // Nén ảnh bằng Canvas với độ phân giải tối đa 1280px, nén JPEG 0.82
      const result = await compressImageWithDetails(file, 1280, 1280, 0.82);
      const url = URL.createObjectURL(result.blob);

      if (selectedPhoto?.previewUrl) {
        URL.revokeObjectURL(selectedPhoto.previewUrl);
      }

      setSelectedPhoto({
        blob: result.blob,
        previewUrl: url,
        compression: result,
      });
    } catch (err) {
      console.error('Lỗi khi nén ảnh:', err);
      const url = URL.createObjectURL(file);
      if (selectedPhoto?.previewUrl) {
        URL.revokeObjectURL(selectedPhoto.previewUrl);
      }
      setSelectedPhoto({
        blob: file,
        previewUrl: url,
        compression: null,
      });
    } finally {
      setIsCompressingPhoto(false);
      e.target.value = '';
    }
  }

  function handleRemoveSelectedPhoto() {
    if (selectedPhoto?.previewUrl) {
      URL.revokeObjectURL(selectedPhoto.previewUrl);
    }
    setSelectedPhoto(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // 4. Gửi tin nhắn mới lên bảng tin (Tức thời, hỗ trợ văn bản và hình ảnh đã nén)
  async function sendFeedMessage(
    msgText: string,
    photoBlob?: Blob | null,
    photoPreviewUrl?: string | null
  ) {
    if (!currentUser) {
      alert('Vui lòng đăng nhập để gửi tin nhắn!');
      return;
    }

    const trimmed = msgText.trim();
    if (!trimmed && !photoBlob) return;
    if (trimmed.length > 500) {
      alert('Nội dung quá dài (tối đa 500 ký tự)!');
      return;
    }

    // Tạo tin nhắn tạm hiện ngay lập tức
    const tempId = `temp-${Date.now()}`;
    const optimisticPost: Post = {
      id: tempId,
      user_id: currentUser.id,
      content: trimmed || (photoBlob ? '📷 [Hình ảnh]' : ''),
      image_url: photoPreviewUrl || null,
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

    // Đẩy ngay vào luồng chat
    setPosts((prev) => {
      const updated = [...prev, optimisticPost];
      setFeedsCache(updated, topDrivers);
      return updated;
    });
    setTimeout(() => scrollToBottom(true), 40);

    try {
      let uploadedImageUrl: string | null = null;
      if (photoBlob) {
        setIsUploading(true);
        const fileName = `${currentUser.id}_${Date.now()}.jpg`;
        uploadedImageUrl = await uploadImageToSupabase(supabase, photoBlob, {
          primaryBucket: 'feed-images',
          fileName,
          fallbackBucket: 'warehouse-images',
          compress: false, // Ảnh đã được nén trước khi upload
        });
      }

      const postPayload: any = {
        user_id: currentUser.id,
        content: trimmed || (uploadedImageUrl ? '📷 [Hình ảnh]' : ''),
        tag: 'tam_su',
        status: 'active',
      };
      if (uploadedImageUrl) {
        postPayload.image_url = uploadedImageUrl;
      }

      let { data, error } = await supabase
        .from('posts')
        .insert(postPayload)
        .select(`*, user:profiles(*)`)
        .single();

      // Fallback nếu database chưa có cột image_url
      if (error && (error.code === '42703' || error.message?.includes('image_url'))) {
        console.warn('Cột image_url chưa có trong bảng posts, lưu link ảnh kèm nội dung:', error.message);
        delete postPayload.image_url;
        postPayload.content = trimmed ? `${trimmed}\n${uploadedImageUrl}` : `${uploadedImageUrl}`;
        const fallbackRes = await supabase
          .from('posts')
          .insert(postPayload)
          .select(`*, user:profiles(*)`)
          .single();
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) {
        console.error('Lỗi khi gửi tin nhắn:', error);
        setPosts((prev) => {
          const reverted = prev.filter((p) => p.id !== tempId);
          setFeedsCache(reverted, topDrivers);
          return reverted;
        });
        alert('Không thể gửi tin: ' + error.message);
        return;
      }

      if (data) {
        setPosts((prev) => {
          const updated = prev.map((p) =>
            p.id === tempId
              ? {
                  ...data,
                  user_vote: null,
                  net_score: 0,
                  upvotes_count: 0,
                  downvotes_count: 0,
                }
              : p
          );
          setFeedsCache(updated, topDrivers);
          return updated;
        });
      }
    } catch (err: any) {
      console.error('Lỗi sendFeedMessage:', err);
      setPosts((prev) => {
        const reverted = prev.filter((p) => p.id !== tempId);
        setFeedsCache(reverted, topDrivers);
        return reverted;
      });
      alert('Lỗi gửi tin: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed && !selectedPhoto) return;

    const currentContent = trimmed;
    const photoBlob = selectedPhoto?.blob || null;
    const previewUrl = selectedPhoto?.previewUrl || null;

    setContent('');
    setSelectedPhoto(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    await sendFeedMessage(currentContent, photoBlob, previewUrl);
  }

  // Gửi định vị GPS hiện tại
  async function handleSendCurrentLocation() {
    if (!currentUser) {
      alert('Vui lòng đăng nhập để gửi định vị!');
      return;
    }
    if (isLocating) return;

    if (!navigator.geolocation) {
      alert('Thiết bị của bạn không hỗ trợ định vị GPS.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const addr = await reverseGeocode(latitude, longitude);
          const mapUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
          const text = addr
            ? `📍 Vị trí hiện tại: ${addr} - ${mapUrl}`
            : `📍 Vị trí hiện tại: ${mapUrl}`;
          await sendFeedMessage(text);
        } catch (err) {
          console.error('Lỗi khi gửi định vị:', err);
        } finally {
          setIsLocating(false);
        }
      },
      (err) => {
        console.warn('Lỗi lấy vị trí GPS:', err);
        alert('Không thể lấy vị trí hiện tại. Vui lòng bật quyền truy cập GPS!');
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  }

  // Mở modal chọn kho
  async function handleOpenWarehousePicker() {
    if (!currentUser) {
      alert('Vui lòng đăng nhập để gửi định vị kho!');
      return;
    }
    setIsWarehousePickerOpen(true);
    if (warehouses.length === 0) {
      setLoadingWarehouses(true);
      try {
        const { data } = await supabase
          .from('warehouses')
          .select('*')
          .eq('status', 'active')
          .order('name', { ascending: true })
          .limit(100);
        if (data) {
          setWarehouses(data as Warehouse[]);
        }
      } catch (err) {
        console.warn('Lỗi tải danh sách kho:', err);
      } finally {
        setLoadingWarehouses(false);
      }
    }
  }

  // Chọn kho để gửi định vị
  async function handleSelectWarehouse(wh: Warehouse) {
    setIsWarehousePickerOpen(false);
    const mapUrl = `https://maps.google.com/?q=${wh.latitude},${wh.longitude}`;
    const text = wh.address
      ? `🏢 Kho ${wh.name}: ${wh.address} - ${mapUrl}`
      : `🏢 Kho ${wh.name} - ${mapUrl}`;
    await sendFeedMessage(text);
  }

  // 5. Xử lý Vote (Upvote / Downvote - Cập nhật sau khi hoàn tất để tránh giật lag)
  async function handleVote(post: Post, intendedValue: 1 | -1) {
    if (!currentUser) {
      alert('Vui lòng đăng nhập để bình chọn tin nhắn!');
      return;
    }

    if (votingPostId === post.id) return;

    const currentVote = post.user_vote;
    const nextVote: number | null = currentVote === intendedValue ? null : intendedValue;

    setVotingPostId(post.id);
    lastVoteTimeRef.current = Date.now();

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

      // Chỉ cập nhật hiển thị sau khi đã lưu DB thành công (không giật hiện rồi tắt)
      let deltaUp = 0;
      let deltaDown = 0;

      if (currentVote === 1) deltaUp -= 1;
      if (currentVote === -1) deltaDown -= 1;

      if (nextVote === 1) deltaUp += 1;
      if (nextVote === -1) deltaDown += 1;

      setPosts((prev) => {
        const updated = prev.map((p) => {
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
        });
        setFeedsCache(updated, topDrivers);
        return updated;
      });
    } catch (err) {
      console.error('Lỗi khi gửi vote:', err);
    } finally {
      setVotingPostId(null);
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

      setPosts((prev) => {
        const updated = prev.filter((p) => p.id !== postId);
        setFeedsCache(updated, topDrivers);
        return updated;
      });
    } catch (err) {
      console.error('Lỗi handleDeletePost:', err);
    }
  }

  return (
    <div className="p-3 sm:p-4 pb-28 sm:pb-32 space-y-3 max-w-xl mx-auto w-full flex-1 flex flex-col justify-between">
      <div className="space-y-3">
        {/* 1. Vinh danh Bác tài tiêu biểu trên đầu (Mặc định thu gọn, mở rộng khi cần) */}
        <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border border-amber-200/80 rounded-2xl px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-2xs transition-all">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setIsTopDriversExpanded((prev) => !prev)}
              className="flex items-center gap-2 group cursor-pointer text-left py-0.5 active:scale-98 transition min-w-0"
              title={isTopDriversExpanded ? 'Bấm để thu gọn danh sách' : 'Bấm để mở danh sách Bác tài tiêu biểu'}
            >
              <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 shrink-0 group-hover:bg-amber-200 transition">
                <Trophy className="w-3.5 h-3.5 fill-amber-500 text-amber-600" />
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">
                  Bác Tài Tiêu Biểu
                </h2>
                {topDrivers.length > 0 && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100/80 px-1.5 py-0.2 rounded-full border border-amber-200 shrink-0">
                    {topDrivers.length}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 group-hover:text-amber-800 transition-transform duration-200 shrink-0 ${
                    isTopDriversExpanded ? 'rotate-180 text-amber-800' : ''
                  }`}
                />
              </div>
            </button>

            <Link
              href="/leaderboard"
              className="text-[11px] font-bold text-amber-800 hover:text-amber-950 flex items-center gap-0.5 active:scale-95 transition shrink-0"
            >
              <span>Bảng vàng</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Carousel Top Drivers khi mở rộng */}
          {isTopDriversExpanded && (
            <div className="mt-2.5 pt-2 border-t border-amber-200/60 flex items-center gap-3 overflow-x-auto no-scrollbar py-1 animate-in fade-in duration-200">
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
          )}
        </div>

        {/* 2. Tin nhắn được nhiều Upvote nhất được ghim lại ở Top (Tối đa 3 tin, tối đa 1 dòng, phân biệt bằng màu ấm) */}
        {pinnedPosts.length > 0 && (
          <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border border-amber-300/80 rounded-2xl p-2 sm:p-2.5 shadow-2xs">
            {/* Hàng ngang cuộn lướt sang tiết kiệm không gian */}
            <div className="flex items-start gap-2.5 overflow-x-auto no-scrollbar snap-x py-0.5">
              {pinnedPosts.map((post) => (
                <div
                  key={`pinned-${post.id}`}
                  onClick={() => scrollToPost(post.id)}
                  className="w-[200px] xs:w-[230px] sm:w-[250px] shrink-0 snap-start bg-white/95 hover:bg-white border border-amber-200/80 rounded-xl p-2 transition cursor-pointer active:scale-[0.99] shadow-2xs flex flex-col justify-between"
                  title="Bấm để cuộn đến tin nhắn này trong đoạn chat"
                >
                  {/* Header tin ghim: Avatar + Tên + Điểm upvote */}
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <DriverAvatar profile={post.user} size="xs" showStars={true} />
                      <span className="text-[11px] font-bold text-slate-900 truncate">
                        {post.user?.full_name || 'Bác tài'}
                      </span>
                    </div>
                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-0.5 shrink-0">
                      <ThumbsUp className="w-2.5 h-2.5" />
                      <span>+{post.net_score}</span>
                    </span>
                  </div>

                  {/* Nội dung tối đa 1 dòng */}
                  <p className="text-xs text-slate-700 leading-tight truncate flex items-center gap-1">
                    {post.image_url && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded shrink-0 flex items-center gap-0.5">
                        <Camera className="w-2.5 h-2.5" />
                        <span>Ảnh</span>
                      </span>
                    )}
                    <span className="truncate">
                      {post.content && post.content !== '📷 [Hình ảnh]'
                        ? post.content
                        : post.image_url
                        ? 'Hình ảnh'
                        : ''}
                    </span>
                  </p>
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
                        <span className="text-[9px] font-black text-amber-800 bg-amber-100/80 border border-amber-200/80 rounded px-1 py-0.2 shrink-0">
                          Top
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
                      {/* Hình ảnh đính kèm bài viết (nếu có) */}
                      {post.image_url && (
                        <div className="mb-1.5 rounded-xl overflow-hidden border border-slate-200/90 bg-slate-100 relative group cursor-pointer shadow-2xs max-w-xs sm:max-w-sm">
                          <img
                            src={post.image_url}
                            alt="Ảnh bài đăng"
                            className="w-full max-h-64 sm:max-h-72 object-cover hover:scale-[1.01] transition-transform duration-200"
                            loading="lazy"
                            onClick={() => setPreviewingImageUrl(post.image_url || null)}
                          />
                          <button
                            type="button"
                            onClick={() => setPreviewingImageUrl(post.image_url || null)}
                            className="absolute bottom-1.5 right-1.5 bg-slate-900/70 hover:bg-slate-900 text-white p-1 rounded-md opacity-80 sm:opacity-0 group-hover:opacity-100 transition flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                            title="Xem toàn màn hình"
                          >
                            <ZoomIn className="w-3 h-3" />
                            <span>Phóng to</span>
                          </button>
                        </div>
                      )}

                      {/* Nội dung chữ (ẩn nếu chỉ là placeholder hình ảnh) */}
                      {post.content && post.content !== '📷 [Hình ảnh]' && (
                        <p className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
                          {renderMessageContent(post.content)}
                        </p>
                      )}

                      {/* Cụm Upvote / Downvote thu gọn như reaction chat */}
                      <div className="flex items-center justify-end gap-1 mt-1 pt-1 border-t border-slate-100/80">
                        <button
                          type="button"
                          disabled={votingPostId === post.id}
                          onClick={() => handleVote(post, 1)}
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition flex items-center gap-0.5 cursor-pointer active:scale-95 ${
                            votingPostId === post.id ? 'opacity-60 cursor-wait' : ''
                          } ${
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
                          disabled={votingPostId === post.id}
                          onClick={() => handleVote(post, -1)}
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition flex items-center gap-0.5 cursor-pointer active:scale-95 ${
                            votingPostId === post.id ? 'opacity-60 cursor-wait' : ''
                          } ${
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
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] sm:bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] p-2 sm:p-2.5">
        <div className="max-w-xl mx-auto w-full space-y-1.5">
          {/* Preview ảnh đã chọn & đã nén trước khi gửi */}
          {selectedPhoto && (
            <div className="flex items-center gap-2 p-2 bg-emerald-50/70 border border-emerald-200/80 rounded-xl relative animate-in fade-in slide-in-from-bottom-1 duration-150">
              <div className="relative w-11 h-11 rounded-lg overflow-hidden border border-emerald-300 shrink-0 bg-slate-200">
                <img
                  src={selectedPhoto.previewUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-800">
                  <Zap className="w-3 h-3 fill-emerald-600 text-emerald-700" />
                  <span>Ảnh đã nén tiết kiệm 4G</span>
                </div>
                {selectedPhoto.compression && (
                  <div className="text-[10px] text-emerald-700 font-medium truncate">
                    {formatBytes(selectedPhoto.compression.originalSize)} ➔ {formatBytes(selectedPhoto.compression.compressedSize)} (-{selectedPhoto.compression.reductionPercentage}%)
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleRemoveSelectedPhoto}
                disabled={isUploading}
                className="p-1 text-slate-400 hover:text-red-500 rounded-full hover:bg-emerald-100/60 transition cursor-pointer shrink-0"
                title="Hủy ảnh đã chọn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Nút chức năng nhanh - Tải ảnh (nén tự động), Định vị GPS, Gửi kho */}
          {currentUser && (
            <div className="flex items-center gap-1.5 px-0.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageFileSelect}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressingPhoto || isUploading}
                className={`p-1.5 rounded-lg border transition active:scale-90 cursor-pointer disabled:opacity-50 flex items-center gap-1 text-xs font-semibold ${
                  selectedPhoto
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 border-slate-200/80'
                }`}
                title="Chụp ảnh / Tải ảnh lên (tự động nén)"
              >
                {isCompressingPhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                ) : (
                  <Camera className="w-4 h-4 text-emerald-600" />
                )}
                <span className="text-[11px] text-slate-700">Tải ảnh</span>
              </button>

              <button
                type="button"
                onClick={handleSendCurrentLocation}
                disabled={isLocating || isUploading}
                className="p-1.5 bg-slate-100 hover:bg-orange-50 text-slate-600 hover:text-orange-600 rounded-lg border border-slate-200/80 transition active:scale-90 cursor-pointer disabled:opacity-50 flex items-center gap-1"
                title="Gửi định vị hiện tại"
              >
                {isLocating ? (
                  <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
                ) : (
                  <MapPin className="w-4 h-4 text-orange-600" />
                )}
                <span className="text-[11px] text-slate-700">Định vị</span>
              </button>

              <button
                type="button"
                onClick={handleOpenWarehousePicker}
                disabled={isUploading}
                className="p-1.5 bg-slate-100 hover:bg-orange-50 text-slate-600 hover:text-orange-600 rounded-lg border border-slate-200/80 transition active:scale-90 cursor-pointer flex items-center gap-1"
                title="Gửi định vị kho"
              >
                <Building2 className="w-4 h-4 text-amber-600" />
                <span className="text-[11px] text-slate-700">Gửi kho</span>
              </button>
            </div>
          )}

          {/* Form nhập tin nhắn */}
          {currentUser ? (
            <form onSubmit={handleCreatePost} className="flex items-center gap-2">
              <DriverAvatar profile={currentUser} size="sm" showStars={true} />
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={selectedPhoto ? "Thêm ghi chú cho ảnh (tùy chọn)..." : "Nhập tin nhắn..."}
                maxLength={300}
                disabled={isUploading}
                className="flex-1 min-w-0 bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-orange-500 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none transition placeholder:text-slate-400 shadow-2xs"
              />
              <button
                type="submit"
                disabled={(!content.trim() && !selectedPhoto) || isUploading || isCompressingPhoto}
                className="p-2 sm:px-3.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 active:scale-95 shadow-2xs cursor-pointer"
                title="Gửi tin nhắn"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">{isUploading ? 'Đang gửi...' : 'Gửi'}</span>
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

      {/* Modal Chọn Kho Để Gửi Định Vị */}
      {isWarehousePickerOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsWarehousePickerOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Chọn kho gửi định vị</h3>
                  <p className="text-[11px] text-slate-500">Bấm vào kho để chia sẻ vị trí vào chat</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWarehousePickerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition active:scale-95 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ô tìm kiếm */}
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={warehouseSearch}
                  onChange={(e) => setWarehouseSearch(e.target.value)}
                  placeholder="Tìm tên kho, địa chỉ..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-100 focus:bg-white border border-slate-200 focus:border-orange-500 rounded-xl text-xs focus:outline-none transition"
                  autoFocus
                />
              </div>
            </div>

            {/* Danh sách kho */}
            <div className="overflow-y-auto divide-y divide-slate-100 flex-1 p-1 max-h-[50vh]">
              {loadingWarehouses ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
                </div>
              ) : (
                (() => {
                  const filtered = warehouses.filter((wh) => {
                    const q = warehouseSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      wh.name.toLowerCase().includes(q) ||
                      (wh.address && wh.address.toLowerCase().includes(q))
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="py-8 text-center text-xs text-slate-400">
                        Không tìm thấy kho nào
                      </div>
                    );
                  }

                  return filtered.map((wh) => (
                    <button
                      key={wh.id}
                      type="button"
                      onClick={() => handleSelectWarehouse(wh)}
                      className="w-full text-left p-2.5 hover:bg-orange-50/60 rounded-xl flex items-start gap-2.5 transition active:scale-[0.99] cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-orange-100 text-slate-500 group-hover:text-orange-600 flex items-center justify-center shrink-0 transition mt-0.5">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900 group-hover:text-orange-900 truncate">
                          {wh.name}
                        </div>
                        {wh.address && (
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {wh.address}
                          </div>
                        )}
                      </div>
                    </button>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem Chi Tiết Ảnh Phóng To */}
      {previewingImageUrl && (
        <div
          className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in"
          onClick={() => setPreviewingImageUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[92vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setPreviewingImageUrl(null)}
              className="absolute -top-11 right-0 p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition cursor-pointer"
              title="Đóng xem ảnh"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewingImageUrl}
              alt="Chi tiết ảnh bài đăng"
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
