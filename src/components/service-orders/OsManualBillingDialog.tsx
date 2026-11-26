import { useEffect, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { DatePicker } from '@/components/ui/DatePicker';
import { ReceivePaymentModal, type ReceivePaymentResult } from '@/components/financial/ReceivePaymentModal';
import { useOsFieldBudget } from '@/hooks/useOsCommercial';
import { useOsManualBilling } from '@/hooks/useOsManualBilling';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { todayInTz } from '@/lib/timezone';
import { getOsBillingTotals, osBillingError } from '@/lib/osCommercial';
import { localizeAppPath } from '@/lib/i18n/appRouteSlugs';
import type { OsRevenueContext } from '@/hooks/useOsFinishRevenuePrompt';
import { OsFieldBudgetEditor } from './OsFieldBudgetEditor';
import { OsCommercialSummary } from '@/components/technician/OsCommercialSummary';
import { OsReceiptDialog } from './OsReceiptDialog';

export function OsManualBillingDialog({ open, onOpenChange, context, onReceived }: {
  open: boolean; onOpenChange: (open: boolean) => void; context: OsRevenueContext; onReceived?: () => void | Promise<void>;
}) {
  const { timezone, currency = 'BRL', locale = 'pt-br' } = useAppLocaleContext();
  const budget = useOsFieldBudget(context.serviceOrderId);
  const billing = useOsManualBilling(context.serviceOrderId, open);
  const [manualTotal, setManualTotal] = useState('');
  const [dueDate, setDueDate] = useState(todayInTz(timezone));
  const [editorOpen, setEditorOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [parent, setParent] = useState<NonNullable<typeof billing.data>[number] | undefined>();
  const [paymentTotal, setPaymentTotal] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { if (open) { setReceiving(false); setEditorOpen(false); setReceiptOpen(false); setParent(undefined); setPaymentTotal(null); setError(null); setManualTotal(''); setDueDate(todayInTz(timezone)); } }, [open, context.serviceOrderId, timezone]);
  const total = budget.data?.total > 0 ? budget.data.total : Number(manualTotal);
  const totals = getOsBillingTotals(total, billing.data ?? []);
  const canComplement = !!billing.data?.length && billing.data.every(row => row.can_complement === true);
  const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency });
  const commit = async (payment: ReceivePaymentResult | null) => {
    setSaving(true); setError(null);
    try {
      await billing.receive(paymentTotal ?? total, payment, dueDate, parent);
      setReceiving(false); onOpenChange(false);
      if (payment) void onReceived?.();
    } catch (err) { setError(err); void billing.refetch(); }
    finally { setSaving(false); }
  };
  const ready = !budget.isPending && !budget.isError && !billing.isPending && !billing.isError && !budget.draft;
  const complement = async () => {
    setSaving(true); setError(null);
    try { await billing.complement(total, totals.billed, dueDate); }
    catch (err) { setError(err); void billing.refetch(); }
    finally { setSaving(false); }
  };
  return <>
    <ResponsiveModal open={open && !receiving && !editorOpen && !receiptOpen} onOpenChange={next => { if (!saving) onOpenChange(next); }} title="Faturar OS" description={`OS #${context.osNumber ?? ''} · ${context.customerName ?? 'Cliente'}`} className="sm:max-w-2xl">
      <div className="space-y-5">
        {(budget.isPending || billing.isPending) && <p role="status">Conferindo orçamento e recebimentos…</p>}
        {(budget.isError || billing.isError) && <NoticeBanner variant="warning">Não foi possível carregar os valores. <button className="underline" onClick={() => { void budget.refresh(); void billing.refetch(); }}>Tentar novamente</button></NoticeBanner>}
        {budget.data && <>
          {!billing.data?.length && (budget.data.items.length > 0 ? <OsCommercialSummary summary={{ items: budget.data.items, total: budget.data.total, adjustment: budget.data.adjustment, currency }} /> : <div className="space-y-2"><Label htmlFor="os-billing-total">Valor total do serviço ({currency === 'BRL' ? 'R$' : currency})</Label><Input id="os-billing-total" type="number" min="0.01" step="0.01" value={budget.data.total > 0 ? budget.data.total : manualTotal} disabled={budget.data.total > 0 || !budget.data.can_price || saving} onChange={e => setManualTotal(e.target.value)} className="h-12 text-base" />{!budget.data.total && !budget.data.can_price && <p className="text-sm text-muted-foreground">Para informar o valor inicial, solicite a permissão de alterar preços da OS.</p>}</div>)}
          {!billing.isPending && !billing.data?.length && <Button variant="outline" onClick={() => setEditorOpen(true)}>Conferir ou lançar serviços e produtos</Button>}
          {budget.draft && <NoticeBanner variant="warning">Há um orçamento guardado neste aparelho. Confira e salve os itens antes de faturar. <button type="button" className="underline" onClick={() => setEditorOpen(true)}>Conferir alterações locais</button></NoticeBanner>}
        </>}
        {billing.data?.length ? <section className="space-y-3" aria-label="Recebimentos da OS">
          <h3 className="font-semibold">Pagamentos e saldo</h3>
          {ready && <>
            <dl className="flex flex-wrap gap-x-8 gap-y-3 border-y py-4 tabular-nums">
              <div><dt className="text-sm text-muted-foreground">Total da OS</dt><dd className="font-semibold">{money(total)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Recebido</dt><dd className="font-semibold">{money(totals.received)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Falta receber na OS</dt><dd className="font-bold">{money(totals.remaining)}</dd></div>
            </dl>
            {totals.unbilled > 0 && <div className="space-y-3">
              <NoticeBanner variant="warning">{money(totals.unbilled)} do valor da OS ainda não foram faturados. O faturamento anterior de {money(totals.billed)} e seus recebimentos serão preservados.</NoticeBanner>
              {canComplement ? <>
                <div className="space-y-2"><Label htmlFor="os-complement-due-date">Vencimento da diferença</Label><DatePicker id="os-complement-due-date" value={dueDate} onValueChange={setDueDate} /></div>
                <Button className="h-auto min-h-12 w-full whitespace-normal sm:w-auto" disabled={saving} onClick={() => void complement()}>{saving ? 'Salvando…' : `Lançar diferença de ${money(totals.unbilled)} a receber`}</Button>
                <p className="text-sm text-muted-foreground">Depois de lançar, registre o pagamento da diferença aqui. Nenhum pagamento será marcado como recebido automaticamente.</p>
              </> : <p className="text-sm text-muted-foreground">Confira as parcelas e cobranças vinculadas no Financeiro antes de lançar a diferença.</p>}
            </div>}
            {totals.overbilled > 0 && <NoticeBanner variant="warning">O faturamento está {money(totals.overbilled)} acima do valor atual da OS. Confira os lançamentos no Financeiro antes de alterar os valores.</NoticeBanner>}
            {totals.unbilled === 0 && totals.overbilled === 0 && totals.open === 0 && <p className="text-sm text-muted-foreground">O valor desta OS já foi recebido. Você pode gerar o recibo ou conferir o histórico no Financeiro.</p>}
            <div className="flex flex-wrap gap-3">
              {totals.received > 0 && <Button variant="outline" disabled={saving} onClick={() => setReceiptOpen(true)}>Gerar recibo</Button>}
              <Button variant="outline" asChild><a href={localizeAppPath('/financeiro/movimentacoes', locale)}>Conferir no Financeiro</a></Button>
            </div>
          </>}
          {billing.data.map(row => <div key={row.id} className="space-y-3 border-t py-3"><div className="flex flex-wrap justify-between gap-3"><span>Lançamento {money(row.amount)}</span><span>Recebido {money(row.is_paid ? row.amount : row.amount_received)}</span><strong>Saldo desta conta {money(row.is_paid ? 0 : row.amount - row.amount_received)}</strong></div>
            {row.has_live_charge && !row.is_paid && <p className="text-sm text-muted-foreground">Esta parcela tem cobrança online. Confira o recebimento no Financeiro.</p>}
            {!row.is_paid && !row.has_live_charge && <Button disabled={!ready || saving} onClick={() => { setParent(row); setPaymentTotal(total); setReceiving(true); }}>Receber pagamento</Button>}
          </div>)}
        </section> : ready && <>
          <div className="space-y-2"><Label htmlFor="os-billing-due-date">Vencimento do saldo</Label><DatePicker id="os-billing-due-date" value={dueDate} onValueChange={setDueDate} /></div>
          <p className="text-sm text-muted-foreground">O total vira uma conta a receber. Você pode receber uma parte agora e lançar os próximos pagamentos nesta mesma OS.</p>
          <div className="flex flex-col gap-3 sm:flex-row"><Button className="h-12 flex-1" disabled={saving || !(total > 0)} onClick={() => { setParent(undefined); setPaymentTotal(total); setReceiving(true); }}>Receber agora · total ou parcial</Button><Button className="h-12" variant="outline" disabled={saving || !(total > 0)} onClick={() => void commit(null)}>{saving ? 'Salvando…' : 'Lançar a receber'}</Button></div>
        </>}
        {!!billing.data?.length && !!budget.data?.items.length && <OsCommercialSummary summary={{ items: budget.data.items, total: budget.data.total, adjustment: budget.data.adjustment, currency }} />}
        {!!error && <NoticeBanner variant="warning">{osBillingError(error)}</NoticeBanner>}
      </div>
    </ResponsiveModal>
    <OsReceiptDialog osId={context.serviceOrderId} publicMode={false} open={open && receiptOpen} onOpenChange={setReceiptOpen} />
    <OsFieldBudgetEditor open={editorOpen} onOpenChange={setEditorOpen} budget={budget} />
    <ReceivePaymentModal open={open && receiving} onOpenChange={next => { if (!saving) { setReceiving(next); if (!next) { setParent(undefined); setPaymentTotal(null); } } }}
      amount={parent?.amount ?? paymentTotal ?? total} amountReceived={parent?.amount_received ?? 0} allowPartial allowPartialInstallments
      installmentTotal={parent?.installment_total ?? 1} currentDueDate={parent?.due_date ?? dueDate}
      title="Receber pagamento da OS" description="Informe quanto entrou agora. O restante continua a receber nesta OS."
      isSubmitting={saving} errorMessage={error ? osBillingError(error) : undefined} onConfirm={commit} />
  </>;
}
