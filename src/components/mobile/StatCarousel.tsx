import type { ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface StatCarouselItem {
  key: string;
  label: string;
  count: number;
  icon: ReactNode;
  accentColor?: string;
  active?: boolean;
  onClick?: () => void;
}

interface StatCarouselProps {
  items: StatCarouselItem[];
  loading?: boolean;
}

/**
 * Stats de listagem. Mobile = carrossel horizontal de chips snap-x. Desktop = grid auto-fit.
 */
export function StatCarousel({ items, loading = false }: StatCarouselProps) {
  const isMobile = useIsMobile();

  if (loading) {
    return isMobile ? (
      <div className="flex gap-2 overflow-hidden px-3 -mx-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] w-[140px] shrink-0 rounded-2xl" />
        ))}
      </div>
    ) : (
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="relative -mx-3">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent" />
        <div className="flex gap-2 overflow-x-auto px-3 pb-1 snap-x scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className={cn(
                'snap-start shrink-0 flex flex-col justify-between h-[88px] min-w-[140px] p-3 rounded-2xl border bg-card text-left transition-all active:scale-95',
                item.active
                  ? 'ring-2 ring-primary border-primary/60 shadow-md'
                  : 'border-border shadow-sm'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white shrink-0"
                  style={{ backgroundColor: item.accentColor || 'hsl(var(--primary))' }}
                >
                  {item.icon}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate text-right mt-1">
                  {item.label}
                </span>
              </div>
              <span className="text-2xl font-bold leading-none">{item.count}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
      {items.map((item) => (
        <Card
          key={item.key}
          className={cn(
            'cursor-pointer transition-colors hover:bg-muted',
            item.active && 'ring-2 ring-primary'
          )}
          onClick={item.onClick}
        >
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">{item.label}</p>
                <p className="text-xl sm:text-2xl font-bold">{item.count}</p>
              </div>
              <div
                className="rounded-full p-1.5 sm:p-2 text-white"
                style={{ backgroundColor: item.accentColor || 'hsl(var(--primary))' }}
              >
                {item.icon}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
