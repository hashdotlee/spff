import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { ProvinceProvider } from '@/lib/contexts/ProvinceContext';
import { ProvincePickerModal } from '@/components/common/ProvincePickerModal';
import { PWAInstallPrompt } from '@/components/common/PWAInstallPrompt';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'SPFF - Bản Đồ Kho & Ghi Chú Voice Chỉ Đường Tài Xế',
  description:
    'Ứng dụng cộng đồng phi lợi nhuận cho tài xế giao nhận hàng: đánh dấu vị trí kho bãi, nghe ghi chú giọng nói hướng dẫn ngõ ngách, donate VietQR cảm ơn.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SPFF Kho Vận',
  },
};

export const viewport: Viewport = {
  themeColor: '#ea580c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="h-full">
      <body className="min-h-dvh flex flex-col bg-slate-50 text-slate-900 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 antialiased selection:bg-orange-500 selection:text-white overflow-x-hidden">
        <ProvinceProvider>
          <Suspense fallback={null}>
            <Navbar />
          </Suspense>
          <main className="flex-1 flex flex-col max-w-3xl w-full mx-auto">
            {children}
          </main>
          <Suspense fallback={null}>
            <BottomNavigation />
          </Suspense>
          <ProvincePickerModal />
          <PWAInstallPrompt />
        </ProvinceProvider>
      </body>
    </html>
  );
}
