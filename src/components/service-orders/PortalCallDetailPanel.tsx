import { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Megaphone,
  PackageSearch,
  Phone,
  Wrench,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { formatDateTime } from '@/lib/format';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatOSNumberDigits } from '@/lib/osNumber';
import type { PortalCall, PortalCallStatus } from '@/lib/portalCalls';
import { cn } from '@/lib/utils';

type PortalCallsMessages = typeof MESSAGES['pt-br']['app']['os']['calls'];

interface PortalCallStatusBadgeProps {
  status: PortalCallStatus;
  className?: string;
}

export function PortalCallStatusBadge({ status, className }: PortalCallStatusBadgeProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.calls as PortalCallsMessages;
  const config = {
    aguardando_analise: { label: t.statusAwaiting, className: 'bg-warning text-warning-foreground' },
    convertido: { label: t.statusConverted, className: 'bg-success text-success-foreground' },
    encerrado_sem_os: { label: t.statusClosed, className: 'bg-slate-600 text-white' },
  }[status];

  return (
    <Badge className={cn('border-transparent', config.className, className)}>
      {config.label}
    </Badge>
  );
}

interface PortalCallDetailPanelProps {
  call: PortalCall;
  canManage: boolean;
  isConverting: boolean;
  isClosing: boolean;
  onBack: () => void;
  onConvert: (callId: string) => Promise<unknown>;
  onCloseWithoutOs: (callId: string) => Promise<unknown>;
  onOpenServiceOrder: (serviceOrderId: string) => void;
}

export function PortalCallDetailPanel({
  call,
  canManage,
  isConverting,
  isClosing,
  onBack,
  onConvert,
  onCloseWithoutOs,
  onOpenServiceOrder,
}: PortalCallDetailPanelProps) {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.calls as PortalCallsMessages;
  const [convertOpen, setConvertOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const phone = call.customer?.phone || call.customer?.celular;
  const protocol = call.protocol_number ? `CH-${call.protocol_number}` : `CH-${call.id.slice(0, 8)}`;
  const sourceLabel = call.source === 'contract' ? t.sourceContract : t.sourceCustomer;
  const awaitingReview = call.status === 'aguardando_analise';
  const linkedOrder = call.service_order;

  const handleConvert = async () => {
    try {
      await onConvert(call.id);
      setConvertOpen(false);
    } catch {
      // O hook mostra a orientação de recuperação e mantém a confirmação aberta.
    }
  };

  const handleClose = async () => {
    try {
      await onCloseWithoutOs(call.id);
      setCloseOpen(false);
    } catch {
      // O hook mostra a orientação de recuperação e mantém a confirmação aberta.
    }
  };

  return (
    <section className="min-h-[28rem]" aria-labelledby="portal-call-title">
      <header className="border-b border-border pb-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2 gap-2 lg:hidden"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          {t.backToList}
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{t.protocol} {protocol}</span>
              <span aria-hidden="true">•</span>
              <span>{sourceLabel}</span>
            </div>
            <h2 id="portal-call-title" className="break-words text-xl font-semibold tracking-tight">
              {call.customer?.name || t.customerFallback}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4 shrink-0" />
              {t.receivedAt} {formatDateTime(call.created_at, locale, timezone)}
            </p>
          </div>
          <PortalCallStatusBadge status={call.status} className="self-start" />
        </div>
      </header>

      {awaitingReview && (
        <div className="flex flex-col gap-2 border-b border-border py-4 sm:flex-row">
          {canManage ? (
            <>
              <Button className="min-h-11 flex-1 sm:flex-none" onClick={() => setConvertOpen(true)}>
                <ClipboardList className="mr-2 h-4 w-4" />
                {t.createOs}
              </Button>
              <Button
                variant="outline"
                className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setCloseOpen(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                {t.closeWithoutOs}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t.noPermission}</p>
          )}
        </div>
      )}

      {call.status === 'convertido' && linkedOrder && (
        <div className="my-4 flex flex-col gap-3 border-l-4 border-success bg-success/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 className="h-5 w-5" />
              {t.osCreated}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.osNumber.replace('{number}', formatOSNumberDigits(linkedOrder.order_number))}. {t.osNextStep}
            </p>
          </div>
          <Button variant="outline" onClick={() => onOpenServiceOrder(linkedOrder.id)}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t.openOs}
          </Button>
        </div>
      )}

      {call.status === 'convertido' && !linkedOrder && (
        <div className="my-4 flex items-start gap-2 border-l-4 border-warning bg-warning/10 p-4 text-sm">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>{t.osRemoved}</p>
        </div>
      )}

      {call.status === 'encerrado_sem_os' && (
        <div className="my-4 flex items-start gap-2 border-l-4 border-slate-500 bg-muted/60 p-4 text-sm">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p>{t.closedWithoutOs}</p>
        </div>
      )}

      <div className="space-y-6 py-5">
        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Megaphone className="h-4 w-4 text-primary" />
            {t.problem}
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
            {call.description || t.noDescription}
          </p>
        </section>

        <dl className="grid gap-x-8 gap-y-5 border-t border-border pt-5 sm:grid-cols-2">
          <div>
            <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Building2 className="h-4 w-4" /> {t.source}
            </dt>
            <dd className="mt-1 text-sm font-medium">{sourceLabel}</dd>
          </div>
          {phone && (
            <div>
              <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Phone className="h-4 w-4" /> {t.contact}
              </dt>
              <dd className="mt-1 text-sm font-medium">{phone}</dd>
            </div>
          )}
          {call.equipment && (
            <div>
              <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Wrench className="h-4 w-4" /> {t.equipment}
              </dt>
              <dd className="mt-1 text-sm font-medium">{call.equipment.name}</dd>
              {(call.equipment.brand || call.equipment.model) && (
                <dd className="text-xs text-muted-foreground">
                  {[call.equipment.brand, call.equipment.model].filter(Boolean).join(' ')}
                </dd>
              )}
            </div>
          )}
          {call.contract && (
            <div>
              <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <PackageSearch className="h-4 w-4" /> {t.contract}
              </dt>
              <dd className="mt-1 text-sm font-medium">{call.contract.name || 'Contrato vinculado'}</dd>
            </div>
          )}
        </dl>
      </div>

      <AlertDialog open={convertOpen} onOpenChange={setConvertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.createOsConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.createOsConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConverting}>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={isConverting} onClick={(event) => { event.preventDefault(); void handleConvert(); }}>
              {isConverting ? t.creatingOs : t.createOsConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={closeOpen} onOpenChange={setCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.closeConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.closeConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isClosing}
              onClick={(event) => { event.preventDefault(); void handleClose(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClosing ? t.closing : t.closeConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
