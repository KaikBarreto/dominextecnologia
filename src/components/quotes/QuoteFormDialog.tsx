import { useState, useEffect, useMemo, useCallback, useRef, useId } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES, type Messages } from '@/lib/i18n/messages';
import { formatMoney, formatNumber, getCurrencySymbol } from '@/lib/format';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyField } from '@/components/ui/CurrencyField';
import { DatePicker } from '@/components/ui/DatePicker';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useCustomers } from '@/hooks/useCustomers';
import { useQuotes, type QuoteInput, type Quote } from '@/hooks/useQuotes';
import { useProposalTemplates } from '@/hooks/useProposalTemplates';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useInventory, type InventoryItem } from '@/hooks/useInventory';
import { useCostResources, type CostResource } from '@/hooks/useCostResources';
import { useAuth } from '@/contexts/AuthContext';
import { useBDICalculator } from '@/hooks/useBDICalculator';
import { fetchServiceCostBreakdown } from '@/hooks/useServiceCostBreakdown';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useSaveQuoteServiceCosts } from '@/hooks/useSaveQuoteServiceCosts';
import { useToast } from '@/hooks/use-toast';
import { QuotePricingSummary } from '@/components/quotes/QuotePricingSummary';
import { QuoteBdiComposer } from '@/components/quotes/QuoteBdiComposer';
import { QuoteRecipientSummary } from '@/components/quotes/QuoteRecipientSummary';
import { QuoteTemplatePreviewDialog } from '@/components/quotes/QuoteTemplatePreviewDialog';
import { ProposalCoverPreview } from '@/components/quotes/ProposalCoverPreview';
import {
  QuoteServiceCostEditor,
  createQuoteCostComposition,
  getQuoteCostCompositionTotals,
  type QuoteCostComposition,
} from '@/components/quotes/QuoteServiceCostEditor';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { MaterialBatchPicker, type MaterialBatchSelection } from '@/components/inventory/MaterialBatchPicker';
import { InventoryItemThumbnail } from '@/components/inventory/InventoryItemThumbnail';
import { formatQty } from '@/components/inventory/InventoryMaterialSelect';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import { QuickServiceTypeDialog } from '@/components/service-orders/QuickServiceTypeDialog';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeNotice } from '@/components/ui/DraftResumeNotice';
import { FullscreenWizard, FullscreenWizardAction } from '@/components/ui/FullscreenWizard';
import { FormDraftStatus } from '@/components/ui/FormDraftStatus';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { FormWizardStepper } from '@/components/ui/FormWizardStepper';
import { WizardMobileSummary } from '@/components/ui/WizardReviewChecklist';
import { StepTransition } from '@/components/ui/step-transition';
import { cn } from '@/lib/utils';
import { readPastedCents } from '@/lib/money-paste-mask';
import {
  User, Palette, Wrench, Package,
  Calculator, Plus, Minus, Trash2, Tag, AlertTriangle, Gift, CreditCard, ChevronDown,
  ChevronLeft, ChevronRight, Save, Loader2, Inbox, Eye,
} from 'lucide-react';

export type ItemPricingMode = 'registered' | 'cost_bdi' | 'manual';
type DisplacementPricingMode = 'cost_bdi' | 'manual';

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
  pricing_mode: ItemPricingMode;
  cost_composition?: QuoteCostComposition | null;
  save_costs_to_catalog?: boolean;
  service_color?: string;
}

/** Arredonda pra 2 casas (evita flutuação de ponto). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Lê "2,5" ou "2.5" (string crua do `NumericInput decimal`) como número. */
function parseDecimalInput(raw: string): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function calculateQuoteCommercialTotal({
  itemsTotal,
  displacementCost,
  discountType,
  discountValue,
}: {
  itemsTotal: number;
  displacementCost: number;
  discountType: 'percentual' | 'valor';
  discountValue: number;
}) {
  const subtotalBeforeDiscount = Math.max(0, itemsTotal) + Math.max(0, displacementCost);
  const discountAmount = discountType === 'percentual'
    ? subtotalBeforeDiscount * (discountValue / 100)
    : discountValue;

  return {
    subtotalBeforeDiscount,
    discountAmount,
    finalTotal: Math.max(0, subtotalBeforeDiscount - discountAmount),
  };
}

/**
 * Monta um `FormQuoteItem` de MATERIAL — função pura, extraída do antigo
 * `handleAddMaterial` byte a byte igual (nenhum cálculo novo). É a MESMA
 * função usada tanto pelo item único quanto pelo lote do `MaterialBatchPicker`
 * (regra de não-regressão de preço: um único lugar calcula `unit_price` /
 * `unit_total_cost` / `total_price` / `bdi`).
 *
 * Quando `inv` está presente (material do catálogo), o preço SEMPRE vem do
 * próprio item de estoque (`sale_price` ou, na falta, `cost_price`) — nunca
 * de `manualPrice`. `manualPrice` só vale pro material avulso (`inv` nulo).
 * Devolve `null` quando não há nome (nem catálogo nem manual) — chamador filtra.
 */
export function buildMaterialItem({
  inv,
  manualName,
  manualCost = 0,
  manualPrice,
  quantity,
  profitRate,
  bdiFactor,
  pricingMode,
}: {
  inv: InventoryItem | null | undefined;
  manualName: string | null;
  manualCost?: number;
  manualPrice: number;
  quantity: number;
  profitRate: number;
  bdiFactor: number;
  pricingMode?: ItemPricingMode;
}): FormQuoteItem | null {
  const isFromStock = !!inv;
  const name = isFromStock ? (inv?.name ?? '') : (manualName ?? '').trim();
  if (!name) return null;
  const resolvedMode = pricingMode ?? (isFromStock ? 'registered' : 'manual');
  const unitCost = isFromStock ? Number(inv?.cost_price ?? 0) : Math.max(0, manualCost);
  const unitPrice = calculateItemPrice({
    mode: resolvedMode,
    registeredPrice: Number(inv?.sale_price ?? inv?.cost_price ?? 0),
    unitCost,
    bdiFactor,
    manualPrice,
  });
  return {
    item_type: 'material',
    description: name,
    details: '',
    quantity,
    unit_total_cost: unitCost,
    unit_price: unitPrice,
    total_price: Math.round(unitPrice * quantity * 100) / 100,
    service_type_id: null,
    inventory_id: isFromStock ? (inv!.id) : null,
    unit_hourly_rate: 0,
    unit_hours: 0,
    unit_labor_cost: 0,
    unit_materials_cost: 0,
    unit_extras_cost: 0,
    profit_rate: profitRate,
    bdi: bdiFactor,
    price_override: resolvedMode === 'cost_bdi' ? null : unitPrice,
    pricing_mode: resolvedMode,
  };
}

export function calculateItemPrice({
  mode,
  registeredPrice,
  unitCost,
  bdiFactor,
  manualPrice,
}: {
  mode: ItemPricingMode;
  registeredPrice: number;
  unitCost: number;
  bdiFactor: number;
  manualPrice: number;
}) {
  if (mode === 'registered') return round2(Math.max(0, registeredPrice));
  if (mode === 'cost_bdi') {
    return round2(bdiFactor > 0.01 ? Math.max(0, unitCost) / bdiFactor : Math.max(0, unitCost));
  }
  return round2(Math.max(0, manualPrice));
}

export function calculateMixedQuotePricing({
  items,
  useBdi,
  bdiFactor,
  displacementMode,
  displacementCost,
  displacementPrice,
}: {
  items: FormQuoteItem[];
  useBdi: boolean;
  bdiFactor: number;
  displacementMode: DisplacementPricingMode;
  displacementCost: number;
  displacementPrice: number;
}) {
  const automaticItemsCost = items.reduce((sum, item) => (
    useBdi && item.pricing_mode === 'cost_bdi'
      ? sum + Math.max(0, item.unit_total_cost) * Math.max(0, item.quantity)
      : sum
  ), 0);
  const automaticDisplacementCost = useBdi && displacementMode === 'cost_bdi'
    ? Math.max(0, displacementCost)
    : 0;
  const automaticCost = automaticItemsCost + automaticDisplacementCost;
  const automaticPrice = automaticCost > 0
    ? round2(automaticCost / Math.max(0.01, bdiFactor))
    : 0;
  const outsideItemsPrice = items.reduce((sum, item) => (
    useBdi && item.pricing_mode === 'cost_bdi'
      ? sum
      : sum + Math.max(0, item.total_price)
  ), 0);
  const outsidePrice = outsideItemsPrice + (
    useBdi && displacementMode === 'cost_bdi' ? 0 : Math.max(0, displacementPrice)
  );
  const totalKnownCost = items.reduce(
    (sum, item) => sum + Math.max(0, item.unit_total_cost) * Math.max(0, item.quantity),
    Math.max(0, displacementCost),
  );

  return {
    automaticCost,
    automaticPrice,
    outsidePrice,
    totalKnownCost,
    suggestedPrice: round2(automaticPrice + outsidePrice),
  };
}

interface QuoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote?: Quote | null;
}

// STEPS é construído dentro do componente (locale-aware) — ver buildSteps() abaixo.
const STEP_KEYS = ['recipient', 'services', 'materials', 'commercial', 'review'] as const;
type StepKey = typeof STEP_KEYS[number];

// ─── Service Items List with expandable cost details ─────────────────────────
function ServiceItemsList({
  items: serviceItems,
  allItems,
  onUpdatePrice,
  onUpdateQty,
  onUpdateDetails,
  onRestoreAutomatic,
  onUpdatePricingMode,
  canUseRegisteredPrice,
  onRemove,
  fmt,
  currencySymbol,
  tq,
  useBdi,
  bdiFactor,
  onUpdateCostComposition,
  inventoryItems,
  costResources,
}: {
  items: FormQuoteItem[];
  allItems: FormQuoteItem[];
  onUpdatePrice: (idx: number, price: number) => void;
  onUpdateQty: (idx: number, qty: number) => void;
  onUpdateDetails: (idx: number, details: string) => void;
  onRestoreAutomatic: (idx: number) => void;
  onUpdatePricingMode: (idx: number, mode: ItemPricingMode) => void;
  canUseRegisteredPrice: (item: FormQuoteItem) => boolean;
  onRemove: (idx: number) => void;
  fmt: (v: number) => string;
  currencySymbol: string;
  tq: Messages['app']['crm']['quotes'];
  useBdi: boolean;
  bdiFactor: number;
  onUpdateCostComposition: (idx: number, composition: QuoteCostComposition, saveAsCatalogDefault: boolean) => void;
  inventoryItems: InventoryItem[];
  costResources: CostResource[];
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const handlePricePaste = (event: React.ClipboardEvent<HTMLInputElement>, index: number) => {
    const cents = readPastedCents(event);
    if (cents == null) return;
    onUpdatePrice(index, cents / 100);
  };
  const subtotal = serviceItems.reduce((sum, item) => sum + item.total_price, 0);

  return (
    <div className="border-y">
      <div className="divide-y">
        {serviceItems.map((item) => {
          const globalIdx = allItems.indexOf(item);
          const isExpanded = expandedIdx === globalIdx;
          const hasCosts = item.unit_total_cost > 0;
          return (
            <article key={item.id ?? globalIdx}>
              <div className="flex items-stretch gap-2 py-2 sm:gap-3">
                <button
                  type="button"
                  className="group grid min-w-0 flex-1 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 rounded-2xl bg-zinc-950 px-3 py-4 text-left text-white transition-colors hover:bg-zinc-900 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:gap-4 sm:px-4"
                  onClick={() => setExpandedIdx(isExpanded ? null : globalIdx)}
                  aria-label={`${isExpanded ? 'Recolher serviço' : 'Abrir serviço'} ${item.description}`}
                  aria-expanded={isExpanded}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white sm:h-12 sm:w-12" style={{ backgroundColor: item.service_color || '#22c55e' }}>
                    <Wrench className="h-5 w-5" />
                  </span>

                  <span className="min-w-0">
                    <span className="block text-lg font-semibold leading-6 sm:text-xl">{item.description}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-white/75 sm:text-sm">
                      {hasCosts
                        ? `Mão de obra ${fmt(item.unit_labor_cost)} · Insumos ${fmt(item.unit_materials_cost)} · Recursos ${fmt(item.unit_extras_cost)}`
                        : tq.serviceNoCosts}
                    </span>
                  </span>

                  <span className="col-span-2 flex items-center justify-between gap-5 border-t border-white/15 pt-3 sm:col-span-1 sm:justify-end sm:border-0 sm:pt-0">
                    <span className="text-xs text-zinc-300 sm:hidden">{item.quantity} × {fmt(item.unit_price)}</span>
                    <span className="hidden gap-6 lg:flex">
                      <span>
                        <span className="block text-xs font-medium uppercase tracking-wide text-zinc-300">Qtd.</span>
                        <span className="mt-0.5 block font-semibold tabular-nums">{item.quantity}</span>
                      </span>
                      <span>
                        <span className="block text-xs font-medium uppercase tracking-wide text-zinc-300">Custo unit.</span>
                        <span className="mt-0.5 block font-semibold tabular-nums">{hasCosts ? fmt(item.unit_total_cost) : '—'}</span>
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-xs font-medium uppercase tracking-wide text-zinc-300">Total</span>
                      <span className="mt-0.5 block text-base font-semibold tabular-nums sm:text-lg">{fmt(item.total_price)}</span>
                    </span>
                    <ChevronDown className={cn('h-5 w-5 shrink-0 transition-transform', isExpanded && 'rotate-180')} />
                  </span>
                </button>
                <Button type="button" variant="destructive-ghost" size="icon" className="my-auto h-10 w-10 shrink-0" aria-label={`Remover ${item.description}`} onClick={() => onRemove(globalIdx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {isExpanded && (
                <div className="pb-8 pt-3">
                  <QuoteServiceCostEditor
                    value={{
                      serviceTypeId: item.service_type_id,
                      composition: item.cost_composition ?? createQuoteCostComposition(),
                      saveAsCatalogDefault: item.save_costs_to_catalog,
                    }}
                    onChange={next => onUpdateCostComposition(globalIdx, next.composition, next.saveAsCatalogDefault === true)}
                    bdiFactor={bdiFactor}
                    formatMoney={fmt}
                    currencySymbol={currencySymbol}
                    inventoryItems={inventoryItems}
                    costResources={costResources}
                  />

                  <section className="mt-8 space-y-5 border-t pt-7">
                    <div>
                      <h4 className="text-xl font-semibold sm:text-2xl">Preço e apresentação no orçamento</h4>
                      <p className="mt-1 text-sm text-muted-foreground">Defina como o serviço será cobrado e o texto que o cliente verá.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 xl:grid-cols-[minmax(13rem,1.4fr)_5rem_9rem]">
                      <div className="col-span-2 space-y-1.5 xl:col-span-1">
                        <Label className="text-sm font-semibold text-foreground">Forma de precificação</Label>
                        <ServicePricingModeControl
                          item={item}
                          useBdi={useBdi}
                          allowRegistered={canUseRegisteredPrice(item)}
                          onChange={mode => onUpdatePricingMode(globalIdx, mode)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-semibold text-foreground">{tq.serviceColQty}</Label>
                        <Input
                          aria-label={`${tq.serviceColQty} de ${item.description}`}
                          type="number"
                          min={1}
                          step="1"
                          value={item.quantity || ''}
                          onChange={event => onUpdateQty(globalIdx, Math.max(1, parseInt(event.target.value, 10) || 1))}
                          className="h-11 text-center"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-semibold text-foreground">{tq.serviceColUnitPrice}</Label>
                        <CurrencyField symbol={currencySymbol} className="max-w-40">
                          <Input
                            aria-label={`Preço de ${item.description}`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unit_price || ''}
                            onChange={event => onUpdatePrice(globalIdx, parseFloat(event.target.value) || 0)}
                            onPaste={event => handlePricePaste(event, globalIdx)}
                            className="h-11 text-right"
                          />
                        </CurrencyField>
                      </div>
                    </div>

                    {item.pricing_mode === 'manual' && (
                      <p className="text-sm leading-relaxed text-warning">
                        Preço manual: fora da precificação automática.
                        {useBdi && hasCosts && (
                          <button type="button" className="ml-1 underline underline-offset-2" onClick={() => onRestoreAutomatic(globalIdx)}>Restaurar cálculo com BDI</button>
                        )}
                      </p>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold text-foreground">Descrição para o cliente</Label>
                      <Textarea
                        value={item.details ?? ''}
                        onChange={event => onUpdateDetails(globalIdx, event.target.value)}
                        placeholder={tq.itemDetailsPlaceholder}
                        rows={3}
                        className="min-h-24 resize-y"
                      />
                    </div>
                  </section>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t py-4 text-sm">
        <span className="text-muted-foreground">{tq.serviceSubtotal}</span>
        <span className="text-lg font-semibold tabular-nums">{fmt(subtotal)}</span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function QuoteFormDialog({ open, onOpenChange, quote }: QuoteFormDialogProps) {
  const { locale, currency } = useAppLocaleContext();
  const tq = MESSAGES[locale].app.crm.quotes;
  const stepLabels: Record<typeof locale, Record<StepKey, string>> = {
    'pt-br': { recipient: 'Cliente', services: 'Serviços e custos', materials: 'Materiais', commercial: 'Preço e condições', review: 'Revisão e envio' },
    en: { recipient: 'Customer', services: 'Services and costs', materials: 'Materials', commercial: 'Pricing and terms', review: 'Review and send' },
    es: { recipient: 'Cliente', services: 'Servicios y costes', materials: 'Materiales', commercial: 'Precio y condiciones', review: 'Revisión y envío' },
    fr: { recipient: 'Client', services: 'Services et coûts', materials: 'Matériaux', commercial: 'Prix et conditions', review: 'Révision et envoi' },
  };
  const STEPS = STEP_KEYS.map(key => ({ key, label: stepLabels[locale][key] }));
  const fmt = (v: number) => formatMoney(Math.round(v * 100) / 100, currency, locale);
  const fmtRate = (v: number) => formatNumber(v, locale, { maximumFractionDigits: 1 });
  const currencySymbol = getCurrencySymbol(currency, locale);
  const { customers } = useCustomers();
  const { createQuote, updateQuote, quotes } = useQuotes();
  const { templates } = useProposalTemplates();
  const { settings: pricing } = usePricingSettings();
  const { serviceTypes } = useServiceTypes();
  const { items: inventoryItems } = useInventory();
  const { resources: costResources } = useCostResources();
  const { profile } = useAuth();
  const { settings: companySettings } = useCompanySettings();
  const queryClient = useQueryClient();
  const saveQuoteServiceCosts = useSaveQuoteServiceCosts();
  const { toast } = useToast();
  const isEditing = !!quote;

  // ── Wizard navigation ──
  const [step, setStep] = useState(0);
  // Etapa mais avançada já visitada — libera o clique direto no cabeçalho para
  // navegar livremente (ida e volta) até onde já se chegou.
  const [maxStepReached, setMaxStepReached] = useState(0);
  const currentStepKey = STEPS[step]?.key ?? 'assembly';

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
  const pricingTouchedRef = useRef({
    taxRate: false,
    adminRate: false,
    profitRate: false,
    kmCost: false,
    cardDiscountRate: false,
    cardInstallments: false,
  });
  const [useBdi, setUseBdi] = useState(true);

  // ── Items ──
  const [items, setItems] = useState<FormQuoteItem[]>([]);

  // ── Displacement ──
  const [distanceKm, setDistanceKm] = useState(0);
  const [displacementPricingMode, setDisplacementPricingMode] = useState<DisplacementPricingMode>('cost_bdi');
  const [manualDisplacementPrice, setManualDisplacementPrice] = useState(0);

  // ── Validity / Template ──
  const [validUntil, setValidUntil] = useState('');
  const [proposalTemplateId, setProposalTemplateId] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [navigationMessage, setNavigationMessage] = useState('');
  const recipientSectionRef = useRef<HTMLElement>(null);
  const itemsSectionRef = useRef<HTMLElement>(null);
  const wizardContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollArea = wizardContentRef.current?.parentElement;
    if (scrollArea) scrollArea.scrollTop = 0;
  }, [step]);

  // ── Condição de recebimento (usada pela aprovação, seja pelo operador seja
  // pelo cliente final no link público, onde não há ninguém pra perguntar) ──
  const [receivableInstallments, setReceivableInstallments] = useState(1);
  const [receivableFirstDueDate, setReceivableFirstDueDate] = useState('');

  // ── Notes / Terms ──
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');

  // ── Discount (at end) ──
  const [discountType, setDiscountType] = useState<'valor' | 'percentual'>('valor');
  const [discountValue, setDiscountValue] = useState(0);
  const [includeGifts, setIncludeGifts] = useState(true);
  const [showLaborCostInProposal, setShowLaborCostInProposal] = useState(false);
  const [showInputsCostInProposal, setShowInputsCostInProposal] = useState(false);

  // ── Add-service row state ──
  const [addSvcId, setAddSvcId] = useState('');
  const [addSvcQty, setAddSvcQty] = useState(1);
  const [isFetchingSvc, setIsFetchingSvc] = useState(false);
  // Quick-create de tipo de serviço inline (botão "+" ao lado do seletor).
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');

  // ── Seletor em lote de materiais (etapa Materiais) ──
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  // Índices (globais em `items`) cujo campo de detalhe já foi revelado — nasce
  // fechado, exceto quando o item já tem detalhe preenchido (ver `detailsOpen`).
  const [openMaterialDetails, setOpenMaterialDetails] = useState<Set<number>>(new Set());

  type QuoteDraft = {
    customerMode: string; customerId: string; prospectName: string; prospectPhone: string; prospectEmail: string;
    distanceKm: number; discountType: string; discountValue: number; includeGifts: boolean;
    validUntil: string; notes: string; terms: string; proposalTemplateId: string;
    receivableInstallments: number; receivableFirstDueDate: string;
    useBdi: boolean; displacementPricingMode: DisplacementPricingMode; manualDisplacementPrice: number;
    showLaborCostInProposal: boolean; showInputsCostInProposal: boolean;
    items?: FormQuoteItem[];
    taxRate?: number; adminRate?: number; profitRate?: number; kmCost?: number;
    cardDiscountRate?: number; cardInstallments?: number;
  };
  const draftScopeKey = profile?.company_id ? `quote-form:${profile.company_id}:${profile.user_id || profile.id || 'session'}` : 'quote-form';
  const draftScopeRef = useRef(draftScopeKey);
  const draftScopeChanged = draftScopeRef.current !== draftScopeKey;
  const draft = useFormDraft<QuoteDraft>({
    key: draftScopeKey,
    isOpen: open, isEditing, debounceMs: 500,
    ignoreKeys: ['customerMode', 'discountType', 'useBdi', 'includeGifts', 'receivableInstallments', 'proposalTemplateId', 'displacementPricingMode', 'taxRate', 'adminRate', 'profitRate', 'kmCost', 'cardDiscountRate', 'cardInstallments'],
  });
  const currentDraft = useMemo<QuoteDraft>(() => ({
    customerMode, customerId, prospectName, prospectPhone, prospectEmail,
    distanceKm, discountType, discountValue, includeGifts,
    validUntil, notes, terms, proposalTemplateId,
    receivableInstallments, receivableFirstDueDate,
    useBdi, displacementPricingMode, manualDisplacementPrice,
    showLaborCostInProposal, showInputsCostInProposal,
    items, taxRate, adminRate, profitRate, kmCost: kmCostCfg,
    cardDiscountRate: cardDiscountRateCfg, cardInstallments: cardInstallmentsCfg,
  }), [customerMode, customerId, prospectName, prospectPhone, prospectEmail, distanceKm, discountType, discountValue, includeGifts, validUntil, notes, terms, proposalTemplateId, receivableInstallments, receivableFirstDueDate, useBdi, displacementPricingMode, manualDisplacementPrice, showLaborCostInProposal, showInputsCostInProposal, items, taxRate, adminRate, profitRate, kmCostCfg, cardDiscountRateCfg, cardInstallmentsCfg]);
  const startNewDraftIfNeeded = (patch: Partial<QuoteDraft>) => {
    if (!draftScopeChanged && draft.showResumePrompt) draft.startNewDraft({ ...currentDraft, ...patch });
  };

  // Rascunho local completo, com debounce. O rascunho da conta continua sendo
  // salvo apenas pela ação explícita; a edição do banco não recebe autosave.
  useEffect(() => {
    if (open && !isEditing && !draftQuoteId && !draft.showResumePrompt && !draftScopeChanged) {
      draft.saveDraft(currentDraft);
    }
  }, [currentDraft, open, isEditing, draftQuoteId, draft.showResumePrompt, draft.saveDraft, draftScopeChanged]);

  const applyQuoteDraft = (d: QuoteDraft) => {
    setCustomerMode(d.customerMode === 'prospect' ? 'prospect' : 'existing');
    setCustomerId(d.customerId || '');
    setProspectName(d.prospectName || '');
    setProspectPhone(d.prospectPhone || '');
    setProspectEmail(d.prospectEmail || '');
    setDistanceKm(d.distanceKm || 0);
    setDiscountType(d.discountType === 'percentual' ? 'percentual' : 'valor');
    setDiscountValue(d.discountValue || 0);
    setIncludeGifts(d.includeGifts !== false);
    setValidUntil(d.validUntil || '');
    setNotes(d.notes || '');
    setTerms(d.terms || '');
    setProposalTemplateId(d.proposalTemplateId || '');
    setReceivableInstallments(d.receivableInstallments || 1);
    setReceivableFirstDueDate(d.receivableFirstDueDate || '');
    setUseBdi(d.useBdi !== false);
    setDisplacementPricingMode(d.displacementPricingMode === 'manual' ? 'manual' : 'cost_bdi');
    setManualDisplacementPrice(Number(d.manualDisplacementPrice ?? 0));
    setShowLaborCostInProposal(d.showLaborCostInProposal === true);
    setShowInputsCostInProposal(d.showInputsCostInProposal === true);
    const restoredRates = { taxRate: d.taxRate, adminRate: d.adminRate, profitRate: d.profitRate, kmCost: d.kmCost, cardDiscountRate: d.cardDiscountRate, cardInstallments: d.cardInstallments };
    for (const [key, value] of Object.entries(restoredRates)) {
      if (typeof value === 'number' && Number.isFinite(value)) pricingTouchedRef.current[key as keyof typeof restoredRates] = true;
    }
    if (Number.isFinite(d.taxRate)) setTaxRate(d.taxRate!);
    if (Number.isFinite(d.adminRate)) setAdminRate(d.adminRate!);
    if (Number.isFinite(d.profitRate)) setProfitRate(d.profitRate!);
    if (Number.isFinite(d.kmCost)) setKmCostCfg(d.kmCost!);
    if (Number.isFinite(d.cardDiscountRate)) setCardDiscountRateCfg(d.cardDiscountRate!);
    if (Number.isFinite(d.cardInstallments)) setCardInstallmentsCfg(d.cardInstallments!);
    setItems(Array.isArray(d.items) ? d.items.map(item => ({ ...item, cost_composition: createQuoteCostComposition(item.cost_composition ?? undefined) })) : []);
  };

  const resetQuoteForm = useCallback(() => {
    pricingTouchedRef.current = {
      taxRate: false,
      adminRate: false,
      profitRate: false,
      kmCost: false,
      cardDiscountRate: false,
      cardInstallments: false,
    };
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
    setReceivableInstallments(1);
    setReceivableFirstDueDate('');
    setUseBdi(true);
    setDisplacementPricingMode('cost_bdi');
    setManualDisplacementPrice(0);
    setShowLaborCostInProposal(false);
    setShowInputsCostInProposal(false);
    setItems([]);
    // Novos orçamentos nascem no template "Clean" (branco/enxuto). Os demais
    // seguem selecionáveis no seletor de template. Fallback: 1º da lista.
    setProposalTemplateId(
      (templates.find(t => t.slug === 'clean') ?? templates[0])?.id ?? ''
    );
    setTaxRate(Number(pricing?.tax_rate ?? 10));
    setAdminRate(Number(pricing?.admin_indirect_rate ?? 12));
    setProfitRate(Number(pricing?.default_profit_rate ?? 10));
    setKmCostCfg(Number(pricing?.km_cost ?? 1));
    setCardDiscountRateCfg(Number(pricing?.card_discount_rate ?? 6));
    setCardInstallmentsCfg(Number(pricing?.card_installments ?? 10));
  }, [templates, pricing]);

  useEffect(() => {
    if (draftScopeRef.current === draftScopeKey) return;
    draftScopeRef.current = draftScopeKey;
    resetQuoteForm();
    setStep(0);
    setMaxStepReached(0);
    setDraftQuoteId(null);
    // A troca de empresa/usuário encerra o formulário sem gravar o snapshot
    // anterior sob o novo contexto. O rascunho da outra conta fica isolado.
    if (open) onOpenChange(false);
  }, [draftScopeKey, open, onOpenChange, resetQuoteForm]);

  // ── Default de template pra NOVO orçamento: "Clean" (branco/enxuto) ──
  // Os templates carregam async; quando chegam e ainda não há seleção (orçamento
  // novo, sem rascunho), aponta pro "clean". Os 3 escuros seguem no seletor.
  useEffect(() => {
    if (open && !isEditing && !proposalTemplateId && templates.length > 0) {
      setProposalTemplateId((templates.find(t => t.slug === 'clean') ?? templates[0]).id);
    }
  }, [open, isEditing, proposalTemplateId, templates]);

  // ── Initialize BDI config from pricing settings (new quote) ──
  // A query pode resolver ou refazer fetch com o formulário aberto. Nesse caso,
  // aplica o padrão apenas aos campos ainda intocados nesta sessão, sem apagar
  // ajustes manuais que o usuário já começou a fazer.
  useEffect(() => {
    if (!open || !pricing || quote) return;
    const touched = pricingTouchedRef.current;
    if (!touched.taxRate) setTaxRate(Number(pricing.tax_rate ?? 10));
    if (!touched.adminRate) setAdminRate(Number(pricing.admin_indirect_rate ?? 12));
    if (!touched.profitRate) setProfitRate(Number(pricing.default_profit_rate ?? 10));
    if (!touched.kmCost) setKmCostCfg(Number(pricing.km_cost ?? 1));
    if (!touched.cardDiscountRate) setCardDiscountRateCfg(Number(pricing.card_discount_rate ?? 6));
    if (!touched.cardInstallments) setCardInstallmentsCfg(Number(pricing.card_installments ?? 10));
  }, [open, pricing, quote]);

  // ── Reset wizard nav on open/close + reset draft id ──
  useEffect(() => {
    if (!open) {
      setStep(0);
      setMaxStepReached(0);
      setDraftQuoteId(null);
      // Limpa os itens ao fechar pra que a próxima abertura (novo/retomar) não
      // herde itens da sessão anterior. O effect de populate/reset repovoa
      // corretamente quando o diálogo reabre (edição ou novo).
      setItems([]);
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
      setUseBdi(quote.use_bdi !== false);
      setDistanceKm(Number(quote.distance_km ?? 0));
      const storedDisplacement = Number(quote.displacement_cost ?? 0);
      const baseDisplacement = Number(quote.distance_km ?? 0) * Number(quote.km_cost ?? 0);
      const storedBdi = Number(quote.bdi ?? 0);
      const automaticDisplacement = storedBdi > 0.01 ? baseDisplacement / storedBdi : baseDisplacement;
      const isManualDisplacement = quote.use_bdi === false || Math.abs(storedDisplacement - automaticDisplacement) > 0.01;
      setDisplacementPricingMode(isManualDisplacement ? 'manual' : 'cost_bdi');
      setManualDisplacementPrice(storedDisplacement);
      setDiscountType((quote.discount_type as 'valor' | 'percentual') ?? 'valor');
      setDiscountValue(Number(quote.discount_value ?? 0));
      setIncludeGifts(quote.include_gifts !== false);
      setShowLaborCostInProposal(quote.show_labor_cost_in_proposal === true);
      setShowInputsCostInProposal(quote.show_inputs_cost_in_proposal === true);
      setValidUntil(quote.valid_until ?? '');
      setProposalTemplateId(quote.proposal_template_id ?? '');
      setNotes(quote.notes ?? '');
      setTerms(quote.terms ?? '');
      setReceivableInstallments(Number(quote.receivable_installments ?? 1));
      setReceivableFirstDueDate(quote.receivable_first_due_date ?? '');
      setItems(
        (quote.quote_items ?? []).map(qi => {
          const inventory = qi.inventory_id ? inventoryItems.find(item => item.id === qi.inventory_id) : null;
          const serviceType = qi.service_type_id ? serviceTypes.find(item => item.id === qi.service_type_id) : null;
          const registeredPrice = Number(inventory?.sale_price ?? inventory?.cost_price ?? 0);
          const registeredServicePrice = Number(serviceType?.default_price ?? 0);
          const pricingMode: ItemPricingMode = qi.item_type === 'material'
            ? qi.price_override == null && quote.use_bdi !== false
              ? 'cost_bdi'
              : inventory && Math.abs(Number(qi.unit_price) - registeredPrice) < 0.01
                ? 'registered'
                : 'manual'
            : qi.price_override == null && quote.use_bdi !== false
              ? 'cost_bdi'
              : serviceType?.default_price != null && Math.abs(Number(qi.unit_price) - registeredServicePrice) < 0.01
                ? 'registered'
                : 'manual';
          return ({
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
          pricing_mode: (qi.pricing_mode as ItemPricingMode | undefined) ?? pricingMode,
          cost_composition: qi.cost_composition
            ? createQuoteCostComposition(qi.cost_composition)
            : createQuoteCostComposition({
                labor: { hourlyRate: Number(qi.unit_hourly_rate ?? 0), hours: Number(qi.unit_hours ?? 0) },
                supplies: Number(qi.unit_materials_cost ?? 0) > 0
                  ? [{ id: crypto.randomUUID(), label: 'Insumos cadastrados', quantity: 1, unitCost: Number(qi.unit_materials_cost ?? 0) }]
                  : [],
                resources: Number(qi.unit_extras_cost ?? 0) > 0
                  ? [{ id: crypto.randomUUID(), label: 'Recursos e extras cadastrados', quantity: 1, unitCost: Number(qi.unit_extras_cost ?? 0) }]
                  : [],
              }),
          service_color: qi.item_type === 'servico' ? (serviceType?.color ?? '#18181b') : undefined,
        });})
      );
    } else if (!isEditing && draft.hasDraft && draft.draftData) {
      // O usuário escolhe retomar o preenchimento pelo aviso flutuante.
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

  // ── Auto-recalculate service prices when BDI rates change ──
  useEffect(() => {
    if (!useBdi || items.length === 0) return;
    setItems(prev => prev.map(it => {
      if (it.pricing_mode !== 'cost_bdi') return it;
      const newUnitPrice = calculateItemPrice({
        mode: 'cost_bdi',
        registeredPrice: 0,
        unitCost: it.unit_total_cost,
        bdiFactor,
        manualPrice: it.unit_price,
      });
      return {
        ...it,
        unit_price: newUnitPrice,
        total_price: Math.round(newUnitPrice * it.quantity * 100) / 100,
        bdi: bdiFactor,
        price_override: null,
      };
    }));
  }, [bdiFactor, useBdi]);

  // ── Add service handler ──
  // Núcleo reutilizável: busca custos do serviço e empurra o item na lista.
  // Usado tanto pelo botão "Adicionar" (id selecionado) quanto pelo criar-na-hora
  // (serviço recém-criado, ainda pode não estar na lista de serviceTypes do cache).
  const addServiceById = useCallback(async (
    serviceId: string,
    qty: number,
    override?: { name?: string; description?: string | null; default_price?: number | null; color?: string | null },
  ) => {
    setIsFetchingSvc(true);
    const st = serviceTypes.find(s => s.id === serviceId);
    const companyId = profile?.company_id;
    let laborCost = 0, matsCost = 0, quoteExtrasCost = 0, hourlyRate = 0, hours = 0;
    let registeredComposition: Pick<QuoteCostComposition, 'supplies' | 'resources'> | null = null;

    if (companyId) {
      try {
        const breakdown = await fetchServiceCostBreakdown(queryClient, companyId, serviceId);
        hourlyRate = breakdown.hourlyRate;
        hours = breakdown.hours;
        laborCost = breakdown.laborCost;
        matsCost = breakdown.materialsCost;
        quoteExtrasCost = breakdown.quoteExtrasCost;
        registeredComposition = breakdown.composition;
      } catch (err) {
        console.error('Erro ao buscar custos do serviço:', err);
      }
    }

    const unitTotalCost = laborCost + matsCost + quoteExtrasCost;
    const costComposition = createQuoteCostComposition({
      labor: { hourlyRate, hours },
      supplies: registeredComposition?.supplies ?? (matsCost > 0
        ? [{ id: crypto.randomUUID(), label: 'Insumos cadastrados', quantity: 1, unitCost: matsCost }]
        : []),
      resources: registeredComposition?.resources ?? (quoteExtrasCost > 0
        ? [{ id: crypto.randomUUID(), label: 'Recursos e extras cadastrados', quantity: 1, unitCost: quoteExtrasCost }]
        : []),
    });

    // Regra de precedência do preço sugerido:
    // 1) Calculadora configurada (unitTotalCost > 0) → preço pelo BDI (fonte preferida).
    // 2) Sem calculadora mas serviço tem default_price → usa o preço padrão cadastrado.
    // 3) Nenhum dos dois → 0 (usuário preenche manualmente, sem regressão).
    const hasCalculatorPrice = unitTotalCost > 0;
    const defaultPrice = override?.default_price ?? st?.default_price ?? null;
    const unitPrice = useBdi && hasCalculatorPrice
      ? (bdiFactor > 0.01 ? Math.round((unitTotalCost / bdiFactor) * 100) / 100 : unitTotalCost)
      : (defaultPrice != null ? Math.round(Number(defaultPrice) * 100) / 100 : 0);

    // Se o preço veio do default_price (não da calculadora), marca como override
    // para o useEffect de recálculo de BDI não sobrescrever com unitTotalCost/bdiFactor = 0.
    const pricingMode: ItemPricingMode = useBdi && hasCalculatorPrice
      ? 'cost_bdi'
      : defaultPrice != null
        ? 'registered'
        : 'manual';
    const priceOverride = pricingMode === 'cost_bdi' ? null : unitPrice;

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
      // O schema do orçamento agrega extras manuais, recursos e brindes neste
      // campo; o valor vem da mesma decomposição canônica usada no Resumo.
      unit_extras_cost: quoteExtrasCost,
      profit_rate: profitRate,
      bdi: bdiFactor,
      price_override: priceOverride,
      pricing_mode: pricingMode,
      cost_composition: costComposition,
      save_costs_to_catalog: override != null,
      service_color: override?.color ?? st?.color ?? '#18181b',
    }]);
    setIsFetchingSvc(false);
  }, [serviceTypes, profile, queryClient, bdiFactor, profitRate, tq.serviceFallback, useBdi]);

  // Botão "Adicionar": usa o serviço selecionado no seletor.
  const handleAddService = useCallback(async () => {
    if (!addSvcId) return;
    await addServiceById(addSvcId, addSvcQty);
    setAddSvcId('');
    setAddSvcQty(1);
    setServicePickerOpen(false);
  }, [addSvcId, addSvcQty, addServiceById]);

  // ── Criar tipo de serviço na hora (botão "+" do seletor) ──
  // Abre o `QuickServiceTypeDialog` (mesmo quick-create de OS) pré-preenchido
  // com o texto digitado na busca; ao criar, o serviço já entra no orçamento
  // com a quantidade atual. Preço/qtd seguem editáveis inline.
  const handleServiceTypeCreated = useCallback(async (created: { id: string; name: string; color?: string | null }) => {
    setServiceFormOpen(false);
    setServicePickerOpen(false);
    setIsFetchingSvc(true);
    try {
      // Serviço novo não tem custos cadastrados → cai no fluxo preço 0/editável.
      await addServiceById(created.id, addSvcQty, { name: created.name, description: null, color: created.color });
    } finally {
      setAddSvcId('');
      setAddSvcQty(1);
      setIsFetchingSvc(false);
    }
  }, [addSvcQty, addServiceById]);

  const handleLocalServiceCreated = useCallback((created: { name: string; color: string }) => {
    const costComposition = createQuoteCostComposition();
    setItems(previous => [...previous, {
      item_type: 'servico',
      description: created.name,
      details: '',
      quantity: addSvcQty,
      unit_total_cost: 0,
      unit_price: 0,
      total_price: 0,
      service_type_id: null,
      inventory_id: null,
      unit_hourly_rate: 0,
      unit_hours: 0,
      unit_labor_cost: 0,
      unit_materials_cost: 0,
      unit_extras_cost: 0,
      profit_rate: profitRate,
      bdi: bdiFactor,
      price_override: null,
      pricing_mode: 'manual',
      cost_composition: costComposition,
      save_costs_to_catalog: false,
      service_color: created.color,
    }]);
    setServiceFormOpen(false);
    setServicePickerOpen(false);
    setAddSvcId('');
    setAddSvcQty(1);
  }, [addSvcQty, bdiFactor, profitRate]);

  // ── Add materials handler (lote) ──
  // Recebe a seleção inteira do `MaterialBatchPicker` e adiciona TODOS de uma
  // vez, num único `setItems`. Cada item passa pela MESMA `buildMaterialItem`
  // pura que o fluxo antigo usava (prova de não-regressão de preço/BDI).
  const handleAddMaterialsBatch = useCallback((selections: MaterialBatchSelection[]) => {
    const newItems = selections
      .map((sel) =>
        buildMaterialItem({
          inv: sel.inventoryId ? inventoryItems.find((i) => i.id === sel.inventoryId) : null,
          manualName: sel.manualName,
          manualCost: sel.unitCost,
          manualPrice: sel.unitPrice,
          quantity: sel.quantity,
          profitRate,
          bdiFactor,
        }),
      )
      .filter((it): it is FormQuoteItem => it != null);
    if (newItems.length === 0) return;
    setItems(prev => [...prev, ...newItems]);
  }, [inventoryItems, profitRate, bdiFactor]);

  // ── Item price update ──
  const updateItemPrice = (idx: number, newPrice: number) => {
    setItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, unit_price: newPrice, total_price: Math.round(newPrice * it.quantity * 100) / 100, price_override: newPrice, pricing_mode: 'manual' } : it
    ));
  };

  // ── Item quantity update ──
  // Quantidade vale pra QUALQUER tipo (serviço, mão de obra, material). Recalcula
  // total_price = unit_price × quantity. O unit_price e o modo de precificação
  // ficam intactos: quantidade não transforma uma linha automática em manual.
  const updateItemQty = (idx: number, newQty: number) => {
    // Decimal liberado (não mais `Math.floor` com piso 1): material vendido
    // fracionado (2,5 m de tubo, 0,5 kg de gás) precisa de casa decimal.
    // O 0 é aceito porque é estado TRANSITÓRIO de digitação — apagar o campo
    // pra redigitar não pode travar o input num piso. Quem restaura o piso é
    // o `QuantityField` ao sair do foco (e o submit, como rede de segurança).
    const qty = Math.max(0, Math.round((newQty || 0) * 100) / 100);
    setItems(prev => prev.map((it, i) =>
      i === idx
        ? {
            ...it,
            quantity: qty,
            total_price: Math.round(it.unit_price * qty * 100) / 100,
          }
        : it
    ));
  };

  // ── Item details update (descrição secundária, opcional) ──
  const updateItemDetails = (idx: number, newDetails: string) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, details: newDetails } : it));
  };

  const updateServiceCostComposition = (idx: number, composition: QuoteCostComposition, saveAsCatalogDefault: boolean) => {
    const totals = getQuoteCostCompositionTotals(composition);
    setItems(previous => previous.map((item, itemIdx) => {
      if (itemIdx !== idx) return item;
      const nextUnitPrice = item.pricing_mode === 'cost_bdi'
        ? calculateItemPrice({
            mode: 'cost_bdi',
            registeredPrice: 0,
            unitCost: totals.total,
            bdiFactor,
            manualPrice: item.unit_price,
          })
        : item.unit_price;
      return {
        ...item,
        unit_hourly_rate: composition.labor.hourlyRate,
        unit_hours: composition.labor.hours,
        unit_labor_cost: totals.labor,
        unit_materials_cost: totals.supplies,
        unit_extras_cost: totals.resources,
        unit_total_cost: totals.total,
        unit_price: nextUnitPrice,
        total_price: round2(nextUnitPrice * item.quantity),
        cost_composition: composition,
        save_costs_to_catalog: saveAsCatalogDefault,
      };
    }));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const updateItemPricingMode = (idx: number, mode: ItemPricingMode) => {
    setItems(prev => prev.map((item, itemIdx) => {
      if (itemIdx !== idx) return item;
      const inventory = item.inventory_id ? inventoryItems.find(inv => inv.id === item.inventory_id) : null;
      const serviceType = item.service_type_id ? serviceTypes.find(service => service.id === item.service_type_id) : null;
      const unitPrice = calculateItemPrice({
        mode,
        registeredPrice: Number(
          item.item_type === 'servico'
            ? serviceType?.default_price ?? item.unit_price
            : inventory?.sale_price ?? inventory?.cost_price ?? item.unit_price,
        ),
        unitCost: item.unit_total_cost,
        bdiFactor,
        manualPrice: item.unit_price,
      });
      return {
        ...item,
        pricing_mode: mode,
        unit_price: unitPrice,
        total_price: round2(unitPrice * item.quantity),
        price_override: mode === 'cost_bdi' ? null : unitPrice,
        bdi: bdiFactor,
      };
    }));
  };

  const restoreAutomaticPrice = (idx: number) => updateItemPricingMode(idx, 'cost_bdi');

  const handleUseBdiChange = (enabled: boolean) => {
    setUseBdi(enabled);
    if (!enabled) {
      setItems(prev => prev.map(item => ({
        ...item,
        pricing_mode: item.pricing_mode === 'cost_bdi' ? 'manual' : item.pricing_mode,
        price_override: item.pricing_mode === 'cost_bdi' ? item.unit_price : item.price_override,
      })));
      setDisplacementPricingMode('manual');
      setManualDisplacementPrice(displacementSalePrice);
    }
  };

  const applyBdiToItemsWithCost = () => {
    setItems(prev => prev.map(item => {
      if (item.unit_total_cost <= 0) return item;
      const unitPrice = calculateItemPrice({
        mode: 'cost_bdi',
        registeredPrice: 0,
        unitCost: item.unit_total_cost,
        bdiFactor,
        manualPrice: item.unit_price,
      });
      return {
        ...item,
        pricing_mode: 'cost_bdi',
        unit_price: unitPrice,
        total_price: round2(unitPrice * item.quantity),
        price_override: null,
        bdi: bdiFactor,
      };
    }));
  };

  // ── Totals ──
  const totalItemsPrice = items.reduce((s, i) => s + i.total_price, 0);
  const displacementSuggestedPrice = round2(
    bdiFactor > 0.01 ? bdi.displacementCost / bdiFactor : bdi.displacementCost,
  );
  const displacementSalePrice = displacementPricingMode === 'manual'
    ? manualDisplacementPrice
    : displacementSuggestedPrice;
  const mixedPricing = calculateMixedQuotePricing({
    items,
    useBdi,
    bdiFactor,
    displacementMode: displacementPricingMode,
    displacementCost: bdi.displacementCost,
    displacementPrice: displacementSalePrice,
  });
  const bdiWarning = bdiFactor < 0.20;
  const bdiDanger = bdiFactor < 0.05 || (
    mixedPricing.automaticPrice > 0 && mixedPricing.automaticPrice < mixedPricing.automaticCost
  );
  const { discountAmount, finalTotal } = calculateQuoteCommercialTotal({
    itemsTotal: totalItemsPrice,
    displacementCost: displacementSalePrice,
    discountType,
    discountValue,
  });

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
    displacement_cost: displacementSalePrice,
    bdi: bdiFactor,
    use_bdi: useBdi,
    total_cost: mixedPricing.totalKnownCost,
    total_price: mixedPricing.suggestedPrice,
    valid_until: validUntil || undefined,
    receivable_installments: receivableInstallments,
    // null (não undefined/''): precisa chegar explicitamente no UPDATE pra
    // limpar a data quando o usuário apaga o campo (voltando ao default
    // "vence na aprovação"). Coluna date do Postgres rejeita string vazia.
    receivable_first_due_date: receivableFirstDueDate || null,
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
    show_labor_cost_in_proposal: showLaborCostInProposal,
    show_inputs_cost_in_proposal: showInputsCostInProposal,
    // Rede de segurança pra quantidade: o campo aceita 0 como estado
    // TRANSITÓRIO de digitação (apagar pra redigitar) e o `QuantityField`
    // restaura o piso 1 ao sair do foco. Se alguém salvar sem tirar o foco do
    // campo vazio, aqui garantimos que nenhuma linha vai pro banco com
    // quantidade 0 (o que zeraria o valor da linha silenciosamente).
    items: items.map((it, idx) => {
      const quantity = it.quantity > 0 ? it.quantity : 1;
      const total_price = it.quantity > 0 ? it.total_price : Math.round(it.unit_price * 100) / 100;
      return {
      id: it.id,
      position: idx,
      item_type: it.item_type,
      description: it.description,
      details: it.details?.trim() ? it.details.trim() : null,
      quantity,
      unit_price: it.unit_price,
      total_price,
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
      pricing_mode: it.pricing_mode,
      cost_composition: it.cost_composition ?? null,
      };
    }),
  });

  const finishSavedQuote = async () => {
    const snapshots = items
      .filter(item => item.save_costs_to_catalog && item.service_type_id && item.cost_composition)
      .map(item => ({ serviceId: item.service_type_id!, composition: item.cost_composition! }));
    if (snapshots.length > 0) {
      try {
        await saveQuoteServiceCosts.mutateAsync(snapshots);
        toast({ title: snapshots.length === 1 ? 'Padrão do serviço atualizado.' : 'Padrões dos serviços atualizados.' });
      } catch {
        toast({
          variant: 'destructive',
          title: 'Orçamento salvo, mas o padrão do serviço não foi atualizado',
          description: 'O orçamento manteve os valores informados. Tente atualizar o cadastro do serviço novamente.',
        });
      }
    }
    draft.clearDraft();
    onOpenChange(false);
  };

  // ── Submit (finaliza: cria/atualiza com validação completa) ──
  const handleSubmit = () => {
    const hasCustomer = customerMode === 'existing' ? !!customerId : !!prospectName;
    if (!hasCustomer || items.length === 0) return;

    const payload = buildPayload();

    // Se estiver editando, ou se já existe um rascunho persistido pra esta sessão,
    // atualiza a MESMA linha — nunca duplica.
    const targetId = quote?.id ?? draftQuoteId;
    if (targetId) {
      updateQuote.mutate({ ...payload, id: targetId }, { onSuccess: () => { void finishSavedQuote(); } });
    } else {
      createQuote.mutate(payload, { onSuccess: () => { void finishSavedQuote(); } });
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
        onSuccess: () => { setSavingDraft(false); void finishSavedQuote(); },
        onError: () => setSavingDraft(false),
      });
    } else {
      createQuote.mutate(payload, {
        onSuccess: (created: { id?: string | null }) => {
          if (created?.id) setDraftQuoteId(created.id);
          setSavingDraft(false);
          void finishSavedQuote();
        },
        onError: () => setSavingDraft(false),
      });
    }
  };

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

  // Top 5 materiais mais usados pelo tenant — alimenta o grupo "Mais usados"
  // do `MaterialBatchPicker` (mesma fonte que o antigo `inventoryGroups` usava).
  const materialFrequentIds = useMemo(() => {
    const all = inventoryItems ?? [];
    return [...usageFreq.inv.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .filter(id => all.some(i => i.id === id))
      .slice(0, 5);
  }, [inventoryItems, usageFreq.inv]);

  const hasAnyService = activeServices.length > 0;

  const serviceItems = items.filter(i => i.item_type === 'servico');
  const materialItems = items.filter(i => i.item_type === 'material');
  const hasCustomer = customerMode === 'existing' ? !!customerId : !!prospectName;
  const laborCost = items.reduce((sum, item) => sum + item.unit_labor_cost * item.quantity, 0);
  const resourcesCost = items.reduce((sum, item) => sum + item.unit_extras_cost * item.quantity, 0);
  const inputsCost = serviceItems.reduce((sum, item) => sum + item.unit_materials_cost * item.quantity, 0);
  const materialsCost = materialItems.reduce((sum, item) => sum + item.unit_total_cost * item.quantity, 0);
  const selectedTemplate = templates.find(template => template.id === proposalTemplateId);
  const selectedCustomer = customerMode === 'existing'
    ? customers?.find(customer => customer.id === customerId)
    : null;
  const previewItems = items.map(({ save_costs_to_catalog: _saveCatalog, ...item }, position) => ({ ...item, position }));
  const previewQuote: Quote = {
    id: quote?.id ?? 'preview',
    quote_number: quote?.quote_number ?? 0,
    customer_id: customerMode === 'existing' ? customerId || null : null,
    prospect_name: customerMode === 'prospect' ? prospectName || null : null,
    prospect_phone: customerMode === 'prospect' ? prospectPhone || null : null,
    prospect_email: customerMode === 'prospect' ? prospectEmail || null : null,
    status: quote?.status ?? 'rascunho',
    valid_until: validUntil || null,
    receivable_installments: receivableInstallments,
    receivable_first_due_date: receivableFirstDueDate || null,
    discount_type: discountType,
    discount_value: discountValue,
    subtotal: totalItemsPrice,
    discount_amount: discountAmount,
    total_value: finalTotal,
    notes: notes || null,
    terms: terms || null,
    assigned_to: quote?.assigned_to ?? null,
    proposal_template_id: proposalTemplateId || null,
    token: quote?.token ?? 'preview',
    created_by: quote?.created_by ?? null,
    created_at: quote?.created_at ?? new Date().toISOString(),
    updated_at: quote?.updated_at ?? new Date().toISOString(),
    converted_to_os_id: quote?.converted_to_os_id ?? null,
    final_price: finalTotal,
    tax_rate: taxRate,
    admin_indirect_rate: adminRate,
    profit_rate: profitRate,
    km_cost: kmCostCfg,
    distance_km: distanceKm,
    displacement_cost: displacementSalePrice,
    bdi: bdiFactor,
    use_bdi: useBdi,
    total_cost: mixedPricing.totalKnownCost,
    total_price: mixedPricing.suggestedPrice,
    include_gifts: includeGifts,
    card_discount_rate: cardDiscountRateCfg,
    card_installments: cardInstallmentsCfg,
    show_labor_cost_in_proposal: showLaborCostInProposal,
    show_inputs_cost_in_proposal: showInputsCostInProposal,
    customers: customerMode === 'existing'
      ? ((selectedCustomer ?? quote?.customers) as Quote['customers'])
      : undefined,
    quote_items: previewItems,
    proposal_templates: selectedTemplate ? { slug: selectedTemplate.slug, name: selectedTemplate.name } : null,
  };

  // ── Wizard gating ──
  const canNext = () => {
    switch (currentStepKey) {
      case 'recipient':
        return hasCustomer;
      case 'materials':
        return items.length > 0;
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

  const advanceWithValidation = () => {
    if (canNext()) {
      setNavigationMessage('');
      setStep(current => Math.min(STEPS.length - 1, current + 1));
      return;
    }

    const missingRecipient = currentStepKey === 'recipient' && !hasCustomer;
    setNavigationMessage(
      missingRecipient
        ? 'Selecione um cliente ou informe o nome do prospecto para continuar.'
        : 'Adicione ao menos um serviço ou material para continuar.',
    );
    requestAnimationFrame(() => {
      const container = missingRecipient ? recipientSectionRef.current : itemsSectionRef.current;
      container?.querySelector<HTMLElement>('input, button, [role="combobox"]')?.focus();
    });
  };

  const mutating = createQuote.isPending || updateQuote.isPending || saveQuoteServiceCosts.isPending;

  const displacementBlock = (
    <section id="quote-displacement" className="space-y-4">
      <h3 className="text-xl font-semibold sm:text-2xl">{tq.displacementHeader}</h3>
      <p className="text-sm text-muted-foreground">Defina a distância, seu custo por quilômetro e como o deslocamento será cobrado.</p>
      <div className="grid gap-5 border-y py-5 sm:grid-cols-2 sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="quote-distance-km" className="text-sm font-semibold text-foreground">Distância (km)</Label>
          <NumericInput id="quote-distance-km" value={distanceKm ? String(distanceKm) : ''}
            onValueChange={v => setDistanceKm(Number(v) || 0)}
            className="h-11 text-base" placeholder={tq.displacementPlaceholder} />
        </div>
        <BdiField label={tq.bdiKmCost} prefix={currencySymbol} value={kmCostCfg} onChange={value => {
          pricingTouchedRef.current.kmCost = true;
          setKmCostCfg(value);
        }} step={0.01} />
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-foreground">Modalidade</Label>
          <Select
            value={displacementPricingMode}
            onValueChange={value => {
              const mode = value === 'manual' ? 'manual' : 'cost_bdi';
              setDisplacementPricingMode(mode);
              if (mode === 'manual') setManualDisplacementPrice(displacementSalePrice);
            }}
          >
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cost_bdi" disabled={!useBdi}>Custo + BDI</SelectItem>
              <SelectItem value="manual">Valor manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <BdiField label="Preço cobrado" prefix={currencySymbol} value={displacementSalePrice}
          disabled={displacementPricingMode !== 'manual'} onChange={setManualDisplacementPrice} step={0.01} />
      </div>
      <p className="text-xs text-muted-foreground">
        Custo {fmt(bdi.displacementCost)} · Preço resultante {fmt(displacementSalePrice)}
      </p>
      {displacementPricingMode === 'manual' && (
        <p className="text-xs text-warning">Valor manual: o deslocamento saiu da precificação automática estrita.</p>
      )}
    </section>
  );

  const proposalConditionsBlock = (
    <section className={cn('space-y-4 border-t pt-6', !useBdi && 'lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0')}>
      <div><h3 className="text-xl font-semibold sm:text-2xl">Condições da proposta</h3><p className="mt-1 text-sm text-muted-foreground">Desconto à vista e parcelamento exibidos ao cliente.</p></div>
      <div className="grid grid-cols-2 gap-3">
        <BdiField label={tq.bdiCashDiscount} suffix="%" value={cardDiscountRateCfg} onChange={value => {
          pricingTouchedRef.current.cardDiscountRate = true;
          setCardDiscountRateCfg(value);
        }} />
        <BdiField label={tq.bdiInstallments} value={cardInstallmentsCfg} onChange={value => {
          pricingTouchedRef.current.cardInstallments = true;
          setCardInstallmentsCfg(Math.max(1, value));
        }} step={1} min={1} />
      </div>
    </section>
  );

  const bdiConfigBlock = (
    <section className="space-y-6">
      <SectionHeader icon={<Calculator className="h-4 w-4 text-primary" />} title="Como formar o preço?" />
      <div role="group" aria-label="Modo de formação do preço" className="grid gap-3 sm:grid-cols-2">
        <button type="button" id="quote-use-bdi" aria-pressed={useBdi} onClick={() => handleUseBdiChange(true)}
          className={cn('min-h-24 rounded-xl border px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', useBdi ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary')}>
          <span className="block text-lg font-semibold">Calcular com BDI</span>
          <span className={cn('mt-1 block text-sm leading-relaxed', useBdi ? 'text-primary-foreground/80' : 'text-muted-foreground')}>Impostos, administração e lucro sobre os custos.</span>
        </button>
        <button type="button" id="quote-manual-pricing" aria-pressed={!useBdi} onClick={() => handleUseBdiChange(false)}
          className={cn('min-h-24 rounded-xl border px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !useBdi ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary')}>
          <span className="block text-lg font-semibold">Preço cadastrado ou manual</span>
          <span className={cn('mt-1 block text-sm leading-relaxed', !useBdi ? 'text-primary-foreground/80' : 'text-muted-foreground')}>Mantém os preços dos itens, sem recálculo automático.</span>
        </button>
      </div>
      <div className={cn('grid gap-7 lg:items-start', useBdi && 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]')}>
        <div>
          {useBdi ? (
            <div id="quote-bdi-advanced" className="space-y-5">
              <QuoteBdiComposer
                totalCost={mixedPricing.automaticCost}
                finalPrice={mixedPricing.automaticPrice}
                bdiFactor={bdiFactor}
                taxRate={taxRate}
                adminRate={adminRate}
                profitRate={profitRate}
                formatMoney={fmt}
                formatRate={fmtRate}
                onTaxChange={value => { pricingTouchedRef.current.taxRate = true; setTaxRate(value); }}
                onAdminChange={value => { pricingTouchedRef.current.adminRate = true; setAdminRate(value); }}
                onProfitChange={value => { pricingTouchedRef.current.profitRate = true; setProfitRate(value); }}
              />
              {items.some(item => item.pricing_mode === 'manual' && item.unit_total_cost > 0) && (
                <div className="space-y-3 border-t pt-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">Itens com preço manual mantêm o valor atual até você optar por recalculá-los.</p>
                  <Button type="button" variant="outline" onClick={applyBdiToItemsWithCost}>Aplicar BDI aos itens com custo</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-3xl space-y-3 py-2">
              <h3 className="text-xl font-semibold">Preços definidos nos itens</h3>
              <p className="text-base leading-relaxed text-muted-foreground">Os valores atuais são preservados, inclusive os que foram calculados com BDI. Para usar o preço cadastrado, selecione essa modalidade no item.</p>
            </div>
          )}
        </div>
        <div className={cn('space-y-6 rounded-2xl bg-muted/30 p-4 sm:p-5', !useBdi && 'lg:grid lg:grid-cols-2 lg:gap-8 lg:space-y-0')}>
          {displacementBlock}
          {proposalConditionsBlock}
        </div>
      </div>
    </section>
  );

  // ─── Reusable summary block (review step) ───────────────────────────────────
  const summaryBlock = (
    <section className="space-y-3">
      {useBdi && bdiDanger && (
        <NoticeBanner variant="destructive" icon={AlertTriangle}>
          {tq.bdiAlertDanger}
        </NoticeBanner>
      )}
      {useBdi && bdiWarning && !bdiDanger && (
        <NoticeBanner variant="warning" icon={AlertTriangle}>
          {tq.bdiAlertWarning}
        </NoticeBanner>
      )}
      <QuotePricingSummary
        useBdi={useBdi}
        currency={currency}
        locale={locale}
        tone={currentStepKey === 'review' ? 'contrast' : 'default'}
        className={currentStepKey !== 'review' ? 'xl:rounded-none xl:border-0 xl:p-0' : undefined}
        data={{
          laborCost,
          resourcesCost,
          inputsCost,
          materialsCost,
          displacementCost: bdi.displacementCost,
          suggestedPrice: mixedPricing.suggestedPrice,
          practicedPrice: totalItemsPrice + displacementSalePrice,
          discountAmount,
          cashDiscountRate: cardDiscountRateCfg,
          installments: cardInstallmentsCfg,
        }}
      />
    </section>
  );
  const quoteReviewItems = [
    {
      key: 'recipient',
      label: 'Destinatário',
      detail: hasCustomer
        ? (customerMode === 'existing' ? selectedCustomer?.name ?? 'Cliente selecionado' : prospectName)
        : 'Selecione um cliente ou informe o prospecto.',
      complete: hasCustomer,
      stepIndex: 0,
    },
    {
      key: 'services',
      label: 'Serviços e custos',
      detail: serviceItems.length > 0
        ? `${serviceItems.length} ${serviceItems.length === 1 ? 'serviço configurado' : 'serviços configurados'}.`
        : 'Nenhum serviço adicionado; o orçamento pode conter apenas materiais.',
      complete: serviceItems.length > 0,
      stepIndex: 1,
    },
    {
      key: 'materials',
      label: 'Materiais',
      detail: materialItems.length > 0
        ? `${materialItems.length} ${materialItems.length === 1 ? 'material externo adicionado' : 'materiais externos adicionados'}.`
        : 'Sem materiais cobrados por fora.',
      complete: items.length > 0,
      stepIndex: 2,
    },
    {
      key: 'commercial',
      label: 'Condições comerciais',
      detail: 'Desconto, pagamentos e observações revisados.',
      complete: maxStepReached >= 3,
      stepIndex: 3,
    },
    {
      key: 'template',
      label: 'Proposta',
      detail: selectedTemplate ? `Template ${selectedTemplate.name} selecionado.` : 'Selecione o template da proposta.',
      complete: !!selectedTemplate,
      stepIndex: 4,
    },
  ];

  // ─── Wizard content (stepper + steps) ───────────────────────────────────────
  const wizardContent = (
    <div ref={wizardContentRef} className="flex min-h-full flex-col">
      <FormWizardStepper
        steps={STEPS}
        currentIndex={step}
        maxReachedIndex={Math.min(STEPS.length - 1, Math.max(maxStepReached, canNext() ? step + 1 : step))}
        onStepChange={goToStep}
        ariaLabel="Etapas do orçamento"
        tone="contrast"
        className="sticky top-0 z-20 -mx-4 border-b bg-background px-4 pb-4 pt-4 sm:-mx-10 sm:px-10 sm:pt-6"
      />

      {/* Content */}
      <div className={cn(
        'mx-auto mt-8 w-full max-w-[92rem] flex-1',
        currentStepKey === 'review' && 'mt-5',
        step > 0 && currentStepKey !== 'review' && 'xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-10',
      )}>
        <StepTransition
          stepKey={currentStepKey}
          index={step}
          className="space-y-7 text-[15px] sm:space-y-9 [&_input]:min-h-11 [&_input]:text-base [&_textarea]:text-base [&_[role=combobox]]:min-h-11"
        >

          {/* ══ STEP 1: CLIENTE ══ */}
          {currentStepKey === 'recipient' && (
            <section ref={recipientSectionRef} className="space-y-7">
              <SectionHeader icon={<User className="h-4 w-4 text-primary" />} title={tq.recipientHeader} />
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12 xl:gap-20">
              <div className="space-y-6">
              <div role="group" aria-label="Tipo de destinatário" className="grid max-w-md grid-cols-2 gap-2 rounded-xl bg-muted/50 p-1">
                <button type="button" aria-pressed={customerMode === 'existing'} onClick={() => setCustomerMode('existing')} className={cn('min-h-12 rounded-lg px-3 text-sm font-semibold transition-colors', customerMode === 'existing' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{tq.recipientExisting}</button>
                <button type="button" aria-pressed={customerMode === 'prospect'} onClick={() => setCustomerMode('prospect')} className={cn('min-h-12 rounded-lg px-3 text-sm font-semibold transition-colors', customerMode === 'prospect' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{tq.recipientProspect}</button>
              </div>
              <div className="grid gap-5">
                {customerMode === 'existing' ? (
                  <div className="space-y-3">
                    <Label htmlFor="quote-customer" className="text-base font-semibold text-foreground">{tq.recipientCustomerLabel}</Label>
                    <CustomerSelectField
                      id="quote-customer"
                      variant="large"
                      customers={customers ?? []}
                      value={customerId}
                      onValueChange={value => { startNewDraftIfNeeded({ customerId: value }); setCustomerId(value); }}
                      placeholder={tq.recipientCustomerPlaceholder}
                    />
                    <p className="text-sm leading-relaxed text-muted-foreground">Busque por nome, documento ou contato. Use o botão + para cadastrar um cliente.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold text-foreground">{tq.recipientNameLabel}</Label>
                    <Input placeholder={tq.recipientNamePlaceholder} value={prospectName} onChange={e => { startNewDraftIfNeeded({ prospectName: e.target.value }); setProspectName(e.target.value); }} />
                  </div>
                )}
              </div>
              {customerMode === 'prospect' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold text-foreground">{tq.recipientPhoneLabel}</Label>
                    <Input placeholder={tq.recipientPhonePlaceholder} value={prospectPhone} onChange={e => { startNewDraftIfNeeded({ prospectPhone: e.target.value }); setProspectPhone(e.target.value); }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold text-foreground">{tq.recipientEmailLabel}</Label>
                    <Input type="email" placeholder={tq.recipientEmailPlaceholder} value={prospectEmail} onChange={e => { startNewDraftIfNeeded({ prospectEmail: e.target.value }); setProspectEmail(e.target.value); }} />
                  </div>
                </div>
              )}
              </div>
              <QuoteRecipientSummary
                customer={customerMode === 'existing' ? customers?.find(customer => customer.id === customerId) : undefined}
                prospect={customerMode === 'prospect' ? { name: prospectName, phone: prospectPhone, email: prospectEmail } : undefined}
              />
              </div>
            </section>
          )}

          {/* ══ STEP 2: SERVIÇOS E COMPOSIÇÃO DE CUSTOS ══ */}
          {currentStepKey === 'services' && (
            <div className="space-y-6">
              <section ref={itemsSectionRef} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SectionHeader icon={<Wrench className="h-4 w-4 text-primary" />} title={tq.servicesHeader} />
                  {serviceItems.length > 0 && <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
                    <span className="text-sm text-muted-foreground">{serviceItems.length} {serviceItems.length === 1 ? 'serviço' : 'serviços'}</span>
                    <Button type="button" className="h-11 bg-primary px-5 text-primary-foreground hover:bg-primary/90" onClick={() => setServicePickerOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" /> Adicionar serviço
                    </Button>
                  </div>}
                </div>

                {serviceItems.length > 0 ? (
                  <ServiceItemsList
                    items={serviceItems}
                    allItems={items}
                    onUpdatePrice={updateItemPrice}
                    onUpdateQty={updateItemQty}
                    onUpdateDetails={updateItemDetails}
                    onRestoreAutomatic={restoreAutomaticPrice}
                    onUpdatePricingMode={updateItemPricingMode}
                    canUseRegisteredPrice={item => {
                      const service = item.service_type_id
                        ? serviceTypes.find(candidate => candidate.id === item.service_type_id)
                        : null;
                      return service?.default_price != null;
                    }}
                    onRemove={removeItem}
                    fmt={fmt}
                    currencySymbol={currencySymbol}
                    tq={tq}
                    useBdi={useBdi}
                    bdiFactor={bdiFactor}
                    onUpdateCostComposition={updateServiceCostComposition}
                    inventoryItems={inventoryItems}
                    costResources={costResources}
                  />
                ) : (
                  <EmptyState
                    title={tq.serviceEmpty}
                    description="Adicione um serviço do catálogo ou crie um para este orçamento. Depois, ajuste sua composição e o preço."
                    action={<Button type="button" className="h-12 bg-primary px-6 text-base font-semibold text-primary-foreground hover:bg-primary/90" onClick={() => setServicePickerOpen(true)}><Plus className="h-5 w-5" />Adicionar serviço</Button>}
                  />
                )}
              </section>
            </div>
          )}

          {/* ══ STEP 3: MATERIAIS EXTERNOS E DESLOCAMENTO ══ */}
          {currentStepKey === 'materials' && (
            <div className="space-y-6">
              <section className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <SectionHeader icon={<Package className="h-4 w-4 text-primary" />} title={tq.materialsHeader} />
                    <p className="mt-2 text-sm text-muted-foreground">Inclua materiais do estoque ou itens avulsos e defina a modalidade de preço.</p>
                  </div>
                  {materialItems.length > 0 && <Button type="button" className="h-12 bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90" onClick={() => setMaterialPickerOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" />{tq.materialPickerOpen}
                  </Button>}
                </div>

                {/* Um caminho só, igual desktop/celular: abre o seletor em lote
                    (foco automático na busca, marca quantidade na lista, um
                    toque adiciona tudo). Substitui o combobox + input manual +
                    qtd + "Adicionar" de antes (~6 toques por material). */}
                {materialItems.length > 0 ? (
                  <>
                    {/* Mobile (abaixo de sm): lista de cards — a tabela espremida
                        cortava o nome do material numa tela de 360px. */}
                    <div className="divide-y border-y">
                      {materialItems.map((item) => {
                        const globalIdx = items.indexOf(item);
                        const unit = item.inventory_id
                          ? inventoryItems.find(i => i.id === item.inventory_id)?.unit
                          : null;
                        const detailsOpen = openMaterialDetails.has(globalIdx) || !!item.details?.trim();
                        return (
                          <article key={globalIdx} className="space-y-4 py-5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-3">
                                <InventoryItemThumbnail name={item.description} imageUrl={inventoryItems.find(candidate => candidate.id === item.inventory_id)?.image_url} fit="contain" fallbackVariant="plain" className="h-12 w-12 bg-muted/30" />
                                <div className="min-w-0">
                                <p className="text-lg font-semibold leading-6">{item.description}</p>
                                {unit && (
                                  <p aria-label={tq.materialColUnit} className="text-xs text-muted-foreground">{unit}</p>
                                )}
                                </div>
                              </div>
                              <div className="ml-auto flex items-start gap-4">
                                <div className="text-right">
                                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{tq.materialColTotal}</p>
                                  <p className="font-semibold tabular-nums">{fmt(item.total_price)}</p>
                                </div>
                              <Button type="button" variant="destructive-ghost" size="icon"
                                className="h-9 w-9 shrink-0"
                                onClick={() => removeItem(globalIdx)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              </div>
                            </div>

                            <div className="max-w-xl">
                              <MaterialPricingModeControl
                                item={item}
                                useBdi={useBdi}
                                onChange={mode => updateItemPricingMode(globalIdx, mode)}
                                fmt={fmt}
                              />
                            </div>

                            {/* O card não tem cabeçalho de coluna como a tabela,
                                então cada campo precisa do próprio rótulo: sem
                                isso o preço de um material de valor 0 aparece
                                como uma caixa vazia e sem sentido no celular
                                (visto no QA). */}
                            <div className="grid items-end gap-4 sm:grid-cols-[minmax(12rem,1fr)_10rem]">
                              <div className="space-y-1.5">
                                <Label className="text-sm font-semibold text-foreground">{tq.materialColQty}</Label>
                                <div className="flex items-center gap-1">
                                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
                                    onClick={() => updateItemQty(globalIdx, round2(item.quantity - 1))}>
                                    <Minus className="h-3.5 w-3.5" />
                                  </Button>
                                  <QuantityField
                                    quantity={item.quantity}
                                    onCommit={qty => updateItemQty(globalIdx, qty)}
                                    className="h-11 w-24 px-2 text-center text-base"
                                  />
                                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
                                    onClick={() => updateItemQty(globalIdx, round2(item.quantity + 1))}>
                                    <Plus className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="block text-sm font-semibold text-foreground">{tq.materialColUnitPrice}</Label>
                                <CurrencyField symbol={currencySymbol} className="max-w-40">
                                  <Input
                                    type="number" min={0} step="0.01"
                                    placeholder="0,00"
                                    value={item.unit_price || ''}
                                    onChange={e => updateItemPrice(globalIdx, parseFloat(e.target.value) || 0)}
                                    onPaste={e => {
                                      const cents = readPastedCents(e);
                                      if (cents == null) return;
                                      updateItemPrice(globalIdx, cents / 100);
                                    }}
                                    className="h-11 w-full text-right text-base"
                                  />
                                </CurrencyField>
                              </div>
                            </div>

                            {detailsOpen ? (
                              <Textarea
                                value={item.details ?? ''}
                                onChange={e => updateItemDetails(globalIdx, e.target.value)}
                                placeholder={tq.itemDetailsPlaceholder}
                                rows={1}
                                className="min-h-20 w-full resize-y text-base"
                              />
                            ) : (
                              <button
                                type="button"
                                className="text-sm text-muted-foreground underline underline-offset-2"
                                onClick={() => setOpenMaterialDetails(prev => new Set(prev).add(globalIdx))}
                              >
                                {tq.materialDetailsToggle}
                              </button>
                            )}
                          </article>
                        );
                      })}
                      <div className="flex items-center justify-between border-t py-4 text-sm">
                        <span className="text-muted-foreground">{tq.materialSubtotal}</span>
                        <span className="text-lg font-semibold tabular-nums">{fmt(materialItems.reduce((s, i) => s + i.total_price, 0))}</span>
                      </div>
                    </div>

                    {/* Desktop/tablet (sm+): tabela. `overflow-x-auto` (não
                        `overflow-hidden`, que CORTA em vez de rolar). */}
                    <div className="hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="p-2 text-left font-medium text-muted-foreground">{tq.materialColName}</th>
                            <th className="w-24 p-2 text-center font-medium text-muted-foreground">{tq.materialColQty}</th>
                            <th className="w-28 p-2 text-right font-medium text-muted-foreground">{tq.materialColUnitPrice}</th>
                            <th className="w-24 p-2 text-right font-medium text-muted-foreground">{tq.materialColTotal}</th>
                            <th className="w-8 p-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {materialItems.map((item) => {
                            const globalIdx = items.indexOf(item);
                            const unit = item.inventory_id
                              ? inventoryItems.find(i => i.id === item.inventory_id)?.unit
                              : null;
                            const detailsOpen = openMaterialDetails.has(globalIdx) || !!item.details?.trim();
                            return (
                              <tr key={globalIdx} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="p-2 align-top font-medium">
                                  <span>{item.description}</span>
                                  {detailsOpen ? (
                                    <Textarea
                                      value={item.details ?? ''}
                                      onChange={e => updateItemDetails(globalIdx, e.target.value)}
                                      placeholder={tq.itemDetailsPlaceholder}
                                      rows={1}
                                      className="mt-1 min-h-0 h-7 w-full resize-y py-1 text-[11px] font-normal text-muted-foreground"
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      className="mt-1 block text-[11px] text-muted-foreground underline underline-offset-2"
                                      onClick={() => setOpenMaterialDetails(prev => new Set(prev).add(globalIdx))}
                                    >
                                      {tq.materialDetailsToggle}
                                    </button>
                                  )}
                                </td>
                                <td className="p-2 align-top">
                                  <div className="flex flex-col items-center gap-0.5">
                                    <QuantityField
                                      quantity={item.quantity}
                                      onCommit={qty => updateItemQty(globalIdx, qty)}
                                      className="mx-auto h-7 w-16 px-1 text-center text-xs"
                                    />
                                    {unit && (
                                      <span aria-label={tq.materialColUnit} className="text-[10px] text-muted-foreground">{unit}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2 align-top">
                                  <MaterialPricingModeControl
                                    item={item}
                                    useBdi={useBdi}
                                    onChange={mode => updateItemPricingMode(globalIdx, mode)}
                                    fmt={fmt}
                                    compact
                                  />
                                  <Input
                                    aria-label={`Preço de ${item.description}`}
                                    type="number" min={0} step="0.01"
                                    value={item.unit_price || ''}
                                    onChange={e => updateItemPrice(globalIdx, parseFloat(e.target.value) || 0)}
                                    onPaste={e => {
                                      const cents = readPastedCents(e);
                                      if (cents == null) return;
                                      updateItemPrice(globalIdx, cents / 100);
                                    }}
                                    className="ml-auto mt-1 h-7 w-24 text-right text-xs"
                                  />
                                </td>
                                <td className="p-2 text-right align-top font-semibold">{fmt(item.total_price)}</td>
                                <td className="p-2 align-top">
                                  <Button type="button" variant="destructive-ghost" size="icon"
                                    className="h-7 w-7"
                                    onClick={() => removeItem(globalIdx)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="border-t bg-muted/30">
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
                  </>
                ) : (
                  <EmptyState
                    title={tq.materialEmpty}
                    description="Inclua aqui os materiais cobrados à parte. Os insumos usados na execução ficam dentro de cada serviço."
                    action={<Button type="button" className="h-12 bg-primary px-6 text-base font-semibold text-primary-foreground hover:bg-primary/90" onClick={() => setMaterialPickerOpen(true)}><Plus className="h-5 w-5" />{tq.materialPickerOpen}</Button>}
                  />
                )}

                <MaterialBatchPicker
                  open={materialPickerOpen}
                  onOpenChange={setMaterialPickerOpen}
                  items={inventoryItems}
                  frequentIds={materialFrequentIds}
                  onConfirm={handleAddMaterialsBatch}
                />
              </section>


            </div>
          )}

          {/* ══ STEP 4: PREÇO, BDI E CONDIÇÕES COMERCIAIS ══ */}
          {currentStepKey === 'commercial' && (
            <div className="space-y-6">
              {bdiConfigBlock}
              <div className="grid gap-4 md:grid-cols-2 md:divide-x">
                <section className="space-y-4 md:pr-4">
                  <div className="space-y-2">
                    <SectionHeader icon={<Tag className="h-4 w-4 text-primary" />} title={tq.discountHeader} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={discountType}
                        onValueChange={(value) => setDiscountType(value === 'percentual' ? 'percentual' : 'valor')}
                      >
                        <SelectTrigger className="h-9 w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="valor">{currencySymbol}</SelectItem>
                          <SelectItem value="percentual">%</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input aria-label={tq.discountHeader} type="number" min={0} step="0.01" value={discountValue || ''}
                        onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                        onPaste={e => {
                          if (discountType !== 'valor') return;
                          const cents = readPastedCents(e);
                          if (cents == null) return;
                          setDiscountValue(cents / 100);
                        }}
                        placeholder="0" className="h-9 w-28" />
                      {discountAmount > 0 && (
                        <span className="text-xs font-medium text-destructive">− {fmt(discountAmount)}</span>
                      )}
                    </div>
                  </div>

                  <label htmlFor="include-gifts" className="flex cursor-pointer items-center gap-3 border-t pt-3">
                    <Checkbox
                      id="include-gifts"
                      checked={includeGifts}
                      onCheckedChange={(checked) => setIncludeGifts(!!checked)}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <Gift className="h-4 w-4 text-primary" /> {tq.giftsHeader}
                      </span>
                      <span className="text-xs text-muted-foreground">{tq.giftsInclude}</span>
                    </span>
                  </label>
                </section>

                <section className="space-y-3 border-t pt-4 md:border-t-0 md:pl-4 md:pt-0">
                  <SectionHeader icon={<CreditCard className="h-4 w-4 text-primary" />} title="Cobrança após aprovação" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="font-semibold text-foreground">{tq.receivableInstallmentsLabel}</Label>
                      <Select value={String(receivableInstallments)} onValueChange={v => setReceivableInstallments(Number(v) || 1)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">{tq.receivableInstallmentsCash}</SelectItem>
                          {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
                            <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-semibold text-foreground">{tq.receivableFirstDueDateLabel}</Label>
                      <DatePicker
                        value={receivableFirstDueDate}
                        onValueChange={setReceivableFirstDueDate}
                        placeholder={MESSAGES[locale].app.common.datePicker.placeholder}
                        clearable
                        clearLabel={MESSAGES[locale].app.common.clear}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Define como o financeiro criará a cobrança após a aprovação. Não altera as opções de cartão ou pagamento à vista mostradas na proposta.
                  </p>
                </section>
              </div>

              <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="font-semibold text-foreground">{tq.notesLabel}</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={tq.notesPlaceholder} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold text-foreground">{tq.termsLabel}</Label>
                  <Textarea value={terms} onChange={e => setTerms(e.target.value)} placeholder={tq.termsPlaceholder} rows={2} />
                </div>
              </div>
            </div>
          )}

          {/* ══ STEP 5: REVISÃO E ENVIO ══ */}
          {currentStepKey === 'review' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Revise e finalize</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Confira os valores e escolha como a proposta será apresentada ao cliente.</p>
                </div>
                <p className="text-sm font-medium">{items.length} {items.length === 1 ? 'item no orçamento' : 'itens no orçamento'}</p>
              </div>
              <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]">
                <div className="hidden lg:sticky lg:top-28 lg:block">{summaryBlock}</div>
                <div className="flex items-center justify-between gap-4 rounded-xl bg-primary px-4 py-4 text-primary-foreground lg:hidden">
                  <span className="text-sm">Total do orçamento</span>
                  <span className="text-xl font-semibold tabular-nums">{fmt(finalTotal)}</span>
                </div>
                <div className="min-w-0 space-y-4 rounded-2xl bg-muted/25 p-4 sm:p-5">
                  <section aria-label="Conferência do orçamento" className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {quoteReviewItems.filter(item => item.key !== 'template').map(item => (
                      <button key={item.key} type="button" onClick={() => setStep(item.stepIndex)} className="group flex min-w-0 items-center justify-between gap-3 border-b border-border/70 pb-3 text-left">
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground/80">{item.label}</span>
                          <span className="mt-1 block text-sm font-semibold leading-snug">{item.detail}</span>
                        </span>
                        <span className="text-sm font-medium text-foreground underline-offset-4 group-hover:underline">Editar</span>
                      </button>
                    ))}
                  </section>
              <section className="space-y-3">
                <div>
                  <h3 className="text-xl font-semibold sm:text-2xl">Detalhamento exibido na proposta</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    O cliente vê o preço do serviço. Você decide se também compartilha os custos.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label htmlFor="quote-show-labor-cost" className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors', showLaborCostInProposal ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background')}>
                    <Checkbox
                      id="quote-show-labor-cost"
                      checked={showLaborCostInProposal}
                      onCheckedChange={checked => setShowLaborCostInProposal(checked === true)}
                    />
                    <span>
                      <span className="block text-sm font-medium">Mostrar custo de mão de obra</span>
                      <span className={cn('mt-1 block text-xs', showLaborCostInProposal ? 'text-primary-foreground/80' : 'text-muted-foreground')}>Exibe o valor por serviço, além do preço comercial.</span>
                    </span>
                  </label>
                  <label htmlFor="quote-show-inputs-cost" className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors', showInputsCostInProposal ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background')}>
                    <Checkbox
                      id="quote-show-inputs-cost"
                      checked={showInputsCostInProposal}
                      onCheckedChange={checked => setShowInputsCostInProposal(checked === true)}
                    />
                    <span>
                      <span className="block text-sm font-medium">Mostrar custo de insumos</span>
                      <span className={cn('mt-1 block text-xs', showInputsCostInProposal ? 'text-primary-foreground/80' : 'text-muted-foreground')}>Não inclui os materiais cobrados separadamente.</span>
                    </span>
                  </label>
                </div>
              </section>
              <section className="grid items-start gap-5 border-t pt-5 md:grid-cols-[minmax(0,1fr)_11rem] xl:grid-cols-[minmax(0,1fr)_13rem]">
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold sm:text-2xl">Apresentação e validade</h3>
                  <div className="grid grid-cols-2 items-end gap-3 xl:grid-cols-[10rem_minmax(9rem,1fr)_auto]">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="quote-valid-until" className="font-semibold text-foreground">{tq.reviewValidUntil}</Label>
                    {/* Opcional (valid_until vira undefined se vazio), por isso clearable */}
                    <DatePicker
                      id="quote-valid-until"
                      className="h-11 gap-1.5 px-2 !text-sm [&_svg]:mr-0"
                      value={validUntil}
                      onValueChange={setValidUntil}
                      placeholder={MESSAGES[locale].app.common.datePicker.placeholder}
                      clearable
                      clearLabel={MESSAGES[locale].app.common.clear}
                    />
                  </div>

                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="quote-proposal-template" className="flex items-center gap-1.5 font-semibold text-foreground">
                      <Palette className="hidden h-3.5 w-3.5 sm:block" />{tq.reviewTemplateLabel}
                    </Label>
                    <Select value={proposalTemplateId} onValueChange={setProposalTemplateId}>
                      <SelectTrigger id="quote-proposal-template" className="h-11">
                        <SelectValue placeholder={tq.reviewTemplatePlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.preview_color }} />
                              {t.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="col-span-2 h-11 xl:col-span-1"
                      disabled={!selectedTemplate}
                      onClick={() => setPreviewOpen(true)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {tq.reviewFullPreview}
                    </Button>
                  </div>
                </div>

                <div className="hidden w-full max-w-[13rem] space-y-2 md:block">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {tq.reviewCoverTitle}
                    </p>
                    {selectedTemplate && (
                      <span className="text-xs font-medium text-foreground">{selectedTemplate.name}</span>
                    )}
                  </div>
                  {selectedTemplate && (
                    <ProposalCoverPreview
                      quote={previewQuote}
                      company={companySettings}
                      templateSlug={selectedTemplate.slug}
                      customization={companySettings?.proposal_customization}
                      label={`${tq.reviewCoverTitle}: ${selectedTemplate.name}`}
                    />
                  )}
                </div>
              </section>

              {items.length === 0 && (
                <EmptyState>{tq.reviewEmptyItems}</EmptyState>
              )}
                </div>
              </div>
            </div>
          )}

        </StepTransition>
        {step > 0 && currentStepKey !== 'review' && (
          <aside className="sticky top-28 hidden border-l pl-8 xl:block" aria-label="Resumo lateral do orçamento">
            {summaryBlock}
          </aside>
        )}
      </div>
    </div>
  );

  // ── Wizard footer (navegação + salvar rascunho) ──
  const handleQuoteOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isEditing && !draftQuoteId && !draft.showResumePrompt && !draftScopeChanged) draft.flush(currentDraft);
    onOpenChange(nextOpen);
  };
  const wizardFooter = (
    <div className="flex flex-col gap-2">
      <WizardMobileSummary
        title="Resumo do orçamento"
        summary={`${fmt(finalTotal)} · ${items.length} ${items.length === 1 ? 'item' : 'itens'}`}
        className="lg:hidden"
      >
        {summaryBlock}
      </WizardMobileSummary>
      {navigationMessage && !canNext() && (
        <p className="text-right text-xs text-destructive" role="alert">
          {navigationMessage}
        </p>
      )}
      <div className="grid grid-cols-[auto_3.25rem_minmax(0,1fr)] items-center gap-2 sm:flex sm:flex-wrap sm:justify-end sm:gap-3">
          <FullscreenWizardAction
            variant="cancel"
            className="h-[3.25rem] px-3 text-base font-bold sm:h-14 sm:min-w-36 sm:px-7"
            onClick={() => step === 0 ? handleQuoteOpenChange(false) : setStep(step - 1)}
            disabled={mutating || savingDraft}
          >
            {step === 0 ? tq.cancel : <><ChevronLeft className="mr-1 h-4 w-4" /> {tq.back}</>}
          </FullscreenWizardAction>
          {/* Salvar rascunho — visível em QUALQUER etapa. */}
          <FullscreenWizardAction
            variant="outline"
            className="h-[3.25rem] w-[3.25rem] px-0 text-base font-bold sm:h-14 sm:w-auto sm:min-w-48 sm:px-7"
            aria-label={savingDraft ? tq.saving : tq.saveDraft}
            onClick={handleSaveDraft}
            disabled={mutating || savingDraft || !hasCustomer}
          >
            {savingDraft
              ? <><Loader2 className="h-4 w-4 animate-spin sm:mr-1" /><span className="sr-only sm:not-sr-only">{tq.saving}</span></>
              : <><Save className="h-4 w-4 sm:mr-1" /><span className="sr-only sm:not-sr-only">{tq.saveDraft}</span></>}
          </FullscreenWizardAction>

          {step < STEPS.length - 1 ? (
            <FullscreenWizardAction
              onClick={advanceWithValidation}
              aria-disabled={!canNext()}
              className="h-[3.25rem] bg-primary px-3 text-base font-bold text-primary-foreground hover:bg-primary/90 aria-disabled:opacity-50 sm:h-14 sm:min-w-48 sm:px-8"
              disabled={mutating || savingDraft}
            >
              {tq.next} <ChevronRight className="h-4 w-4 ml-1" />
            </FullscreenWizardAction>
          ) : (
            <FullscreenWizardAction
              onClick={handleSubmit}
              disabled={!canNext() || mutating || savingDraft}
              className="h-[3.25rem] bg-primary px-3 text-base font-bold text-primary-foreground hover:bg-primary/90 sm:h-14 sm:min-w-56 sm:px-8"
            >
              {mutating
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {tq.saving}</>
                : quote ? tq.saveChanges : tq.createQuote}
            </FullscreenWizardAction>
          )}
      </div>
    </div>
  );

  const title = quote
    ? tq.formTitleEdit.replace('{number}', String(quote.quote_number))
    : draftQuoteId ? tq.formTitleDraft : tq.formTitleNew;

  return (
    <>
      <FullscreenWizard
        open={open}
        onOpenChange={handleQuoteOpenChange}
        title={title}
        backLabel={tq.back}
        headerActions={!isEditing && !draftQuoteId ? <FormDraftStatus status={draft.status} savedAt={draft.savedAt} /> : undefined}
        description="Monte os itens, confira a precificação e revise a proposta antes de salvar."
        className="min-w-0 overflow-x-hidden"
        footer={wizardFooter}
        floatingNotice={!isEditing && !draftQuoteId && draft.showResumePrompt ? (
          <DraftResumeNotice
            onResume={() => {
              if (draft.draftData) applyQuoteDraft(draft.draftData);
              draft.acceptDraft();
            }}
            onDiscard={() => {
              draft.startNewDraft();
              resetQuoteForm();
            }}
          />
        ) : null}
        lockBackdrop
        overlayId="quote-form-modal"
      >
        {wizardContent}
      </FullscreenWizard>

      <QuoteTemplatePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        quote={previewQuote}
        company={companySettings}
        templateSlug={selectedTemplate?.slug ?? 'clean'}
      />

      <ResponsiveModal
        open={servicePickerOpen}
        onOpenChange={setServicePickerOpen}
        title="Adicionar serviço"
        description="Escolha um serviço cadastrado ou crie um novo sem sair do orçamento."
        className="space-y-5"
        overlayId="quote-service-picker"
        overlayParentId="quote-form-modal"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="cancel-ghost" onClick={() => setServicePickerOpen(false)}>Cancelar</Button>
            <Button type="button" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleAddService} disabled={!addSvcId || isFetchingSvc}>
              {isFetchingSvc ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Adicionar
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-foreground">Serviço</Label>
          <SearchableSelect
            groups={serviceGroups}
            value={addSvcId}
            onValueChange={setAddSvcId}
            onSearchChange={setServiceSearchQuery}
            placeholder={tq.serviceSelectPlaceholder}
            searchPlaceholder={tq.serviceSearchPlaceholder}
            className="h-12 w-full justify-between px-4 text-base font-normal"
            emptyContent={!hasAnyService ? (
              <div className="flex flex-col items-center gap-1.5 px-2 py-5 text-center">
                <p className="text-base font-medium text-foreground">{tq.serviceSelectEmptyTitle}</p>
                <p className="text-sm text-muted-foreground">{tq.serviceSearchPlaceholder}</p>
              </div>
            ) : undefined}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-end">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground">{tq.serviceQtyLabel}</Label>
            <NumericInput value={String(addSvcQty ?? '')} onValueChange={value => setAddSvcQty(Math.max(1, Number(value) || 1))} className="h-11 text-center text-base" />
          </div>
          <Button type="button" variant="outline" className="h-11 justify-start sm:justify-center" onClick={() => { setServicePickerOpen(false); setServiceFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Criar serviço na hora
          </Button>
        </div>
      </ResponsiveModal>

      {/* Quick-create de tipo de serviço — botão "+" ao lado do seletor de serviços. */}
      <QuickServiceTypeDialog
        open={serviceFormOpen}
        onOpenChange={setServiceFormOpen}
        initialName={serviceSearchQuery}
        onCreated={handleServiceTypeCreated}
        allowQuoteOnly
        onCreatedLocal={handleLocalServiceCreated}
        overlayParentId="quote-form-modal"
      />
    </>
  );
}

// ─── Small helpers ───────────────────────────────────────────────────────────
function MaterialPricingModeControl({
  item,
  useBdi,
  onChange,
  fmt,
  compact = false,
}: {
  item: FormQuoteItem;
  useBdi: boolean;
  onChange: (mode: ItemPricingMode) => void;
  fmt: (value: number) => string;
  compact?: boolean;
}) {
  return (
    <div className={cn('space-y-1', compact && 'min-w-32')}>
      <Select value={item.pricing_mode} onValueChange={value => onChange(value as ItemPricingMode)}>
        <SelectTrigger className={cn(compact ? 'h-8 w-32 text-xs' : 'h-11 w-full text-sm')} aria-label={`Modo de preço de ${item.description}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {item.inventory_id && <SelectItem value="registered">Preço de venda cadastrado</SelectItem>}
          <SelectItem value="cost_bdi" disabled={!useBdi}>Custo de compra + BDI</SelectItem>
          <SelectItem value="manual">Valor manual</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs leading-relaxed text-foreground/80">
        {item.unit_total_cost > 0 ? `Custo ${fmt(item.unit_total_cost)}` : 'Custo não informado'} · Preço {fmt(item.unit_price)}
      </p>
      {item.pricing_mode === 'manual' && (
        <p className="text-xs leading-relaxed text-warning">
          Preço manual: esta linha saiu da precificação automática estrita.
        </p>
      )}
    </div>
  );
}

function ServicePricingModeControl({
  item,
  useBdi,
  allowRegistered,
  onChange,
  compact = false,
}: {
  item: FormQuoteItem;
  useBdi: boolean;
  allowRegistered: boolean;
  onChange: (mode: ItemPricingMode) => void;
  compact?: boolean;
}) {
  return (
    <Select value={item.pricing_mode} onValueChange={value => onChange(value as ItemPricingMode)}>
      <SelectTrigger
        className={cn(compact ? 'h-8 w-[12rem] text-xs' : 'h-11 w-full text-sm')}
        aria-label={`Modo de preço de ${item.description}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="registered" disabled={!allowRegistered}>Preço cadastrado do serviço</SelectItem>
        <SelectItem value="cost_bdi" disabled={!useBdi || item.unit_total_cost <= 0}>Custo do serviço + BDI</SelectItem>
        <SelectItem value="manual">Valor manual</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * Campo de quantidade decimal dos itens de material.
 *
 * O `NumericInput` é controlado por STRING CRUA de propósito (ver
 * `numeric-input.tsx`): quem guarda o TEXTO digitado tem que ser o pai.
 * Ligá-lo direto no número do item (`formatQty(item.quantity)`) reescreve o
 * input a cada tecla e engole o separador no instante exato em que ele é
 * digitado: "2," volta como "2" e nunca se chega em "2,5" — ou seja, tubo por
 * metro fica impossível de lançar editando na lista (provado em
 * `QuoteFormDialog.test.tsx`).
 *
 * Por isso o texto vive aqui enquanto o campo está em uso. Ao sair do foco o
 * campo volta a espelhar o item e, se ficou vazio/zerado, restaura o piso 1 —
 * o mesmo piso que o fluxo antigo tinha.
 */
function QuantityField({ quantity, onCommit, className }: {
  quantity: number;
  onCommit: (qty: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <NumericInput
      decimal
      maxDecimals={2}
      inputMode="decimal"
      value={draft ?? (quantity ? formatQty(quantity) : '')}
      onValueChange={(v) => { setDraft(v); onCommit(parseDecimalInput(v)); }}
      onBlur={() => {
        setDraft(null);
        if (!(quantity > 0)) onCommit(1);
      }}
      className={className}
    />
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-primary-foreground">
        {icon}
      </span>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
    </div>
  );
}

function BdiField({ label, value, onChange, suffix, prefix, step = 0.1, min = 0, disabled }: {
  label: string; value: number; onChange: (v: number) => void;
  suffix?: string; prefix?: string; step?: number; min?: number; disabled?: boolean;
}) {
  const [moneyDraft, setMoneyDraft] = useState<string | null>(null);
  const fieldId = useId();
  const fieldClassName = `h-11 bg-background text-lg font-semibold tabular-nums ${prefix ? 'pl-12' : ''} ${suffix ? 'pr-9' : ''}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId} className="text-sm font-semibold text-foreground">{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">{prefix}</span>
        )}
        {prefix ? <NumericInput
          id={fieldId}
          decimal
          aria-label={label}
          disabled={disabled}
          value={moneyDraft ?? String(value).replace('.', ',')}
          onValueChange={raw => {
            setMoneyDraft(raw);
            onChange(Math.max(min, parseDecimalInput(raw)));
          }}
          onBlur={() => setMoneyDraft(null)}
          className={fieldClassName}
        /> : <Input
          id={fieldId}
          aria-label={label}
          disabled={disabled}
          type="number" min={min} max={suffix === '%' ? 100 : undefined} step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className={fieldClassName}
        />}
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ children, title, description, action }: {
  children?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground', action && 'py-12 sm:py-16')}>
      <Inbox className={cn('h-5 w-5 text-muted-foreground/50', action && 'mb-2 h-10 w-10 text-foreground')} strokeWidth={1.5} />
      {title ? <h3 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h3> : children}
      {description && <p className="max-w-md text-base leading-relaxed">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
