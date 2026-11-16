import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyField } from '@/components/ui/CurrencyField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePdvResidualDisposition, validatePdvResidualDisposition } from '@/hooks/usePdvResidualDisposition';
import { PdvResidualFault, type PdvResidualDestination, type PdvResidualKind } from '@/hooks/usePdvReturns';
import { formatPdvMoneyCents, parsePdvMoneyText } from '@/lib/pdv/afterSaleMoney';

type Row = { id: string; paymentId: string; kind: PdvResidualKind | ''; amount: string; accountId: string; sessionId: string };
const blank = (): Row => ({ id: crypto.randomUUID(), paymentId: '', kind: '', amount: '', accountId: '', sessionId: '' });
const methods = { dinheiro: 'Dinheiro', pix: 'Pix', transferencia: 'Transferência' };
type Props = { open: boolean; onOpenChange: (open: boolean) => void; orderId: string; onCompleted: () => void; isCurrent: () => boolean };

export function PdvResidualDispositionDialog(props: Props) {
  const operation = usePdvResidualDisposition(props.orderId, props.open);
  return <DispositionForm key={operation.scopeKey} {...props} operation={operation} />;
}
function DispositionForm({ open, onOpenChange, onCompleted, isCurrent, operation }: Props & { operation: ReturnType<typeof usePdvResidualDisposition> }) {
  const { toast } = useToast(); const [rows, setRows] = useState<Row[]>(() => [blank()]); const [reason, setReason] = useState('');
  const [error, setError] = useState<PdvResidualFault | null>(null); const live = useRef(open); const sending = useRef(false);
  const stillHere = () => live.current && isCurrent() && operation.isCurrent();
  useEffect(() => { live.current = open; return () => { live.current = false; }; }, [open]);
  useEffect(() => {
    if (!open) return;
    const block = (event: KeyboardEvent) => { if (event.key === 'F9') { event.preventDefault(); event.stopImmediatePropagation(); } };
    window.addEventListener('keydown', block, true); return () => window.removeEventListener('keydown', block, true);
  }, [open]);
  const plan = operation.query.data; const pending = operation.isPending || operation.query.isFetching;
  const destinations: PdvResidualDestination[] = rows.flatMap(r => {
    const payment = plan?.payments.find(p => p.id === r.paymentId); const value = parsePdvMoneyText(r.amount, { minCents: 1, maxCents: payment?.availableCents ?? 0 });
    return r.kind && value ? [{ kind: r.kind, paymentId: r.paymentId, amountCents: value.cents, ...(r.accountId ? { accountId: r.accountId } : {}), ...(r.sessionId ? { sessionId: r.sessionId } : {}) }] : [];
  });
  const exact = Boolean(plan && destinations.length === rows.length && validatePdvResidualDisposition(plan, destinations));
  const change = (id: string, patch: Partial<Row>) => { setRows(v => v.map(r => r.id === id ? { ...r, ...patch } : r)); setError(null); };
  const close = () => { live.current = false; onOpenChange(false); };
  async function submit(replay = false) {
    if (sending.current || !stillHere()) return; sending.current = true; setError(null);
    try { const result = await (replay ? operation.retryIntent() : operation.submit(reason, destinations));
      if (!stillHere()) return;
      toast({ title: 'Novo destino registrado', description: result.pendingRefund ? 'O reembolso bancário foi solicitado e aguarda confirmação.' : 'O valor liberado recebeu o novo destino escolhido.' });
      close(); onCompleted();
    } catch (e) { if (stillHere()) setError(e instanceof PdvResidualFault ? e : new PdvResidualFault('Confira a solicitação antes de tentar novamente.', 'unknown')); }
    finally { sending.current = false; }
  }
  async function refresh() { setError(null); await operation.query.refetch(); if (stillHere() && !operation.uncertain) setRows([blank()]); }
  const footer = <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="cancel" onClick={close}>Fechar</Button>
    {operation.uncertain ? <Button disabled={pending} onClick={() => void submit(true)}>Repetir a mesma solicitação</Button>
      : <Button disabled={!exact || !reason.trim() || pending} onClick={() => void submit()}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar novo destino</Button>}</div>;
  return <ResponsiveDialog open={open} onOpenChange={v => { if (!v) close(); }} title="Escolher novo destino" description="Distribua o valor liberado pelo estorno. O cancelamento dos itens permanece registrado." mobileFullHeight className="pdv-dialog" drawerClassName="pdv-dialog" footer={footer}>
    <div className="space-y-5 py-3">
      {operation.query.isError ? <div role="alert" className="space-y-3"><p>{operation.query.error instanceof Error ? operation.query.error.message : 'Não foi possível conferir os valores.'}</p><Button variant="outline" onClick={() => void refresh()}>Tentar consultar novamente</Button></div>
        : operation.uncertain ? <section className="space-y-3 border-l-2 border-primary pl-3"><h3 className="font-semibold">Confira a solicitação anterior</h3><p className="text-sm">A resposta pode ter se perdido. Repita exatamente a mesma solicitação para conferir o resultado. Os destinos ficam bloqueados até a confirmação.</p></section>
        : !plan ? <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Conferindo o valor disponível…</p>
        : plan.freeCents === 0 ? <p role="status">Não há valor aguardando nova destinação. Atualize o pós-venda para conferir o histórico.</p>
        : <><div><p className="text-sm text-muted-foreground">Valor aguardando destino</p><strong className="break-words text-3xl tabular-nums">{formatPdvMoneyCents(plan.freeCents)}</strong></div><p className="text-sm text-muted-foreground">O fiado já abatido e os itens cancelados permanecem no histórico. Esta escolha trata somente o valor liberado pelo estorno.</p>
          {rows.map((row, index) => {
            const p = plan.payments.find(p => p.id === row.paymentId); const cash = plan.cash.filter(c => c.accountId === p?.accountId); const banks = plan.banks.filter(b => b.id === p?.accountId);
            const canRefund = plan.canRefund && (p?.method === 'dinheiro' ? cash.length > 0 : banks.length > 0);
            const options = [...(plan.canCredit ? [{ value: 'customer_credit', label: 'Saldo do cliente' }] : []), ...(plan.canVoucher ? [{ value: 'voucher', label: 'Voucher' }] : []), ...(canRefund ? [{ value: 'refund', label: 'Reembolso' }] : [])];
            return <section key={row.id} className="space-y-3 border-b pb-4" aria-label={`Novo destino ${index + 1}`}><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
              <label className="min-w-0 space-y-1 text-sm font-medium">Pagamento original<Select value={row.paymentId || '_none'} disabled={pending} onValueChange={v => change(row.id, { paymentId: v === '_none' ? '' : v, kind: '', amount: '', accountId: '', sessionId: '' })}><SelectTrigger aria-label={`Pagamento original ${index + 1}`} className="h-auto min-h-11 [&>span]:whitespace-normal"><SelectValue placeholder="Escolha o pagamento" /></SelectTrigger><SelectContent><SelectItem value="_none">Escolha o pagamento</SelectItem>{plan.payments.filter(p => p.availableCents > 0).map(p => <SelectItem key={p.id} value={p.id}>{methods[p.method]} · disponível {formatPdvMoneyCents(p.availableCents)}</SelectItem>)}</SelectContent></Select></label>
              <label className="space-y-1 text-sm font-medium">Valor<CurrencyField symbol="R$"><Input aria-label={`Valor do novo destino ${index + 1}`} inputMode="decimal" value={row.amount} disabled={pending || !p} onChange={e => change(row.id, { amount: e.target.value })} /></CurrencyField></label>
              <Button variant="ghost" size="icon" aria-label={`Remover novo destino ${index + 1}`} disabled={pending} onClick={() => setRows(v => v.filter(r => r.id !== row.id))}><Trash2 className="h-4 w-4" /></Button></div>
              {p && <SegmentedControl aria-label={`Tipo do novo destino ${index + 1}`} options={options} value={row.kind} disabled={pending} onValueChange={v => change(row.id, { kind: v as PdvResidualKind, accountId: '', sessionId: '' })} />}
              {p?.method === 'dinheiro' && plan.canRefund && !cash.length && <p className="text-sm text-muted-foreground">O caixa original está fechado ou indisponível para reembolso em dinheiro.</p>}
              {row.kind === 'voucher' && <p className="text-sm text-muted-foreground">Um novo voucher será vinculado ao cliente, sem validade definida.</p>}
              {row.kind === 'refund' && p?.method === 'dinheiro' && <label className="block space-y-1 text-sm font-medium">Caixa original<Select value={row.sessionId || '_none'} disabled={pending} onValueChange={v => { const c = cash.find(c => c.id === v); change(row.id, { sessionId: c?.id ?? '', accountId: c?.accountId ?? '' }); }}><SelectTrigger aria-label={`Caixa original ${index + 1}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="_none">Confirme o caixa original</SelectItem>{cash.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></label>}
              {row.kind === 'refund' && p && p.method !== 'dinheiro' && <div><label className="block space-y-1 text-sm font-medium">Conta original<Select value={row.accountId || '_none'} disabled={pending} onValueChange={v => change(row.id, { accountId: v === '_none' ? '' : v })}><SelectTrigger aria-label={`Conta original ${index + 1}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="_none">Confirme a conta original</SelectItem>{banks.map(b => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}</SelectContent></Select></label><p className="mt-2 text-sm text-muted-foreground">O reembolso ficará pendente até a confirmação no financeiro.</p></div>}
            </section>;
          })}<div className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={pending || rows.length >= 10} onClick={() => setRows(v => [...v, blank()])}><Plus className="mr-2 h-4 w-4" />Adicionar destino</Button><p aria-live="polite" className="text-sm tabular-nums">{exact ? 'Valor distribuído' : `Distribuído ${formatPdvMoneyCents(destinations.reduce((s, r) => s + r.amountCents, 0))} de ${formatPdvMoneyCents(plan.freeCents)}`}</p></div>
          <label className="block space-y-2 text-sm font-medium">Motivo da nova destinação<Textarea aria-label="Motivo da nova destinação" maxLength={500} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} /></label></>}
      {error && <div role="alert" className="space-y-3"><p>{error.message}</p>{error.kind === 'stale' && <Button variant="outline" onClick={() => void refresh()}>Atualizar valores</Button>}</div>}
    </div>
  </ResponsiveDialog>;
}
