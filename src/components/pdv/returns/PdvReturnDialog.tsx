import { usePdvDurableReturn } from '@/hooks/usePdvReturnIntent';
import { PdvReturnIntentError } from '@/lib/pdv/return-intent';
import '@/components/pdv/PdvWorkspace.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useToast } from '@/hooks/use-toast';
import {
  calculatePdvReturnTotal,
  type PdvReturnDispositionInput,
  type PdvReturnLineInput,
  type PdvReturnWorkspace,
} from '@/hooks/usePdvReturns';

type FinancialMode = 'credit' | 'reduce' | 'split';
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

export function PdvReturnDialog({ open, onOpenChange, workspace, canBackdate, onCompleted }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: PdvReturnWorkspace;
  canBackdate: boolean;
  onCompleted?: () => void;
}) {
  const { toast } = useToast();
  const durable = usePdvDurableReturn(workspace.orderId, open);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [destination, setDestination] = useState<'saleable' | 'quarantine'>('saleable');
  const [stockId, setStockId] = useState('');
  const [occurredOn, setOccurredOn] = useState(today());
  const [reason, setReason] = useState('');
  const [financialMode, setFinancialMode] = useState<FinancialMode>(workspace.receivables.length ? 'reduce' : 'credit');
  const [receivableId, setReceivableId] = useState(workspace.receivables[0]?.id ?? '');
  const [reductionAmount, setReductionAmount] = useState(0);
  const [confirmedSummary, setConfirmedSummary] = useState<{ itemCount: number; total: number } | null>(null);
  const recoveryView = useRef(false);
  const session = useRef<{ open: boolean; orderId: string; scopeKey: string } | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);

  const destinationStocks = useMemo(() => workspace.stocks.filter((stock) => stock.destination === destination), [destination, workspace.stocks]);
  const total = useMemo(() => calculatePdvReturnTotal(workspace.items, quantities), [quantities, workspace.items]);
  const selectedReceivable = workspace.receivables.find((entry) => entry.id === receivableId) ?? null;
  const effectiveReduction = financialMode === 'credit' ? 0 : financialMode === 'reduce'
    ? Math.min(total, selectedReceivable?.openAmount ?? 0)
    : Math.min(total, selectedReceivable?.openAmount ?? 0, Math.max(0, reductionAmount));
  const creditAmount = financialMode === 'reduce' ? Math.max(0, total - effectiveReduction) : Math.max(0, total - effectiveReduction);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  useEffect(() => {
    // Refetching the same order must preserve both the draft and its confirmed summary.
    if (session.current?.open === open && session.current.orderId === workspace.orderId && session.current.scopeKey === durable.token.epoch) return;
    session.current = { open, orderId: workspace.orderId, scopeKey: durable.token.epoch };
    generation.current += 1;
    setConfirmedSummary(null);
    recoveryView.current = false;
    if (!open) return;
    const defaultDestination = workspace.stocks.some((stock) => stock.destination === 'saleable') ? 'saleable' : 'quarantine';
    const defaultStock = workspace.stocks.find((stock) => stock.destination === defaultDestination);
    setQuantities({});
    setDestination(defaultDestination);
    setStockId(defaultStock?.id ?? '');
    setOccurredOn(today());
    setReason('');
    setFinancialMode(workspace.receivables.length ? 'reduce' : 'credit');
    setReceivableId(workspace.receivables[0]?.id ?? '');
    setReductionAmount(0);
  }, [durable.token.epoch, open, workspace]);

  useEffect(() => {
    if (!destinationStocks.some((stock) => stock.id === stockId)) setStockId(destinationStocks[0]?.id ?? '');
  }, [destinationStocks, stockId]);

  const lines = useMemo<PdvReturnLineInput[]>(() => workspace.items.reduce<PdvReturnLineInput[]>((entries, item) => {
    const quantity = Math.max(0, Math.min(item.returnableQuantity, Number(quantities[item.deliveryItemId] ?? 0)));
    if (!quantity) return entries;
    if (item.itemType !== 'material') {
      entries.push({ deliveryItemId: item.deliveryItemId, quantity, destination: 'none' });
      return entries;
    }
    entries.push({ deliveryItemId: item.deliveryItemId, quantity, destination, destinationStockId: stockId || null });
    return entries;
  }, []), [destination, quantities, stockId, workspace.items]);

  const dispositions = useMemo<PdvReturnDispositionInput[]>(() => {
    if (total <= 0) return [];
    const entries: PdvReturnDispositionInput[] = [];
    if (effectiveReduction > 0 && selectedReceivable) entries.push({ kind: 'receivable_reduction', amount: effectiveReduction, receivableTransactionId: selectedReceivable.id });
    if (creditAmount > 0) entries.push({ kind: 'customer_credit', amount: creditAmount });
    return entries;
  }, [creditAmount, effectiveReduction, selectedReceivable, total]);

  const hasMaterial = lines.some((line) => line.destination !== 'none');
  const invalidFinancial = total > 0 && (!workspace.customerId || !dispositions.length || Math.abs(dispositions.reduce((sum, entry) => sum + entry.amount, 0) - total) > 0.009);
  const canSubmit = lines.length > 0 && reason.trim().length > 0 && occurredOn.length === 10 && (!hasMaterial || Boolean(stockId)) && !invalidFinancial;

  async function submit(retry = false) {
    const submissionGeneration = generation.current;
    const submittedSummary = { itemCount: lines.length, total };
    const isCurrentSubmission = () => mounted.current && generation.current === submissionGeneration && durable.isCurrent();
    try {
      const completion = retry ? await durable.retry() : await durable.submit({ orderId: workspace.orderId, lines, dispositions, occurredOn, reason: reason.trim() }, submittedSummary);
      if (!completion || !isCurrentSubmission()) return;
      const result = completion.result;
      setConfirmedSummary({ ...completion.summary, total: typeof result.commercialTotal === 'number' && Number.isFinite(result.commercialTotal) && result.commercialTotal >= 0 ? result.commercialTotal : completion.summary.total });
      onCompleted?.();
      toast({ title: 'Devolução registrada', description: 'O estoque, o saldo do cliente e o histórico foram atualizados.' });
    } catch (error) {
      if (!isCurrentSubmission()) return;
      const unknown = error instanceof PdvReturnIntentError && ['unknown', 'pending'].includes(error.kind);
      toast({ title: unknown ? 'Confirmação pendente' : 'Não foi possível concluir a devolução', description: error instanceof Error ? error.message : 'Tente confirmar a solicitação novamente.', variant: 'destructive' });
    }
  }

  if (!durable.ready || session.current && session.current.scopeKey !== durable.token.epoch) return null;
  if (durable.pending && !durable.busy) recoveryView.current = true;
  if (durable.pending && recoveryView.current) {
    return <ResponsiveDialog className="pdv-dialog" drawerClassName="pdv-dialog" open={open} onOpenChange={onOpenChange} title="Conferir devolução pendente" description={`Pedido #${workspace.orderNumber} · confirme a solicitação anterior antes de iniciar outra.`} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="cancel" onClick={() => onOpenChange(false)}>Fechar</Button><Button disabled={durable.busy || Boolean(durable.storageError)} onClick={() => void submit(true)}>{durable.busy ? 'Tentando confirmar…' : 'Tentar confirmar'}</Button></div>}>
      <div className="space-y-4 py-3">
        <NoticeBanner variant="warning">A devolução pode ter sido registrada. A tentativa foi preservada neste aparelho.</NoticeBanner>
        <p className="text-sm">Ao tentar confirmar, os mesmos itens, data, destino e valor serão enviados novamente. Isso pode concluir a solicitação caso ela ainda não tenha sido registrada.</p>
        {durable.intent && <div className="space-y-1 text-sm"><p>{durable.intent.summary.itemCount} item(ns) · <strong className="tabular-nums">{money.format(durable.intent.summary.total)}</strong></p><p>Motivo: {String(durable.intent.args.p_reason)}</p></div>}
      </div>
    </ResponsiveDialog>;
  }

  if (confirmedSummary) {
    return <ResponsiveDialog className="pdv-dialog" drawerClassName="pdv-dialog" open={open} onOpenChange={onOpenChange} title="Devolução confirmada" description="O registro comercial foi concluído." footer={<Button className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Concluir</Button>}>
      <div className="space-y-4 py-3">
        <div className="rounded-xl bg-success p-5 text-success-foreground">
          <CheckCircle2 className="mb-3 h-8 w-8" />
          <p className="font-semibold">{confirmedSummary.itemCount} item(ns) devolvido(s)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{money.format(confirmedSummary.total)}</p>
        </div>
        <p className="text-sm text-muted-foreground">Esta devolução não estorna pagamento e não cria reembolso. O valor foi destinado ao saldo escolhido.</p>
      </div>
    </ResponsiveDialog>;
  }

  return <ResponsiveDialog className="pdv-dialog" drawerClassName="pdv-dialog" open={open} onOpenChange={onOpenChange} title="Devolver itens entregues" description={`Pedido #${workspace.orderNumber} · escolha somente o que voltou para a loja.`} mobileFullHeight footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="cancel" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => void submit()} disabled={!canSubmit || durable.busy || durable.pending || Boolean(durable.storageError)}>{durable.busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Confirmar devolução</Button></div>}>
    <fieldset disabled={durable.busy || durable.pending || Boolean(durable.storageError)} className="min-w-0 space-y-6 py-3">
      {durable.storageError && <NoticeBanner variant="destructive">{durable.storageError}</NoticeBanner>}
      <NoticeBanner variant="warning" icon={AlertTriangle}>Devolução não é estorno de pagamento e não gera reembolso. Voucher e troca não fazem parte desta etapa.</NoticeBanner>

      <section className="space-y-2" aria-label="Itens entregues">
        <h3 className="pdv-section-heading font-semibold">1. Itens e quantidades</h3>
        <div className="divide-y rounded-xl border">
          {workspace.items.map((item) => <div key={item.deliveryItemId} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-center">
            <div className="min-w-0"><p className="font-medium break-words">{item.description}</p><p className="text-sm text-muted-foreground">Disponível para devolver: <strong className="text-foreground tabular-nums">{item.returnableQuantity}</strong></p></div>
            <Input aria-label={`Quantidade devolvida de ${item.description}`} type="number" min={0} max={item.returnableQuantity} step="any" value={quantities[item.deliveryItemId] ?? 0} onChange={(event) => { setQuantities((current) => ({ ...current, [item.deliveryItemId]: Number(event.target.value) })); }} className="text-right tabular-nums" />
          </div>)}
        </div>
      </section>

      {workspace.items.some((item) => item.itemType === 'material' && Number(quantities[item.deliveryItemId] ?? 0) > 0) && <section className="space-y-3">
        <h3 className="pdv-section-heading font-semibold">2. Destino no estoque</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Condição<Select value={destination} onValueChange={value => { setDestination(value as 'saleable' | 'quarantine'); }}><SelectTrigger aria-label="Condição do item devolvido"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="saleable">Vendável</SelectItem><SelectItem value="quarantine">Quarentena</SelectItem></SelectContent></Select></label>
          <label className="space-y-1 text-sm font-medium">Local<Select value={stockId || '_none'} onValueChange={value => { setStockId(value === '_none' ? '' : value); }}><SelectTrigger aria-label="Local de destino"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="_none">Selecione</SelectItem>{destinationStocks.map(stock => <SelectItem key={stock.id} value={stock.id}>{stock.name}</SelectItem>)}</SelectContent></Select></label>
        </div>
      </section>}

      <section className="space-y-3">
        <h3 className="pdv-section-heading font-semibold">3. Data e motivo</h3>
        <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <label className="space-y-1 text-sm font-medium">Data<DatePicker ariaLabel="Data da devolução" max={today()} value={occurredOn} disabled={!canBackdate} onValueChange={value => { setOccurredOn(value); }} /></label>
          <label className="space-y-1 text-sm font-medium">Motivo<Textarea aria-label="Motivo da devolução" maxLength={500} value={reason} onChange={(event) => { setReason(event.target.value); }} placeholder="Ex.: material não utilizado na obra" /></label>
        </div>
        {!canBackdate && <p className="text-xs text-muted-foreground">Seu perfil registra devoluções somente na data de hoje.</p>}
      </section>

      {total > 0 && <section className="space-y-3">
        <h3 className="pdv-section-heading font-semibold">4. Destino do valor</h3>
        {!workspace.customerId ? <NoticeBanner variant="destructive">Este pedido não tem cliente identificado. Atualize o pedido antes de devolver itens com valor.</NoticeBanner> : <>
          <div className="grid gap-2 sm:grid-cols-3">
            {([['credit', 'Gerar crédito'], ['reduce', 'Reduzir dívida'], ['split', 'Dividir os dois']] as const).map(([value, label]) => <label key={value} className={`cursor-pointer rounded-lg border p-3 text-sm font-medium ${financialMode === value ? 'border-primary bg-primary text-primary-foreground' : ''}`}><input className="sr-only" type="radio" name="financial-mode" value={value} checked={financialMode === value} disabled={value !== 'credit' && !workspace.receivables.length} onChange={() => { setFinancialMode(value); }} />{label}</label>)}
          </div>
          {financialMode !== 'credit' && <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Conta em aberto<Select value={receivableId || '_none'} onValueChange={value => { setReceivableId(value === '_none' ? '' : value); }}><SelectTrigger aria-label="Conta em aberto"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="_none">Selecione</SelectItem>{workspace.receivables.map(entry => <SelectItem key={entry.id} value={entry.id}>{entry.description} · {money.format(entry.openAmount)}</SelectItem>)}</SelectContent></Select></label>
            {financialMode === 'split' && <label className="space-y-1 text-sm font-medium">Valor para reduzir<Input aria-label="Valor para reduzir da dívida" type="number" min={0} max={Math.min(total, selectedReceivable?.openAmount ?? 0)} step="0.01" value={reductionAmount} onChange={(event) => { setReductionAmount(Number(event.target.value)); }} /></label>}
          </div>}
        </>}
      </section>}

      <section className="rounded-xl border bg-background p-4" aria-label="Resumo da devolução">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-muted-foreground">Resumo comercial</p><p className="text-sm">{lines.length} item(ns) selecionado(s)</p></div><p className="text-2xl font-bold tabular-nums">{money.format(total)}</p></div>
        {total > 0 && workspace.customerId && <div className="mt-3 grid gap-1 border-t pt-3 text-sm"><p className="flex justify-between gap-4"><span>Redução da dívida</span><strong className="tabular-nums">{money.format(effectiveReduction)}</strong></p><p className="flex justify-between gap-4"><span>Crédito do cliente</span><strong className="tabular-nums">{money.format(creditAmount)}</strong></p></div>}
      </section>
    </fieldset>
  </ResponsiveDialog>;
}
