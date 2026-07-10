'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from './cn';

type MaxWidth = 'sm' | 'md' | 'lg';
const MAXW: Record<MaxWidth, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

/** Dialog terpusat dengan backdrop. Tutup via Esc / klik backdrop. */
export function Modal({
  open,
  onClose,
  title,
  description,
  maxWidth = 'md',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  maxWidth?: MaxWidth;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6 animate-lent-fade"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn('bg-white rounded-xl shadow-lg w-full p-6', MAXW[maxWidth])}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <h2 className="font-display text-xl font-semibold text-wedel-900 mb-1">{title}</h2>
        )}
        {description && <p className="text-sm text-tanah-500 mb-3">{description}</p>}
        {children}
        {footer && <div className="mt-5 flex items-center justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
