import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { todayInTz } from '@/lib/timezone';
import { useState } from 'react';
import { ArrowLeft, Plus, TicketPercent } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ListDetailLayout } from '@/components/ui/ListDetailLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/DatePicker';
import { PdvMoneyInput } from '@/components/pdv/caixa/PdvMoneyInput';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterButton } from '@/components/ui/FilterButton';
import { PdvCouponCard } from '@/components/pdv/coupons/PdvCouponCard';
import { PdvCouponScopePicker } from '@/components/pdv/coupons/PdvCouponScopePicker';
import { usePdvCoupons, type PdvCoupon, type PdvCouponRules } from '@/hooks/usePdvCoupons';
import { useToast } from '@/hooks/use-toast';
import { PdvPageSkeleton } from '@/components/pdv/loading/PdvPageSkeleton';

const NEW: PdvCouponRules = { code: '', name: '', kind: 'percentage', value: 10, max_discount_amount: null, minimum_amount: 0, starts_on: null, expires_on: null, is_active: true, usage_limit: null, per_customer_limit: null, customer_ids: [], inventory_ids: [] };
const STATUS = { available: 'Ativo', inactive: 'Inativo', expired: 'Vencido', scheduled: 'Agendado' };
export default function PdvCoupons() {
  const coupons = usePdvCoupons(true);
  const { timezone, currency, locale } = useAppLocaleContext();
  const { money } = useLocaleFormatters();
  const currencySymbol = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0).find(part => part.type === 'currency')?.value ?? currency;
  const { toast } = useToast();
  const [selected, setSelected] = useState<PdvCoupon | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('all');
  const [rules, setRules] = useState<PdvCouponRules>(NEW);
  const [contextKey, setContextKey] = useState(coupons.contextKey);
  if (contextKey !== coupons.contextKey) { setContextKey(coupons.contextKey); setSelected(null); setCreating(false); setRules({ ...NEW }); }
  const today = todayInTz(timezone);
  const previewStatus = !rules.is_active ? 'inactive' : rules.expires_on && rules.expires_on < today ? 'expired' : rules.starts_on && rules.starts_on > today ? 'scheduled' : 'available';
  const edit = (coupon: PdvCoupon) => { setCreating(false); setSelected(coupon); setRules({ code: coupon.code, name: coupon.name, kind: coupon.kind, value: coupon.value, max_discount_amount: coupon.max_discount_amount, minimum_amount: coupon.minimum_amount, starts_on: coupon.starts_on, expires_on: coupon.expires_on, is_active: coupon.is_active, usage_limit: coupon.usage_limit, per_customer_limit: coupon.per_customer_limit, customer_ids: coupon.customer_ids, inventory_ids: coupon.inventory_ids }); };
  const update = <K extends keyof PdvCouponRules>(key: K, value: PdvCouponRules[K]) => setRules(current => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try { const saved = await coupons.save.mutateAsync({ id: selected?.id ?? null, revision: selected?.revision ?? null, rules }); if (!saved) return; edit(saved); toast({ title: 'Cupom salvo', description: 'As regras serão confirmadas novamente no pagamento.' }); }
    catch (error) { if (!coupons.isCurrent()) return; toast({ title: 'Não foi possível salvar', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' }); }
  };
  return <div className="pdv-workspace space-y-5" data-pdv-ui>
    <PageHeader title="Cupons promocionais" subtitle="Descontos para vendas, com vigência, limites e produtos participantes." icon={TicketPercent} actions={!coupons.isCurrent() || coupons.isLoading || coupons.isError ? undefined : <Button onClick={() => { setSelected(null); setRules({ ...NEW }); setCreating(true); }}><Plus className="mr-2 h-4 w-4" />Criar cupom</Button>} />
    {!coupons.isCurrent() || coupons.isLoading ? <PdvPageSkeleton variant="list-detail" label="Carregando cupons" /> : coupons.isError ? <div role="alert" className="space-y-3 py-10 text-center"><p>{coupons.error instanceof Error ? coupons.error.message : 'Não foi possível carregar os cupons.'}</p><Button variant="outline" onClick={() => void coupons.refetch()}>Tentar novamente</Button></div> : <ListDetailLayout
      items={coupons.coupons.filter(coupon => filter === 'all' || coupon.status === filter).map(coupon => ({ id: coupon.id, title: coupon.code, subtitle: coupon.name, searchText: `${coupon.name} ${coupon.code}`, leading: <TicketPercent className="h-5 w-5" />, trailing: <span className={`rounded px-2 py-1 text-xs font-semibold text-white ${coupon.status === 'available' ? 'bg-violet-600' : 'bg-zinc-600'}`}>{STATUS[coupon.status]}</span> }))}
      selectedId={selected?.id} onSelect={id => { const coupon = coupons.coupons.find(item => item.id === id); if (coupon) edit(coupon); }}
      listTitle="Cupons" searchPlaceholder="Buscar código ou nome" emptyLabel="Nenhum cupom encontrado" mobileDetailOpen={creating || !!selected} storageKey="pdv-coupons"
      listFilters={<FilterButton embedded onClear={() => setFilter('all')} activeCount={filter === 'all' ? 0 : 1}><Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Situação do cupom"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(STATUS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></FilterButton>}
    >
      {!selected && !creating ? <div className="flex min-h-80 flex-col items-center justify-center p-6 text-center"><TicketPercent className="mb-3 h-10 w-10 text-muted-foreground" /><h2 className="font-semibold">Selecione um cupom</h2><p className="mt-2 max-w-sm text-sm text-muted-foreground">Consulte as regras e edite o desconto. Crie um cupom para começar uma promoção.</p></div> : <form onSubmit={save} className="min-w-0 space-y-5">
        <header className="flex min-h-10 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button className="shrink-0 lg:hidden" variant="cancel-ghost" size="icon" type="button" aria-label="Voltar à lista" onClick={() => { setSelected(null); setCreating(false); }}><ArrowLeft className="h-4 w-4" /></Button>
            <h2 className="min-w-0 truncate text-sm font-semibold">{creating ? 'Criar cupom' : selected?.code}</h2>
          </div>
          <Button type="submit" disabled={coupons.save.isPending}>{coupons.save.isPending ? 'Salvando…' : 'Salvar cupom'}</Button>
        </header>
        <PdvCouponCard code={rules.code || 'SEUCUPOM'} name={rules.name || 'Nome da promoção'} kind={rules.kind} value={Number(rules.value)} ruleSummary={rules.minimum_amount ? `Compra mínima de ${money(Number(rules.minimum_amount))}` : 'Sem compra mínima'} expiresOn={rules.expires_on} status={previewStatus} selected={previewStatus === 'available'} formatCurrency={money} />
        <div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2 [&>div]:space-y-1.5 [&_label]:block">
          <div><Label htmlFor="coupon-code">Código</Label><Input id="coupon-code" autoFocus={creating} required minLength={2} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,39}" value={rules.code} onChange={event => update('code', event.target.value.toUpperCase())} placeholder="BEMVINDO10" /><p className="mt-1 text-xs text-muted-foreground">Letras, números, hífen e sublinhado.</p></div>
          <div><Label htmlFor="coupon-name">Nome da promoção</Label><Input id="coupon-name" required minLength={2} maxLength={100} value={rules.name} onChange={event => update('name', event.target.value)} /></div>
          <div><Label>Tipo de desconto</Label><Select value={rules.kind} onValueChange={value => update('kind', value as PdvCouponRules['kind'])}><SelectTrigger aria-label="Tipo de desconto"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">Percentual</SelectItem><SelectItem value="fixed">Valor fixo</SelectItem></SelectContent></Select></div>
          <div><Label htmlFor="coupon-value">{rules.kind === 'percentage' ? 'Percentual (%)' : `Desconto (${currencySymbol})`}</Label><>{rules.kind === 'fixed' ? <PdvMoneyInput id="coupon-value" value={rules.value} onChange={value => update('value', value)} selectOnFocus className="text-sm font-medium" /> : <Input id="coupon-value" type="number" required min="0.01" max={100} step="0.01" value={rules.value} onChange={event => update('value', Number(event.target.value))} />}</></div>
          {([{ key: 'minimum_amount', label: `Compra mínima (${currencySymbol})` }, { key: 'max_discount_amount', label: `Desconto máximo (${currencySymbol})` }] as const).map(field => <div key={field.key}><Label htmlFor={`coupon-${field.key}`}>{field.label}</Label><PdvMoneyInput id={`coupon-${field.key}`} value={rules[field.key] ?? 0} placeholder={field.key === 'minimum_amount' ? '0,00' : 'Sem limite'} onChange={value => update(field.key, value || (field.key === 'minimum_amount' ? 0 : null))} selectOnFocus className="text-sm font-medium" /></div>)}
          {([{ key: 'usage_limit', label: 'Limite total de utilizações' }, { key: 'per_customer_limit', label: 'Limite por cliente' }] as const).map(field => <div key={field.key}><Label htmlFor={`coupon-${field.key}`}>{field.label}</Label><Input id={`coupon-${field.key}`} type="number" min={1} step="1" value={rules[field.key] ?? ''} placeholder="Sem limite" onChange={event => update(field.key, event.target.value ? Number(event.target.value) : null)} /></div>)}
          <div><Label htmlFor="coupon-start">Início da vigência</Label><DatePicker id="coupon-start" value={rules.starts_on ?? ''} onValueChange={value => update('starts_on', value || null)} clearable placeholder="Sem data inicial" /></div>
          <div><Label htmlFor="coupon-end">Fim da vigência</Label><DatePicker id="coupon-end" min={rules.starts_on ?? undefined} value={rules.expires_on ?? ''} onValueChange={value => update('expires_on', value || null)} clearable placeholder="Sem expiração" /></div>
        </div>
        <p className="text-xs text-muted-foreground">A vigência inclui o primeiro e o último dia no fuso da empresa. Orçamentos não consomem utilizações; o pagamento confirma disponibilidade e limites. Cancelamentos após conclusão e devoluções preservam a utilização do cupom.</p>
        <PdvCouponScopePicker label="Clientes participantes" options={coupons.customers} value={rules.customer_ids} onChange={value => update('customer_ids', value)} />
        <PdvCouponScopePicker label="Produtos participantes" options={coupons.inventory} value={rules.inventory_ids} onChange={value => update('inventory_ids', value)} />
        <div className="flex items-center gap-3"><Switch id="coupon-active" checked={rules.is_active} onCheckedChange={value => update('is_active', value)} /><Label htmlFor="coupon-active">Cupom ativo</Label></div>
        {selected && <p className="text-sm text-muted-foreground">{selected.used_count} utilizações confirmadas. Alterar ou desativar preserva os descontos das vendas concluídas.</p>}
      </form>}
    </ListDetailLayout>}
  </div>;
}
