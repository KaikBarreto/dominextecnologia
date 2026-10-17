import { useMemo, useState } from 'react';
import { Eye, Megaphone, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/mobile/EmptyState';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDateTime } from '@/lib/format';
import { MESSAGES } from '@/lib/i18n/messages';
import { fuzzyIncludes } from '@/lib/utils';
import { getPortalCallSource, isOpenPortalCall, isPortalCall, type PortalCallSource } from '@/lib/portalCalls';
import { formatOSNumber } from '@/lib/osNumber';
import type { ServiceOrder } from '@/types/database';

type CallView = 'open' | 'all';
type SourceFilter = 'all' | PortalCallSource;

interface PortalCallsPanelProps {
  items: ServiceOrder[];
  isLoading?: boolean;
  defaultView?: CallView;
  onOpenCall: (order: ServiceOrder) => void;
}

function relationName(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}

export function PortalCallsPanel({
  items,
  isLoading = false,
  defaultView = 'open',
  onOpenCall,
}: PortalCallsPanelProps) {
  const isMobile = useIsMobile();
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os;
  const tc = t.calls;
  const [view, setView] = useState<CallView>(defaultView);
  const [source, setSource] = useState<SourceFilter>('all');
  const [search, setSearch] = useState('');

  const portalCalls = useMemo(() => items.filter(isPortalCall), [items]);
  const filteredCalls = useMemo(() => {
    const term = search.trim();
    return portalCalls.filter((order) => {
      if (view === 'open' && !isOpenPortalCall(order)) return false;
      if (source !== 'all' && getPortalCallSource(order) !== source) return false;
      if (!term) return true;
      return (
        fuzzyIncludes(String(order.order_number), term)
        || fuzzyIncludes(order.description, term)
        || fuzzyIncludes(order.customer?.name, term)
        || fuzzyIncludes(order.equipment?.name, term)
        || fuzzyIncludes(relationName((order as ServiceOrder & { contract?: unknown }).contract), term)
      );
    });
  }, [portalCalls, search, source, view]);

  const sourceLabel = (order: ServiceOrder) => (
    getPortalCallSource(order) === 'contract' ? tc.sourceContract : tc.sourceCustomer
  );
  const statusLabel = (order: ServiceOrder) => (
    t.statusFallback[order.status] ?? order.status
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tc.searchPlaceholder}
            className="pl-10"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={view} onValueChange={(value) => setView(value as CallView)}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">{tc.filterOpen}</SelectItem>
              <SelectItem value="all">{tc.filterAll}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={(value) => setSource(value as SourceFilter)}>
            <SelectTrigger className="w-full sm:w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tc.sourceAll}</SelectItem>
              <SelectItem value="customer">{tc.sourceCustomer}</SelectItem>
              <SelectItem value="contract">{tc.sourceContract}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredCalls.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<Megaphone className="h-10 w-10" />}
          title={portalCalls.length === 0 ? tc.emptyTitle : tc.noResultsTitle}
          description={portalCalls.length === 0 ? tc.emptyDescription : tc.noResultsDescription}
        />
      ) : isMobile ? (
        <div className="space-y-2">
          {filteredCalls.map((order) => (
            <Card
              key={order.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenCall(order)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpenCall(order);
                }
              }}
              className="cursor-pointer rounded-2xl active:scale-[0.99]"
            >
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{formatOSNumber(order.order_number)}</p>
                    <p className="truncate font-semibold">{order.customer?.name || tc.customerFallback}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">{statusLabel(order)}</Badge>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{order.description || tc.noDescription}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{sourceLabel(order)}</Badge>
                  <span>{formatDateTime(order.created_at, locale, timezone)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-0 bg-transparent shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tc.colOs}</TableHead>
                    <TableHead>{tc.colCustomer}</TableHead>
                    <TableHead>{tc.colDescription}</TableHead>
                    <TableHead>{tc.colSource}</TableHead>
                    <TableHead>{tc.colOpenedAt}</TableHead>
                    <TableHead>{tc.colStatus}</TableHead>
                    <TableHead className="w-16 text-right">{tc.colActions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCalls.map((order) => (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer"
                      onClick={() => onOpenCall(order)}
                    >
                      <TableCell className="font-mono font-medium">{formatOSNumber(order.order_number)}</TableCell>
                      <TableCell>
                        <p className="font-medium">{order.customer?.name || tc.customerFallback}</p>
                        {order.equipment?.name && <p className="text-xs text-muted-foreground">{order.equipment.name}</p>}
                      </TableCell>
                      <TableCell><p className="max-w-[280px] truncate">{order.description || tc.noDescription}</p></TableCell>
                      <TableCell><Badge variant="secondary">{sourceLabel(order)}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateTime(order.created_at, locale, timezone)}</TableCell>
                      <TableCell><Badge variant="outline">{statusLabel(order)}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={tc.openCall}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenCall(order);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
