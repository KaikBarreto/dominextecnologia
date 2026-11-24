import '@/components/pdv/PdvWorkspace.css';
import { useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/DatePicker';
import { NumericInput } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PdvMoneyInput } from '@/components/pdv/caixa/PdvMoneyInput';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { PdvListRowsSkeleton } from '@/components/pdv/loading/PdvPageSkeleton';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { type OpenCardAuthorization, usePdvCardSettlements } from '@/hooks/usePdvCardSettlements';

const requestId = () => globalThis.crypto?.randomUUID?.() ?? `card-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function PdvCardSettlementsPanel() {
  const { money, dateTime } = useLocaleFormatters();
  const cards = usePdvCardSettlements();
  const [selected, setSelected] = useState<OpenCardAuthorization | null>(null);
  const [accountId, setAccountId] = useState('');
  const [settledOn, setSettledOn] = useState('');
  const [acquirer, setAcquirer] = useState('');
  const [nsu, setNsu] = useState('');
  const [installments, setInstallments] = useState('1');
  const [fee, setFee] = useState('0');
  const [idempotencyKey, setIdempotencyKey] = useState(requestId);

  const close = () => {
    setSelected(null); setAccountId(''); setSettledOn(''); setAcquirer(''); setNsu('');
    setInstallments('1'); setFee('0'); setIdempotencyKey(requestId());
  };
  const open = (payment: OpenCardAuthorization) => {
    setSelected(payment); setSettledOn(cards.workspace?.companyToday ?? ''); setIdempotencyKey(requestId());
  };
  const submit = async () => {
    if (!selected) return;
    try {
      await cards.settle.mutateAsync({ paymentId: selected.id, accountId, settledOn, acquirer, nsu,
        installments: Number(installments), feeAmount: Number(fee.replace(',', '.')), idempotencyKey });
      close();
    } catch { /* preserva a chave para retry idempotente */ }
  };

  if (cards.isLoading) return <PdvListRowsSkeleton label="Carregando cartões para conciliação" />;
  if (cards.error) return <NoticeBanner variant="destructive" action="Tentar novamente" onClick={() => void cards.refetch()}>{cards.error.message}</NoticeBanner>;
  const payments = cards.workspace?.payments ?? [];
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Confirme o valor que caiu no banco e a taxa cobrada.</p>
        <Button variant="outline" size="sm" onClick={() => void cards.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
      </div>
      {payments.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center"><CreditCard className="mb-3 h-9 w-9 text-muted-foreground" /><b>Nenhum cartão pendente</b><span className="text-sm text-muted-foreground">As vendas conciliadas saem desta lista.</span></div>
      ) : <div className="divide-y rounded-lg border">{payments.map((payment) => (
        <div key={payment.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><b>Pedido #{payment.orderNumber}</b><p className="truncate text-sm text-muted-foreground">{payment.customerName} · {payment.method === 'credito' ? 'Crédito' : 'Débito'} · {dateTime(payment.authorizedAt)}</p></div>
          <b className="tabular-nums">{money(payment.amount)}</b>
          <Button size="sm" onClick={() => open(payment)}>Conciliar</Button>
        </div>
      ))}</div>}
      <ResponsiveModal drawerClassName="pdv-dialog" className="pdv-dialog" open={Boolean(selected)} onOpenChange={(value) => { if (!value && !cards.settle.isPending) close(); }}
        title="Conciliar cartão" description={selected ? `Pedido #${selected.orderNumber} · ${money(selected.amount)}` : ''}
        footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="cancel-ghost" onClick={close} disabled={cards.settle.isPending}>Cancelar</Button><Button onClick={() => void submit()} disabled={cards.settle.isPending || !accountId || !settledOn || !acquirer.trim() || !nsu.trim() || Number(installments) < 1 || Number(fee.replace(',', '.')) < 0}>{cards.settle.isPending ? 'Conciliando…' : 'Confirmar conciliação'}</Button></div>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="card-account">Conta que recebeu</Label><Select value={accountId} onValueChange={setAccountId}><SelectTrigger id="card-account"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{(cards.workspace?.accounts ?? []).map(account => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="card-acquirer">Operadora do cartão</Label><Input id="card-acquirer" value={acquirer} onChange={(event) => setAcquirer(event.target.value)} maxLength={80} placeholder="Ex.: Stone" /></div>
          <div className="space-y-2"><Label htmlFor="card-nsu">Código da transação (NSU)</Label><Input id="card-nsu" value={nsu} onChange={(event) => setNsu(event.target.value)} maxLength={80} autoComplete="off" /></div>
          <div className="space-y-2"><Label htmlFor="card-installments">Parcelas</Label><NumericInput id="card-installments" value={installments} onValueChange={setInstallments} /></div>
          <div className="space-y-2"><Label htmlFor="card-fee">Taxa cobrada</Label><PdvMoneyInput id="card-fee" value={Number(fee.replace(',', '.')) || 0} onChange={value => setFee(String(value))} /></div>
          <div className="space-y-2"><Label htmlFor="card-date">Data em que caiu</Label><DatePicker id="card-date" max={cards.workspace?.companyToday} value={settledOn} onValueChange={setSettledOn} /></div>
          {cards.settle.error && <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2">{cards.settle.error.message}</p>}
        </div>
      </ResponsiveModal>
    </section>
  );
}
