import { useRef, useState } from 'react';
import { ClipboardList, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { PdvPaymentDialog } from '@/components/pdv/PdvPaymentDialog';
import { usePdvCashQueue, usePdvCounterCapability, usePdvCoverOrder, type PdvCashQueueRow } from '@/hooks/usePdvCounterFlow';
import type { AccountOptionSource } from '@/components/financial/accountSelectOptions';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useToast } from '@/hooks/use-toast';
import { getPdvCashQueueCopy } from './pdvCashQueueCopy';

export function PdvCashQueuePanel({ canCover, terminalId, sessionId, cashAccountId, accounts, canUseBankAccounts, onGoToCashPanel }: { canCover: boolean; terminalId: string; sessionId: string; cashAccountId: string | null; accounts: AccountOptionSource[]; canUseBankAccounts: boolean; onGoToCashPanel: () => void }) {
  const { locale } = useAppLocaleContext(); const texts = MESSAGES[locale].app.pdv.cashier.payment;
  const { money } = useLocaleFormatters(); const { toast } = useToast();
  const capability = usePdvCounterCapability();
  const queue = usePdvCashQueue(sessionId, terminalId, canCover && capability.data?.counterEnabled === true);
  const cover = usePdvCoverOrder();
  const [selected, setSelected] = useState<PdvCashQueueRow | null>(null);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  if (!canCover || capability.isLoading || capability.isError || !capability.data?.counterEnabled) return null;
  const cashierDeliveryEnabled = capability.data.cashierDeliveryEnabled;
  const copy = getPdvCashQueueCopy(cashierDeliveryEnabled);
  const paymentTexts = {
    ...texts,
    description: copy.paymentDescription,
    confirm: copy.paymentConfirm,
    submitting: copy.paymentSubmitting,
  };

  async function confirm(payments: Parameters<NonNullable<React.ComponentProps<typeof PdvPaymentDialog>['onConfirm']>>[0]) {
    if (!selected || !cashAccountId) throw new Error('Este caixa não possui uma conta de dinheiro vinculada.');
    const signature = JSON.stringify({ orderId: selected.id, payments });
    if (!attempt.current || attempt.current.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
    await cover.mutateAsync({ orderId: selected.id, terminalId, cashSessionId: sessionId, cashAccountId, payments, attemptId: attempt.current.id });
    toast({ title: copy.successTitle, description: copy.successDescription });
    setSelected(null); attempt.current = null;
  }

  return <Card>
    <CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-5 w-5" />Pedidos aguardando no caixa</CardTitle><p className="mt-1 text-sm text-muted-foreground">{copy.description}</p></div><Button variant="ghost" size="icon" onClick={() => void queue.refetch()} aria-label="Atualizar fila"><RefreshCw className="h-4 w-4" /></Button></CardHeader>
    <CardContent>
      {queue.isLoading ? <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div> : queue.isError ? <NoticeBanner variant="warning" action="Tentar novamente" onClick={() => void queue.refetch()}>Não foi possível carregar a fila do balcão.</NoticeBanner> : !queue.data?.length ? <p className="py-5 text-center text-sm text-muted-foreground">Nenhum pedido aguardando recebimento.</p> : <div className="divide-y">
        {queue.data.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-semibold">Pedido #{order.number}</p><p className="text-sm text-muted-foreground break-words">{order.customerName ?? 'Sem cliente'} · {order.stockName ?? 'Estoque'}</p>{!order.reservationReady && <p className="text-xs font-medium text-muted-foreground">A reserva será validada ao receber.</p>}</div><div className="flex items-center gap-3"><strong className="whitespace-nowrap tabular-nums">{money(order.total)}</strong><Button size="sm" onClick={() => { attempt.current = null; setSelected(order); }} disabled={!cashAccountId}>{copy.action}</Button></div></div>)}
      </div>}
    </CardContent>
    {selected && <PdvPaymentDialog open onOpenChange={(open) => { if (!open) setSelected(null); }} texts={paymentTexts} total={selected.total} itemCount={1} customerName={selected.customerName} customerCredit={null} accounts={accounts} canUseBankAccounts={canUseBankAccounts} hasOpenCashSession hasCofreAccount={Boolean(cashAccountId)} onGoToCashPanel={onGoToCashPanel} onConfirm={async (payments) => { await confirm(payments); }} />}
    {cover.isPending && <span className="sr-only"><Loader2 className="animate-spin" />Processando recebimento</span>}
  </Card>;
}
