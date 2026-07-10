import type { ReactNode } from 'react';
import { cn } from './cn';

type Padding = 'none' | 'sm' | 'md' | 'lg';
const PAD: Record<Padding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export const cardBase = 'bg-white rounded-xl border border-cream-200 shadow-sm';

interface CardProps {
  padding?: Padding;
  className?: string;
  children: ReactNode;
}

/** Kartu putih standar Sembada (radius 12, border cream-200, shadow hangat). */
export function Card({ padding = 'md', className, children }: CardProps) {
  return <div className={cn(cardBase, PAD[padding], className)}>{children}</div>;
}

export function SectionHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        'text-xs uppercase tracking-wider text-tanah-500 font-bold mb-3',
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** Kartu dengan judul seksi opsional. */
export function Section({
  title,
  actions,
  padding = 'md',
  className,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  padding?: Padding;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card padding={padding} className={className}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-3">
          {title && <SectionHeader className="mb-0">{title}</SectionHeader>}
          {actions}
        </div>
      )}
      {children}
    </Card>
  );
}
