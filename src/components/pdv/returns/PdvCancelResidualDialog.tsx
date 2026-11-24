import '@/components/pdv/PdvWorkspace.css';
import { useRef, useState } from 'react';
import { Ban, CheckCircle2, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyField } from '@/components/ui/CurrencyField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePdvResidualCancellation, PdvResidualFault, validatePdvResidualDestinations, type PdvResidualDestination, type PdvResidualKind, type PdvResidualSummary } from '@/hooks/usePdvReturns';
import { formatPdvMoneyCents, parsePdvMoneyText } from '@/lib/pdv/afterSaleMoney';
import { useToast } from '@/hooks/use-toast';

type Props = { open: boolean; onOpenChange: (open: boolean) => void; orderId: string; orderNumber: number; remainingQuantity: number; onCompleted?: () => void };
type Row = { id: string; paymentId: string; kind: PdvResidualKind | ''; amount: string; accountId: string; sessionId: string };
const emptyRow = (): Row => ({ id: crypto.randomUUID(), paymentId: '', kind: '', amount: '', accountId: '', sessionId: '' });
const methodLabel = { dinheiro: 'Dinheiro', pix: 'Pix', transferencia: 'Transferência' };
const selectClass = 'h-auto min-h-11 [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:text-left';

export function PdvCancelResidualDialog(props: Props) {
  const operation = usePdvResidualCancellation(props.orderId, props.open);
  return <ResidualForm key={operation.scopeKey} {...props} operation={operation} />;
}

function ResidualForm({ open, onOpenChange, orderNumber, remainingQuantity, onCompleted, operation }: Props & { operation: ReturnType<typeof usePdvResidualCancellation> }) {
  const { toast } = useToast(); const [reason, setReason] = useState(''); const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [error, setError] = useState<PdvResidualFault | null>(null); const [refreshing, setRefreshing] = useState(false);
  const live = useRef(open); const sending = useRef(false); const completed = useRef(false);
  if (!open) live.current = false;
  const workspace = operation.query.isError ? undefined : operation.query.data;
  const covered = workspace?.mode === 'covered' ? workspace : null;
  const destinations: PdvResidualDestination[] = rows.flatMap(row => {
    const payment = covered?.plan.payments.find(p => p.id === row.paymentId);
    const amount = parsePdvMoneyText(row.amount, { minCents: 1, maxCents: payment && covered ? Math.min(payment.amountCents, covered.plan.paidCents) : 0 });
    return row.kind && amount ? [{ kind: row.kind, paymentId: row.paymentId, amountCents: amount.cents,
      ...(row.accountId ? { accountId: row.accountId } : {}), ...(row.sessionId ? { sessionId: row.sessionId } : {}) }] : [];
  });
  const allocated = destinations.reduce((sum, row) => sum + row.amountCents, 0);
  const exact = !covered || (covered.plan.paidCents === 0 ? true : destinations.length === rows.length && validatePdvResidualDestinations(covered, destinations));
  const pending = operation.isPending || refreshing;
  const uncertain = operation.uncertain;
  const canSubmit = Boolean(workspace && workspace.mode !== 'completed' && remainingQuantity > 0 && reason.trim() && exact && !pending && !operation.query.isFetching && !uncertain);
  const stillHere = () => live.current && operation.isCurrent();
  function close() { live.current = false; onOpenChange(false); }
  function finish(summary: PdvResidualSummary, notify = true) {
    if (!stillHere() || completed.current) return;
    completed.current = true;
    if (notify) toast({ title: 'Restante cancelado', description: summary.pendingRefund
      ? 'O reembolso bancário foi solicitado e aguarda confirmação no financeiro.'
      : 'O pedido e o destino dos valores foram atualizados.' });
    close(); onCompleted?.();
  }
  async function submit(replay = false) {
    if (sending.current || !stillHere()) return;
    sending.current = true; setError(null);
    try { finish(await (replay ? operation.retryIntent() : operation.submit(reason, covered?.plan.paidCents === 0 ? [] : destinations))); }
    catch (cause) { if (stillHere()) setError(cause instanceof PdvResidualFault ? cause : new PdvResidualFault('Não foi possível confirmar a solicitação. Confira o pedido antes de tentar novamente.', 'unknown')); }
    finally { sending.current = false; }
  }
  async function refresh() {
    if (!stillHere() || refreshing) return;
    setRefreshing(true); setError(null);
    try { const result = await operation.reconcile(); if (!stillHere()) return; if (result.data?.mode === 'covered' && !operation.uncertain) setRows([emptyRow()]); }
    finally { if (stillHere()) setRefreshing(false); }
  }
  const change = (id: string, patch: Partial<Row>) => { setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row)); setError(null); };
  const summary = workspace?.mode === 'completed' ? workspace.summary : null;
  const footer = summary ? <Button onClick={() => summary.accessMasked ? close() : finish(summary, false)}>{summary.accessMasked ? 'Fechar' : 'Concluir'}</Button> : uncertain && workspace ? <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
    <Button variant="cancel" onClick={close}>Fechar</Button><Button variant="outline" disabled={pending} onClick={() => void refresh()}><RefreshCw className="mr-2 h-4 w-4" />Conferir resultado</Button>
    <Button disabled={pending} onClick={() => void submit(true)}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Repetir a mesma solicitação</Button>
  </div> : <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
    <Button variant="cancel" onClick={close}>Voltar</Button><Button variant="destructive" disabled={!canSubmit} onClick={() => void submit()}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}Confirmar cancelamento</Button>
  </div>;
  return <ResponsiveDialog className="pdv-dialog" drawerClassName="pdv-dialog" open={open} onOpenChange={value => { if (!value) close(); }} title="Cancelar restante do pedido" description={workspace ? `Pedido #${orderNumber} · até ${Math.max(0, remainingQuantity)} unidade(s) não retirada(s).` : 'Confira o pedido antes de cancelar.'} mobileFullHeight footer={footer}>
    <div className="space-y-5 py-3">
      {!workspace && !operation.query.isError && <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Conferindo o pedido e os valores…</p>}
      {operation.query.isError && <div role="alert" className="space-y-3 border-l-2 border-destructive pl-3"><p className="text-sm">{operation.query.error instanceof Error ? operation.query.error.message : 'Não foi possível conferir o pedido.'}</p><Button variant="outline" disabled={refreshing} onClick={() => void refresh()}>Tentar consultar novamente</Button></div>}
      {summary ? <section className="space-y-3" aria-label="Cancelamento conferido"><CheckCircle2 className="h-8 w-8 text-primary" /><h3 className="text-lg font-semibold">O restante já foi cancelado</h3>
        {summary.accessMasked && <p role="status" className="text-sm">Você não tem acesso aos destinos e valores financeiros deste cancelamento. Peça a um responsável autorizado para consultar o pós-venda. A solicitação já foi registrada e não será reenviada.</p>}
        {summary.pendingRefund && <p className="text-sm">O reembolso bancário está solicitado e aguarda confirmação no financeiro.</p>}
        {summary.unallocatedCents > 0 && <p className="border-l-2 border-destructive pl-3 text-sm">Há {formatPdvMoneyCents(summary.unallocatedCents)} aguardando uma nova destinação no financeiro.</p>}
      </section> : workspace && !operation.query.isError && (uncertain ? <section aria-label="Solicitação aguardando confirmação" className="space-y-3 border-l-2 border-primary pl-3">
        <h3 className="font-semibold">Confira a solicitação anterior</h3><p className="text-sm">A resposta pode ter se perdido. Consulte o resultado ou repita exatamente a mesma solicitação. Os valores ficam bloqueados até a confirmação.</p>
        {operation.intentReason && <p className="break-words text-sm text-muted-foreground">Motivo enviado: {operation.intentReason}</p>}
      </section> : <>
        {remainingQuantity <= 0 && <p role="alert" className="text-sm">Não há restante disponível. Atualize o pedido para conferir as retiradas.</p>}
        {workspace.mode === 'unpaid' ? <section className="space-y-2 border-b pb-4"><h3 className="font-semibold">Sem pagamento vinculado</h3><p className="text-sm text-muted-foreground">As reservas do restante serão liberadas ao confirmar.</p></section> : covered && <>
          <section aria-label="Valores do restante" className="space-y-4 border-b pb-4">
            <div><p className="text-sm text-muted-foreground">Restante a cancelar</p><p className="break-words text-3xl font-semibold tabular-nums">{formatPdvMoneyCents(covered.plan.residualCents)}</p></div>
            <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">Abater do fiado · automático</dt><dd className="break-words text-xl font-semibold tabular-nums">{formatPdvMoneyCents(covered.plan.reductionCents)}</dd></div><div><dt className="text-sm text-muted-foreground">Valor já pago para destinar</dt><dd className="break-words text-xl font-semibold tabular-nums">{formatPdvMoneyCents(covered.plan.paidCents)}</dd></div></dl>
          </section>
          {covered.plan.paidCents > 0 ? <section aria-label="Destino do valor já pago" className="space-y-4">
            <div><h3 className="font-semibold">Como destinar o valor já pago?</h3><p className="mt-1 text-sm text-muted-foreground">Escolha o pagamento de origem, o destino e o valor. Você pode dividir entre destinos.</p></div>
            {covered.optionsWarning && <p className="border-l-2 border-primary pl-3 text-sm">Não foi possível conferir as opções de reembolso. Você pode consultar novamente ou escolher outro destino disponível.</p>}
            {rows.map((row, index) => {
              const payment = covered.plan.payments.find(p => p.id === row.paymentId);
              const banks = covered.banks.filter(b => b.id === payment?.accountId && b.methods.includes(payment?.method ?? ''));
              const refundAllowed = covered.canRefund && (payment?.method === 'dinheiro' ? covered.cash.length > 0 : banks.length > 0);
              const kinds = [...(covered.canCredit ? [{ value: 'customer_credit', label: 'Saldo do cliente' }] : []), ...(covered.canVoucher ? [{ value: 'voucher', label: 'Voucher' }] : []), ...(refundAllowed ? [{ value: 'refund', label: 'Reembolso' }] : [])];
              return <div key={row.id} className="space-y-3 border-b pb-4" aria-label={`Destino ${index + 1}`}>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
                  <label className="min-w-0 space-y-1 text-sm font-medium">Pagamento original<Select disabled={pending} value={row.paymentId || '_none'} onValueChange={value => change(row.id, { paymentId: value === '_none' ? '' : value, kind: '', amount: '', accountId: '', sessionId: '' })}><SelectTrigger className={selectClass} aria-label={`Pagamento original do destino ${index + 1}`}><SelectValue placeholder="Escolha o pagamento" /></SelectTrigger><SelectContent><SelectItem value="_none">Escolha o pagamento</SelectItem>{covered.plan.payments.map(p => <SelectItem key={p.id} value={p.id}>{methodLabel[p.method]} · recebido {formatPdvMoneyCents(p.amountCents)}</SelectItem>)}</SelectContent></Select></label>
                  <label className="min-w-0 space-y-1 text-sm font-medium">Valor<CurrencyField symbol="R$"><Input inputMode="decimal" autoComplete="off" aria-label={`Valor do destino ${index + 1}`} placeholder="0,00" value={row.amount} disabled={pending || !payment} onChange={event => change(row.id, { amount: event.target.value })} /></CurrencyField></label>
                  <Button variant="ghost" size="icon" aria-label={`Remover destino ${index + 1}`} disabled={pending} onClick={() => setRows(current => current.filter(r => r.id !== row.id))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {payment && <SegmentedControl aria-label={`Tipo do destino ${index + 1}`} options={kinds} value={row.kind} disabled={pending} onValueChange={value => change(row.id, { kind: value as PdvResidualKind, accountId: '', sessionId: '' })} className="[&_button]:min-h-11 [&_button]:whitespace-normal" />}
                {row.kind === 'customer_credit' && <p className="text-sm text-muted-foreground">O saldo ficará disponível na ficha do cliente para outra compra.</p>}
                {row.kind === 'voucher' && <p className="text-sm text-muted-foreground">Será gerado um voucher vinculado ao cliente, sem validade definida.</p>}
                {row.kind === 'refund' && payment?.method === 'dinheiro' && <label className="block space-y-1 text-sm font-medium">Devolver pelo caixa original<Select value={row.sessionId || '_none'} onValueChange={value => { const cash = covered.cash.find(c => c.id === value); change(row.id, { sessionId: cash?.id ?? '', accountId: cash?.accountId ?? '' }); }} disabled={pending}><SelectTrigger aria-label={`Caixa do reembolso ${index + 1}`}><SelectValue placeholder="Confirme o caixa" /></SelectTrigger><SelectContent><SelectItem value="_none">Confirme o caixa</SelectItem>{covered.cash.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></label>}
                {row.kind === 'refund' && payment && payment.method !== 'dinheiro' && <div className="space-y-2"><label className="block space-y-1 text-sm font-medium">Conta original do pagamento<Select value={row.accountId || '_none'} onValueChange={value => change(row.id, { accountId: value === '_none' ? '' : value })} disabled={pending}><SelectTrigger aria-label={`Conta do reembolso ${index + 1}`}><SelectValue placeholder="Confirme a conta" /></SelectTrigger><SelectContent><SelectItem value="_none">Confirme a conta</SelectItem>{banks.map(b => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}</SelectContent></Select></label><p className="text-sm text-muted-foreground">O reembolso será solicitado e ficará pendente até a confirmação no financeiro.</p></div>}
              </div>;
            })}
            <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={pending || rows.length >= 10} onClick={() => setRows(current => [...current, emptyRow()])}><Plus className="mr-2 h-4 w-4" />Adicionar destino</Button><p aria-live="polite" className="break-words text-sm font-medium tabular-nums">{allocated === covered.plan.paidCents ? 'Valor distribuído' : allocated > covered.plan.paidCents ? `Reduza ${formatPdvMoneyCents(allocated - covered.plan.paidCents)}` : `Falta destinar ${formatPdvMoneyCents(covered.plan.paidCents - allocated)}`}</p></div>
          </section> : <p className="text-sm text-muted-foreground">Todo o restante será abatido do fiado. Não há valor já pago para destinar.</p>}
        </>}
        <label className="block space-y-2 text-sm font-medium">Motivo do cancelamento<Textarea aria-label="Motivo do cancelamento do saldo" maxLength={500} value={reason} disabled={pending} onChange={event => { setReason(event.target.value); setError(null); }} placeholder="Ex.: cliente desistiu do restante" /></label>
      </>)}
      {error && <div role="alert" className="space-y-2 border-l-2 border-destructive pl-3"><p className="text-sm">{error.message}</p>{error.kind === 'stale' && <Button variant="outline" disabled={pending} onClick={() => void refresh()}>Atualizar valores e conferir novamente</Button>}</div>}
    </div>
  </ResponsiveDialog>;
}
