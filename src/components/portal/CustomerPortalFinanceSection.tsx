import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortalChargesSection, type PortalChargeItem, type PortalChargesSectionMessages } from './PortalChargesSection';
import { usePortalPaymentReceipts } from '@/hooks/usePortalPaymentReceipts';
import { paymentMethodLabel } from '@/utils/osReceiptPdf';

export function CustomerPortalFinanceSection({ token, sessionToken, charges, ...props }: {
  token: string; sessionToken: string; charges: PortalChargeItem[]; t?: PortalChargesSectionMessages; locale?: string; currency?: string; timezone?: string;
}) {
  const payments = usePortalPaymentReceipts(token, sessionToken || null);
  const manual = (payments.data ?? []).filter(p => p.kind === 'transaction' || !p.public_short_code || !charges.some(c => c.public_short_code === p.public_short_code));
  return <div className="space-y-8">
    <PortalChargesSection charges={charges} {...props} downloadingReceipt={payments.downloading} receiptPayments={payments.data ?? []} onReceipt={payment => void payments.download(payment)} />
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Recebimentos e recibos</h2><Button variant="outline" size="sm" disabled={payments.isFetching} onClick={() => void payments.refetch()}>Atualizar</Button></div>
      {payments.isPending && <p role="status" className="text-sm text-muted-foreground">Consultando pagamentos confirmados…</p>}
      {payments.isError && <p role="alert" className="text-sm">Não foi possível consultar os recibos. <button className="underline" onClick={() => void payments.refetch()}>Tentar novamente</button></p>}
      {!payments.isPending && !payments.isError && manual.length === 0 && <p className="text-sm text-muted-foreground">{charges.length ? 'Os recibos de cobranças pagas estão disponíveis acima.' : 'Nenhum recebimento confirmado até o momento.'}</p>}
      {manual.map(payment => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-4">
        <div className="min-w-0 flex-1"><p className="break-words font-medium">{payment.description || 'Pagamento recebido'}</p><p className="mt-1 text-sm text-muted-foreground">{payment.paid_date.slice(0, 10).split('-').reverse().join('/')} · {paymentMethodLabel(payment.method)}</p><p className="mt-1 font-semibold tabular-nums">{payment.amount.toLocaleString('pt-BR', { style: 'currency', currency: props.currency || 'BRL' })}</p></div>
        <Button variant="outline" className="gap-2" disabled={!!payments.downloading} onClick={() => void payments.download(payment)}>{payments.downloading === payment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}Gerar recibo</Button>
      </div>)}
    </section>
  </div>;
}
