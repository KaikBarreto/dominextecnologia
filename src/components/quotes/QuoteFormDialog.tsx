import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES, type Messages } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useCustomers } from '@/hooks/useCustomers';
import { useQuotes, type QuoteInput, type Quote } from '@/hooks/useQuotes';
import { useProposalTemplates } from '@/hooks/useProposalTemplates';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { useBDICalculator } from '@/hooks/useBDICalculator';
import { computeExtraCostsTotal } from '@/hooks/useServiceCosts';
import { BDISummaryCard } from '@/components/quotes/BDISummaryCard';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { supabase } from '@/integrations/supabase/client';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { StepTransition } from '@/components/ui/step-transition';
import { cn } from '@/lib/utils';
import {
  User, UserPlus, Palette, Wrench, MapPin, Package,
  Calculator, Plus, Trash2, Tag, AlertTriangle, Gift, CreditCard, ChevronDown,
  ChevronLeft, ChevronRight, Check, Save, Loader2,
} from 'lucide-react';

// ─── Extended item type for the form ───────────────────────────────────────
interface FormQuoteItem {
  id?: string;
  item_type: 'servico' | 'material';
  description: string;
  details?: string | null;
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

// STEPS é construído dentro do componente (locale-aware) — ver buildSteps() abaixo.
const STEP_KEYS = ['recipient', 'services', 'materials', 'discount', 'review'] as const;
type StepKey = typeof STEP_KEYS[number];

// ─── Service Items List with expandable cost details ─────────────────────────
function ServiceItemsList({
  items: serviceItems,
  allItems,
  onUpdatePrice,
  onUpdateQty,
  onUpdateDetails,
  onRemove,
  fmt,
  tq,
}: {
  items: FormQuoteItem[];
  allItems: FormQuoteItem[];
  onUpdatePrice: (idx: number, price: number) => void;
  onUpdateQty: (idx: number, qty: number) => void;
  onUpdateDetails: (idx: number, details: string) => void;
  onRemove: (idx: number) => void;
  fmt: (v: number) => string;
  tq: Messages['app']['crm']['quotes'];
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left p-2 font-medium text-muted-foreground">{tq.serviceColName}</th>
            <th className="text-center p-2 font-medium text-muted-foreground w-12">{tq.serviceColQty}</th>
            <th className="text-right p-2 font-medium text-muted-foreground w-24 hidden sm:table-cell">{tq.serviceColUnitCost}</th>
            <th className="text-right p-2 font-medium text-muted-foreground w-28">{tq.serviceColUnitPrice}</th>
            <th className="text-right p-2 font-medium text-muted-foreground w-24">{tq.serviceColTotal}</th>
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
                        {tq.serviceNoCosts}
                      </Badge>
                    )}
                    <Textarea
                      value={item.details ?? ''}
                      onChange={e => onUpdateDetails(globalIdx, e.target.value)}
                      placeholder={tq.itemDetailsPlaceholder}
                      rows={1}
                      className="ml-5 mt-1 min-h-0 h-7 py-1 text-[11px] font-normal text-muted-foreground resize-y w-[calc(100%-1.25rem)]"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <Input
                      type="number" min={1} step="1"
                      value={item.quantity || ''}
                      onChange={e => onUpdateQty(globalIdx, Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="h-7 w-14 text-xs text-center mx-auto px-1"
                    />
                  </td>
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
                          <span className="text-muted-foreground">{tq.serviceLaborDetail}</span>
                          <p className="font-medium">
                            {item.unit_hourly_rate > 0
                              ? `${fmt(item.unit_hourly_rate)}/h × ${item.unit_hours}h = ${fmt(item.unit_labor_cost)}`
                              : '—'}
                          </p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-muted-foreground">{tq.serviceMatsDetail}</span>
                          <p className="font-medium">{item.unit_materials_cost > 0 ? fmt(item.unit_materials_cost) : '—'}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-muted-foreground">{tq.serviceExtrasDetail}</span>
                          <p className="font-medium">{item.unit_extras_cost > 0 ? fmt(item.unit_extras_cost) : '—'}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-muted-foreground font-semibold">{tq.serviceUnitCostDetail}</span>
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
              {tq.serviceSubtotal}
            </td>
            <td colSpan={2} className="p-2 text-right text-xs font-medium text-muted-foreground sm:hidden">
              {tq.serviceSubtotal}
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
  const { locale, currency } = useAppLocaleContext();
  const tq = MESSAGES[locale].app.crm.quotes;
  const STEPS = [
    { key: 'recipient' as StepKey, label: tq.stepRecipient },
    { key: 'services' as StepKey, label: tq.stepServices },
    { key: 'materials' as StepKey, label: tq.stepMaterials },
    { key: 'discount' as StepKey, label: tq.stepDiscount },
    { key: 'review' as StepKey, label: tq.stepReview },
  ];
  const fmt = (v: number) => formatMoney(Math.round(v * 100) / 100, currency, locale);
  const { hasModule } = useCompanyModules();
  const hasPricing = hasModule('pricing_advanced');
  const { customers } = useCustomers();
  const { createQuote, updateQuote, quotes } = useQuotes();
  const { templates } = useProposalTemplates();
  const { settings: pricing } = usePricingSettings();
  const { serviceTypes, createServiceType } = useServiceTypes();
  const { items: inventoryItems } = useInventory();
  const { profile } = useAuth();
  const isEditing = !!quote;

  // ── Wizard navigation ──
  const [step, setStep] = useState(0);
  // Etapa mais avançada já visitada — libera o clique direto no cabeçalho para
  // navegar livremente (ida e volta) até onde já se chegou.
  const [maxStepReached, setMaxStepReached] = useState(0);
  const currentStepKey = STEPS[step]?.key ?? 'recipient';

  // ── Persisted draft id (rascunho no banco) ──
  // Num orçamento novo, o 1º "Salvar rascunho" cria a linha; edições seguintes
  // atualizam a MESMA linha. Guarda o id retornado pra não duplicar.
  const [draftQuoteId, setDraftQuoteId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);

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

  // ── Add-material row state ──
  const [addMatId, setAddMatId] = useState('');
  const [addMatManualName, setAddMatManualName] = useState('');
  const [addMatManualPrice, setAddMatManualPrice] = useState(0);
  const [addMatQty, setAddMatQty] = useState(1);

  type QuoteDraft = {
    customerMode: string; customerId: string; prospectName: string; prospectPhone: string; prospectEmail: string;
    distanceKm: number; discountType: string; discountValue: number; includeGifts: boolean;
    validUntil: string; notes: string; terms: string; proposalTemplateId: string;
  };
  const draft = useFormDraft<QuoteDraft>({ key: 'quote-form', isOpen: open, isEditing });

  // Save draft on changes (lightweight — excludes items to avoid perf issues).
  // Suspende enquanto um rascunho PERSISTIDO está sendo retomado (draftQuoteId)
  // pra o auto-resume do sessionStorage não conflitar com a edição do banco.
  useEffect(() => {
    if (open && !isEditing && !draftQuoteId && !draft.showResumePrompt) {
      draft.saveDraft({
        customerMode, customerId, prospectName, prospectPhone, prospectEmail,
        distanceKm, discountType, discountValue, includeGifts,
        validUntil, notes, terms, proposalTemplateId,
      });
    }
  }, [customerMode, customerId, prospectName, prospectPhone, prospectEmail, distanceKm, discountType, discountValue, includeGifts, validUntil, notes, terms, proposalTemplateId, open, isEditing, draftQuoteId, draft.showResumePrompt]);

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
    // Novos orçamentos nascem no template "Clean" (branco/enxuto). Os demais
    // seguem selecionáveis no seletor de template. Fallback: 1º da lista.
    setProposalTemplateId(
      (templates.find(t => t.slug === 'clean') ?? templates[0])?.id ?? ''
    );
    if (pricing) {
      setTaxRate(Number(pricing.tax_rate ?? 10));
      setAdminRate(Number(pricing.admin_indirect_rate ?? 12));
      setProfitRate(Number(pricing.default_profit_rate ?? 10));
      setKmCostCfg(Number(pricing.km_cost ?? 1));
      setCardDiscountRateCfg(Number(pricing.card_discount_rate ?? 6));
      setCardInstallmentsCfg(Number(pricing.card_installments ?? 10));
    }
  };

  // ── Default de template pra NOVO orçamento: "Clean" (branco/enxuto) ──
  // Os templates carregam async; quando chegam e ainda não há seleção (orçamento
  // novo, sem rascunho), aponta pro "clean". Os 3 escuros seguem no seletor.
  useEffect(() => {
    if (open && !isEditing && !proposalTemplateId && templates.length > 0) {
      setProposalTemplateId((templates.find(t => t.slug === 'clean') ?? templates[0]).id);
    }
  }, [open, isEditing, proposalTemplateId, templates]);

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

  // ── Reset wizard nav on open/close + reset draft id ──
  useEffect(() => {
    if (!open) {
      setStep(0);
      setMaxStepReached(0);
      setDraftQuoteId(null);
      return;
    }
    setStep(0);
    setMaxStepReached(0);
    // Em edição, todas as etapas já estão preenchidas → navegação livre desde já.
    if (isEditing) setMaxStepReached(STEPS.length - 1);
    // Editar um rascunho persistido reabre apontando pra mesma linha (não duplica).
    setDraftQuoteId(quote?.id ?? null);
  }, [open, quote, isEditing]);

  // Mantém o "mais avançado já visitado" sempre ≥ etapa atual.
  useEffect(() => {
    setMaxStepReached(prev => (step > prev ? step : prev));
  }, [step]);

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
          details: qi.details ?? '',
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
  // Núcleo reutilizável: busca custos do serviço e empurra o item na lista.
  // Usado tanto pelo botão "Adicionar" (id selecionado) quanto pelo criar-na-hora
  // (serviço recém-criado, ainda pode não estar na lista de serviceTypes do cache).
  const addServiceById = useCallback(async (
    serviceId: string,
    qty: number,
    override?: { name?: string; description?: string | null; default_price?: number | null },
  ) => {
    setIsFetchingSvc(true);
    const st = serviceTypes.find(s => s.id === serviceId);
    const companyId = profile?.company_id;
    let laborCost = 0, matsCost = 0, extrasCost = 0, hourlyRate = 0, hours = 0;
    let resourcesCost = 0, giftsCost = 0;

    if (companyId) {
      try {
        const [costRes, matRes, linkedRes, giftsRes] = await Promise.all([
          supabase.from('service_costs').select('*').eq('company_id', companyId).eq('service_id', serviceId).maybeSingle(),
          supabase.from('service_materials').select('*').eq('company_id', companyId).eq('service_id', serviceId).order('sort_order'),
          supabase.from('service_cost_resources').select('resource_id, override_value').eq('service_id', serviceId),
          supabase.from('service_gifts').select('*').eq('service_id', serviceId),
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

    // Regra de precedência do preço sugerido:
    // 1) Calculadora configurada (unitTotalCost > 0) → preço pelo BDI (fonte preferida).
    // 2) Sem calculadora mas serviço tem default_price → usa o preço padrão cadastrado.
    // 3) Nenhum dos dois → 0 (usuário preenche manualmente, sem regressão).
    const hasCalculatorPrice = unitTotalCost > 0;
    const defaultPrice = override?.default_price ?? st?.default_price ?? null;
    const unitPrice = hasCalculatorPrice
      ? (bdiFactor > 0.01 ? Math.round((unitTotalCost / bdiFactor) * 100) / 100 : unitTotalCost)
      : (defaultPrice != null ? Math.round(Number(defaultPrice) * 100) / 100 : 0);

    // Se o preço veio do default_price (não da calculadora), marca como override
    // para o useEffect de recálculo de BDI não sobrescrever com unitTotalCost/bdiFactor = 0.
    const priceOverride = !hasCalculatorPrice && defaultPrice != null ? unitPrice : null;

    setItems(prev => [...prev, {
      item_type: 'servico',
      description: override?.name ?? st?.name ?? tq.serviceFallback,
      // Prefill da descrição do catálogo (editável por orçamento depois).
      details: override?.description ?? st?.description ?? '',
      quantity: qty,
      unit_total_cost: unitTotalCost,
      unit_price: unitPrice,
      total_price: Math.round(unitPrice * qty * 100) / 100,
      service_type_id: serviceId,
      inventory_id: null,
      unit_hourly_rate: hourlyRate,
      unit_hours: hours,
      unit_labor_cost: laborCost,
      unit_materials_cost: matsCost,
      unit_extras_cost: extrasCost + resourcesCost + giftsCost,
      profit_rate: profitRate,
      bdi: bdiFactor,
      price_override: priceOverride,
    }]);
    setIsFetchingSvc(false);
  }, [serviceTypes, profile, bdiFactor, profitRate, tq.serviceFallback]);

  // Botão "Adicionar": usa o serviço selecionado no seletor.
  const handleAddService = useCallback(async () => {
    if (!addSvcId) return;
    await addServiceById(addSvcId, addSvcQty);
    setAddSvcId('');
    setAddSvcQty(1);
  }, [addSvcId, addSvcQty, addServiceById]);

  // ── Criar tipo de serviço na hora (inline) ──
  // Espelha o campo livre de MATERIAL: usuário digita um nome inexistente no
  // seletor, escolhe "Criar '<nome>'", e o serviço nasce (is_active) já entrando
  // no orçamento com a quantidade atual. Preço/qtd seguem editáveis inline.
  const handleCreateService = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || createServiceType.isPending) return;
    setIsFetchingSvc(true);
    try {
      const created = await createServiceType.mutateAsync({
        name: trimmed,
        color: '#00C597',
        is_active: true,
      });
      // invalidate + toast "Tipo de serviço criado!" já ocorrem no onSuccess do hook.
      if (created?.id) {
        // Serviço novo não tem custos cadastrados → cai no fluxo preço 0/editável.
        await addServiceById(created.id, addSvcQty, { name: trimmed, description: null });
      }
    } catch {
      // erro já toasteado pelo hook (onError).
    } finally {
      setAddSvcId('');
      setAddSvcQty(1);
      setIsFetchingSvc(false);
    }
  }, [createServiceType, addSvcQty, addServiceById]);

  // ── Add material handler ──
  const handleAddMaterial = useCallback(() => {
    const isFromStock = !!addMatId;
    const inv = isFromStock ? inventoryItems.find(i => i.id === addMatId) : null;
    const name = isFromStock ? (inv?.name ?? '') : addMatManualName.trim();
    if (!name) return;
    const unitPrice = isFromStock ? Number(inv?.sale_price ?? inv?.cost_price ?? 0) : addMatManualPrice;
    setItems(prev => [...prev, {
      item_type: 'material',
      description: name,
      details: '',
      quantity: addMatQty,
      unit_total_cost: isFromStock ? Number(inv?.cost_price ?? 0) : addMatManualPrice,
      unit_price: unitPrice,
      total_price: Math.round(unitPrice * addMatQty * 100) / 100,
      service_type_id: null,
      inventory_id: isFromStock ? inv!.id : null,
      unit_hourly_rate: 0,
      unit_hours: 0,
      unit_labor_cost: 0,
      unit_materials_cost: 0,
      unit_extras_cost: 0,
      profit_rate: profitRate,
      bdi: bdiFactor,
    }]);
    setAddMatId('');
    setAddMatManualName('');
    setAddMatManualPrice(0);
    setAddMatQty(1);
  }, [addMatId, addMatManualName, addMatManualPrice, addMatQty, inventoryItems, profitRate, bdiFactor]);

  // ── Item price update ──
  const updateItemPrice = (idx: number, newPrice: number) => {
    setItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, unit_price: newPrice, total_price: Math.round(newPrice * it.quantity * 100) / 100, price_override: newPrice } : it
    ));
  };

  // ── Item quantity update ──
  // Quantidade vale pra QUALQUER tipo (serviço, mão de obra, material). Recalcula
  // total_price = unit_price × quantity. O unit_price fica fixo (é preço por
  // unidade); mudar a quantidade não deve reprecificar via BDI, então marca
  // price_override quando o unit_price já existe pra não ser sobrescrito.
  const updateItemQty = (idx: number, newQty: number) => {
    const qty = Math.max(1, Math.floor(newQty) || 1);
    setItems(prev => prev.map((it, i) =>
      i === idx
        ? {
            ...it,
            quantity: qty,
            total_price: Math.round(it.unit_price * qty * 100) / 100,
            price_override: it.unit_price > 0 ? (it.price_override ?? it.unit_price) : it.price_override,
          }
        : it
    ));
  };

  // ── Item details update (descrição secundária, opcional) ──
  const updateItemDetails = (idx: number, newDetails: string) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, details: newDetails } : it));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  // ── Totals ──
  const totalItemsPrice = items.reduce((s, i) => s + i.total_price, 0);
  const subtotalBeforeDiscount = totalItemsPrice + bdi.displacementCost;
  const discountAmount = discountType === 'percentual'
    ? subtotalBeforeDiscount * (discountValue / 100)
    : discountValue;
  const finalTotal = Math.max(0, subtotalBeforeDiscount - discountAmount);

  // ── Build payload (shared by submit + draft) ──
  const buildPayload = (status?: string): QuoteInput => ({
    customer_id: customerMode === 'existing' ? customerId : undefined,
    prospect_name: customerMode === 'prospect' ? prospectName : undefined,
    prospect_phone: customerMode === 'prospect' ? prospectPhone : undefined,
    prospect_email: customerMode === 'prospect' ? prospectEmail : undefined,
    ...(status ? { status } : {}),
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
      details: it.details?.trim() ? it.details.trim() : null,
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
  });

  // ── Submit (finaliza: cria/atualiza com validação completa) ──
  const handleSubmit = () => {
    const hasCustomer = customerMode === 'existing' ? !!customerId : !!prospectName;
    if (!hasCustomer || items.length === 0) return;

    const payload = buildPayload();

    // Se estiver editando, ou se já existe um rascunho persistido pra esta sessão,
    // atualiza a MESMA linha — nunca duplica.
    const targetId = quote?.id ?? draftQuoteId;
    if (targetId) {
      updateQuote.mutate({ ...payload, id: targetId }, { onSuccess: () => { draft.clearDraft(); onOpenChange(false); } });
    } else {
      createQuote.mutate(payload, { onSuccess: () => { draft.clearDraft(); onOpenChange(false); } });
    }
  };

  // ── Salvar rascunho (qualquer etapa, sem validação completa) ──
  // Cria a linha no 1º salvar (guarda o id) e atualiza nas chamadas seguintes,
  // sempre via o hook useQuotes (nunca supabase.from direto — hook é a fronteira).
  const handleSaveDraft = () => {
    setSavingDraft(true);
    const payload = buildPayload('rascunho');
    const targetId = quote?.id ?? draftQuoteId;
    if (targetId) {
      updateQuote.mutate({ ...payload, id: targetId }, {
        onSuccess: () => { draft.clearDraft(); setSavingDraft(false); onOpenChange(false); },
        onError: () => setSavingDraft(false),
      });
    } else {
      createQuote.mutate(payload, {
        onSuccess: (created: any) => {
          if (created?.id) setDraftQuoteId(created.id);
          draft.clearDraft();
          setSavingDraft(false);
          onOpenChange(false);
        },
        onError: () => setSavingDraft(false),
      });
    }
  };

  // ── Options ──
  const customerOptions = useMemo(
    () => (customers ?? []).map(c => ({ value: c.id, label: c.name })),
    [customers]
  );

  // Frequência de uso do tenant — deriva dos quote_items dos orçamentos já
  // carregados por useQuotes (sem query nova). Conta quantas vezes cada
  // service_type_id / inventory_id apareceu; usamos pra destacar "Recentes"
  // no topo do seletor. Estratégia leve: dados já em memória.
  const usageFreq = useMemo(() => {
    const svc = new Map<string, number>();
    const inv = new Map<string, number>();
    for (const q of quotes ?? []) {
      for (const it of (q.quote_items ?? [])) {
        if (it.service_type_id) svc.set(it.service_type_id, (svc.get(it.service_type_id) ?? 0) + 1);
        if (it.inventory_id) inv.set(it.inventory_id, (inv.get(it.inventory_id) ?? 0) + 1);
      }
    }
    return { svc, inv };
  }, [quotes]);

  const activeServices = useMemo(
    () => (serviceTypes ?? []).filter(s => s.is_active),
    [serviceTypes]
  );

  const serviceGroups = useMemo(() => {
    const toOption = (s: typeof activeServices[number]) => ({
      value: s.id,
      label: s.name,
      icon: <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />,
    });
    // Top 5 mais usados que existem no catálogo ativo.
    const recentIds = [...usageFreq.svc.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .filter(id => activeServices.some(s => s.id === id))
      .slice(0, 5);
    if (recentIds.length === 0) {
      return [{ options: activeServices.map(toOption) }];
    }
    const recentSet = new Set(recentIds);
    const recents = recentIds
      .map(id => activeServices.find(s => s.id === id)!)
      .map(toOption);
    const rest = activeServices.filter(s => !recentSet.has(s.id)).map(toOption);
    const groups = [{ heading: tq.serviceSelectRecents, options: recents }];
    if (rest.length > 0) groups.push({ heading: tq.serviceSelectAll, options: rest });
    return groups;
  }, [activeServices, usageFreq.svc, tq.serviceSelectRecents, tq.serviceSelectAll]);

  const inventoryGroups = useMemo(() => {
    const toOption = (i: typeof inventoryItems[number]) => ({
      value: i.id,
      label: `${i.name}${i.sku ? ` (${i.sku})` : ''}`,
    });
    const all = inventoryItems ?? [];
    const recentIds = [...usageFreq.inv.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .filter(id => all.some(i => i.id === id))
      .slice(0, 5);
    if (recentIds.length === 0) {
      return [{ options: all.map(toOption) }];
    }
    const recentSet = new Set(recentIds);
    const recents = recentIds.map(id => all.find(i => i.id === id)!).map(toOption);
    const rest = all.filter(i => !recentSet.has(i.id)).map(toOption);
    const groups = [{ heading: tq.serviceSelectRecents, options: recents }];
    if (rest.length > 0) groups.push({ heading: tq.serviceSelectAll, options: rest });
    return groups;
  }, [inventoryItems, usageFreq.inv, tq.serviceSelectRecents, tq.serviceSelectAll]);

  const hasAnyService = activeServices.length > 0;

  const serviceItems = items.filter(i => i.item_type === 'servico');
  const materialItems = items.filter(i => i.item_type === 'material');
  const hasCustomer = customerMode === 'existing' ? !!customerId : !!prospectName;

  // ── Wizard gating ──
  const canNext = () => {
    switch (currentStepKey) {
      case 'recipient':
        return hasCustomer;
      case 'review':
        // Finalizar exige destinatário + ao menos 1 item.
        return hasCustomer && items.length > 0;
      default:
        return true;
    }
  };

  const goToStep = (target: number) => {
    if (target === step) return;
    if (target <= maxStepReached) { setStep(target); return; }
    if (target === step + 1 && canNext()) setStep(target);
  };

  const progressPercent = ((step + 1) / STEPS.length) * 100;
  const mutating = createQuote.isPending || updateQuote.isPending;

  // ─── BDI config block (reused inside the Services step) ─────────────────────
  const bdiConfigBlock = hasPricing && (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <SectionHeader icon={<Calculator className="h-4 w-4 text-primary" />} title={tq.bdiHeader} />
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
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">{tq.bdiTax} &amp; {tq.bdiProfit}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <BdiField label={tq.bdiTax} suffix="%" value={taxRate} onChange={v => setTaxRate(v)} />
            <BdiField label={tq.bdiAdmin} suffix="%" value={adminRate} onChange={v => setAdminRate(v)} />
            <BdiField label={tq.bdiProfit} suffix="%" value={profitRate} onChange={v => setProfitRate(v)} />
            <BdiField label={tq.bdiKmCost} value={kmCostCfg} onChange={v => setKmCostCfg(v)} step={0.01} />
          </div>
        </div>

        <Separator className="opacity-50" />

        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <CreditCard className="h-3 w-3" /> {tq.bdiPaymentConditions}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <BdiField label={tq.bdiCashDiscount} suffix="%" value={cardDiscountRateCfg} onChange={v => setCardDiscountRateCfg(v)} />
            <BdiField label={tq.bdiInstallments} value={cardInstallmentsCfg} onChange={v => setCardInstallmentsCfg(Math.max(1, v))} step={1} min={1} />
          </div>
        </div>
      </div>
    </section>
  );

  // ─── Reusable summary block (review step) ───────────────────────────────────
  const summaryBlock = (
    <section className="space-y-3">
      {hasPricing && bdiDanger && (
        <Alert variant="destructive" className="border-destructive/50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{tq.bdiAlertDanger}</AlertDescription>
        </Alert>
      )}
      {hasPricing && bdiWarning && !bdiDanger && (
        <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            {tq.bdiAlertWarning}
          </AlertDescription>
        </Alert>
      )}
      {hasPricing ? (
        <BDISummaryCard data={{ ...bdi, cardInstallments: cardInstallmentsCfg }} />
      ) : (
        <Card className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-slate-700">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium text-white flex items-center gap-2">
              <Calculator className="h-4 w-4 text-emerald-400" /> {tq.reviewSummaryTitle}
            </p>
            <Separator className="bg-slate-700" />
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">{tq.reviewSubtotalServices}</span>
                <span className="text-sm text-white">{fmt(serviceItems.reduce((s, i) => s + (i.total_price || 0), 0))}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">{tq.reviewSubtotalMaterials}</span>
                <span className="text-sm text-white">{fmt(materialItems.reduce((s, i) => s + (i.total_price || 0), 0))}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">{tq.reviewDiscount}</span>
                  <span className="text-sm text-destructive">− {fmt(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                <span className="text-sm font-medium text-white">{tq.reviewTotal}</span>
                <span className="text-sm font-bold text-emerald-400">
                  {fmt(items.reduce((s, i) => s + (i.total_price || 0), 0) - discountAmount)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );

  // ─── Wizard content (stepper + steps) ───────────────────────────────────────
  const wizardContent = (
    <div className="flex flex-col">
      {/* Stepper — indicador de etapas centralizado horizontalmente */}
      <div className="space-y-3">
        <Progress value={progressPercent} className="h-1.5 max-w-md mx-auto" />
        <div className="flex items-center justify-center gap-1 flex-wrap">
          {STEPS.map((s, i) => {
            const clickable = i <= maxStepReached || (i === step + 1 && canNext());
            return (
              <div key={s.key} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={!clickable}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-colors shrink-0',
                    i < step ? 'bg-primary text-primary-foreground' :
                    i === step ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
                    'bg-muted text-muted-foreground',
                    clickable ? 'cursor-pointer hover:opacity-90' : 'cursor-not-allowed opacity-70',
                  )}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </button>
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={!clickable}
                  className={cn(
                    'text-xs hidden sm:inline truncate text-left',
                    i === step ? 'font-medium text-foreground' : 'text-muted-foreground',
                    clickable ? 'cursor-pointer hover:text-foreground' : 'cursor-not-allowed',
                  )}
                >
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <div className="w-4 sm:w-8 h-px bg-border mx-1" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 mt-4">
        <StepTransition stepKey={currentStepKey} index={step} className="space-y-5">

          {/* ══ STEP 1: DESTINATÁRIO ══ */}
          {currentStepKey === 'recipient' && (
            <section className="space-y-3">
              <SectionHeader icon={<User className="h-4 w-4 text-primary" />} title={tq.recipientHeader} />
              <LabeledSwitch<'existing' | 'prospect'>
                value={customerMode}
                onChange={setCustomerMode}
                size="default"
                off={{ value: 'existing', label: <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{tq.recipientExisting}</span> }}
                on={{ value: 'prospect', label: <span className="inline-flex items-center gap-1.5"><UserPlus className="h-3.5 w-3.5" />{tq.recipientProspect}</span> }}
                aria-label={tq.recipientHeader}
              />
              {customerMode === 'existing' ? (
                <div className="space-y-1">
                  <Label className="text-xs">{tq.recipientCustomerLabel}</Label>
                  <SearchableSelect
                    options={customerOptions}
                    value={customerId}
                    onValueChange={setCustomerId}
                    placeholder={tq.recipientCustomerPlaceholder}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{tq.recipientNameLabel}</Label>
                    <Input placeholder={tq.recipientNamePlaceholder} value={prospectName} onChange={e => setProspectName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tq.recipientPhoneLabel}</Label>
                    <Input placeholder={tq.recipientPhonePlaceholder} value={prospectPhone} onChange={e => setProspectPhone(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tq.recipientEmailLabel}</Label>
                    <Input type="email" placeholder={tq.recipientEmailPlaceholder} value={prospectEmail} onChange={e => setProspectEmail(e.target.value)} />
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ══ STEP 2: SERVIÇOS E MÃO DE OBRA (+ BDI) ══ */}
          {currentStepKey === 'services' && (
            <div className="space-y-5">
              {bdiConfigBlock}
              {hasPricing && <Separator />}

              <section className="space-y-3">
                <SectionHeader icon={<Wrench className="h-4 w-4 text-primary" />} title={tq.servicesHeader} />

                <div className="flex flex-col sm:flex-row gap-2 p-3 bg-muted/40 rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <SearchableSelect
                      groups={serviceGroups}
                      value={addSvcId}
                      onValueChange={setAddSvcId}
                      placeholder={tq.serviceSelectPlaceholder}
                      searchPlaceholder={tq.serviceSearchPlaceholder}
                      onCreateOption={handleCreateService}
                      createOptionLabel={tq.serviceSelectCreate}
                      emptyContent={!hasAnyService ? (
                        <div className="flex flex-col items-center gap-1.5 py-4 px-2 text-center">
                          <p className="text-sm font-medium text-foreground">{tq.serviceSelectEmptyTitle}</p>
                          <p className="text-xs text-muted-foreground">{tq.serviceSearchPlaceholder}</p>
                        </div>
                      ) : undefined}
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Label className="text-xs whitespace-nowrap">{tq.serviceQtyLabel}</Label>
                    <NumericInput value={String(addSvcQty ?? '')}
                      onValueChange={v => setAddSvcQty(Math.max(1, Number(v) || 1))}
                      className="h-9 w-16 text-sm" />
                    <Button size="sm" onClick={handleAddService} disabled={!addSvcId || isFetchingSvc} className="h-9 shrink-0">
                      {isFetchingSvc ? '…' : <><Plus className="h-3.5 w-3.5 mr-1" />{tq.serviceAddButton}</>}
                    </Button>
                  </div>
                </div>

                {serviceItems.length > 0 ? (
                  <ServiceItemsList items={serviceItems} allItems={items} onUpdatePrice={updateItemPrice} onUpdateQty={updateItemQty} onUpdateDetails={updateItemDetails} onRemove={removeItem} fmt={fmt} tq={tq} />
                ) : (
                  <EmptyState>{tq.serviceEmpty}</EmptyState>
                )}
              </section>
            </div>
          )}

          {/* ══ STEP 3: MATERIAIS E DESLOCAMENTO ══ */}
          {currentStepKey === 'materials' && (
            <div className="space-y-5">
              <section className="space-y-3">
                <SectionHeader icon={<Package className="h-4 w-4 text-primary" />} title={tq.materialsHeader} />

                <div className="flex flex-col gap-2 p-3 bg-muted/40 rounded-lg border">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 min-w-0">
                      <SearchableSelect
                        groups={inventoryGroups}
                        value={addMatId}
                        onValueChange={(v) => { setAddMatId(v); setAddMatManualName(''); }}
                        placeholder={tq.materialSelectPlaceholder}
                      />
                    </div>
                    {!addMatId && (
                      <div className="flex-1 min-w-0">
                        <Input
                          value={addMatManualName}
                          onChange={e => setAddMatManualName(e.target.value)}
                          placeholder={tq.materialManualPlaceholder}
                          className="h-9 text-sm"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {!addMatId && addMatManualName && (
                      <>
                        <Label className="text-xs whitespace-nowrap">{tq.materialUnitPriceLabel}</Label>
                        <Input type="number" min={0} step="0.01" value={addMatManualPrice}
                          onChange={e => setAddMatManualPrice(Number(e.target.value) || 0)}
                          className="h-9 w-24 text-sm" />
                      </>
                    )}
                    <Label className="text-xs whitespace-nowrap">{tq.materialQtyLabel}</Label>
                    <NumericInput value={String(addMatQty ?? '')}
                      onValueChange={v => setAddMatQty(Math.max(1, Number(v) || 1))}
                      className="h-9 w-16 text-sm" />
                    <Button size="sm" onClick={handleAddMaterial} disabled={!addMatId && !addMatManualName.trim()} className="h-9 shrink-0">
                      <Plus className="h-3.5 w-3.5 mr-1" />{tq.materialAddButton}
                    </Button>
                  </div>
                </div>

                {materialItems.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2 font-medium text-muted-foreground">{tq.materialColName}</th>
                          <th className="text-center p-2 font-medium text-muted-foreground w-12">{tq.materialColQty}</th>
                          <th className="text-right p-2 font-medium text-muted-foreground w-28">{tq.materialColUnitPrice}</th>
                          <th className="text-right p-2 font-medium text-muted-foreground w-24">{tq.materialColTotal}</th>
                          <th className="w-8 p-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {materialItems.map((item) => {
                          const globalIdx = items.indexOf(item);
                          return (
                            <tr key={globalIdx} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="p-2 font-medium align-top">
                                <span>{item.description}</span>
                                <Textarea
                                  value={item.details ?? ''}
                                  onChange={e => updateItemDetails(globalIdx, e.target.value)}
                                  placeholder={tq.itemDetailsPlaceholder}
                                  rows={1}
                                  className="mt-1 min-h-0 h-7 py-1 text-[11px] font-normal text-muted-foreground resize-y w-full"
                                />
                              </td>
                              <td className="p-2 text-center">
                                <Input
                                  type="number" min={1} step="1"
                                  value={item.quantity || ''}
                                  onChange={e => updateItemQty(globalIdx, Math.max(1, parseInt(e.target.value, 10) || 1))}
                                  className="h-7 w-14 text-xs text-center mx-auto px-1"
                                />
                              </td>
                              <td className="p-2">
                                <Input
                                  type="number" min={0} step="0.01"
                                  value={item.unit_price || ''}
                                  onChange={e => updateItemPrice(globalIdx, parseFloat(e.target.value) || 0)}
                                  className="h-7 w-24 text-xs text-right ml-auto"
                                />
                              </td>
                              <td className="p-2 text-right font-semibold">{fmt(item.total_price)}</td>
                              <td className="p-2">
                                <Button type="button" variant="ghost" size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => removeItem(globalIdx)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-muted/30 border-t">
                          <td colSpan={3} className="p-2 text-right text-xs font-medium text-muted-foreground">
                            {tq.materialSubtotal}
                          </td>
                          <td className="p-2 text-right font-bold">
                            {fmt(materialItems.reduce((s, i) => s + i.total_price, 0))}
                          </td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState>{tq.materialEmpty}</EmptyState>
                )}
              </section>

              {hasPricing && (
                <>
                  <Separator />
                  <section className="space-y-2">
                    <SectionHeader icon={<MapPin className="h-4 w-4 text-primary" />} title={tq.displacementHeader} />
                    <div className="flex items-center gap-2 flex-wrap">
                      <NumericInput value={distanceKm ? String(distanceKm) : ''}
                        onValueChange={v => setDistanceKm(Number(v) || 0)}
                        className="h-9 w-28" placeholder={tq.displacementPlaceholder} />
                      {bdi.displacementCost > 0 && (
                        <span className="text-xs text-muted-foreground">
                          = <span className="font-semibold text-foreground">{fmt(bdi.displacementCost)}</span>
                        </span>
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>
          )}

          {/* ══ STEP 4: DESCONTO, BRINDES E CONDIÇÕES ══ */}
          {currentStepKey === 'discount' && (
            <div className="space-y-5">
              <section className="space-y-2">
                <SectionHeader icon={<Tag className="h-4 w-4 text-primary" />} title={tq.discountHeader} />
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
              </section>

              <Separator />

              <section className="space-y-2">
                <SectionHeader icon={<Gift className="h-4 w-4 text-primary" />} title={tq.giftsHeader} />
                <div className="flex items-center gap-2 px-1">
                  <Checkbox
                    id="include-gifts"
                    checked={includeGifts}
                    onCheckedChange={(checked) => setIncludeGifts(!!checked)}
                  />
                  <Label htmlFor="include-gifts" className="text-xs text-muted-foreground cursor-pointer">
                    {tq.giftsInclude}
                  </Label>
                </div>
              </section>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{tq.notesLabel}</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={tq.notesPlaceholder} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>{tq.termsLabel}</Label>
                  <Textarea value={terms} onChange={e => setTerms(e.target.value)} placeholder={tq.termsPlaceholder} rows={2} />
                </div>
              </div>
            </div>
          )}

          {/* ══ STEP 5: VALIDADE, TEMPLATE + RESUMO ══ */}
          {currentStepKey === 'review' && (
            <div className="space-y-5">
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{tq.reviewValidUntil}</Label>
                  <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Palette className="h-3.5 w-3.5" />{tq.reviewTemplateLabel}
                  </Label>
                  <Select value={proposalTemplateId} onValueChange={setProposalTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder={tq.reviewTemplatePlaceholder} />
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

              {items.length > 0 ? (
                <>
                  <Separator />
                  {summaryBlock}
                </>
              ) : (
                <EmptyState>{tq.reviewEmptyItems}</EmptyState>
              )}
            </div>
          )}

        </StepTransition>
      </div>
    </div>
  );

  // ── Wizard footer (navegação + salvar rascunho) ──
  const wizardFooter = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row justify-between gap-2">
        <Button
          variant="outline"
          onClick={() => step === 0 ? onOpenChange(false) : setStep(step - 1)}
          disabled={mutating || savingDraft}
        >
          {step === 0 ? tq.cancel : <><ChevronLeft className="h-4 w-4 mr-1" /> {tq.back}</>}
        </Button>

        <div className="flex items-center gap-2">
          {/* Salvar rascunho — visível em QUALQUER etapa. */}
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={mutating || savingDraft || !hasCustomer}
          >
            {savingDraft
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {tq.saving}</>
              : <><Save className="h-4 w-4 mr-1" /> {tq.saveDraft}</>}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
              {tq.next} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canNext() || mutating || savingDraft}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {mutating
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {tq.saving}</>
                : quote ? tq.saveChanges : tq.createQuote}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  const title = quote
    ? tq.formTitleEdit.replace('{number}', String(quote.quote_number))
    : draftQuoteId ? tq.formTitleDraft : tq.formTitleNew;

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        className="sm:max-w-[920px]"
        footer={wizardFooter}
        lockBackdrop
      >
        {wizardContent}
      </ResponsiveModal>

      {/* Rascunho local (sessionStorage) — só em criação e quando NÃO retomando
          um rascunho persistido do banco (não conflitam). */}
      {!isEditing && !draftQuoteId && (
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
      )}
    </>
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
