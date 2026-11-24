import { useEffect, useMemo, useState } from 'react';
import { Inbox, Megaphone, RotateCw } from 'lucide-react';
import { FilterButton } from '@/components/ui/FilterButton';
import { ListDetailLayout, type ListDetailItem, type ListDetailSortOption } from '@/components/ui/ListDetailLayout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { PortalCall, PortalCallSource, PortalCallStatus } from '@/lib/portalCalls';
import { PortalCallDetailPanel, PortalCallStatusBadge } from './PortalCallDetailPanel';

type StatusFilter = 'all' | PortalCallStatus;
type SourceFilter = 'all' | PortalCallSource;
type PortalCallsMessages = typeof MESSAGES['pt-br']['app']['os']['calls'];

interface PortalCallsPanelProps {
  calls: PortalCall[];
  isLoading: boolean;
  isError: boolean;
  selectedCallId?: string | null;
  canManage: boolean;
  isConverting: boolean;
  isClosing: boolean;
  onRetry: () => void;
  onConvert: (callId: string) => Promise<unknown>;
  onCloseWithoutOs: (callId: string) => Promise<unknown>;
  onOpenServiceOrder: (serviceOrderId: string) => void;
}

export function PortalCallsPanel({
  calls,
  isLoading,
  isError,
  selectedCallId,
  canManage,
  isConverting,
  isClosing,
  onRetry,
  onConvert,
  onCloseWithoutOs,
  onOpenServiceOrder,
}: PortalCallsPanelProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.calls as PortalCallsMessages;
  const [selectedId, setSelectedId] = useState<string | undefined>(selectedCallId ?? undefined);
  const [status, setStatus] = useState<StatusFilter>('aguardando_analise');
  const [source, setSource] = useState<SourceFilter>('all');

  useEffect(() => {
    if (selectedCallId) setSelectedId(selectedCallId);
  }, [selectedCallId]);

  const selectedCall = calls.find((call) => call.id === selectedId);
  const filteredCalls = useMemo(
    () => calls.filter((call) => (
      (status === 'all' || call.status === status)
      && (source === 'all' || call.source === source)
    )),
    [calls, source, status],
  );

  const callById = useMemo(() => new Map(calls.map((call) => [call.id, call])), [calls]);
  const listItems: ListDetailItem[] = useMemo(() => filteredCalls.map((call) => {
    const protocol = call.protocol_number ? `CH-${call.protocol_number}` : `CH-${call.id.slice(0, 8)}`;
    return {
      id: call.id,
      title: call.customer?.name || t.customerFallback,
      subtitle: `${protocol} · ${call.description || t.noDescription}`,
      searchText: [protocol, call.description, call.customer?.name, call.equipment?.name, call.contract?.name]
        .filter(Boolean).join(' '),
      leading: (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Megaphone className="h-4 w-4" />
        </span>
      ),
      trailing: <PortalCallStatusBadge status={call.status} className="text-[10px]" />,
    };
  }), [filteredCalls, t.customerFallback, t.noDescription]);

  const sortOptions: ListDetailSortOption[] = useMemo(() => [
    {
      value: 'newest', label: t.newestFirst, shortLabel: '↓',
      compare: (a, b) => new Date(callById.get(b.id)?.created_at ?? 0).getTime()
        - new Date(callById.get(a.id)?.created_at ?? 0).getTime(),
    },
    {
      value: 'oldest', label: t.oldestFirst, shortLabel: '↑',
      compare: (a, b) => new Date(callById.get(a.id)?.created_at ?? 0).getTime()
        - new Date(callById.get(b.id)?.created_at ?? 0).getTime(),
    },
    {
      value: 'customer', label: t.customerAsc, shortLabel: 'A–Z',
      compare: (a, b) => a.title.localeCompare(b.title, locale, { sensitivity: 'base' }),
    },
  ], [callById, locale, t.customerAsc, t.newestFirst, t.oldestFirst]);

  if (isLoading) {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="hidden h-80 w-full lg:block" />
      </div>
    );
  }

  if (isError) {
    return <EmptyState icon={<RotateCw className="h-10 w-10" />} title={t.errorTitle} description={t.errorDescription} action={{ label: t.retry, onClick: onRetry }} />;
  }

  if (calls.length === 0) {
    return <EmptyState icon={<Inbox className="h-10 w-10" />} title={t.emptyTitle} description={t.emptyDescription} />;
  }

  const activeFilterCount = (status === 'all' ? 0 : 1) + (source === 'all' ? 0 : 1);
  const filters = (
    <FilterButton embedded activeCount={activeFilterCount} onClear={() => { setStatus('all'); setSource('all'); }}>
      <div className="space-y-2">
        <label className="text-sm font-medium">{t.filterStatus}</label>
        <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.filterAll}</SelectItem>
            <SelectItem value="aguardando_analise">{t.statusAwaiting}</SelectItem>
            <SelectItem value="convertido">{t.statusConverted}</SelectItem>
            <SelectItem value="encerrado_sem_os">{t.statusClosed}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{t.source}</label>
        <Select value={source} onValueChange={(value) => setSource(value as SourceFilter)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.sourceAll}</SelectItem>
            <SelectItem value="customer">{t.sourceCustomer}</SelectItem>
            <SelectItem value="contract">{t.sourceContract}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </FilterButton>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t.heading}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
      </div>
      <ListDetailLayout
        items={listItems}
        selectedId={selectedId}
        listTitle={t.inboxTitle}
        listDescription={t.listDescription}
        listFilters={filters}
        sortOptions={sortOptions}
        pageSize={25}
        storageKey="portal-calls"
        searchPlaceholder={t.searchPlaceholder}
        emptyLabel={t.noResultsTitle}
        onSelect={setSelectedId}
        mobileDetailOpen={Boolean(selectedCall)}
      >
        {selectedCall ? (
          <PortalCallDetailPanel
            call={selectedCall}
            canManage={canManage}
            isConverting={isConverting}
            isClosing={isClosing}
            onBack={() => setSelectedId(undefined)}
            onConvert={onConvert}
            onCloseWithoutOs={onCloseWithoutOs}
            onOpenServiceOrder={onOpenServiceOrder}
          />
        ) : (
          <EmptyState icon={<Megaphone className="h-10 w-10" />} title={t.emptySelectionTitle} description={t.emptySelectionDescription} />
        )}
      </ListDetailLayout>
    </div>
  );
}
