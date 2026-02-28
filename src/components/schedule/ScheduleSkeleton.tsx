import { Skeleton } from '@/components/ui/skeleton';

export function ScheduleSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* Calendar grid skeleton */}
      <div className="rounded-xl border overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="py-3 flex justify-center">
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[100px] border-b border-r p-2 space-y-1">
              <Skeleton className="h-5 w-5 rounded-full" />
              {i % 4 === 0 && <Skeleton className="h-4 w-full" />}
              {i % 5 === 1 && <Skeleton className="h-4 w-3/4" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
