import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PdvAfterSaleAccess, PdvAfterSaleRefund, PdvAfterSaleReturn, PdvAfterSaleVoucher } from '@/hooks/usePdvAfterSale';
import { pdvMoneyCentsFromNumber } from '@/lib/pdv/afterSaleMoney';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const refundStatus: Record<PdvAfterSaleRefund['status'], string> = { pending: 'Pendente', settled: 'Concluído', reversed: 'Estornado' };
const voucherStatus: Record<PdvAfterSaleVoucher['status'], string> = { active: 'Disponível', exhausted: 'Utilizado', expired: 'Vencido', reversed: 'Estornado' };

export function PdvAfterSaleHistory({ entry, access, capabilities, onConfirmRefund, onReverseRefund, onReverseVoucher, onApplyVoucher }: {
  entry: PdvAfterSaleReturn;
  access: PdvAfterSaleAccess;
  capabilities: { confirmRefund: boolean; reverseRefund: boolean; reverseVoucher: boolean; applyVoucher: boolean };
  onConfirmRefund: (refund: PdvAfterSaleRefund) => void;
  onReverseRefund: (refund: PdvAfterSaleRefund) => void;
  onReverseVoucher: (voucher: PdvAfterSaleVoucher) => void;
  onApplyVoucher: (voucher: PdvAfterSaleVoucher) => void;
}) {
  if (!entry.vouchers.length && !entry.refunds.length && !entry.exchanges.length) return <p className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">Nenhum voucher, reembolso ou troca registrado nesta devolução.</p>;
  return <div className="space-y-3">
    {entry.vouchers.map((voucher) => <div key={voucher.voucherId} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="font-mono text-sm tracking-wide">{voucher.publicCode}</strong><Badge className={voucher.status === 'active' ? 'bg-emerald-600 text-white' : 'bg-slate-600 text-white'}>{voucherStatus[voucher.status]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Voucher · saldo <strong className="text-foreground tabular-nums">{money(voucher.balance)}</strong>{voucher.expiresOn ? ` · vence em ${new Date(`${voucher.expiresOn}T12:00:00`).toLocaleDateString('pt-BR')}` : ' · sem validade definida'}</p></div><div className="flex flex-wrap gap-2">{capabilities.applyVoucher && voucher.status === 'active' && (pdvMoneyCentsFromNumber(voucher.balance) ?? 0) > 0 && <Button size="sm" variant="outline" onClick={() => onApplyVoucher(voucher)}>Usar em pedido</Button>}{access.canReverseVoucher && capabilities.reverseVoucher && voucher.canReverse && <Button size="sm" variant="outline" onClick={() => onReverseVoucher(voucher)}>Estornar</Button>}</div></div>)}
    {entry.refunds.map((refund) => <div key={refund.refundId} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>Reembolso {money(refund.amount)}</strong><Badge className={refund.status === 'settled' ? 'bg-emerald-600 text-white' : refund.status === 'pending' ? 'bg-amber-600 text-white' : 'bg-slate-600 text-white'}>{refundStatus[refund.status]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{refund.method === 'credito' ? 'Cartão de crédito' : refund.method === 'debito' ? 'Cartão de débito' : refund.method === 'transferencia' ? 'Transferência' : refund.method === 'pix' ? 'Pix' : 'Dinheiro'}{refund.confirmationReferenceRedacted ? ` · ref. ${refund.confirmationReferenceRedacted}` : ''}</p></div><div className="flex flex-wrap gap-2">{access.canConfirmRefund && capabilities.confirmRefund && refund.canConfirm && <Button size="sm" onClick={() => onConfirmRefund(refund)}>Confirmar externo</Button>}{access.canReverseRefund && capabilities.reverseRefund && refund.canReverse && <Button size="sm" variant="outline" onClick={() => onReverseRefund(refund)}>Estornar</Button>}</div></div>)}
    {entry.exchanges.map((exchange) => <div key={exchange.exchangeId} className="rounded-xl border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Troca no pedido #{exchange.newOrderNumber}</strong><Badge className="bg-emerald-600 text-white">Concluída</Badge></div><p className="mt-1 text-sm text-muted-foreground">Voucher {money(exchange.voucherAmount)} · saldo {money(exchange.creditAmount)} · diferença {money(exchange.differenceAmount)}</p></div>)}
  </div>;
}
