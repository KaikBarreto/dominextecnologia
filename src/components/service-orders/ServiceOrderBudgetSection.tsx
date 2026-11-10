import { Calculator, Sparkles } from 'lucide-react';
import { QuoteItemsTable } from '@/components/quotes/QuoteItemsTable';
import { QuoteBdiScopeGuide } from '@/components/quotes/QuoteBdiScopeGuide';
import { BDICompositionPreview } from '@/components/pricing/BDICompositionPreview';
import { Skeleton } from '@/components/ui/skeleton';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumericInput, parseDecimalInputValue } from '@/components/ui/numeric-input';
import { Switch } from '@/components/ui/switch';
import {
  applyBdiToServiceOrderBudgetItems,
  calculateServiceOrderBdiFactor,
  calculateServiceOrderBudgetTotals,
  type ServiceOrderBudgetItem,
  type ServiceOrderBudgetPricing,
} from '@/lib/serviceOrderBudget';
import { useLocaleFormatters } from '@/lib/format/hooks';

interface ServiceOrderBudgetSectionProps {
  items: ServiceOrderBudgetItem[];
  onChange?: (items: ServiceOrderBudgetItem[]) => void;
  loading?: boolean;
  /** Total consolidado da OS. Pode incluir desconto/ajuste do orçamento original. */
  totalValue?: number | null;
  pricing?: ServiceOrderBudgetPricing;
  onPricingChange?: (pricing: ServiceOrderBudgetPricing) => void;
}

function EditableRateField({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value).replace('.', ','));
  useEffect(() => setDraft(String(value).replace('.', ',')), [value]);
  const commit = () => {
    const parsed = parseDecimalInputValue(draft);
    if (parsed == null || parsed < 0) {
      setDraft(String(value).replace('.', ','));
      return;
    }
    onCommit(parsed);
  };
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="relative">
        <NumericInput
          id={id}
          decimal
          maxDecimals={2}
          value={draft}
          onValueChange={setDraft}
          onBlur={commit}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          className="h-9 pr-8 tabular-nums"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
      </div>
    </div>
  );
}
export function ServiceOrderBudgetSection({
  items,
  onChange,
  loading,
  totalValue,
  pricing,
  onPricingChange,
}: ServiceOrderBudgetSectionProps) {
  const { money, number } = useLocaleFormatters();
  const totals = calculateServiceOrderBudgetTotals(items);
  const finalTotal = totalValue ?? (totals.total + Number(pricing?.commercial_adjustment || 0));
  const adjustment = Math.round((finalTotal - totals.total) * 100) / 100;
  const bdiFactor = pricing
    ? calculateServiceOrderBdiFactor(pricing.tax_rate, pricing.admin_indirect_rate, pricing.profit_rate)
    : 0.68;
  const automaticItems = items.filter(item => pricing?.use_bdi && item.pricing_mode === 'cost_bdi');
  const automaticCost = automaticItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_total_cost || 0),
    0,
  );
  const automaticPrice = automaticItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  const setPricingRate = (field: 'tax_rate' | 'admin_indirect_rate' | 'profit_rate', value: number) => {
    if (!pricing || !onPricingChange) return;
    const next = { ...pricing, [field]: Math.max(0, value) };
    onPricingChange({
      ...next,
      bdi: calculateServiceOrderBdiFactor(next.tax_rate, next.admin_indirect_rate, next.profit_rate),
    });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pricing && onPricingChange && (
        <section className="space-y-4 border-y py-4" aria-label="Precificação da ordem de serviço">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Label htmlFor="os-use-bdi" className="text-sm font-semibold">Precificar com BDI</Label>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {pricing.use_bdi
                  ? 'Transforme o seu custo em preço para o cliente. Cada item ainda pode usar preço cadastrado ou manual.'
                  : 'Orçamento padrão: use os preços cadastrados ou digite livremente, sem cálculo automático.'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {pricing.use_bdi ? 'BDI automático' : 'Preço livre'}
              </span>
              <Switch
                id="os-use-bdi"
                checked={pricing.use_bdi}
                onCheckedChange={checked => onPricingChange({ ...pricing, use_bdi: checked })}
              />
            </div>
          </div>

          {pricing.use_bdi && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  ['tax_rate', 'Impostos'],
                  ['admin_indirect_rate', 'Adm. indireta'],
                  ['profit_rate', 'Lucro'],
                ] as const).map(([field, label]) => (
                  <EditableRateField
                    key={field}
                    id={`os-${field}`}
                    label={label}
                    value={pricing[field]}
                    onCommit={value => setPricingRate(field, value)}
                  />
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Coeficiente <strong className="text-foreground">{bdiFactor.toFixed(4)}</strong>. Aplicar afeta somente itens com custo conhecido.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  disabled={!items.some(item => Number(item.unit_total_cost || 0) > 0)}
                  onClick={() => onChange?.(applyBdiToServiceOrderBudgetItems(items, bdiFactor))}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Aplicar aos itens com custo
                </Button>
              </div>

              {automaticItems.length > 0 && (
                <BDICompositionPreview
                  totalCost={automaticCost}
                  finalPrice={automaticPrice}
                  bdiFactor={bdiFactor}
                  taxRate={pricing.tax_rate}
                  adminRate={pricing.admin_indirect_rate}
                  profitRate={pricing.profit_rate}
                  formatMoney={money}
                  formatRate={value => number(value, { maximumFractionDigits: 2 })}
                  labels={{
                    composition: 'Composição automática desta OS',
                    cost: 'Seu custo',
                    tax: 'Impostos',
                    admin: 'Administração',
                    profit: 'Lucro',
                    finalPrice: 'Cliente paga',
                    factor: 'Coeficiente BDI',
                    factorFormation: 'Formação do coeficiente',
                    priceFormula: 'Custo dividido pelo coeficiente',
                  }}
                  variant="inline"
                />
              )}
            </div>
          )}
        </section>
      )}

      {!onChange && items.length === 0 ? (
        <NoticeBanner variant="info">
          Esta OS ainda não possui serviços ou materiais orçados.
        </NoticeBanner>
      ) : (
        <QuoteItemsTable
          items={items}
          onChange={next => onChange?.(next as ServiceOrderBudgetItem[])}
          readOnly={!onChange}
          showServicePicker={false}
          pricingEnabled={Boolean(pricing?.use_bdi)}
          bdiFactor={bdiFactor}
        />
      )}

      {pricing && items.length > 0 && (
        <QuoteBdiScopeGuide
          items={items.map(item => ({
            item_type: item.item_type === 'material' ? 'material' as const : 'servico' as const,
            pricing_mode: item.pricing_mode ?? 'manual',
            quantity: Number(item.quantity || 0),
            unit_total_cost: Number(item.unit_total_cost || 0),
            unit_price: Number(item.unit_price || 0),
            unit_materials_cost: Number(item.unit_materials_cost || 0),
          }))}
          useBdi={pricing.use_bdi}
          bdiFactor={bdiFactor}
          displacementMode="manual"
          displacementCost={0}
          displacementPrice={0}
          formatMoney={money}
          compact
        />
      )}

      {items.length > 0 && (
        <div className="ml-auto w-full max-w-sm space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Serviços e mão de obra</span>
            <span>{money(totals.services)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Materiais</span>
            <span>{money(totals.materials)}</span>
          </div>
          {adjustment !== 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Ajustes e descontos do orçamento</span>
              <span>{money(adjustment)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span className="flex items-center gap-1.5">
              <Calculator className="h-4 w-4" /> Total para faturamento
            </span>
            <span>{money(finalTotal)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
import { useEffect, useState } from 'react';
