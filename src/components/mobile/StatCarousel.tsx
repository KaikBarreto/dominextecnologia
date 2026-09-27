import type { ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface StatCarouselItem {
  key: string;
  label: string;
  count: number;
  /** Quando fornecido, substitui `count` na exibição (ex.: valor monetário formatado). */
  displayValue?: string;
  icon: ReactNode;
  accentColor?: string;
  active?: boolean;
  onClick?: () => void;
}

interface StatCarouselProps {
  items: StatCarouselItem[];
  loading?: boolean;
  /** Cards com fundo semântico saturado e conteúdo branco (padrão Dominex). */
  variant?: 'default' | 'saturated';
}

// Degrada o tamanho da fonte do valor do chip conforme o texto cresce — números
// curtos (1-4 dígitos) e "R$ 930" continuam em text-2xl (aparência inalterada);
// valores longos (ex.: "R$ 1.234.567,89") encolhem em vez de estourar o chip.
// `truncate` é só o backstop de último caso (texto absurdamente longo).
function getChipValueSizeClass(value: string): string {
  const len = value.length;
  if (len <= 8) return 'text-2xl';
  if (len <= 11) return 'text-xl';
  if (len <= 14) return 'text-base';
  return 'text-sm';
}

/**
 * Stats de listagem. Mobile = carrossel horizontal de chips snap-x. Desktop = grid auto-fit.
 */
export function StatCarousel({ items, loading = false, variant = 'default' }: StatCarouselProps) {
  const isMobile = useIsMobile();
  const saturated = variant === 'saturated';

  if (loading) {
    return isMobile ? (
      <div className="flex gap-2 overflow-hidden px-3 -mx-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] w-[112px] shrink-0 rounded-2xl" />
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
              style={saturated ? { backgroundColor: item.accentColor || 'hsl(var(--primary))' } : undefined}
              className={cn(
                'snap-start shrink-0 flex flex-col items-center justify-center gap-1.5 h-[120px] min-w-[112px] max-w-[140px] p-3 rounded-2xl text-center transition-all active:scale-95',
                saturated
                  ? 'border-0 bg-gradient-to-br from-white/10 to-transparent text-white shadow-md hover:shadow-lg'
                  : 'border bg-card',
                item.active
                  ? saturated ? 'ring-2 ring-white/80 shadow-lg' : 'ring-2 ring-primary border-primary/60 shadow-md'
                  : !saturated && 'border-border shadow-sm'
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full text-white shrink-0',
                  saturated && 'bg-white/20 backdrop-blur-sm',
                )}
                style={saturated ? undefined : { backgroundColor: item.accentColor || 'hsl(var(--primary))' }}
              >
                {item.icon}
              </span>
              <span className={cn('text-[10px] uppercase tracking-wider truncate max-w-full', saturated ? 'text-white/80' : 'text-muted-foreground')}>
                {item.label}
              </span>
              <span
                className={cn(
                  'font-bold leading-none truncate max-w-full',
                  getChipValueSizeClass(String(item.displayValue ?? item.count)),
                )}
              >
                {item.displayValue ?? item.count}
              </span>
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
          style={saturated ? { backgroundColor: item.accentColor || 'hsl(var(--primary))' } : undefined}
          className={cn(
            'h-full cursor-pointer overflow-hidden rounded-2xl transition-all',
            saturated
              ? 'border-0 bg-gradient-to-br from-white/10 to-transparent text-white shadow-md hover:-translate-y-0.5 hover:shadow-lg'
              : 'hover:bg-muted',
            item.active && (saturated ? 'ring-2 ring-white/80' : 'ring-2 ring-primary')
          )}
          onClick={item.onClick}
        >
          <CardContent className="h-full p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className={cn('truncate text-xs sm:text-sm', saturated ? 'text-white/80' : 'text-muted-foreground')}>{item.label}</p>
                <p className="truncate text-xl font-bold sm:text-2xl">{item.displayValue ?? item.count}</p>
              </div>
              <div
                className={cn('shrink-0 rounded-full p-1.5 text-white sm:p-2', saturated && 'bg-white/20 backdrop-blur-sm')}
                style={saturated ? undefined : { backgroundColor: item.accentColor || 'hsl(var(--primary))' }}
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
