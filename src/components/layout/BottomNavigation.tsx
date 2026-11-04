'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, PlusCircle, MessageSquareText, User, Siren } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function BottomNavigation() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [unreadFeedsCount, setUnreadFeedsCount] = useState<number>(0);
  const supabase = createClient();

  // Kiểm tra tin nhắn mới chưa đọc khi không ở trang /feeds
  useEffect(() => {
    async function checkUnread() {
      if (pathname.startsWith('/feeds')) {
        try {
          localStorage.setItem('spff_feeds_last_read', new Date().toISOString());
        } catch (_) {}
        setUnreadFeedsCount(0);
        return;
      }

      try {
        let lastRead = '';
        try {
          lastRead =
            localStorage.getItem('spff_feeds_last_read') ||
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        } catch (_) {
          lastRead = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        }

        const { count, error } = await supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .gt('created_at', lastRead);

        if (!error && typeof count === 'number') {
          setUnreadFeedsCount(count);
        }
      } catch (err) {
        console.warn('Lỗi kiểm tra tin chưa đọc:', err);
      }
    }

    checkUnread();

    const channel = supabase
      .channel('bottom_nav_unread_feeds')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        () => {
          if (!pathname.startsWith('/feeds')) {
            setUnreadFeedsCount((prev) => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pathname]);

  useEffect(() => {
    supabase.auth.getUser().then((res: any) => {
      if (res.data?.user) setUserId(res.data.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setUserId(session?.user?.id || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const navItems = [
    {
      label: 'Trang chủ',
      href: '/',
      icon: Home,
      isActive: pathname === '/',
    },
    {
      label: 'Cứu hộ SOS',
      href: '/incidents/new',
      icon: Siren,
      isActive: pathname.startsWith('/incidents'),
      isSos: true,
    },
    {
      label: 'Ghim địa chỉ',
      href: '/warehouse/new',
      icon: PlusCircle,
      isActive: pathname === '/warehouse/new',
      highlight: true,
    },
    {
      label: 'Bảng tin',
      href: '/feeds',
      icon: MessageSquareText,
      isActive: pathname.startsWith('/feeds'),
    },
    {
      label: 'Cá nhân',
      href: userId ? `/profile/${userId}` : '/login',
      icon: User,
      isActive: pathname.startsWith('/profile') || pathname === '/login',
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom,0px))] sm:hidden shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-1 min-h-[48px] rounded-xl transition active:scale-95 ${
                item.isActive
                  ? item.isSos
                    ? 'text-red-600 font-bold'
                    : 'text-orange-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800 font-medium'
              }`}
            >
              <div
                className={`relative flex items-center justify-center rounded-full transition-transform ${
                  item.highlight
                    ? 'w-11 h-11 -mt-6 bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-500/30 border-2 border-white ring-2 ring-orange-500/20'
                    : 'w-6 h-6'
                } ${
                  item.isActive && !item.highlight
                    ? item.isSos
                      ? 'scale-110 text-red-600'
                      : 'scale-110 text-orange-600'
                    : ''
                }`}
              >
                <Icon className={item.highlight ? 'w-6 h-6' : 'w-5 h-5'} />
                {/* Chỉ số màu đỏ khi có tin nhắn bảng tin chưa đọc */}
                {item.href === '/feeds' && unreadFeedsCount > 0 && !item.isActive && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-600 rounded-full border border-white ring-1 ring-red-400 animate-pulse" />
                )}
              </div>
              <span
                className={`text-[10px] tracking-tight mt-1 flex items-center gap-1 ${
                  item.highlight
                    ? 'font-bold text-orange-600 -mt-0.5'
                    : item.isActive && item.isSos
                    ? 'text-red-600 font-bold'
                    : ''
                }`}
              >
                <span>{item.label}</span>
                {item.href === '/feeds' && unreadFeedsCount > 0 && !item.isActive && (
                  <span className="px-1 py-0.2 bg-red-600 text-white text-[8px] font-black rounded-full leading-none shadow-2xs">
                    {unreadFeedsCount > 9 ? '9+' : unreadFeedsCount}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
