import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useToast } from '@/hooks/use-toast';
import {
  calculatePdvReturnTotal,
  stablePdvReturnAttempt,
  usePdvCreateReturn,
  type PdvReturnDispositionInput,
  type PdvReturnLineInput,
  type PdvReturnWorkspace,
  type PdvStableAttempt,
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
  const mutation = usePdvCreateReturn();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [destination, setDestination] = useState<'saleable' | 'quarantine'>('saleable');
  const [stockId, setStockId] = useState('');
  const [occurredOn, setOccurredOn] = useState(today());
  const [reason, setReason] = useState('');
  const [financialMode, setFinancialMode] = useState<FinancialMode>(workspace.receivables.length ? 'reduce' : 'credit');
  const [receivableId, setReceivableId] = useState(workspace.receivables[0]?.id ?? '');
  const [reductionAmount, setReductionAmount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const attempt = useRef<PdvStableAttempt | null>(null);

  const destinationStocks = useMemo(() => workspace.stocks.filter((stock) => stock.destination === destination), [destination, workspace.stocks]);
  const total = useMemo(() => calculatePdvReturnTotal(workspace.items, quantities), [quantities, workspace.items]);
  const selectedReceivable = workspace.receivables.find((entry) => entry.id === receivableId) ?? null;
  const effectiveReduction = financialMode === 'credit' ? 0 : financialMode === 'reduce'
    ? Math.min(total, selectedReceivable?.openAmount ?? 0)
    : Math.min(total, selectedReceivable?.openAmount ?? 0, Math.max(0, reductionAmount));
  const creditAmount = financialMode === 'reduce' ? Math.max(0, total - effectiveReduction) : Math.max(0, total - effectiveReduction);

  useEffect(() => {
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
    setCompleted(false);
    attempt.current = null;
  }, [open, workspace]);

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

  async function submit() {
    const payload = { orderId: workspace.orderId, lines, dispositions, occurredOn, reason: reason.trim() };
    const signature = JSON.stringify(payload);
    attempt.current = stablePdvReturnAttempt(attempt.current, signature, () => crypto.randomUUID());
    try {
      await mutation.mutateAsync({ ...payload, attemptId: attempt.current.id });
      setCompleted(true);
      onCompleted?.();
      toast({ title: 'Devolução registrada', description: 'O estoque, o saldo do cliente e o histórico foram atualizados.' });
    } catch (error) {
      toast({ title: 'Devolução não registrada', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    }
  }

  if (completed) {
    return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Devolução confirmada" description="O registro comercial foi concluído." footer={<Button className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Concluir</Button>}>
      <div className="space-y-4 py-3">
        <div className="rounded-xl bg-success p-5 text-success-foreground">
          <CheckCircle2 className="mb-3 h-8 w-8" />
          <p className="font-semibold">{lines.length} item(ns) devolvido(s)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{money.format(total)}</p>
        </div>
        <p className="text-sm text-muted-foreground">Esta devolução não estorna pagamento e não cria reembolso. O valor foi destinado ao saldo escolhido.</p>
      </div>
    </ResponsiveDialog>;
  }

  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Devolver itens entregues" description={`Pedido #${workspace.orderNumber} · escolha somente o que voltou para a loja.`} mobileFullHeight footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => void submit()} disabled={!canSubmit || mutation.isPending}>{mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Confirmar devolução</Button></div>}>
    <div className="space-y-6 py-3">
      <NoticeBanner variant="warning" icon={AlertTriangle}>Devolução não é estorno de pagamento e não gera reembolso. Voucher e troca não fazem parte desta etapa.</NoticeBanner>

      <section className="space-y-2" aria-label="Itens entregues">
        <h3 className="font-semibold">1. Itens e quantidades</h3>
        <div className="divide-y rounded-xl border">
          {workspace.items.map((item) => <div key={item.deliveryItemId} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-center">
            <div className="min-w-0"><p className="font-medium break-words">{item.description}</p><p className="text-sm text-muted-foreground">Disponível para devolver: <strong className="text-foreground tabular-nums">{item.returnableQuantity}</strong></p></div>
            <Input aria-label={`Quantidade devolvida de ${item.description}`} type="number" min={0} max={item.returnableQuantity} step="any" value={quantities[item.deliveryItemId] ?? 0} onChange={(event) => { setQuantities((current) => ({ ...current, [item.deliveryItemId]: Number(event.target.value) })); attempt.current = null; }} className="text-right tabular-nums" />
          </div>)}
        </div>
      </section>

      {workspace.items.some((item) => item.itemType === 'material' && Number(quantities[item.deliveryItemId] ?? 0) > 0) && <section className="space-y-3">
        <h3 className="font-semibold">2. Destino no estoque</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Condição<select aria-label="Condição do item devolvido" className="h-10 w-full rounded-md border bg-background px-3" value={destination} onChange={(event) => { setDestination(event.target.value as 'saleable' | 'quarantine'); attempt.current = null; }}><option value="saleable">Vendável</option><option value="quarantine">Quarentena</option></select></label>
          <label className="space-y-1 text-sm font-medium">Local<select aria-label="Local de destino" className="h-10 w-full rounded-md border bg-background px-3" value={stockId} onChange={(event) => { setStockId(event.target.value); attempt.current = null; }}><option value="">Selecione</option>{destinationStocks.map((stock) => <option key={stock.id} value={stock.id}>{stock.name}</option>)}</select></label>
        </div>
      </section>}

      <section className="space-y-3">
        <h3 className="font-semibold">3. Data e motivo</h3>
        <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <label className="space-y-1 text-sm font-medium">Data<Input aria-label="Data da devolução" type="date" max={today()} value={occurredOn} disabled={!canBackdate} onChange={(event) => { setOccurredOn(event.target.value); attempt.current = null; }} /></label>
          <label className="space-y-1 text-sm font-medium">Motivo<Textarea aria-label="Motivo da devolução" maxLength={500} value={reason} onChange={(event) => { setReason(event.target.value); attempt.current = null; }} placeholder="Ex.: material não utilizado na obra" /></label>
        </div>
        {!canBackdate && <p className="text-xs text-muted-foreground">Seu perfil registra devoluções somente na data de hoje.</p>}
      </section>

      {total > 0 && <section className="space-y-3">
        <h3 className="font-semibold">4. Destino do valor</h3>
        {!workspace.customerId ? <NoticeBanner variant="destructive">Este pedido não tem cliente identificado. Atualize o pedido antes de devolver itens com valor.</NoticeBanner> : <>
          <div className="grid gap-2 sm:grid-cols-3">
            {([['credit', 'Gerar crédito'], ['reduce', 'Reduzir dívida'], ['split', 'Dividir os dois']] as const).map(([value, label]) => <label key={value} className={`cursor-pointer rounded-lg border p-3 text-sm font-medium ${financialMode === value ? 'border-primary bg-primary text-primary-foreground' : ''}`}><input className="sr-only" type="radio" name="financial-mode" value={value} checked={financialMode === value} disabled={value !== 'credit' && !workspace.receivables.length} onChange={() => { setFinancialMode(value); attempt.current = null; }} />{label}</label>)}
          </div>
          {financialMode !== 'credit' && <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Conta em aberto<select aria-label="Conta em aberto" className="h-10 w-full rounded-md border bg-background px-3" value={receivableId} onChange={(event) => { setReceivableId(event.target.value); attempt.current = null; }}><option value="">Selecione</option>{workspace.receivables.map((entry) => <option key={entry.id} value={entry.id}>{entry.description} · {money.format(entry.openAmount)}</option>)}</select></label>
            {financialMode === 'split' && <label className="space-y-1 text-sm font-medium">Valor para reduzir<Input aria-label="Valor para reduzir da dívida" type="number" min={0} max={Math.min(total, selectedReceivable?.openAmount ?? 0)} step="0.01" value={reductionAmount} onChange={(event) => { setReductionAmount(Number(event.target.value)); attempt.current = null; }} /></label>}
          </div>}
        </>}
      </section>}

      <section className="rounded-xl border bg-background p-4" aria-label="Resumo da devolução">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-muted-foreground">Resumo comercial</p><p className="text-sm">{lines.length} item(ns) selecionado(s)</p></div><p className="text-2xl font-bold tabular-nums">{money.format(total)}</p></div>
        {total > 0 && workspace.customerId && <div className="mt-3 grid gap-1 border-t pt-3 text-sm"><p className="flex justify-between gap-4"><span>Redução da dívida</span><strong className="tabular-nums">{money.format(effectiveReduction)}</strong></p><p className="flex justify-between gap-4"><span>Crédito do cliente</span><strong className="tabular-nums">{money.format(creditAmount)}</strong></p></div>}
      </section>
    </div>
  </ResponsiveDialog>;
}
