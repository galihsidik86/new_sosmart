import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { InstallAppButton } from '@/components/InstallAppButton';

export const metadata: Metadata = {
  title: 'Lentera — Akuntansi & Pajak',
  description: 'Sistem akuntansi & pajak Indonesia, multi-tenant & multi-cabang.',
  applicationName: 'Lentera',
  // Bisa di-install ke home screen iOS sebagai app standalone.
  appleWebApp: { capable: true, title: 'Lentera', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#8B2E2E', // sogan/maroon — warnai bilah status di mode standalone
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Terapkan tema aksen tersimpan SEBELUM paint supaya tidak ada kedip warna.
const THEME_INIT = `try{var t=localStorage.getItem('lentera-theme');if(t&&t!=='sogan')document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="font-sans">
        <ServiceWorkerRegister />
        {children}
        <InstallAppButton />
      </body>
    </html>
  );
}
