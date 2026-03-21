import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCustomers } from '@/hooks/useCustomers';
import { useQuotes, type QuoteInput, type Quote } from '@/hooks/useQuotes';
import { useProposalTemplates } from '@/hooks/useProposalTemplates';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useServiceTypes } from '@/hooks/useServiceTypes';
// inventory import kept for potential future use
import { useAuth } from '@/contexts/AuthContext';
import { useBDICalculator } from '@/hooks/useBDICalculator';
import { computeExtraCostsTotal } from '@/hooks/useServiceCosts';
import { BDISummaryCard } from '@/components/quotes/BDISummaryCard';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { supabase } from '@/integrations/supabase/client';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import {
  User, UserPlus, Palette, Wrench, MapPin,
  Calculator, Plus, Trash2, Tag, AlertTriangle, Gift, CreditCard, ChevronDown,
}from 'lucide-react';

// ─── Extended item type for the form ───────────────────────────────────────
interface FormQuoteItem {
  id?: string;
  item_type: 'servico' | 'material';
  description: string;
  quantity: number;
  unit_total_cost: number;   // cost per unit (before BDI markup)
  unit_price: number;        // final sell price per unit
  total_price: number;       // unit_price * quantity
  service_type_id?: string | null;
  inventory_id?: string | null;
  unit_hourly_rate: number;
  unit_hours: number;
  unit_labor_cost: number;
  unit_materials_cost: number;
  unit_extras_cost: number;
  profit_rate: number;
  bdi: number;
  price_override?: number | null;
}

interface QuoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote?: Quote | null;
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ─── Service Items List with expandable cost details ─────────────────────────
function ServiceItemsList({
  items: serviceItems,
  allItems,
  onUpdatePrice,
  onRemove,
  fmt,
}: {
  items: FormQuoteItem[];
  allItems: FormQuoteItem[];
  onUpdatePrice: (idx: number, price: number) => void;
  onRemove: (idx: number) => void;
  fmt: (v: number) => string;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left p-2 font-medium text-muted-foreground">Serviço</th>
            <th className="text-center p-2 font-medium text-muted-foreground w-12">Qtd</th>
            <th className="text-right p-2 font-medium text-muted-foreground w-24 hidden sm:table-cell">Custo unit.</th>
            <th className="text-right p-2 font-medium text-muted-foreground w-28">Preço unit.</th>
            <th className="text-right p-2 font-medium text-muted-foreground w-24">Total</th>
            <th className="w-8 p-2" />
          </tr>
        </thead>
        <tbody>
          {serviceItems.map((item) => {
            const globalIdx = allItems.indexOf(item);
            const isExpanded = expandedIdx === globalIdx;
            const hasCosts = item.unit_total_cost > 0;
            return (
              <>
                <tr key={globalIdx} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-2 font-medium">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-left w-full"
                      onClick={() => setExpandedIdx(isExpanded ? null : globalIdx)}
                    >
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      <span>{item.description}</span>
                    </button>
                    {!hasCosts && (
                      <Badge variant="outline" className="ml-5 mt-0.5 text-[10px] text-amber-600 border-amber-300 bg-amber-50">
                        Sem custos configurados
                      </Badge>
                    )}
                  </td>
                  <td className="p-2 text-center text-muted-foreground">{item.quantity}</td>
                  <td className="p-2 text-right text-muted-foreground hidden sm:table-cell">
                    {hasCosts ? fmt(item.unit_total_cost) : '—'}
                  </td>
                  <td className="p-2">
                    <Input
                      type="number" min={0} step="0.01"
                      value={item.unit_price || ''}
                      onChange={e => onUpdatePrice(globalIdx, parseFloat(e.target.value) || 0)}
                      className="h-7 w-24 text-xs text-right ml-auto"
                    />
                  </td>
                  <td className="p-2 text-right font-semibold">{fmt(item.total_price)}</td>
                  <td className="p-2">
                    <Button type="button" variant="ghost" size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onRemove(globalIdx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${globalIdx}-detail`} className="bg-muted/10">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="space-y-0.5">
                          <span className="text-muted-foreground">Mão de obra</span>
                          <p className="font-medium">
                            {item.unit_hourly_rate > 0
                              ? `${fmt(item.unit_hourly_rate)}/h × ${item.unit_hours}h = ${fmt(item.unit_labor_cost)}`
                              : '—'}
                          </p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-muted-foreground">Materiais</span>
                          <p className="font-medium">{item.unit_materials_cost > 0 ? fmt(item.unit_materials_cost) : '—'}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-muted-foreground">Custos extras</span>
                          <p className="font-medium">{item.unit_extras_cost > 0 ? fmt(item.unit_extras_cost) : '—'}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-muted-foreground font-semibold">Custo total unit.</span>
                          <p className="font-bold text-foreground">{hasCosts ? fmt(item.unit_total_cost) : '—'}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
          <tr className="bg-muted/30 border-t">
            <td colSpan={4} className="p-2 text-right text-xs font-medium text-muted-foreground hidden sm:table-cell">
              Subtotal Serviços
            </td>
            <td colSpan={2} className="p-2 text-right text-xs font-medium text-muted-foreground sm:hidden">
              Subtotal
            </td>
            <td className="p-2 text-right font-bold">
              {fmt(serviceItems.reduce((s, i) => s + i.total_price, 0))}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function QuoteFormDialog({ open, onOpenChange, quote }: QuoteFormDialogProps) {
  const isMobile = useIsMobile();
  const { hasModule } = useCompanyModules();
  const hasPricing = hasModule('pricing_advanced');
  const { customers } = useCustomers();
  const { createQuote, updateQuote } = useQuotes();
  const { templates } = useProposalTemplates();
  const { settings: pricing } = usePricingSettings();
  const { serviceTypes } = useServiceTypes();
  const { profile } = useAuth();
  const isEditing = !!quote;

  // ── Customer ──
  const [customerMode, setCustomerMode] = useState<'existing' | 'prospect'>('existing');
  const [customerId, setCustomerId] = useState('');
  const [prospectName, setProspectName] = useState('');
  const [prospectPhone, setProspectPhone] = useState('');
  const [prospectEmail, setProspectEmail] = useState('');

  // ── BDI Configuration ──
  const [taxRate, setTaxRate] = useState(10);
  const [adminRate, setAdminRate] = useState(12);
  const [profitRate, setProfitRate] = useState(10);
  const [kmCostCfg, setKmCostCfg] = useState(1);
  const [cardDiscountRateCfg, setCardDiscountRateCfg] = useState(6);
  const [cardInstallmentsCfg, setCardInstallmentsCfg] = useState(10);

  // ── Items ──
  const [items, setItems] = useState<FormQuoteItem[]>([]);

  // ── Displacement ──
  const [distanceKm, setDistanceKm] = useState(0);

  // ── Validity / Template ──
  const [validUntil, setValidUntil] = useState('');
  const [proposalTemplateId, setProposalTemplateId] = useState('');

  // ── Notes / Terms ──
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');

  // ── Discount (at end) ──
  const [discountType, setDiscountType] = useState<'valor' | 'percentual'>('valor');
  const [discountValue, setDiscountValue] = useState(0);
  const [includeGifts, setIncludeGifts] = useState(true);

  // ── Add-service row state ──
  const [addSvcId, setAddSvcId] = useState('');
  const [addSvcQty, setAddSvcQty] = useState(1);
  const [isFetchingSvc, setIsFetchingSvc] = useState(false);

  // (material state removed — materials are now part of services)

  type QuoteDraft = {
    customerMode: string; customerId: string; prospectName: string; prospectPhone: string; prospectEmail: string;
    distanceKm: number; discountType: string; discountValue: number; includeGifts: boolean;
    validUntil: string; notes: string; terms: string; proposalTemplateId: string;
  };
  const draft = useFormDraft<QuoteDraft>({ key: 'quote-form', isOpen: open, isEditing });

  // Save draft on changes (lightweight — excludes items to avoid perf issues)
  useEffect(() => {
    if (open && !isEditing && !draft.showResumePrompt) {
      draft.saveDraft({
        customerMode, customerId, prospectName, prospectPhone, prospectEmail,
        distanceKm, discountType, discountValue, includeGifts,
        validUntil, notes, terms, proposalTemplateId,
      });
    }
  }, [customerMode, customerId, prospectName, prospectPhone, prospectEmail, distanceKm, discountType, discountValue, includeGifts, validUntil, notes, terms, proposalTemplateId, open, isEditing, draft.showResumePrompt]);

  const applyQuoteDraft = (d: QuoteDraft) => {
    setCustomerMode(d.customerMode as any || 'existing');
    setCustomerId(d.customerId || '');
    setProspectName(d.prospectName || '');
    setProspectPhone(d.prospectPhone || '');
    setProspectEmail(d.prospectEmail || '');
    setDistanceKm(d.distanceKm || 0);
    setDiscountType(d.discountType as any || 'valor');
    setDiscountValue(d.discountValue || 0);
    setIncludeGifts(d.includeGifts !== false);
    setValidUntil(d.validUntil || '');
    setNotes(d.notes || '');
    setTerms(d.terms || '');
    setProposalTemplateId(d.proposalTemplateId || '');
  };

  const resetQuoteForm = () => {
    setCustomerMode('existing');
    setCustomerId('');
    setProspectName('');
    setProspectPhone('');
    setProspectEmail('');
    setDistanceKm(0);
    setDiscountType('valor');
    setDiscountValue(0);
    setIncludeGifts(true);
    setValidUntil('');
    setNotes('');
    setTerms('');
    setItems([]);
    setProposalTemplateId(templates[0]?.id ?? '');
    if (pricing) {
      setTaxRate(Number(pricing.tax_rate ?? 10));
      setAdminRate(Number(pricing.admin_indirect_rate ?? 12));
      setProfitRate(Number(pricing.default_profit_rate ?? 10));
      setKmCostCfg(Number(pricing.km_cost ?? 1));
      setCardDiscountRateCfg(Number(pricing.card_discount_rate ?? 6));
      setCardInstallmentsCfg(Number(pricing.card_installments ?? 10));
    }
  };

  // ── Initialize BDI config from pricing settings (new quote) ──
  useEffect(() => {
    if (pricing && !quote) {
      setTaxRate(Number(pricing.tax_rate ?? 10));
      setAdminRate(Number(pricing.admin_indirect_rate ?? 12));
      setProfitRate(Number(pricing.default_profit_rate ?? 10));
      setKmCostCfg(Number(pricing.km_cost ?? 1));
      setCardDiscountRateCfg(Number(pricing.card_discount_rate ?? 6));
      setCardInstallmentsCfg(Number(pricing.card_installments ?? 10));
    }
  }, [pricing, quote]);

  // ── Populate form when editing ──
  useEffect(() => {
    if (!open) return;

    if (quote) {
      setCustomerId(quote.customer_id || '');
      setCustomerMode(quote.customer_id ? 'existing' : 'prospect');
      setProspectName(quote.prospect_name ?? '');
      setProspectPhone(quote.prospect_phone ?? '');
      setProspectEmail(quote.prospect_email ?? '');
      setTaxRate(Number(quote.tax_rate ?? 10));
      setAdminRate(Number(quote.admin_indirect_rate ?? 12));
      setProfitRate(Number(quote.profit_rate ?? 10));
      setKmCostCfg(Number(quote.km_cost ?? 1));
      setCardDiscountRateCfg(Number(quote.card_discount_rate ?? 6));
      setCardInstallmentsCfg(Number(quote.card_installments ?? 10));
      setDistanceKm(Number(quote.distance_km ?? 0));
      setDiscountType((quote.discount_type as 'valor' | 'percentual') ?? 'valor');
      setDiscountValue(Number(quote.discount_value ?? 0));
      setIncludeGifts(quote.include_gifts !== false);
      setValidUntil(quote.valid_until ?? '');
      setProposalTemplateId(quote.proposal_template_id ?? '');
      setNotes(quote.notes ?? '');
      setTerms(quote.terms ?? '');
      setItems(
        (quote.quote_items ?? []).map(qi => ({
          id: qi.id,
          item_type: (qi.item_type as 'servico' | 'material') ?? 'servico',
          description: qi.description,
          quantity: Number(qi.quantity),
          unit_total_cost: Number(qi.unit_total_cost ?? 0),
          unit_price: Number(qi.unit_price),
          total_price: Number(qi.total_price),
          service_type_id: qi.service_type_id ?? null,
          inventory_id: qi.inventory_id ?? null,
          unit_hourly_rate: Number(qi.unit_hourly_rate ?? 0),
          unit_hours: Number(qi.unit_hours ?? 0),
          unit_labor_cost: Number(qi.unit_labor_cost ?? 0),
          unit_materials_cost: Number(qi.unit_materials_cost ?? 0),
          unit_extras_cost: Number(qi.unit_extras_cost ?? 0),
          profit_rate: Number(qi.profit_rate ?? 10),
          bdi: Number(qi.bdi ?? 0.68),
          price_override: qi.price_override ?? null,
        }))
      );
    } else if (!isEditing && draft.hasDraft && draft.draftData) {
      // Draft will be applied via DraftResumeDialog
    } else {
      resetQuoteForm();
    }
  }, [quote, open]);

  // ── BDI Calculation ──
  const bdiItems = useMemo(
    () => items.map(it => ({
      totalCost: it.unit_total_cost * it.quantity,
      profitRate: it.profit_rate ?? profitRate,
    })),
    [items, profitRate]
  );

  const bdi = useBDICalculator({
    taxRate,
    adminRate,
    profitRate,
    items: bdiItems,
    distanceKm,
    kmCost: kmCostCfg,
    cardDiscountRate: cardDiscountRateCfg,
    cardInstallments: cardInstallmentsCfg,
  });

  const bdiFactor = bdi.bdiFactor;
  const bdiWarning = bdiFactor < 0.20;
  const bdiDanger = bdiFactor < 0.05 || (bdi.finalPrice > 0 && bdi.finalPrice < bdi.totalCost);

  // ── Auto-recalculate service prices when BDI rates change ──
  useEffect(() => {
    if (items.length === 0) return;
    setItems(prev => prev.map(it => {
      if (it.item_type !== 'servico' || it.price_override) return it;
      const newUnitPrice = bdiFactor > 0.01 ? Math.round((it.unit_total_cost / bdiFactor) * 100) / 100 : it.unit_total_cost;
      return {
        ...it,
        unit_price: newUnitPrice,
        total_price: Math.round(newUnitPrice * it.quantity * 100) / 100,
        bdi: bdiFactor,
      };
    }));
  }, [bdiFactor]);

  // ── Add service handler ──
  const handleAddService = useCallback(async () => {
    if (!addSvcId) return;
    setIsFetchingSvc(true);
    const st = serviceTypes.find(s => s.id === addSvcId);
    const companyId = profile?.company_id;
    let laborCost = 0, matsCost = 0, extrasCost = 0, hourlyRate = 0, hours = 0;
    let resourcesCost = 0, giftsCost = 0;

    if (companyId) {
      try {
        const [costRes, matRes, linkedRes, giftsRes] = await Promise.all([
          supabase.from('service_costs').select('*').eq('company_id', companyId).eq('service_id', addSvcId).maybeSingle(),
          supabase.from('service_materials').select('*').eq('company_id', companyId).eq('service_id', addSvcId).order('sort_order'),
          supabase.from('service_cost_resources').select('resource_id, override_value').eq('service_id', addSvcId),
          supabase.from('service_gifts').select('*').eq('service_id', addSvcId),
        ]);
        if (costRes.data) {
          hourlyRate = Number(costRes.data.hourly_rate ?? 0);
          hours = Number(costRes.data.hours ?? 0);
          laborCost = hourlyRate * hours;
          extrasCost = computeExtraCostsTotal((costRes.data.extra_costs as any) ?? []);
        }
        if (matRes.data) {
          matsCost = matRes.data.reduce((sum, m) => sum + Number(m.subtotal ?? 0), 0);
        }
        // Linked resource costs (vehicles, tools, EPIs, etc.)
        if (linkedRes.data?.length) {
          const resourceIds = linkedRes.data.map(r => r.resource_id);
          const { data: resources } = await supabase
            .from('cost_resources_with_rate')
            .select('id, hourly_rate, category')
            .in('id', resourceIds);

          linkedRes.data.forEach(link => {
            const resource = resources?.find(r => r.id === link.resource_id);
            if (resource && (resource as any).category !== 'gift') {
              resourcesCost += link.override_value != null
                ? Number(link.override_value)
                : (Number((resource as any).hourly_rate ?? 0) * hours);
            }
          });
        }
        // Gift costs
        if (giftsRes.data) {
          giftsCost = giftsRes.data.reduce((sum, g) => sum + Number((g as any).subtotal ?? 0), 0);
        }
      } catch (err) {
        console.error('Erro ao buscar custos do serviço:', err);
      }
    }

    const unitTotalCost = laborCost + matsCost + extrasCost + resourcesCost + giftsCost;
    const unitPrice = bdiFactor > 0.01 ? Math.round((unitTotalCost / bdiFactor) * 100) / 100 : unitTotalCost;

    setItems(prev => [...prev, {
      item_type: 'servico',
      description: st?.name ?? 'Serviço',
      quantity: addSvcQty,
      unit_total_cost: unitTotalCost,
      unit_price: unitPrice,
      total_price: Math.round(unitPrice * addSvcQty * 100) / 100,
      service_type_id: addSvcId,
      inventory_id: null,
      unit_hourly_rate: hourlyRate,
      unit_hours: hours,
      unit_labor_cost: laborCost,
      unit_materials_cost: matsCost,
      unit_extras_cost: extrasCost + resourcesCost + giftsCost,
      profit_rate: profitRate,
      bdi: bdiFactor,
    }]);
    setAddSvcId('');
    setAddSvcQty(1);
    setIsFetchingSvc(false);
  }, [addSvcId, addSvcQty, serviceTypes, profile, bdiFactor, profitRate]);

  // (material handler removed — materials are sub-items of services)

  // ── Item price update ──
  const updateItemPrice = (idx: number, newPrice: number) => {
    setItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, unit_price: newPrice, total_price: Math.round(newPrice * it.quantity * 100) / 100, price_override: newPrice } : it
    ));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  // ── Totals ──
  const totalItemsPrice = items.reduce((s, i) => s + i.total_price, 0);
  const subtotalBeforeDiscount = totalItemsPrice + bdi.displacementCost;
  const discountAmount = discountType === 'percentual'
    ? subtotalBeforeDiscount * (discountValue / 100)
    : discountValue;
  const finalTotal = Math.max(0, subtotalBeforeDiscount - discountAmount);

  // ── Submit ──
  const handleSubmit = () => {
    const hasCustomer = customerMode === 'existing' ? !!customerId : !!prospectName;
    if (!hasCustomer || items.length === 0) return;

    const payload: QuoteInput = {
      customer_id: customerMode === 'existing' ? customerId : undefined,
      prospect_name: customerMode === 'prospect' ? prospectName : undefined,
      prospect_phone: customerMode === 'prospect' ? prospectPhone : undefined,
      prospect_email: customerMode === 'prospect' ? prospectEmail : undefined,
      tax_rate: taxRate,
      admin_indirect_rate: adminRate,
      profit_rate: profitRate,
      km_cost: kmCostCfg,
      distance_km: distanceKm,
      displacement_cost: bdi.displacementCost,
      bdi: bdiFactor,
      total_cost: bdi.totalCost,
      total_price: bdi.finalPrice,
      valid_until: validUntil || undefined,
      discount_type: discountType,
      discount_value: discountValue,
      subtotal: totalItemsPrice,
      discount_amount: discountAmount,
      total_value: finalTotal,
      final_price: finalTotal,
      notes: notes || undefined,
      terms: terms || undefined,
      proposal_template_id: proposalTemplateId || undefined,
      include_gifts: includeGifts,
      card_discount_rate: cardDiscountRateCfg,
      card_installments: cardInstallmentsCfg,
      items: items.map((it, idx) => ({
        id: it.id,
        position: idx,
        item_type: it.item_type,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
        service_type_id: it.service_type_id ?? null,
        inventory_id: it.inventory_id ?? null,
        unit_hourly_rate: it.unit_hourly_rate,
        unit_hours: it.unit_hours,
        unit_labor_cost: it.unit_labor_cost,
        unit_materials_cost: it.unit_materials_cost,
        unit_extras_cost: it.unit_extras_cost,
        unit_total_cost: it.unit_total_cost,
        profit_rate: it.profit_rate,
        bdi: it.bdi,
        price_override: it.price_override ?? null,
      })),
    };

    if (quote) {
      updateQuote.mutate({ ...payload, id: quote.id }, { onSuccess: () => onOpenChange(false) });
    } else {
      createQuote.mutate(payload, { onSuccess: () => { draft.clearDraft(); onOpenChange(false); } });
    }
  };

  // ── Options ──
  const customerOptions = useMemo(
    () => (customers ?? []).map(c => ({ value: c.id, label: c.name })),
    [customers]
  );
  const serviceOptions = useMemo(
    () => (serviceTypes ?? []).filter(s => s.is_active).map(s => ({ value: s.id, label: s.name })),
    [serviceTypes]
  );

  const serviceItems = items.filter(i => i.item_type === 'servico');
  const hasCustomer = customerMode === 'existing' ? !!customerId : !!prospectName;

  // ── Form Content ───────────────────────────────────────────────────────────
  const content = (
    <div className="space-y-5 overflow-y-auto max-h-[70vh] pr-1 pb-4">
      <DraftResumeDialog
        open={draft.showResumePrompt}
        onResume={() => {
          if (draft.draftData) applyQuoteDraft(draft.draftData);
          draft.acceptDraft();
        }}
        onDiscard={() => {
          draft.discardDraft();
          resetQuoteForm();
        }}
      />

      {/* ══ 1. DESTINATÁRIO ══ */}
      <section className="space-y-3">
        <SectionHeader icon={<User className="h-4 w-4 text-primary" />} title="Destinatário" />
        <Tabs value={customerMode} onValueChange={(v) => setCustomerMode(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="existing" className="flex-1 gap-1.5">
              <User className="h-3.5 w-3.5" />Cliente Cadastrado
            </TabsTrigger>
            <TabsTrigger value="prospect" className="flex-1 gap-1.5">
              <UserPlus className="h-3.5 w-3.5" />Novo Prospecto
            </TabsTrigger>
          </TabsList>
          <TabsContent value="existing" className="mt-3">
            <SearchableSelect
              options={customerOptions}
              value={customerId}
              onValueChange={setCustomerId}
              placeholder="Selecione o cliente"
            />
          </TabsContent>
          <TabsContent value="prospect" className="mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome *</Label>
                <Input placeholder="Nome do prospecto" value={prospectName} onChange={e => setProspectName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Telefone</Label>
                <Input placeholder="(00) 00000-0000" value={prospectPhone} onChange={e => setProspectPhone(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">E-mail</Label>
                <Input type="email" placeholder="email@exemplo.com" value={prospectEmail} onChange={e => setProspectEmail(e.target.value)} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      {hasPricing && (
      <>
      <Separator />

      {/* ══ 2. CONFIGURAÇÕES BDI ══ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <SectionHeader icon={<Calculator className="h-4 w-4 text-primary" />} title="Configurações BDI" />
          <Badge
            variant="outline"
            className={`text-xs font-mono ml-auto px-2.5 py-0.5 ${
              bdiDanger
                ? 'border-destructive/50 bg-destructive/10 text-destructive'
                : bdiWarning
                  ? 'border-amber-400/50 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                  : 'border-primary/30 bg-primary/5 text-primary'
            }`}
          >
            BDI {(bdiFactor * 100).toFixed(1)}%
          </Badge>
        </div>

        <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
          {/* Row 1: Taxas */}
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Taxas e Margens</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <BdiField label="Imposto" suffix="%" value={taxRate}
                onChange={v => setTaxRate(v)} />
              <BdiField label="Adm. Indireta" suffix="%" value={adminRate}
                onChange={v => setAdminRate(v)} />
              <BdiField label="Lucro" suffix="%" value={profitRate}
                onChange={v => setProfitRate(v)} />
              <BdiField label="Custo / km" prefix="R$" value={kmCostCfg}
                onChange={v => setKmCostCfg(v)} step={0.01} />
            </div>
          </div>

          <Separator className="opacity-50" />

          {/* Row 2: Pagamento */}
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <CreditCard className="h-3 w-3" /> Condições de Pagamento
            </p>
            <div className="grid grid-cols-2 gap-3">
              <BdiField label="Desconto à vista" suffix="%" value={cardDiscountRateCfg}
                onChange={v => setCardDiscountRateCfg(v)} />
              <BdiField label="Parcelas (cartão)" value={cardInstallmentsCfg}
                onChange={v => setCardInstallmentsCfg(Math.max(1, v))} step={1} min={1} />
            </div>
          </div>
        </div>
      </section>
      </>
      )}

      <Separator />

      {/* ══ 3. SERVIÇOS E MÃO DE OBRA ══ */}
      <section className="space-y-3">
        <SectionHeader icon={<Wrench className="h-4 w-4 text-primary" />} title="Serviços e Mão de Obra" />

        {/* Add service row */}
        <div className="flex flex-col sm:flex-row gap-2 p-3 bg-muted/40 rounded-lg border">
          <div className="flex-1 min-w-0">
            <SearchableSelect
              options={serviceOptions}
              value={addSvcId}
              onValueChange={setAddSvcId}
              placeholder="Selecionar tipo de serviço..."
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label className="text-xs whitespace-nowrap">Qtd:</Label>
            <Input type="number" min={1} value={addSvcQty}
              onChange={e => setAddSvcQty(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 w-16 text-sm" />
            <Button size="sm" onClick={handleAddService} disabled={!addSvcId || isFetchingSvc} className="h-9 shrink-0">
              {isFetchingSvc ? '…' : <><Plus className="h-3.5 w-3.5 mr-1" />Adicionar</>}
            </Button>
          </div>
        </div>

        {serviceItems.length > 0 ? (
          <ServiceItemsList items={serviceItems} allItems={items} onUpdatePrice={updateItemPrice} onRemove={removeItem} fmt={fmt} />
        ) : (
          <EmptyState>Nenhum serviço adicionado</EmptyState>
        )}
      </section>


      <Separator />

      {/* ══ DESLOCAMENTO + DESCONTO (mesma linha) ══ */}
      <section className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <SectionHeader icon={<MapPin className="h-4 w-4 text-primary" />} title="Deslocamento" />
            <div className="flex items-center gap-2 flex-wrap">
              <Input type="number" min={0} step="1" value={distanceKm || ''}
                onChange={e => setDistanceKm(Number(e.target.value) || 0)}
                className="h-9 w-28" placeholder="0 km" />
              {bdi.displacementCost > 0 && (
                <span className="text-xs text-muted-foreground">
                  = <span className="font-semibold text-foreground">{fmt(bdi.displacementCost)}</span>
                </span>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <SectionHeader icon={<Tag className="h-4 w-4 text-primary" />} title="Desconto" />
            <div className="flex items-center gap-2">
              <Select value={discountType} onValueChange={(v) => setDiscountType(v as any)}>
                <SelectTrigger className="w-20 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="valor">R$</SelectItem>
                  <SelectItem value="percentual">%</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" min={0} step="0.01" value={discountValue || ''}
                onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                placeholder="0" className="w-28 h-9" />
              {discountAmount > 0 && (
                <span className="text-xs text-destructive font-medium">− {fmt(discountAmount)}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══ BRINDES ══ */}
      <div className="flex items-center gap-2 px-1">
        <Checkbox
          id="include-gifts"
          checked={includeGifts}
          onCheckedChange={(checked) => setIncludeGifts(!!checked)}
        />
        <Label htmlFor="include-gifts" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1.5">
          <Gift className="h-3.5 w-3.5" />
          Incluir brindes neste orçamento
        </Label>
      </div>

      {/* ══ RESUMO DO ORÇAMENTO ══ */}
      {items.length > 0 && (
        <>
          <Separator />
          <section className="space-y-3">
            {bdiDanger && (
              <Alert variant="destructive" className="border-destructive/50">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  O BDI está muito baixo ou negativo. O preço final não cobre os custos. Revise as taxas.
                </AlertDescription>
              </Alert>
            )}
            {bdiWarning && !bdiDanger && (
              <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-400">
                  BDI abaixo de 20% — margem de lucro muito apertada.
                </AlertDescription>
              </Alert>
            )}
            <BDISummaryCard data={{ ...bdi, cardInstallments: cardInstallmentsCfg }} />
          </section>
        </>
      )}

      <Separator />

      {/* ══ VALIDADE + TEMPLATE ══ */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Válido até</Label>
          <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5" />Template da Proposta
          </Label>
          <Select value={proposalTemplateId} onValueChange={setProposalTemplateId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: t.preview_color }} />
                    {t.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* ══ 10. NOTAS + TERMOS ══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Observações</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações internas" rows={2} />
        </div>
        <div className="space-y-2">
          <Label>Condições / Termos</Label>
          <Textarea value={terms} onChange={e => setTerms(e.target.value)} placeholder="Condições de pagamento, garantia, etc." rows={2} />
        </div>
      </div>

      {/* ══ ACTIONS ══ */}
      <div className="flex justify-end gap-2 pt-2 pb-1">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button
          onClick={handleSubmit}
          disabled={!hasCustomer || items.length === 0 || createQuote.isPending || updateQuote.isPending}
        >
          {quote ? 'Salvar Alterações' : 'Criar Orçamento'}
        </Button>
      </div>
    </div>
  );

  const title = quote ? `Editar Orçamento #${quote.quote_number}` : 'Novo Orçamento';

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[95vh]">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription className="sr-only">
              Formulário para criar ou editar orçamento
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Formulário para criar ou editar orçamento
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

// ─── Small helpers ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</span>
    </div>
  );
}

function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function BdiField({ label, value, onChange, suffix, prefix, step = 0.1, min = 0 }: {
  label: string; value: number; onChange: (v: number) => void;
  suffix?: string; prefix?: string; step?: number; min?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-medium">{prefix}</span>
        )}
        <Input
          type="number" min={min} max={suffix === '%' ? 100 : undefined} step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className={`h-8 text-sm font-medium bg-background ${prefix ? 'pl-8' : ''} ${suffix ? 'pr-8' : ''}`}
        />
        {suffix && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-medium">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-dashed rounded-lg p-5 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
