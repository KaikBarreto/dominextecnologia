import { useAuth } from '@/contexts/AuthContext';
import { PdvResidualDispositionDialog } from './PdvResidualDispositionDialog';
import { useRef, useState } from 'react';
import { Loader2, RefreshCw, Repeat2, Search, Ticket, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { PdvVoucherDialog } from './PdvVoucherDialog';
import { PdvRefundDialog } from './PdvRefundDialog';
import { PdvExchangeDialog } from './PdvExchangeDialog';
import { PdvAfterSaleHistory } from './PdvAfterSaleHistory';
import { PdvApplyVoucherDialog, PdvConfirmRefundDialog, PdvReverseAfterSaleDialog, type PdvConfirmRefundTarget, type PdvReverseAfterSaleTarget } from './PdvAfterSaleActionDialogs';
import { getPdvExchangeOrderCandidates, getPdvVoucherOrderCandidates, stablePdvAfterSaleAttempt, usePdvAfterSaleWorkspace, type PdvAfterSaleAccess, type PdvAfterSaleAttempt, type PdvAfterSaleReturn, type PdvAfterSaleVoucher, type PdvAfterSaleWorkspace } from '@/hooks/usePdvAfterSale';
import { PdvVoucherSearchDialog } from './PdvVoucherSearchDialog';
import { PdvResidualAfterSaleHistory } from './PdvResidualAfterSaleHistory';
import { pdvMoneyCentsFromNumber } from '@/lib/pdv/afterSaleMoney';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function PdvAfterSalePanel({ orderId, access, onReload }: { orderId: string; access: PdvAfterSaleAccess; onReload: () => void }) {
  const workspace = usePdvAfterSaleWorkspace(orderId, access.enabled && access.canView);
  if (!access.enabled || !access.canView) return null;
  if (workspace.isLoading) return <div className="flex items-center gap-2 border-t pt-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando valores do pós-venda…</div>;
  if (workspace.isError || !workspace.data) return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><span className="text-sm font-semibold">Não foi possível carregar vouchers e reembolsos.</span><Button size="sm" variant="outline" onClick={() => void workspace.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button></div>;
  if (!workspace.data.capabilities.view) return null;
  return <AfterSaleContent key={workspace.scopeKey} orderId={orderId} access={access} data={workspace.data} onReload={onReload} workspace={workspace} />;
}

function AfterSaleContent({ orderId, access, data, onReload, workspace }: { orderId: string; access: PdvAfterSaleAccess; data: PdvAfterSaleWorkspace; onReload: () => void; workspace: ReturnType<typeof usePdvAfterSaleWorkspace> }) {
  const auth = useAuth();
  const canRedistribute = auth.roles.some(r => ['admin', 'gestor', 'super_admin'].includes(r)) || auth.hasPermissionRecord && (auth.permissions.includes('*') || auth.permissions.includes('fn:manage_party_credit') && auth.permissions.includes('screen:customers'));
  const [redistribute, setRedistribute] = useState(false);
  const attempts = useRef(new Map<string, PdvAfterSaleAttempt>());
  const [voucherEntry, setVoucherEntry] = useState<PdvAfterSaleReturn | null>(null);
  const [refundEntry, setRefundEntry] = useState<PdvAfterSaleReturn | null>(null);
  const [exchangeEntry, setExchangeEntry] = useState<PdvAfterSaleReturn | null>(null);
  const [confirmRefund, setConfirmRefund] = useState<PdvConfirmRefundTarget | null>(null);
  const [reverseTarget, setReverseTarget] = useState<PdvReverseAfterSaleTarget | null>(null);
  const [applyVoucher, setApplyVoucher] = useState<PdvAfterSaleVoucher | null>(null);
  const [voucherSearchOpen, setVoucherSearchOpen] = useState(false);

  const exchangeCandidates = getPdvExchangeOrderCandidates(data);
  const voucherOrderCandidates = getPdvVoucherOrderCandidates(data);
  const getAttempt = (key: string, signature: string) => { const next = stablePdvAfterSaleAttempt(attempts.current.get(key) ?? null, signature, () => crypto.randomUUID()); attempts.current.set(key, next); return next; };
  const completed = () => { if (!workspace.isCurrent()) return; attempts.current.clear(); void workspace.refetch(); onReload(); };
  return <section className="space-y-4 border-t pt-5" aria-label="Valores do pós-venda"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="pdv-section-heading font-semibold">Voucher, reembolso e troca</h3><p className="text-sm text-muted-foreground">Acompanhe os valores de devoluções e de itens não retirados neste pedido.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={workspace.isFetching} onClick={() => void workspace.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar valores</Button>{data.capabilities.searchVoucher && <Button size="sm" variant="outline" onClick={() => setVoucherSearchOpen(true)}><Search className="mr-2 h-4 w-4" />Consultar vouchers</Button>}</div></div>
    {!data.capabilities.applyVoucher && <p className="text-sm text-muted-foreground">Escolha os vouchers ao receber o pedido no caixa, junto das demais formas de pagamento.</p>}
    {!data.capabilities.directSaleVoucher && <NoticeBanner variant="info">Voucher pode ser usado em pedidos do balcão. Venda direta com voucher ainda não está habilitada.</NoticeBanner>}
    {access.canCreateExchange && data.capabilities.createExchange && data.returns.length > 0 && exchangeCandidates.length === 0 && <p className="text-sm text-muted-foreground">Para usar em troca, é necessário um pedido do mesmo cliente aguardando pagamento e estoque disponível.</p>}
    {data.residualCancellation && <PdvResidualAfterSaleHistory entry={data.residualCancellation} onRedistribute={canRedistribute ? () => setRedistribute(true) : undefined} access={access} workspace={data} onConfirmRefund={setConfirmRefund} onReverseRefund={(item) => setReverseTarget({ kind: 'refund', item })} onReverseVoucher={(item) => setReverseTarget({ kind: 'voucher', item })} />}
    {data.returns.length === 0 && !data.residualCancellation ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">Registre uma devolução antes de escolher o destino do valor.</p> : data.returns.map((entry) => { const availableCents = pdvMoneyCentsFromNumber(entry.availableAmount); const canAllocate = availableCents !== null && availableCents > 0; return <article key={entry.returnId} className="pdv-after-sale-entry"><header className="flex flex-wrap items-start justify-between gap-3"><div><strong>Devolução de {new Date(`${entry.occurredOn.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')}</strong><p className="text-sm text-muted-foreground">{entry.reason}</p></div><div className="text-right"><span className="block text-xs text-muted-foreground">Disponível</span><strong className="text-lg tabular-nums">{money(entry.availableAmount)}</strong></div></header><div className="flex flex-wrap gap-2">{access.canIssueVoucher && data.capabilities.issueVoucher && canAllocate && <Button size="sm" variant="outline" onClick={() => setVoucherEntry(entry)}><Ticket className="mr-2 h-4 w-4" />Gerar voucher</Button>}{access.canRequestRefund && data.capabilities.requestRefund && canAllocate && entry.eligiblePayments.length > 0 && <Button size="sm" variant="outline" onClick={() => setRefundEntry(entry)}><Undo2 className="mr-2 h-4 w-4" />Reembolsar</Button>}{access.canCreateExchange && data.capabilities.createExchange && exchangeCandidates.length > 0 && <Button size="sm" variant="outline" onClick={() => setExchangeEntry(entry)}><Repeat2 className="mr-2 h-4 w-4" />Usar em troca</Button>}</div><PdvAfterSaleHistory entry={entry} access={access} capabilities={{ ...data.capabilities, applyVoucher: data.capabilities.applyVoucher && voucherOrderCandidates.length > 0 }} onConfirmRefund={setConfirmRefund} onReverseRefund={(item) => setReverseTarget({ kind: 'refund', item })} onReverseVoucher={(item) => setReverseTarget({ kind: 'voucher', item })} onApplyVoucher={setApplyVoucher} /></article>; })}
    {redistribute && <PdvResidualDispositionDialog open={redistribute} onOpenChange={setRedistribute} orderId={orderId} onCompleted={completed} isCurrent={workspace.isCurrent} />}
    {voucherEntry && <PdvVoucherDialog open={Boolean(voucherEntry)} onOpenChange={(open) => { if (!open) setVoucherEntry(null); }} orderId={orderId} entry={voucherEntry} getAttempt={getAttempt} onCompleted={completed} />}
    {refundEntry && <PdvRefundDialog open={Boolean(refundEntry)} onOpenChange={(open) => { if (!open) setRefundEntry(null); }} orderId={orderId} entry={refundEntry} workspace={data} getAttempt={getAttempt} onCompleted={completed} />}
    {exchangeEntry && <PdvExchangeDialog open={Boolean(exchangeEntry)} onOpenChange={(open) => { if (!open) setExchangeEntry(null); }} orderId={orderId} entry={exchangeEntry} workspace={{ ...data, exchangeCandidates }} canApproveCredit={access.canApproveCredit && data.capabilities.approveCredit} getAttempt={getAttempt} onCompleted={completed} isCurrent={workspace.isCurrent} />}
    <PdvConfirmRefundDialog open={Boolean(confirmRefund)} onOpenChange={(open) => { if (!open) setConfirmRefund(null); }} orderId={orderId} refund={confirmRefund} accounts={data.accountOptions} getAttempt={getAttempt} onCompleted={completed} isCurrent={workspace.isCurrent} />
    <PdvReverseAfterSaleDialog open={Boolean(reverseTarget)} onOpenChange={(open) => { if (!open) setReverseTarget(null); }} orderId={orderId} target={reverseTarget} getAttempt={getAttempt} onCompleted={completed} isCurrent={workspace.isCurrent} />
    <PdvApplyVoucherDialog open={Boolean(applyVoucher)} onOpenChange={(open) => { if (!open) setApplyVoucher(null); }} orderId={orderId} voucher={applyVoucher} candidates={voucherOrderCandidates} getAttempt={getAttempt} onCompleted={completed} />
    <PdvVoucherSearchDialog open={voucherSearchOpen} onOpenChange={setVoucherSearchOpen} customerId={data.order.customerId} />
  </section>;
}
