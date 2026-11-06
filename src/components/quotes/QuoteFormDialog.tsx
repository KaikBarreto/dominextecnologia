import { Fragment, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES, type Messages } from '@/lib/i18n/messages';
import { formatMoney, formatNumber, getCurrencySymbol } from '@/lib/format';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/DatePicker';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Badge } from '@/components/ui/badge';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useCustomers } from '@/hooks/useCustomers';
import { useQuotes, type QuoteInput, type Quote } from '@/hooks/useQuotes';
import { useProposalTemplates } from '@/hooks/useProposalTemplates';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useInventory, type InventoryItem } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { useBDICalculator } from '@/hooks/useBDICalculator';
import { fetchServiceCostBreakdown } from '@/hooks/useServiceCostBreakdown';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { QuotePricingSummary } from '@/components/quotes/QuotePricingSummary';
import { BDICompositionPreview } from '@/components/pricing/BDICompositionPreview';
import { QuoteTemplatePreviewDialog } from '@/components/quotes/QuoteTemplatePreviewDialog';
import { ProposalCoverPreview } from '@/components/quotes/ProposalCoverPreview';
import { QuoteBdiScopeGuide } from '@/components/quotes/QuoteBdiScopeGuide';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { MaterialBatchPicker, type MaterialBatchSelection } from '@/components/inventory/MaterialBatchPicker';
import { formatQty } from '@/components/inventory/InventoryMaterialSelect';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import { QuickServiceTypeDialog } from '@/components/service-orders/QuickServiceTypeDialog';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { FormWizardStepper } from '@/components/ui/FormWizardStepper';
import { WizardMobileSummary, WizardReviewChecklist } from '@/components/ui/WizardReviewChecklist';
import { StepTransition } from '@/components/ui/step-transition';
import { cn } from '@/lib/utils';
import { readPastedCents } from '@/lib/money-paste-mask';
import {
  User, UserPlus, Palette, Wrench, MapPin, Package,
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
const STEP_KEYS = ['assembly', 'commercial', 'review'] as const;
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
  tq,
  extrasLabel,
  useBdi,
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
  tq: Messages['app']['crm']['quotes'];
  extrasLabel: string;
  useBdi: boolean;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const handlePricePaste = (event: React.ClipboardEvent<HTMLInputElement>, index: number) => {
    const cents = readPastedCents(event);
    if (cents == null) return;
    onUpdatePrice(index, cents / 100);
  };
  const subtotal = serviceItems.reduce((sum, item) => sum + item.total_price, 0);

  return (
    <div className="space-y-2">
      <div className="space-y-2 md:hidden">
        {serviceItems.map((item) => {
          const globalIdx = allItems.indexOf(item);
          const isExpanded = expandedIdx === globalIdx;
          const hasCosts = item.unit_total_cost > 0;
          return (
            <article key={item.id ?? globalIdx} className="rounded-lg border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  onClick={() => setExpandedIdx(isExpanded ? null : globalIdx)}
                  aria-expanded={isExpanded}
                >
                  <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                  <span className="min-w-0 text-sm font-medium leading-snug">{item.description}</span>
                </button>
                <Button type="button" variant="destructive-ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onRemove(globalIdx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="ml-6 mt-2 max-w-xs">
                <ServicePricingModeControl
                  item={item}
                  useBdi={useBdi}
                  allowRegistered={canUseRegisteredPrice(item)}
                  onChange={mode => onUpdatePricingMode(globalIdx, mode)}
                />
              </div>

              {!hasCosts && <Badge variant="warning" className="ml-6 mt-1 text-[10px]">{tq.serviceNoCosts}</Badge>}

              <div className="mt-3 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">{tq.serviceColQty}</Label>
                  <Input
                    aria-label={`${tq.serviceColQty} de ${item.description}`}
                    type="number"
                    min={1}
                    step="1"
                    value={item.quantity || ''}
                    onChange={event => onUpdateQty(globalIdx, Math.max(1, parseInt(event.target.value, 10) || 1))}
                    className="h-9 px-2 text-center text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">{tq.serviceColUnitPrice}</Label>
                  <Input
                    aria-label={`Preço de ${item.description}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unit_price || ''}
                    onChange={event => onUpdatePrice(globalIdx, parseFloat(event.target.value) || 0)}
                    onPaste={event => handlePricePaste(event, globalIdx)}
                    className="h-9 text-right text-sm"
                  />
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{tq.serviceColTotal}</span>
                <span className="font-semibold tabular-nums">{fmt(item.total_price)}</span>
              </div>

              {item.pricing_mode === 'manual' && (
                <p className="mt-2 text-[11px] leading-snug text-warning">
                  Preço manual: fora da precificação automática.
                  {useBdi && hasCosts && (
                    <button type="button" className="ml-1 underline underline-offset-2" onClick={() => onRestoreAutomatic(globalIdx)}>Restaurar</button>
                  )}
                </p>
              )}

              <Textarea
                value={item.details ?? ''}
                onChange={event => onUpdateDetails(globalIdx, event.target.value)}
                placeholder={tq.itemDetailsPlaceholder}
                rows={1}
                className="mt-3 min-h-9 resize-y text-xs"
              />

              {isExpanded && (
                <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs">
                  <CostDetail label={tq.serviceLaborDetail} value={item.unit_hourly_rate > 0 ? `${fmt(item.unit_hourly_rate)}/h × ${item.unit_hours}h` : '—'} />
                  <CostDetail label={tq.serviceMatsDetail} value={item.unit_materials_cost > 0 ? fmt(item.unit_materials_cost) : '—'} />
                  <CostDetail label={extrasLabel} value={item.unit_extras_cost > 0 ? fmt(item.unit_extras_cost) : '—'} />
                  <CostDetail label={tq.serviceUnitCostDetail} value={hasCosts ? fmt(item.unit_total_cost) : '—'} emphasis />
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-lg border md:block">
      <table className="w-full table-fixed text-xs">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="p-2 text-left font-medium text-muted-foreground">{tq.serviceColName}</th>
            <th className="w-16 p-2 text-center font-medium text-muted-foreground">{tq.serviceColQty}</th>
            <th className="w-24 p-2 text-right font-medium text-muted-foreground">{tq.serviceColUnitCost}</th>
            <th className="w-28 p-2 text-right font-medium text-muted-foreground">{tq.serviceColUnitPrice}</th>
            <th className="w-24 p-2 text-right font-medium text-muted-foreground">{tq.serviceColTotal}</th>
            <th className="w-8 p-2" />
          </tr>
        </thead>
        <tbody>
          {serviceItems.map((item) => {
            const globalIdx = allItems.indexOf(item);
            const isExpanded = expandedIdx === globalIdx;
            const hasCosts = item.unit_total_cost > 0;
            return (
              <Fragment key={item.id ?? globalIdx}>
                <tr className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-2 font-medium">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-left w-full"
                      onClick={() => setExpandedIdx(isExpanded ? null : globalIdx)}
                    >
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      <span className="min-w-0 break-words">{item.description}</span>
                    </button>
                    <div className="ml-5 mt-1 max-w-[13rem]">
                      <ServicePricingModeControl
                        item={item}
                        useBdi={useBdi}
                        allowRegistered={canUseRegisteredPrice(item)}
                        onChange={mode => onUpdatePricingMode(globalIdx, mode)}
                        compact
                      />
                    </div>
                    {!hasCosts && (
                      <Badge variant="warning" className="ml-5 mt-0.5 text-[10px]">
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
                  <td className="p-2 text-right text-muted-foreground">
                    {hasCosts ? fmt(item.unit_total_cost) : '—'}
                  </td>
                  <td className="p-2">
                    <Input
                      aria-label={`Preço de ${item.description}`}
                      type="number" min={0} step="0.01"
                      value={item.unit_price || ''}
                      onChange={e => onUpdatePrice(globalIdx, parseFloat(e.target.value) || 0)}
                      onPaste={event => handlePricePaste(event, globalIdx)}
                      className="h-7 w-24 text-xs text-right ml-auto"
                    />
                    {item.pricing_mode === 'manual' && (
                      <div className="mt-1 text-right text-[10px] leading-tight text-warning">
                        <span>Preço manual: fora da precificação automática.</span>
                        {useBdi && item.unit_total_cost > 0 && (
                          <button
                            type="button"
                            className="ml-1 underline underline-offset-2"
                            onClick={() => onRestoreAutomatic(globalIdx)}
                          >
                            Restaurar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-right font-semibold">{fmt(item.total_price)}</td>
                  <td className="p-2">
                    <Button type="button" variant="destructive-ghost" size="icon"
                      className="h-7 w-7"
                      onClick={() => onRemove(globalIdx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-muted/10">
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
                          <span className="text-muted-foreground">{extrasLabel}</span>
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
              </Fragment>
            );
          })}
          <tr className="bg-muted/30 border-t">
            <td colSpan={4} className="p-2 text-right text-xs font-medium text-muted-foreground">
              {tq.serviceSubtotal}
            </td>
            <td className="p-2 text-right font-bold">
              {fmt(subtotal)}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm md:hidden">
        <span className="text-muted-foreground">{tq.serviceSubtotal}</span>
        <span className="font-bold tabular-nums">{fmt(subtotal)}</span>
      </div>
    </div>
  );
}

function CostDetail({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <span className="text-muted-foreground">{label}</span>
      <p className={cn('break-words font-medium', emphasis && 'font-semibold text-foreground')}>{value}</p>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function QuoteFormDialog({ open, onOpenChange, quote }: QuoteFormDialogProps) {
  const { locale, currency } = useAppLocaleContext();
  const tq = MESSAGES[locale].app.crm.quotes;
  const tp = MESSAGES[locale].app.crm.pricing;
  const STEPS = [
    { key: 'assembly' as StepKey, label: tq.stepAssembly },
    { key: 'commercial' as StepKey, label: tq.stepCommercial },
    { key: 'review' as StepKey, label: tq.stepReviewSend },
  ];
  const fmt = (v: number) => formatMoney(Math.round(v * 100) / 100, currency, locale);
  const fmtRate = (v: number) => formatNumber(v, locale, { maximumFractionDigits: 1 });
  const currencySymbol = getCurrencySymbol(currency, locale);
  const { customers } = useCustomers();
  const { createQuote, updateQuote, quotes } = useQuotes();
  const { templates } = useProposalTemplates();
  const { settings: pricing } = usePricingSettings();
  const { serviceTypes } = useServiceTypes();
  const { items: inventoryItems } = useInventory();
  const { profile } = useAuth();
  const { settings: companySettings } = useCompanySettings();
  const queryClient = useQueryClient();
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
  const [bdiAdvancedOpen, setBdiAdvancedOpen] = useState(false);

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

  // ── Add-service row state ──
  const [addSvcId, setAddSvcId] = useState('');
  const [addSvcQty, setAddSvcQty] = useState(1);
  const [isFetchingSvc, setIsFetchingSvc] = useState(false);
  // Quick-create de tipo de serviço inline (botão "+" ao lado do seletor).
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
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
        receivableInstallments, receivableFirstDueDate,
        useBdi, displacementPricingMode, manualDisplacementPrice,
      });
    }
  }, [customerMode, customerId, prospectName, prospectPhone, prospectEmail, distanceKm, discountType, discountValue, includeGifts, validUntil, notes, terms, proposalTemplateId, receivableInstallments, receivableFirstDueDate, useBdi, displacementPricingMode, manualDisplacementPrice, open, isEditing, draftQuoteId, draft.showResumePrompt]);

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
    // O rascunho leve (sessionStorage) NÃO guarda itens de propósito. Ao retomar,
    // zeramos os itens pra não herdar os da sessão anterior que sobreviveram.
    setItems([]);
  };

  const resetQuoteForm = () => {
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
      setBdiAdvancedOpen(false);
      // Limpa os itens ao fechar pra que a próxima abertura (novo/retomar) não
      // herde itens da sessão anterior. O effect de populate/reset repovoa
      // corretamente quando o diálogo reabre (edição ou novo).
      setItems([]);
      return;
    }
    setStep(0);
    setMaxStepReached(0);
    setBdiAdvancedOpen(false);
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
          pricing_mode: pricingMode,
        });})
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
  const bdiCompositionLabels = {
    composition: tq.bdiCompositionTitle,
    cost: tp.totalCostCard,
    tax: tp.taxLabel.replace(' (%)', ''),
    admin: tp.adminLabel.replace(' (%)', ''),
    profit: tp.profitLabel.replace(' (%)', ''),
    finalPrice: tp.finalPriceLabel,
    factor: tp.bdiCoeff.replace('{factor}', '').trim(),
    factorFormation: tp.bdiMethodTitle,
    priceFormula: tp.bdiFormula,
  };

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
    override?: { name?: string; description?: string | null; default_price?: number | null },
  ) => {
    setIsFetchingSvc(true);
    const st = serviceTypes.find(s => s.id === serviceId);
    const companyId = profile?.company_id;
    let laborCost = 0, matsCost = 0, quoteExtrasCost = 0, hourlyRate = 0, hours = 0;

    if (companyId) {
      try {
        const breakdown = await fetchServiceCostBreakdown(queryClient, companyId, serviceId);
        hourlyRate = breakdown.hourlyRate;
        hours = breakdown.hours;
        laborCost = breakdown.laborCost;
        matsCost = breakdown.materialsCost;
        quoteExtrasCost = breakdown.quoteExtrasCost;
      } catch (err) {
        console.error('Erro ao buscar custos do serviço:', err);
      }
    }

    const unitTotalCost = laborCost + matsCost + quoteExtrasCost;

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
    }]);
    setIsFetchingSvc(false);
  }, [serviceTypes, profile, queryClient, bdiFactor, profitRate, tq.serviceFallback, useBdi]);

  // Botão "Adicionar": usa o serviço selecionado no seletor.
  const handleAddService = useCallback(async () => {
    if (!addSvcId) return;
    await addServiceById(addSvcId, addSvcQty);
    setAddSvcId('');
    setAddSvcQty(1);
  }, [addSvcId, addSvcQty, addServiceById]);

  // ── Criar tipo de serviço na hora (botão "+" do seletor) ──
  // Abre o `QuickServiceTypeDialog` (mesmo quick-create de OS) pré-preenchido
  // com o texto digitado na busca; ao criar, o serviço já entra no orçamento
  // com a quantidade atual. Preço/qtd seguem editáveis inline.
  const handleServiceTypeCreated = useCallback(async (created: { id: string; name: string }) => {
    setServiceFormOpen(false);
    setIsFetchingSvc(true);
    try {
      // Serviço novo não tem custos cadastrados → cai no fluxo preço 0/editável.
      await addServiceById(created.id, addSvcQty, { name: created.name, description: null });
    } finally {
      setAddSvcId('');
      setAddSvcQty(1);
      setIsFetchingSvc(false);
    }
  }, [addSvcQty, addServiceById]);

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
      };
    }),
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
        onSuccess: (created: { id?: string | null }) => {
          if (created?.id) setDraftQuoteId(created.id);
          draft.clearDraft();
          setSavingDraft(false);
          onOpenChange(false);
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
  const materialsCost = items.reduce((sum, item) => {
    const embeddedMaterials = item.unit_materials_cost * item.quantity;
    const directMaterial = item.item_type === 'material' ? item.unit_total_cost * item.quantity : 0;
    return sum + embeddedMaterials + directMaterial;
  }, 0);
  const selectedTemplate = templates.find(template => template.id === proposalTemplateId);
  const selectedCustomer = customerMode === 'existing'
    ? customers?.find(customer => customer.id === customerId)
    : null;
  const previewItems = items.map(({ pricing_mode: _pricingMode, ...item }, position) => ({ ...item, position }));
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
    customers: customerMode === 'existing'
      ? ((selectedCustomer ?? quote?.customers) as Quote['customers'])
      : undefined,
    quote_items: previewItems,
    proposal_templates: selectedTemplate ? { slug: selectedTemplate.slug, name: selectedTemplate.name } : null,
  };

  // ── Wizard gating ──
  const canNext = () => {
    switch (currentStepKey) {
      case 'assembly':
        return hasCustomer && items.length > 0;
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

    const missingRecipient = !hasCustomer;
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

  const mutating = createQuote.isPending || updateQuote.isPending;

  // ─── BDI config block (reused inside the Services step) ─────────────────────
  const bdiConfigBlock = (
    <section className="border-y py-3">
      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader icon={<Calculator className="h-4 w-4 text-primary" />} title={tq.bdiHeader} />
        <label htmlFor="quote-use-bdi" className="ml-auto flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
          <Checkbox
            id="quote-use-bdi"
            checked={useBdi}
            onCheckedChange={checked => handleUseBdiChange(checked === true)}
          />
          Usar BDI
        </label>
        {useBdi && (
          <Badge
            variant={bdiDanger ? 'destructive' : bdiWarning ? 'warning' : 'default'}
            className="px-2.5 py-0.5 font-mono text-xs"
          >
            Coeficiente {bdiFactor.toFixed(4)}
          </Badge>
        )}
      </div>

      {useBdi ? (
        <div className="space-y-3 pt-3">
          <BDICompositionPreview
            variant="inline"
            totalCost={mixedPricing.automaticCost}
            finalPrice={mixedPricing.automaticPrice}
            bdiFactor={bdiFactor}
            taxRate={taxRate}
            adminRate={adminRate}
            profitRate={profitRate}
            formatMoney={fmt}
            formatRate={fmtRate}
            labels={bdiCompositionLabels}
          />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-1 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={bdiAdvancedOpen}
            aria-controls="quote-bdi-advanced"
            onClick={() => setBdiAdvancedOpen(open => !open)}
          >
            <ChevronDown className={cn('mr-1.5 h-3.5 w-3.5 transition-transform', bdiAdvancedOpen && 'rotate-180')} />
            {bdiAdvancedOpen ? 'Ocultar ajustes avançados' : 'Ajustar taxas e entender o BDI'}
          </Button>

          {bdiAdvancedOpen && (
            <div id="quote-bdi-advanced" className="space-y-4 border-t pt-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1.65fr)_minmax(15rem,1fr)]">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tq.bdiTax} &amp; {tq.bdiProfit}</p>
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <BdiField label={tq.bdiTax} suffix="%" value={taxRate} onChange={v => {
                      pricingTouchedRef.current.taxRate = true;
                      setTaxRate(v);
                    }} />
                    <BdiField label={tq.bdiAdmin} suffix="%" value={adminRate} onChange={v => {
                      pricingTouchedRef.current.adminRate = true;
                      setAdminRate(v);
                    }} />
                    <BdiField label={tq.bdiProfit} suffix="%" value={profitRate} onChange={v => {
                      pricingTouchedRef.current.profitRate = true;
                      setProfitRate(v);
                    }} />
                    <BdiField label={tq.bdiKmCost} value={kmCostCfg} onChange={v => {
                      pricingTouchedRef.current.kmCost = true;
                      setKmCostCfg(v);
                    }} step={0.01} />
                  </div>
                </div>

                <div className="border-t pt-4 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <CreditCard className="h-3 w-3" /> Opções exibidas na proposta
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <BdiField label={tq.bdiCashDiscount} suffix="%" value={cardDiscountRateCfg} onChange={v => {
                      pricingTouchedRef.current.cardDiscountRate = true;
                      setCardDiscountRateCfg(v);
                    }} />
                    <BdiField label={tq.bdiInstallments} value={cardInstallmentsCfg} onChange={v => {
                      pricingTouchedRef.current.cardInstallments = true;
                      setCardInstallmentsCfg(Math.max(1, v));
                    }} step={1} min={1} />
                  </div>
                </div>
              </div>

              <QuoteBdiScopeGuide
                items={items}
                useBdi={useBdi}
                bdiFactor={bdiFactor}
                displacementMode={displacementPricingMode}
                displacementCost={bdi.displacementCost}
                displacementPrice={displacementSalePrice}
                formatMoney={fmt}
              />
            </div>
          )}
        </div>
      ) : (
        <p className="pt-3 text-sm leading-relaxed text-muted-foreground">
          Orçamento padrão ativo. Os itens usam o preço de venda cadastrado ou o valor informado por você; nenhum preço será recalculado pelo BDI.
        </p>
      )}
      {useBdi && items.some(item => item.pricing_mode === 'manual' && item.unit_total_cost > 0) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            O BDI está ligado, mas itens já definidos como manuais continuam com o preço atual até você escolher aplicá-lo.
          </p>
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={applyBdiToItemsWithCost}>
            Aplicar BDI aos itens com custo
          </Button>
        </div>
      )}
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
      {useBdi && currentStepKey === 'review' && (
        <BDICompositionPreview
          variant="compact"
          totalCost={mixedPricing.automaticCost}
          finalPrice={mixedPricing.automaticPrice}
          bdiFactor={bdiFactor}
          taxRate={taxRate}
          adminRate={adminRate}
          profitRate={profitRate}
          formatMoney={fmt}
          formatRate={fmtRate}
          labels={bdiCompositionLabels}
        />
      )}
      {currentStepKey === 'review' && (
        <QuoteBdiScopeGuide
          items={items}
          useBdi={useBdi}
          bdiFactor={bdiFactor}
          displacementMode={displacementPricingMode}
          displacementCost={bdi.displacementCost}
          displacementPrice={displacementSalePrice}
          formatMoney={fmt}
          compact
        />
      )}
      <QuotePricingSummary
        useBdi={useBdi}
        currency={currency}
        locale={locale}
        data={{
          laborCost,
          resourcesCost,
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
      key: 'items',
      label: 'Itens e precificação',
      detail: items.length > 0
        ? `${items.length} ${items.length === 1 ? 'item adicionado' : 'itens adicionados'} ao orçamento.`
        : 'Adicione ao menos um serviço ou material.',
      complete: items.length > 0,
      stepIndex: 0,
    },
    {
      key: 'commercial',
      label: 'Condições comerciais',
      detail: 'Desconto, pagamentos e observações revisados.',
      complete: maxStepReached >= 1,
      stepIndex: 1,
    },
    {
      key: 'template',
      label: 'Proposta',
      detail: selectedTemplate ? `Template ${selectedTemplate.name} selecionado.` : 'Selecione o template da proposta.',
      complete: !!selectedTemplate,
      stepIndex: 2,
    },
  ];

  // ─── Wizard content (stepper + steps) ───────────────────────────────────────
  const wizardContent = (
    <div className="flex min-h-full flex-col">
      <FormWizardStepper
        steps={STEPS}
        currentIndex={step}
        maxReachedIndex={Math.min(STEPS.length - 1, Math.max(maxStepReached, canNext() ? step + 1 : step))}
        onStepChange={goToStep}
        ariaLabel="Etapas do orçamento"
        className="sticky top-0 z-20 -mx-1 border-b bg-background px-1 pb-2"
      />

      {/* Content */}
      <div className="mt-3 grid flex-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_286px] lg:gap-0 lg:divide-x">
        <div className="min-w-0 lg:pr-5">
        <StepTransition stepKey={currentStepKey} index={step} className="space-y-5">

          {/* ══ STEP 1: MONTAGEM — DESTINATÁRIO, PREÇO E ITENS ══ */}
          {currentStepKey === 'assembly' && (
            <section ref={recipientSectionRef} className="space-y-3">
              <SectionHeader icon={<User className="h-4 w-4 text-primary" />} title={tq.recipientHeader} />
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                {customerMode === 'existing' ? (
                  <div className="space-y-1">
                    <Label className="text-xs">{tq.recipientCustomerLabel}</Label>
                    <CustomerSelectField
                      customers={customers ?? []}
                      value={customerId}
                      onValueChange={setCustomerId}
                      placeholder={tq.recipientCustomerPlaceholder}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-xs">{tq.recipientNameLabel}</Label>
                    <Input placeholder={tq.recipientNamePlaceholder} value={prospectName} onChange={e => setProspectName(e.target.value)} />
                  </div>
                )}
                <LabeledSwitch<'existing' | 'prospect'>
                  value={customerMode}
                  onChange={setCustomerMode}
                  size="default"
                  className="sm:mb-px"
                  off={{ value: 'existing', label: <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{tq.recipientExisting}</span> }}
                  on={{ value: 'prospect', label: <span className="inline-flex items-center gap-1.5"><UserPlus className="h-3.5 w-3.5" />{tq.recipientProspect}</span> }}
                  aria-label={tq.recipientHeader}
                />
              </div>
              {customerMode === 'prospect' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          {currentStepKey === 'assembly' && (
            <div className="space-y-6">
              {bdiConfigBlock}

              <section ref={itemsSectionRef} className="space-y-3 border-t pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SectionHeader icon={<Wrench className="h-4 w-4 text-primary" />} title={tq.servicesHeader} />
                  <span className="text-xs text-muted-foreground">{serviceItems.length} {serviceItems.length === 1 ? 'serviço' : 'serviços'}</span>
                </div>

                <div className="flex flex-col gap-2 rounded-lg border bg-background p-2 sm:flex-row">
                  <div className="flex-1 min-w-0 flex items-center h-10 rounded-md border border-input bg-background ring-offset-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0">
                    <SearchableSelect
                      groups={serviceGroups}
                      value={addSvcId}
                      onValueChange={setAddSvcId}
                      onSearchChange={setServiceSearchQuery}
                      placeholder={tq.serviceSelectPlaceholder}
                      searchPlaceholder={tq.serviceSearchPlaceholder}
                      className="flex-1 min-w-0 justify-between rounded-none rounded-l-md border-0 bg-transparent hover:bg-transparent text-foreground hover:text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-3 h-10 font-normal"
                      emptyContent={!hasAnyService ? (
                        <div className="flex flex-col items-center gap-1.5 py-4 px-2 text-center">
                          <p className="text-sm font-medium text-foreground">{tq.serviceSelectEmptyTitle}</p>
                          <p className="text-xs text-muted-foreground">{tq.serviceSearchPlaceholder}</p>
                        </div>
                      ) : undefined}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setServiceFormOpen(true)}
                      className="h-10 w-10 shrink-0 rounded-none rounded-r-md border-l border-input bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                      aria-label={tq.serviceSelectCreateAriaLabel}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
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
                    tq={tq}
                    extrasLabel={locale === 'pt-br' ? 'Recursos e extras' : tq.serviceExtrasDetail}
                    useBdi={useBdi}
                  />
                ) : (
                  <EmptyState>{tq.serviceEmpty}</EmptyState>
                )}
              </section>
            </div>
          )}

          {currentStepKey === 'assembly' && (
            <div className="space-y-6">
              <section className="space-y-3 border-t pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <SectionHeader icon={<Package className="h-4 w-4 text-primary" />} title={tq.materialsHeader} />
                    <p className="mt-1 text-xs text-muted-foreground">Inclua materiais do estoque ou itens avulsos e defina a modalidade de preço.</p>
                  </div>
                  <Button type="button" size="sm" onClick={() => setMaterialPickerOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" />{tq.materialPickerOpen}
                  </Button>
                </div>

                {/* Um caminho só, igual desktop/celular: abre o seletor em lote
                    (foco automático na busca, marca quantidade na lista, um
                    toque adiciona tudo). Substitui o combobox + input manual +
                    qtd + "Adicionar" de antes (~6 toques por material). */}
                {materialItems.length > 0 ? (
                  <>
                    {/* Mobile (abaixo de sm): lista de cards — a tabela espremida
                        cortava o nome do material numa tela de 360px. */}
                    <div className="space-y-2 sm:hidden">
                      {materialItems.map((item) => {
                        const globalIdx = items.indexOf(item);
                        const unit = item.inventory_id
                          ? inventoryItems.find(i => i.id === item.inventory_id)?.unit
                          : null;
                        const detailsOpen = openMaterialDetails.has(globalIdx) || !!item.details?.trim();
                        return (
                          <div key={globalIdx} className="space-y-2 rounded-lg border p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{item.description}</p>
                                {unit && (
                                  <p aria-label={tq.materialColUnit} className="text-xs text-muted-foreground">{unit}</p>
                                )}
                              </div>
                              <Button type="button" variant="destructive-ghost" size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => removeItem(globalIdx)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            <MaterialPricingModeControl
                              item={item}
                              useBdi={useBdi}
                              onChange={mode => updateItemPricingMode(globalIdx, mode)}
                              fmt={fmt}
                            />

                            {/* O card não tem cabeçalho de coluna como a tabela,
                                então cada campo precisa do próprio rótulo: sem
                                isso o preço de um material de valor 0 aparece
                                como uma caixa vazia e sem sentido no celular
                                (visto no QA). */}
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">{tq.materialColQty}</Label>
                                <div className="flex items-center gap-1">
                                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
                                    onClick={() => updateItemQty(globalIdx, round2(item.quantity - 1))}>
                                    <Minus className="h-3.5 w-3.5" />
                                  </Button>
                                  <QuantityField
                                    quantity={item.quantity}
                                    onCommit={qty => updateItemQty(globalIdx, qty)}
                                    className="h-9 w-14 text-center px-1"
                                  />
                                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
                                    onClick={() => updateItemQty(globalIdx, round2(item.quantity + 1))}>
                                    <Plus className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                              <div className="ml-auto space-y-1">
                                <Label className="block text-right text-[11px] text-muted-foreground">{tq.materialColUnitPrice}</Label>
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
                                  className="h-9 w-24 text-sm"
                                />
                              </div>
                            </div>

                            <p className="text-right text-sm font-semibold">{fmt(item.total_price)}</p>

                            {detailsOpen ? (
                              <Textarea
                                value={item.details ?? ''}
                                onChange={e => updateItemDetails(globalIdx, e.target.value)}
                                placeholder={tq.itemDetailsPlaceholder}
                                rows={1}
                                className="min-h-0 h-8 w-full resize-y py-1 text-xs"
                              />
                            ) : (
                              <button
                                type="button"
                                className="text-xs text-muted-foreground underline underline-offset-2"
                                onClick={() => setOpenMaterialDetails(prev => new Set(prev).add(globalIdx))}
                              >
                                {tq.materialDetailsToggle}
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">{tq.materialSubtotal}</span>
                        <span className="font-bold">{fmt(materialItems.reduce((s, i) => s + i.total_price, 0))}</span>
                      </div>
                    </div>

                    {/* Desktop/tablet (sm+): tabela. `overflow-x-auto` (não
                        `overflow-hidden`, que CORTA em vez de rolar). */}
                    <div className="hidden overflow-x-auto rounded-lg border sm:block">
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
                  <EmptyState>{tq.materialEmpty}</EmptyState>
                )}

                <MaterialBatchPicker
                  open={materialPickerOpen}
                  onOpenChange={setMaterialPickerOpen}
                  items={inventoryItems}
                  frequentIds={materialFrequentIds}
                  onConfirm={handleAddMaterialsBatch}
                />
              </section>

              <section className="space-y-3 border-t pt-5">
                <SectionHeader icon={<MapPin className="h-4 w-4 text-primary" />} title={tq.displacementHeader} />
                <div className="grid gap-3 rounded-lg border bg-muted/10 p-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Distância (km)</Label>
                    <NumericInput value={distanceKm ? String(distanceKm) : ''}
                      onValueChange={v => setDistanceKm(Number(v) || 0)}
                      className="h-9" placeholder={tq.displacementPlaceholder} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Modalidade</Label>
                    <Select
                      value={displacementPricingMode}
                      onValueChange={value => {
                        const mode = value === 'manual' ? 'manual' : 'cost_bdi';
                        setDisplacementPricingMode(mode);
                        if (mode === 'manual') setManualDisplacementPrice(displacementSalePrice);
                      }}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cost_bdi" disabled={!useBdi}>Custo por km + BDI</SelectItem>
                        <SelectItem value="manual">Valor manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Preço do deslocamento</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={displacementSalePrice || ''}
                      disabled={displacementPricingMode !== 'manual'}
                      onChange={event => setManualDisplacementPrice(Number(event.target.value) || 0)}
                      className="h-9"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Custo {fmt(bdi.displacementCost)} · Preço resultante {fmt(displacementSalePrice)}
                </p>
                {displacementPricingMode === 'manual' && (
                  <p className="text-xs text-warning">Valor manual: o deslocamento saiu da precificação automática estrita.</p>
                )}
              </section>
            </div>
          )}

          {/* ══ STEP 2: CONDIÇÕES COMERCIAIS ══ */}
          {currentStepKey === 'commercial' && (
            <div className="space-y-4">
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
                      <Input type="number" min={0} step="0.01" value={discountValue || ''}
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
                      <Label>{tq.receivableInstallmentsLabel}</Label>
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
                      <Label>{tq.receivableFirstDueDateLabel}</Label>
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

          {/* ══ STEP 3: REVISÃO E ENVIO ══ */}
          {currentStepKey === 'review' && (
            <div className="space-y-5">
              <WizardReviewChecklist items={quoteReviewItems} onEdit={setStep} />
              <section className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(15rem,19rem)]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{tq.reviewValidUntil}</Label>
                    {/* Opcional (valid_until vira undefined se vazio), por isso clearable */}
                    <DatePicker
                      value={validUntil}
                      onValueChange={setValidUntil}
                      placeholder={MESSAGES[locale].app.common.datePicker.placeholder}
                      clearable
                      clearLabel={MESSAGES[locale].app.common.clear}
                    />
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
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.preview_color }} />
                              {t.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {tq.reviewCoverHint}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!selectedTemplate}
                      onClick={() => setPreviewOpen(true)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {tq.reviewFullPreview}
                    </Button>
                  </div>
                </div>

                <div className="mx-auto w-full max-w-[19rem] space-y-2 md:mx-0">
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
          )}

        </StepTransition>
        </div>
        <div className="hidden min-w-0 self-start lg:block lg:pl-5">
          {summaryBlock}
        </div>
      </div>
    </div>
  );

  // ── Wizard footer (navegação + salvar rascunho) ──
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
      <div className="flex flex-col-reverse justify-between gap-2 sm:flex-row">
        <Button
          variant="outline"
          onClick={() => step === 0 ? onOpenChange(false) : setStep(step - 1)}
          disabled={mutating || savingDraft}
        >
          {step === 0 ? tq.cancel : <><ChevronLeft className="h-4 w-4 mr-1" /> {tq.back}</>}
        </Button>

        <div className="flex flex-wrap items-center justify-end gap-2">
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
            <Button
              onClick={advanceWithValidation}
              aria-disabled={!canNext()}
              className="aria-disabled:opacity-50"
            >
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
        description="Monte os itens, confira a precificação e revise a proposta antes de salvar."
        density="compact"
        className="sm:h-[88vh] sm:w-[96vw] sm:max-w-[1280px]"
        footer={wizardFooter}
        lockBackdrop
      >
        {wizardContent}
      </ResponsiveModal>

      <QuoteTemplatePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        quote={previewQuote}
        company={companySettings}
        templateSlug={selectedTemplate?.slug ?? 'clean'}
      />

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

      {/* Quick-create de tipo de serviço — botão "+" ao lado do seletor de serviços. */}
      <QuickServiceTypeDialog
        open={serviceFormOpen}
        onOpenChange={setServiceFormOpen}
        initialName={serviceSearchQuery}
        onCreated={handleServiceTypeCreated}
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
        <SelectTrigger className={cn('h-8 text-xs', compact ? 'w-32' : 'w-full')} aria-label={`Modo de preço de ${item.description}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {item.inventory_id && <SelectItem value="registered">Preço de venda cadastrado</SelectItem>}
          <SelectItem value="cost_bdi" disabled={!useBdi}>Custo de compra + BDI</SelectItem>
          <SelectItem value="manual">Valor manual</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-[10px] leading-tight text-muted-foreground">
        {item.unit_total_cost > 0 ? `Custo ${fmt(item.unit_total_cost)}` : 'Custo não informado'} · Preço {fmt(item.unit_price)}
      </p>
      {item.pricing_mode === 'manual' && (
        <p className="text-[10px] leading-tight text-warning">
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
        className={cn('h-8 text-xs', compact ? 'w-[12rem]' : 'w-full')}
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
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">{prefix}</span>
        )}
        <Input
          type="number" min={min} max={suffix === '%' ? 100 : undefined} step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className={`h-11 bg-background text-lg font-semibold tabular-nums ${prefix ? 'pl-9' : ''} ${suffix ? 'pr-9' : ''}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-6 text-center text-sm text-muted-foreground">
      <Inbox className="h-5 w-5 text-muted-foreground/50" />
      {children}
    </div>
  );
}
