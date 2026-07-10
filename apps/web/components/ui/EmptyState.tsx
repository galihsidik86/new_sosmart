import type { ReactNode } from 'react';
import { cn } from './cn';

/** Empty state blok (di luar tabel). */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('py-12 px-6 text-center', className)}>
      {icon && (
        <div className="mx-auto mb-3 w-12 h-12 rounded-xl bg-cream-100 grid place-items-center text-tanah-300">
          {icon}
        </div>
      )}
      <p className="font-display text-lg font-semibold text-tanah-700">{title}</p>
      {description && <p className="text-sm text-tanah-500 mt-1">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
