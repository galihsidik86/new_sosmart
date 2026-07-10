import type { ReactNode } from 'react';

/**
 * Template (app) — remount tiap navigasi → animasi masuk halaman (lent-fade).
 * Beda dari layout: layout persist, template re-render per rute.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-lent-fade">{children}</div>;
}
