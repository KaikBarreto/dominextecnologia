import { AlertTriangle, Banknote, CheckCircle2, CreditCard, Landmark } from 'lucide-react';
import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/mobile/EmptyState';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { PdvPageSkeleton } from '@/components/pdv/loading/PdvPageSkeleton';
import { PdvCardSettlementsPanel } from './PdvCardSettlementsPanel';
import { usePdvManagementReport } from '@/hooks/usePdvReportsV2';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { paymentMethodLabel } from '@/lib/pdv/reportInsights';

export function PdvPaymentsCashPanel({ from, to, refreshKey = 0 }: { from: string; to: string; refreshKey?: number }) {
  const report = usePdvManagementReport({ from, to });
  const { money } = useLocaleFormatters();
  const { refetch } = report;
  useEffect(() => { if (refreshKey > 0) void refetch(); }, [refreshKey, refetch]);
  if (report.isLoading) return <PdvPageSkeleton variant="reports" label="Carregando pagamentos e caixas" />;
  if (report.error) return <NoticeBanner variant="destructive" action="Tentar novamente" onClick={() => void report.refetch()}>{report.error.message}</NoticeBanner>;
  if (!report.data) return null;
  const { cash, payments, paymentTotal } = report.data;
  const primaryPayment = payments[0] ?? null;
  const hasCashDifference = Math.abs(cash.difference) >= 0.01;
  return <section className="space-y-8">
    <div className="grid gap-4 rounded-xl bg-muted/45 p-4 sm:grid-cols-3 sm:p-5">
      <div>
        <p className="text-xs text-muted-foreground">Pagamentos classificados</p>
        <p className="mt-1 break-words text-2xl font-bold tabular-nums">{money(paymentTotal)}</p>
        <p className="text-xs text-muted-foreground">{payments.length} {payments.length === 1 ? 'forma utilizada' : 'formas utilizadas'}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Forma principal</p>
        <p className="mt-1 break-words font-semibold">{primaryPayment ? paymentMethodLabel(primaryPayment.method) : 'Sem pagamentos'}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{primaryPayment ? `${(primaryPayment.share * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do valor recebido` : 'Aguardando pedidos entregues'}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Conferência de caixa</p>
        <p className="mt-1 flex items-center gap-2 font-semibold">
          {cash.closedSessions === 0 ? <Landmark className="h-4 w-4" /> : hasCashDifference ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          {cash.closedSessions === 0 ? 'Sem fechamento' : hasCashDifference ? 'Com divergência' : 'Sem divergência'}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">{cash.closedSessions === 0 ? 'Nenhum caixa conferido no período' : `${money(Math.abs(cash.difference))} de diferença líquida`}</p>
      </div>
    </div>

    {cash.closedSessions > 0 && hasCashDifference && (
      <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 p-3 text-sm text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p>Os fechamentos têm <b>{cash.difference < 0 ? 'falta' : 'sobra'} líquida de {money(Math.abs(cash.difference))}</b>. Consulte os caixas antes de concluir a conferência do período.</p>
      </div>
    )}

    <div className="space-y-3">
      <div><h3 className="font-semibold">Formas de pagamento</h3><p className="text-sm text-muted-foreground">Mix dos pagamentos dos pedidos entregues no período.</p></div>
      {payments.length === 0 ? <EmptyState size="compact" icon={<Banknote className="h-10 w-10" />} title="Sem pagamentos no período" description="As formas aparecem quando há pedidos entregues no recorte." /> : <div className="grid gap-2 lg:grid-cols-2">
        {payments.map((payment) => <Card key={payment.method}><CardContent className="p-4">
          <div className="flex items-start justify-between gap-4"><div><b>{paymentMethodLabel(payment.method)}</b><p className="text-xs text-muted-foreground">{payment.ordersCount} {payment.ordersCount === 1 ? 'pedido' : 'pedidos'}</p></div><b className="break-words text-right tabular-nums">{money(payment.amount)}</b></div>
          <div className="mt-3 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, payment.share * 100)}%` }} /></div><span className="w-12 text-right text-xs tabular-nums">{(payment.share * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span></div>
        </CardContent></Card>)}
      </div>}
      {paymentTotal > 0 && <p className="text-right text-sm text-muted-foreground">Total classificado: <b className="text-foreground tabular-nums">{money(paymentTotal)}</b></p>}
    </div>

    <div className="space-y-3">
      <div><h3 className="font-semibold">Fechamento dos caixas</h3><p className="text-sm text-muted-foreground">Conferências fechadas no período, respeitando os caixas acessíveis.</p></div>
      {cash.closedSessions === 0 ? <EmptyState size="compact" icon={<Landmark className="h-10 w-10" />} title="Nenhum caixa fechado no período" description="Feche um caixa ou altere o período para ver a conferência." /> : <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-y py-5 lg:grid-cols-6">
        {[
          ['Caixas fechados', String(cash.closedSessions)], ['Valor esperado', money(cash.expected)], ['Valor contado', money(cash.counted)],
          ['Diferença líquida', money(cash.difference)], ['Faltas', money(cash.shortage)], ['Sobras', money(cash.surplus)],
        ].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-xl font-bold tabular-nums">{value}</p></div>)}
      </div>}
    </div>

    <div className="space-y-3 border-t pt-6">
      <div className="flex items-center gap-2"><CreditCard className="h-5 w-5" /><div><h3 className="font-semibold">Conciliação de cartões</h3><p className="text-sm text-muted-foreground">Ferramenta operacional para confirmar recebimentos pendentes.</p></div></div>
      <PdvCardSettlementsPanel />
    </div>
  </section>;
}
