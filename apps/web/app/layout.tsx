import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Lentera — Akuntansi & Pajak',
  description: 'Sistem akuntansi & pajak Indonesia, multi-tenant & multi-cabang.',
};

// Terapkan tema aksen tersimpan SEBELUM paint supaya tidak ada kedip warna.
const THEME_INIT = `try{var t=localStorage.getItem('lentera-theme');if(t&&t!=='sogan')document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
