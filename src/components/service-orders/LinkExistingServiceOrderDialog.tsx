import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Check, Link2, Loader2, Search, Wrench } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/i18n/messages';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { osStatusLabels, type ServiceOrder } from '@/types/database';
import type { ContractServiceOrder } from '@/hooks/useContracts';
import {
  availableContractPeriods,
  isServiceOrderAvailableForContractLink,
} from '@/lib/contractServiceOrderLinking';

interface LinkExistingServiceOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  customerId: string;
  serviceOrders: ServiceOrder[];
  occurrences: ContractServiceOrder[];
  isLoadingOrders: boolean;
  isSubmitting: boolean;
  onSubmit: (input: { serviceOrderId: string; referenceDate: string }) => Promise<unknown>;
}

function localDate(value: string): string {
  return format(parseISO(`${value}T12:00:00`), 'dd/MM/yyyy');
}

function friendlyLinkError(error: unknown, fallback: string, errors: Record<string, string>): string {
  const raw = getErrorMessage(error);
  const key = Object.keys(errors).find(token => raw.includes(token));
  return key ? errors[key] : fallback;
}

export function LinkExistingServiceOrderDialog({
  open,
  onOpenChange,
  contractId,
  customerId,
  serviceOrders,
  occurrences,
  isLoadingOrders,
  isSubmitting,
  onSubmit,
}: LinkExistingServiceOrderDialogProps) {
  const { locale } = useAppLocaleContext();
  const { toast } = useToast();
  const t = MESSAGES[locale].app.pmoc.contractDetail.occurrences;
  const [query, setQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [referenceDate, setReferenceDate] = useState('');
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedOrderId('');
    setReferenceDate('');
    setSubmitError('');
  }, [open]);

  const candidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale);
    return serviceOrders
      .filter(order => isServiceOrderAvailableForContractLink(order, customerId, contractId))
      .filter(order => {
        if (!normalized) return true;
        const haystack = [
          String(order.order_number),
          order.description,
          order.equipment?.name,
          osStatusLabels[order.status],
        ].filter(Boolean).join(' ').toLocaleLowerCase(locale);
        return haystack.includes(normalized);
      })
      .sort((a, b) => (b.scheduled_date ?? '').localeCompare(a.scheduled_date ?? '')
        || b.order_number - a.order_number);
  }, [contractId, customerId, locale, query, serviceOrders]);

  const availablePeriods = useMemo(() => availableContractPeriods(occurrences), [occurrences]);

  const selectedOrder = candidates.find(order => order.id === selectedOrderId);
  const canSubmit = !!selectedOrderId && !!referenceDate && !isSubmitting;

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="min-h-11">
        {t.linkCancel}
      </Button>
      <Button type="submit" form="link-existing-service-order-form" disabled={!canSubmit} className="min-h-11 gap-2">
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
        {isSubmitting ? t.linkSubmitting : t.linkSubmit}
      </Button>
    </div>
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitError('');
    try {
      await onSubmit({ serviceOrderId: selectedOrderId, referenceDate });
      toast({ title: t.linkSuccessTitle, description: t.linkSuccessDescription });
      onOpenChange(false);
    } catch (error) {
      const errors: Record<string, string> = {
        contract_not_active: t.linkErrorInactive,
        service_order_customer_mismatch: t.linkErrorCustomer,
        contract_period_occupied: t.linkErrorOccupied,
        contract_period_has_execution: t.linkErrorExecuted,
        contract_period_not_found: t.linkErrorPeriodMissing,
        service_order_already_linked: t.linkErrorAlreadyLinked,
        service_order_generated_by_contract: t.linkErrorGenerated,
        link_not_allowed: t.linkErrorPermission,
      };
      setSubmitError(friendlyLinkError(error, t.linkErrorFallback, errors));
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.linkDialogTitle}
      description={t.linkDialogDescription}
      className="sm:max-w-2xl"
      footer={footer}
    >
      <form id="link-existing-service-order-form" onSubmit={handleSubmit} className="space-y-5">
        <NoticeBanner variant="info" title={t.linkKeepsHistoryTitle}>
          {t.linkKeepsHistoryDescription}
        </NoticeBanner>

        {submitError && (
          <NoticeBanner variant="destructive" title={t.linkErrorTitle}>
            {submitError}
          </NoticeBanner>
        )}

        <div className="space-y-2">
          <Label htmlFor="link-existing-order-search">{t.linkOrderLabel}</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="link-existing-order-search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t.linkSearchPlaceholder}
              className="min-h-11 pl-10"
              disabled={isLoadingOrders || isSubmitting}
              autoFocus
            />
          </div>

          <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border p-2">
            {isLoadingOrders ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t.loadingAction}
              </div>
            ) : candidates.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Wrench className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">{t.linkEmptyTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.linkEmptyDescription}</p>
              </div>
            ) : candidates.map(order => {
              const selected = selectedOrderId === order.id;
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => { setSelectedOrderId(order.id); setSubmitError(''); }}
                  className={cn(
                    'flex min-h-14 w-full items-start gap-3 rounded-md border p-3 text-left transition-colors',
                    'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected && 'border-primary bg-primary/5',
                  )}
                  aria-pressed={selected}
                >
                  <span className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                    selected && 'border-primary bg-primary text-primary-foreground',
                  )}>
                    {selected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">OS #{order.order_number}</span>
                      <Badge variant="outline">{osStatusLabels[order.status] ?? order.status}</Badge>
                    </span>
                    <span className="mt-1 block truncate text-sm text-muted-foreground">
                      {order.description || order.equipment?.name || t.linkNoDescription}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t.linkOriginalDate}: {order.scheduled_date ? localDate(order.scheduled_date) : t.noDate}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="link-contract-period">{t.linkPeriodLabel}</Label>
          <Select value={referenceDate} onValueChange={value => { setReferenceDate(value); setSubmitError(''); }} disabled={!selectedOrder || isSubmitting}>
            <SelectTrigger id="link-contract-period" className="min-h-11">
              <SelectValue placeholder={t.linkPeriodPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {availablePeriods.map(([date, order]) => (
                <SelectItem key={date} value={date}>
                  {localDate(date)} · {t.linkReplaceOs.replace('{number}', String(order.order_number))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {availablePeriods.length > 0 ? t.linkPeriodHelp : t.linkNoPeriods}
          </p>
        </div>
      </form>
    </ResponsiveModal>
  );
}
