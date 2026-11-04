'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, PlusCircle, MessageSquareText, User, Siren } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function BottomNavigation() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

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
                className={`flex items-center justify-center rounded-full transition-transform ${
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
              </div>
              <span
                className={`text-[10px] tracking-tight mt-1 ${
                  item.highlight
                    ? 'font-bold text-orange-600 -mt-0.5'
                    : item.isActive && item.isSos
                    ? 'text-red-600 font-bold'
                    : ''
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
