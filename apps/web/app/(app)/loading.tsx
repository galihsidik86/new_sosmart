import { Skeleton } from '@/components/ui';

/** Fallback loading global untuk halaman (app) yang async. */
export default function AppLoading() {
  return (
    <div className="px-8 py-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40 mt-2" />
      </div>
      {/* Toolbar */}
      <Skeleton className="h-12 w-full mb-6 rounded-xl" />
      {/* Table card */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-sm p-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
