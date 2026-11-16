import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import type { PdvAfterSaleAccess, PdvAfterSaleResidual, PdvAfterSaleWorkspace, PdvResidualRefund, PdvResidualVoucher } from '@/hooks/usePdvAfterSale';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const refundStatus = { pending: 'Aguardando confirmação', settled: 'Concluído', reversed: 'Estornado' };
const voucherStatus = { active: 'Disponível', exhausted: 'Sem saldo', expired: 'Vencido', reversed: 'Estornado' };

export function PdvResidualAfterSaleHistory({ entry, access, workspace, onConfirmRefund, onReverseRefund, onReverseVoucher, onRedistribute }: {
  entry: PdvAfterSaleResidual; access: PdvAfterSaleAccess; workspace: PdvAfterSaleWorkspace;
  onRedistribute?: () => void;
  onConfirmRefund: (refund: PdvResidualRefund) => void;
  onReverseRefund: (refund: PdvResidualRefund) => void;
  onReverseVoucher: (voucher: PdvResidualVoucher) => void;
}) {
  const capabilities = workspace.capabilities;
  if (entry.accessMasked) return <article className="space-y-2 rounded-xl border p-4" aria-label="Itens não retirados"><h4 className="font-semibold">Itens não retirados</h4><p className="text-sm">Cancelamento registrado.</p><p role="status" className="text-sm text-muted-foreground">Você não tem acesso aos valores e destinos financeiros deste cancelamento. Peça a um responsável autorizado para consultar o pós-venda.</p></article>;
  return <article className="space-y-4 rounded-xl border p-4" aria-label="Itens não retirados">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold">Itens não retirados</h4><p className="text-sm text-muted-foreground">Cancelados em {new Date(`${entry.occurredOn.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')} · {entry.reason}</p></div><strong className="text-lg tabular-nums">{money(entry.residualAmount)}</strong></header>
    <p className="text-sm text-muted-foreground">O cancelamento liberou as reservas dos itens que não foram retirados.</p>
    {entry.reductionAmount > 0 && <div className="flex flex-wrap justify-between gap-2 text-sm"><span>Fiado abatido</span><strong className="tabular-nums">{money(entry.reductionAmount)}</strong></div>}
    {entry.creditedAmount > 0 && <div className="space-y-1"><div className="flex flex-wrap justify-between gap-2 text-sm"><span>Destinado ao saldo do cliente</span><strong className="tabular-nums">{money(entry.creditedAmount)}</strong></div><p className="text-xs text-muted-foreground">O saldo atual, incluindo usos posteriores, está na ficha do cliente.</p></div>}
    {entry.financialStatus === 'pending_disposition' && <NoticeBanner variant="warning"><strong>{money(entry.unallocatedAmount)} aguardando nova destinação.</strong> O estorno preservou o cancelamento dos itens. Esta pendência ainda não foi encerrada.{onRedistribute ? <div className="mt-3"><Button size="sm" onClick={onRedistribute}>Escolher novo destino</Button></div> : <p className="mt-2">Peça a um responsável financeiro para escolher o novo destino.</p>}</NoticeBanner>}
    {entry.vouchers.map(v => <div key={v.voucherId} className="grid gap-3 border-t pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong className="font-mono text-sm">{v.publicCode}</strong>{v.status && <Badge className="bg-slate-600 text-white">{voucherStatus[v.status]}</Badge>}</div><p className="text-sm text-muted-foreground">Voucher · saldo atual <strong className="tabular-nums text-foreground">{money(v.balance)}</strong></p>{!v.eligibilityKnown && <p className="text-xs text-muted-foreground">A disponibilidade para estorno ainda não pôde ser conferida. Atualize os dados mais tarde.</p>}</div>{access.canReverseVoucher && capabilities.reverseVoucher && v.canReverse && <Button size="sm" variant="outline" onClick={() => onReverseVoucher(v)}>Estornar voucher</Button>}</div>)}
    {entry.refunds.map(r => {
      const accountsAvailable = capabilities.useBankAccounts && workspace.accountOptions.some(a => a.methods.includes(r.method as 'pix' | 'transferencia'));
      return <div key={r.refundId} className="grid gap-3 border-t pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>Reembolso {money(r.amount)}</strong><Badge className={r.status === 'pending' ? 'bg-amber-600 text-white' : 'bg-slate-600 text-white'}>{refundStatus[r.status]}</Badge></div><p className="text-sm text-muted-foreground">{r.method === 'pix' ? 'Pix' : r.method === 'transferencia' ? 'Transferência' : r.method === 'dinheiro' ? 'Dinheiro' : 'Cartão'}</p>{r.status === 'pending' && <p className="text-xs text-muted-foreground">Solicitação registrada. Conclua a devolução no banco e depois confirme aqui.</p>}{!r.eligibilityKnown && <p className="text-xs text-muted-foreground">As ações deste reembolso ainda não puderam ser conferidas. Atualize os dados mais tarde.</p>}{r.canConfirm && access.canConfirmRefund && !accountsAvailable && <p className="text-xs text-muted-foreground">Uma conta bancária autorizada é necessária para confirmar.</p>}</div><div className="flex flex-wrap gap-2">{access.canConfirmRefund && capabilities.confirmRefund && r.canConfirm && accountsAvailable && <Button size="sm" onClick={() => onConfirmRefund(r)}>Confirmar reembolso externo</Button>}{access.canReverseRefund && capabilities.reverseRefund && r.canReverse && <Button size="sm" variant="outline" onClick={() => onReverseRefund(r)}>Estornar reembolso</Button>}</div></div>;
    })}
  </article>;
}
