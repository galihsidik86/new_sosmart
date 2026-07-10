import { cn } from './cn';

/** Placeholder loading (shimmer) berwarna cream. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-cream-200 rounded-md', className)} />;
}

/** Beberapa baris teks skeleton. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}
