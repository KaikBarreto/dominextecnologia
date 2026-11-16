import { PdvPendingOrderCouponEditor } from '@/components/pdv/coupons/PdvPendingOrderCouponEditor';
import { TicketPercent } from 'lucide-react';
import { usePdvCustomerCredit } from '@/hooks/usePdvSale';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ClipboardList, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PdvListRowsSkeleton } from '@/components/pdv/loading/PdvPageSkeleton';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { PdvPaymentDialog } from '@/components/pdv/PdvPaymentDialog';
import { PdvAppliedVouchersControl } from '@/components/pdv/PdvAppliedVoucherControl';
import { usePdvCashQueue, usePdvCounterCapability, usePdvCoverOrder, type PdvCashQueueRow } from '@/hooks/usePdvCounterFlow';
import type { AccountOptionSource } from '@/components/financial/accountSelectOptions';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { usePdvStageReceiptAuto } from '@/hooks/usePdvStageReceiptAuto';
import { PdvOrderReceiptButton, usePdvOrderReceiptOpener } from '@/components/pdv/receipt/PdvOrderReceiptButton';
import { useToast } from '@/hooks/use-toast';
import { getPdvCashQueueCopy } from './pdvCashQueueCopy';
import type { PdvAppliedVoucher } from '@/lib/pdv/sale-drafts';

export function PdvCashQueuePanel({ canCover, terminalId, sessionId, cashAccountId, accounts, canUseBankAccounts, onGoToCashPanel }: { canCover: boolean; terminalId: string; sessionId: string; cashAccountId: string | null; accounts: AccountOptionSource[]; canUseBankAccounts: boolean; onGoToCashPanel: () => void }) {
  const { locale } = useAppLocaleContext();
  const navigate = useNavigate();
  const { isAdminOrGestor, hasPermissionRecord, hasPermission, hasScreenAccess } = useAuth();
  const canReviewPreorders = isAdminOrGestor() || hasPermissionRecord && hasScreenAccess('screen:pdv_orders') && (hasPermission('fn:value_pdv_preorder') || hasPermission('fn:convert_pdv_preorder')); const texts = MESSAGES[locale].app.pdv.cashier.payment;
  const { money } = useLocaleFormatters(); const { toast } = useToast();
  const capability = usePdvCounterCapability();
  const queue = usePdvCashQueue(sessionId, terminalId, canCover && capability.data?.counterEnabled === true);
  const cover = usePdvCoverOrder();
  const autoReceipt = usePdvStageReceiptAuto();
  const receiptOpener = usePdvOrderReceiptOpener();
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
  const [couponOrder, setCouponOrder] = useState<PdvCashQueueRow | null>(null);
  const [selected, setSelected] = useState<PdvCashQueueRow | null>(null);
  const customerCredit = usePdvCustomerCredit(selected?.customerId ?? null, canCover && capability.data?.counterEnabled === true);
  const [appliedVouchers, setAppliedVouchers] = useState<PdvAppliedVoucher[]>([]);
  const [voucherPickerOpen, setVoucherPickerOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedOrderId = searchParams.get('pedido');
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => {
    if (couponOrder || !requestedOrderId || !canCover || capability.data?.counterEnabled !== true) return;
    const order = queue.data?.find(item => item.id === requestedOrderId);
    // Somente uma linha que veio da fila autorizada deste caixa pode abrir.
    if (!order) return;
    attempt.current = null;
    setAppliedVouchers([]); setVoucherPickerOpen(false); setSelected(order);
    setSearchParams(current => { const next = new URLSearchParams(current); next.delete('pedido'); return next; }, { replace: true });
  }, [couponOrder, requestedOrderId, canCover, capability.data?.counterEnabled, queue.data, setSearchParams]);
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
    const orderId = selected.id;
    const receiptAttempt = receiptOpener.guardAttempt(autoReceipt.prepare('sale'));
    try {
      const result = await cover.mutateAsync({ orderId, terminalId, cashSessionId: sessionId, cashAccountId, payments, attemptId: attempt.current.id, couponRevision: selected.couponRevision ?? 0 });
      if (!receiptOpener.isCurrent()) { receiptAttempt.cancel(); return; }
      setCompletedOrderId(orderId);
      void receiptAttempt.commit(`sale:${orderId}`, (format, options) => receiptOpener.open(orderId, format, { ...options, documentKind: cashierDeliveryEnabled ? 'sale' : 'pickup' }), result.idempotent === true);
    } catch (error) { receiptAttempt.cancel(); if (receiptOpener.isCurrent()) throw error; return; }
    toast({ title: copy.successTitle, description: copy.successDescription });
    setSelected(null); setAppliedVouchers([]); setVoucherPickerOpen(false); attempt.current = null;
  }

  return <Card>
    <CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-5 w-5" />Pedidos aguardando no caixa</CardTitle><p className="mt-1 text-sm text-muted-foreground">{copy.description}</p></div><div className="flex flex-wrap items-center gap-2">{canReviewPreorders && <Button variant="outline" size="sm" onClick={() => navigate('/pdv/pre-pedidos?situacao=encaminhado')}>Conferir orçamentos</Button>}<Button variant="ghost" size="icon" onClick={() => void queue.refetch()} aria-label="Atualizar fila"><RefreshCw className="h-4 w-4" /></Button></div></CardHeader>
    <CardContent>
      {completedOrderId && <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">{copy.successTitle}</span><PdvOrderReceiptButton orderId={completedOrderId} format={autoReceipt.policy('sale').format} documentKind={cashierDeliveryEnabled ? 'sale' : 'pickup'} label={cashierDeliveryEnabled ? 'Comprovante da venda' : 'Pedido para retirada'} /></div>}
      {queue.isLoading ? <PdvListRowsSkeleton count={2} label="Carregando pedidos do balcão" /> : queue.isError ? <NoticeBanner variant="warning" action="Tentar novamente" onClick={() => void queue.refetch()}>Não foi possível carregar a fila do balcão.</NoticeBanner> : !queue.data?.length ? <p className="py-5 text-center text-sm text-muted-foreground">Nenhum pedido aguardando recebimento.</p> : <div className="divide-y">
        {queue.data.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-semibold">Pedido #{order.number}</p><p className="text-sm text-muted-foreground break-words">{order.customerName ?? 'Sem cliente'} · {order.stockName ?? 'Estoque'}</p>{!order.reservationReady && <p className="text-xs font-medium text-muted-foreground">A reserva será validada ao receber.</p>}</div><div className="flex items-center gap-3"><strong className="whitespace-nowrap tabular-nums">{money(order.total)}</strong><Button variant="outline" size="icon" aria-label={`Alterar cupom do pedido ${order.number}`} disabled={!cashAccountId || cover.isPending || selected !== null} onClick={() => { setSelected(null); setAppliedVouchers([]); setVoucherPickerOpen(false); attempt.current = null; setCouponOrder(order); }}><TicketPercent className="h-4 w-4" /></Button><Button size="sm" onClick={() => { attempt.current = null; setAppliedVouchers([]); setVoucherPickerOpen(false); setSelected(order); }} disabled={!cashAccountId || couponOrder !== null}>{copy.action}</Button></div></div>)}
      </div>}
      {couponOrder && cashAccountId && <PdvPendingOrderCouponEditor key={couponOrder.id} context={{ orderId: couponOrder.id, terminalId, cashSessionId: sessionId, cashAccountId }} formatCurrency={money} onClose={() => setCouponOrder(null)} onSaved={() => { setCouponOrder(null); setSelected(null); setAppliedVouchers([]); setVoucherPickerOpen(false); attempt.current = null; toast({ title: 'Cupom do pedido atualizado', description: 'Confira o total antes de receber.' }); }} />}
    </CardContent>
    {selected && <PdvPaymentDialog open onOpenChange={(open) => { if (!open) { setSelected(null); setAppliedVouchers([]); setVoucherPickerOpen(false); } }} texts={paymentTexts} total={selected.total} itemCount={1} customerName={selected.customerName} customerId={selected.customerId} appliedVouchers={appliedVouchers} embeddedEditorOpen={voucherPickerOpen} appliedCreditContent={<PdvAppliedVouchersControl enabled customerId={selected.customerId} total={selected.total} values={appliedVouchers} formatCurrency={money} onPickerOpenChange={setVoucherPickerOpen} onChange={(value) => { attempt.current = null; setAppliedVouchers(value); }} />} customerCredit={customerCredit.credit} customerCreditPending={customerCredit.isLoading} customerCreditError={customerCredit.isError} customerCreditErrorMessage={customerCredit.errorMessage} onRetryCustomerCredit={() => customerCredit.refetch()} accounts={accounts} canUseBankAccounts={canUseBankAccounts} hasOpenCashSession hasCofreAccount={Boolean(cashAccountId)} onGoToCashPanel={onGoToCashPanel} onConfirm={async (payments) => { await confirm(payments); }} />}
    {cover.isPending && <span className="sr-only"><Loader2 className="animate-spin" />Processando recebimento</span>}
  </Card>;
}
