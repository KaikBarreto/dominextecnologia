import '@/components/pdv/PdvWorkspace.css';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomerAvatar } from '@/components/customers/CustomerAvatar';
import { PartyAccountPanel } from '@/components/customers/PartyAccountPanel';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { usePdvCustomerHistory, type PdvCustomerHistoryKind } from '@/hooks/usePdvCustomerHistory';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { formatCustomerDocument, formatCustomerPhone } from '@/lib/customerDisplay';
import type { Customer } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { PdvOrderActionsMenu } from '@/components/pdv/PdvOrderActionsMenu';
import { usePdvOrderWorkspace } from '@/hooks/usePdvOrdersList';
import { derivePdvReturnsAccess, usePdvReturnsFeature } from '@/hooks/usePdvReturns';
import { derivePdvAfterSaleAccess, usePdvAfterSaleFeature } from '@/hooks/usePdvAfterSale';
import { usePdvReceiptSettings } from '@/hooks/usePdvReceiptSettings';
import { openPdvOrderReceipt } from '@/components/pdv/receipt/PdvOrderReceiptButton';
import { DEFAULT_PDV_RECEIPT_SETTINGS } from '@/lib/pdv/receipt/model';
import { useToast } from '@/hooks/use-toast';
import type { PdvCustomerHistoryRow } from '@/hooks/usePdvCustomerHistory';
import { usePdvCustomerPaymentOptions } from '@/hooks/usePdvCustomerPaymentOptions';
import { isPdvVoucherEligible } from '@/lib/pdv/voucherEligibility';
import { todayInTz } from '@/lib/timezone';
import { PdvPartyProfileButton } from './PdvPartyProfileButton';

export function PdvCustomerProfileDialog({ customer }: { customer: Customer }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('Dados');
  const [kind, setKind] = useState<PdvCustomerHistoryKind>('orders');
  const [page, setPage] = useState(0);
  const history = usePdvCustomerHistory(customer.id, kind, page, open && tab === 'Histórico');
  const { money, dateTime } = useLocaleFormatters();
  const navigate = useNavigate();
  const { roles, permissions, hasPermissionRecord, profile, hasScreenAccess, isAdminOrGestor } = useAuth();
  const privileged = isAdminOrGestor() || roles.includes('super_admin');
  const returnsFeature = usePdvReturnsFeature(open ? profile?.company_id : null);
  const afterSaleFeature = usePdvAfterSaleFeature(open ? profile?.company_id : null);
  const returnsAccess = derivePdvReturnsAccess({ featureEnabled: returnsFeature.data === true, privileged, hasPermissionRecord, permissions });
  const afterSaleAccess = derivePdvAfterSaleAccess({ featureEnabled: afterSaleFeature.data === true, privileged, hasPermissionRecord, permissions });
  const go = (path: string) => { setOpen(false); navigate(path); };
  return <>
    <PdvPartyProfileButton label="Ver ficha do cliente" onClick={() => { setTab('Dados'); setOpen(true); }} />
    <ResponsiveModal drawerClassName="pdv-dialog" open={open} onOpenChange={setOpen} title="Ficha do cliente" className="pdv-dialog sm:max-w-[880px]" footer={<Button variant="cancel-ghost" className="w-full" onClick={() => setOpen(false)}>Voltar ao atendimento</Button>}>
      <div className="flex items-center gap-3"><CustomerAvatar name={customer.name} photoUrl={customer.photo_url} /><div className="min-w-0 flex-1"><h3 className="font-bold">{customer.name}</h3><p className="text-xs text-muted-foreground">{formatCustomerDocument(customer.document) || 'Cliente da loja'}</p></div></div>
      <nav className="my-5 flex gap-6 overflow-x-auto border-b" role="tablist" aria-label="Ficha do cliente">{['Dados', 'Saldo e créditos', 'Histórico'].map(name => <button type="button" role="tab" aria-selected={tab === name} key={name} onClick={() => setTab(name)} className={'shrink-0 border-b-2 pb-3 text-sm font-semibold ' + (tab === name ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground')}>{name}</button>)}</nav>
      <div role="tabpanel" aria-label={tab}>
        {tab === 'Dados' && <div className="grid gap-5 sm:grid-cols-2">{[['CPF/CNPJ', formatCustomerDocument(customer.document)], ['Telefone', formatCustomerPhone(customer.celular || customer.phone)], ['E-mail', customer.email], ['Endereço', [customer.address, customer.address_number, customer.neighborhood, customer.city, customer.state].filter(Boolean).join(', ')]].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold">{value || 'Não informado'}</p></div>)}{hasScreenAccess('screen:customers') && <Button variant="outline" onClick={() => go('/clientes/' + customer.id)}><ExternalLink className="h-4 w-4" />Abrir cadastro completo</Button>}</div>}
        {tab === 'Saldo e créditos' && <div className="space-y-6"><PartyAccountPanel partyType="customer" partyId={customer.id} enabled={open} /><CustomerVouchers customerId={customer.id} /></div>}
        {tab === 'Histórico' && <div className="space-y-4">
          <Select value={kind} onValueChange={(value: PdvCustomerHistoryKind) => { setKind(value); setPage(0); }}><SelectTrigger aria-label="Mostrar histórico"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="orders">Pedidos</SelectItem><SelectItem value="quotes">Orçamentos do balcão</SelectItem></SelectContent></Select>
          {history.isPending ? <p className="text-sm text-muted-foreground">Carregando histórico…</p> : history.isError ? <NoticeBanner variant="destructive" action={<Button size="sm" variant="outline" onClick={() => void history.refetch()}><RefreshCw className="h-4 w-4" />Tentar novamente</Button>}>Não foi possível consultar o histórico.</NoticeBanner> : <div className="divide-y">{history.data?.rows.map(order => <div className="flex items-center gap-3 py-4" key={order.id}><div className="min-w-0 flex-1"><strong className="text-sm">#{order.number} · {kind === 'orders' ? 'Pedido' : 'Orçamento'}</strong><p className="mt-1 text-xs text-muted-foreground">{dateTime(order.created_at)}</p></div><strong className="whitespace-nowrap text-sm tabular-nums">{order.total === null ? 'A valorizar' : money(Number(order.total))}</strong>{kind === 'orders' ? <CustomerOrderActions order={order} go={go} canReceive={privileged || hasScreenAccess('screen:pdv')} canPickup={privileged || hasScreenAccess('screen:pdv_dispatch')} canReturn={returnsAccess.enabled && (returnsAccess.canReturn || returnsAccess.canReverse)} canCancelResidual={returnsAccess.enabled && returnsAccess.canCancelResidual} canViewValues={afterSaleAccess.enabled && afterSaleAccess.canView} /> : <RowActionsMenu triggerVariant="plain" ariaLabel={`Ações do orçamento ${order.number}`} actions={[{ label: 'Ver orçamento e ações', icon: ExternalLink, onClick: () => go('/pdv/orcamentos?orcamento=' + encodeURIComponent(order.id)) }]} />}</div>)}{!history.data?.rows.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum atendimento neste filtro.</p>}</div>}
          <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button><span className="text-xs text-muted-foreground">{history.data?.total ?? 0} registros</span><Button variant="outline" disabled={(page + 1) * 20 >= (history.data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>Próxima</Button></div>
        </div>}
      </div>
    </ResponsiveModal>
  </>;
}


/** Pagamento/retirada e comprovante vêm da mesma projeção autorizada da tela Pedidos. */
function CustomerOrderActions({ order, go, canReceive, canPickup, canReturn, canCancelResidual, canViewValues }: {
  order: PdvCustomerHistoryRow;
  go: (path: string) => void;
  canReceive: boolean;
  canPickup: boolean;
  canReturn: boolean;
  canCancelResidual: boolean;
  canViewValues: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const detail = usePdvOrderWorkspace(menuOpen ? order.id : null);
  const receiptSettings = usePdvReceiptSettings();
  const { toast } = useToast();
  const current = detail.data?.order;
  const confirmed = current && !['rascunho', 'aguardando_pagamento', 'cancelado'].includes(current.commercialStatus);
  const path = '/pdv/pedidos?pedido=' + encodeURIComponent(order.id);
  useEffect(() => {
    if (detail.isError) toast({ variant: 'destructive', title: 'Não foi possível consultar as ações', description: 'Abra o pedido para atualizar as informações.' });
  }, [detail.isError, toast]);
  async function receipt() {
    try {
      await openPdvOrderReceipt(order.id, receiptSettings.data?.defaultFormat ?? DEFAULT_PDV_RECEIPT_SETTINGS.defaultFormat);
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível gerar o comprovante', description: 'Tente novamente pela tela de pedidos.' });
    }
  }
  return <PdvOrderActionsMenu orderId={order.id} orderNumber={order.number} onOpenChange={setMenuOpen}
    onView={() => go(path)} canGenerateReceipt={current?.canGenerateReceipt === true} onReceipt={() => void receipt()}
    onReceive={canReceive && current && ['aguardando', 'parcial'].includes(current.paymentStatus) ? () => go('/pdv?fila=1&pedido=' + encodeURIComponent(order.id)) : undefined}
    onPickup={canPickup && current && ['liberado', 'parcial'].includes(current.pickupStatus) ? () => go('/pdv/expedicao?pedido=' + encodeURIComponent(order.id)) : undefined}
    onReturns={current && current.commercialStatus !== 'cancelado' && (confirmed && canReturn || canCancelResidual) ? () => go(path + '&acao=devolucoes') : undefined}
    onValues={confirmed && canViewValues ? () => go(path + '&acao=valores') : undefined}
  />;
}

function CustomerVouchers({ customerId }: { customerId: string }) {
  const options = usePdvCustomerPaymentOptions(customerId);
  const { money, date, timezone } = useLocaleFormatters();
  const today = todayInTz(timezone);
  const vouchers = options.data?.vouchers.filter(voucher => isPdvVoucherEligible(voucher, today)) ?? [];
  return <section className="space-y-3" aria-label="Vouchers disponíveis"><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Vouchers disponíveis</h4>
    {options.isError ? <NoticeBanner variant="destructive" action={<Button variant="outline" size="sm" onClick={() => void options.refetch()}>Tentar novamente</Button>}>Não foi possível consultar os vouchers.</NoticeBanner> : options.isPending ? <p className="text-sm text-muted-foreground">Consultando vouchers…</p> : vouchers.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum voucher disponível para usar.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{vouchers.map(voucher => <div key={voucher.id} className="overflow-hidden rounded-xl border border-dashed bg-background"><div className="bg-rose-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Crédito da loja</div><div className="space-y-2 p-3"><strong className="block break-all text-sm">{voucher.code}</strong><strong className="block text-lg tabular-nums">{money(voucher.balance)}</strong><p className="text-xs text-muted-foreground">{voucher.expiresOn ? 'Válido até ' + date(voucher.expiresOn) : 'Sem vencimento'}</p></div></div>)}</div>}
  </section>;
}
