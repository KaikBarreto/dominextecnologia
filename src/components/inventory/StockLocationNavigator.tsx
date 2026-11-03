import { Boxes, Package, Settings, ShoppingCart, Star } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface StockLocationNavigationItem {
  id: string;
  name: string;
  groupLabel: string | null;
  purpose: 'pdv' | 'operacional' | string | null;
  isDefault: boolean;
  itemCount: number;
  lowStockCount: number;
}

interface StockLocationNavigatorLabels {
  title: string;
  available: (count: number) => string;
  consolidated: string;
  items: (count: number) => string;
  lowStock: (count: number) => string;
  configure: string;
}

interface StockLocationNavigatorProps {
  generalId: string;
  generalLabel: string;
  generalItemCount: number;
  generalLowStockCount: number;
  items: StockLocationNavigationItem[];
  selectedId: string;
  labels: StockLocationNavigatorLabels;
  onSelect: (id: string) => void;
  onConfigure: (id: string) => void;
  className?: string;
}

export function StockLocationNavigator({
  generalId,
  generalLabel,
  generalItemCount,
  generalLowStockCount,
  items,
  selectedId,
  labels,
  onSelect,
  onConfigure,
  className,
}: StockLocationNavigatorProps) {
  const groupedItems = items.reduce<Array<{ label: string | null; items: StockLocationNavigationItem[] }>>(
    (groups, item) => {
      const existing = groups.find((group) => group.label === item.groupLabel);
      if (existing) existing.items.push(item);
      else groups.push({ label: item.groupLabel, items: [item] });
      return groups;
    },
    [],
  );

  const renderSummary = (itemCount: number, lowStockCount: number, selected: boolean) => (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      <span className={cn(selected ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
        {labels.items(itemCount)}
      </span>
      {lowStockCount > 0 && (
        <Badge
          variant="destructive"
          className={cn(
            'h-5 border-0 px-1.5 text-[10px] font-semibold',
            selected && 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/25',
          )}
        >
          {labels.lowStock(lowStockCount)}
        </Badge>
      )}
    </div>
  );

  const generalSelected = selectedId === generalId;

  return (
    <aside
      aria-label={labels.title}
      className={cn('min-w-0 overflow-hidden rounded-xl border bg-card', className)}
    >
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{labels.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{labels.available(items.length)}</p>
      </header>

      <div className="p-2">
        <button
          type="button"
          aria-current={generalSelected ? 'page' : undefined}
          onClick={() => onSelect(generalId)}
          className={cn(
            'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            generalSelected
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground hover:bg-muted',
          )}
        >
          <span
            className={cn(
              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              generalSelected ? 'bg-primary-foreground/15' : 'bg-muted text-muted-foreground',
            )}
          >
            <Boxes className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-5">{generalLabel}</span>
            <span className={cn('block text-xs', generalSelected ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
              {labels.consolidated}
            </span>
            {renderSummary(generalItemCount, generalLowStockCount, generalSelected)}
          </span>
        </button>

        {groupedItems.map((group, groupIndex) => (
          <section key={`${group.label ?? 'all'}-${groupIndex}`} className="mt-3 first:mt-2">
            {group.label && (
              <h3 className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {group.label}
              </h3>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const selected = selectedId === item.id;
                const LocationIcon = item.purpose === 'pdv' ? ShoppingCart : Package;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'group flex items-stretch rounded-lg transition-colors',
                      selected ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
                    )}
                  >
                    <button
                      type="button"
                      aria-current={selected ? 'page' : undefined}
                      onClick={() => onSelect(item.id)}
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-l-lg px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          selected ? 'bg-primary-foreground/15' : 'bg-background text-muted-foreground shadow-sm',
                        )}
                      >
                        <LocationIcon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-start gap-1.5">
                          <span className="min-w-0 break-words text-sm font-medium leading-5">{item.name}</span>
                          {item.isDefault && (
                            <Star
                              className={cn(
                                'mt-0.5 h-3.5 w-3.5 shrink-0 fill-current',
                                selected ? 'text-primary-foreground' : 'text-warning',
                              )}
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        {renderSummary(item.itemCount, item.lowStockCount, selected)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`${labels.configure}: ${item.name}`}
                      onClick={() => onConfigure(item.id)}
                      className={cn(
                        'flex w-11 shrink-0 items-center justify-center rounded-r-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                        selected
                          ? 'text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground'
                          : 'text-muted-foreground hover:bg-background hover:text-foreground',
                      )}
                    >
                      <Settings className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
