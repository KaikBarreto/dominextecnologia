import { Calculator, Sparkles } from 'lucide-react';
import { QuoteItemsTable } from '@/components/quotes/QuoteItemsTable';
import { QuoteBdiScopeGuide } from '@/components/quotes/QuoteBdiScopeGuide';
import { QuoteBdiComposer } from '@/components/quotes/QuoteBdiComposer';
import { Skeleton } from '@/components/ui/skeleton';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Button } from '@/components/ui/button';
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
    <div className="space-y-8">
      {pricing && onPricingChange && (
        <section className="space-y-4" aria-label="Precificação da ordem de serviço">
          <h3 className="text-xl font-semibold sm:text-2xl">Como você quer precificar?</h3>
          <div role="group" aria-label="Modo de formação do preço da OS" className="grid gap-3 sm:grid-cols-2">
            {[{ bdi: false, title: 'Preço cadastrado ou manual', text: 'Use o preço do catálogo ou informe o valor que será cobrado.' }, { bdi: true, title: 'Calcular com BDI', text: 'Forme o preço a partir dos custos, impostos, administração e lucro.' }].map(mode => <Button key={String(mode.bdi)} type="button" variant="outline" aria-pressed={pricing.use_bdi === mode.bdi} onClick={() => onPricingChange({ ...pricing, use_bdi: mode.bdi })} className={`h-auto min-h-24 flex-col items-start whitespace-normal rounded-xl px-5 py-4 text-left ${pricing.use_bdi === mode.bdi ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground' : ''}`}>
              <span className="text-lg font-semibold">{mode.title}</span><span className="mt-1 text-sm font-normal leading-relaxed opacity-80">{mode.text}</span>
            </Button>)}
          </div>
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
          variant={onChange ? "wizard" : "table"}
          showServicePicker={Boolean(onChange)}
          pricingEnabled={Boolean(pricing?.use_bdi)}
          bdiFactor={bdiFactor}
        />
      )}

      {pricing?.use_bdi && onPricingChange && <section className="space-y-4">
        <QuoteBdiComposer
          totalCost={automaticCost} finalPrice={automaticPrice} bdiFactor={bdiFactor}
          taxRate={pricing.tax_rate} adminRate={pricing.admin_indirect_rate} profitRate={pricing.profit_rate}
          onTaxChange={value => setPricingRate('tax_rate', value)}
          onAdminChange={value => setPricingRate('admin_indirect_rate', value)}
          onProfitChange={value => setPricingRate('profit_rate', value)}
          formatMoney={money} formatRate={value => number(value, { maximumFractionDigits: 2 })}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Preços manuais são preservados. Recalcule apenas quando desejar.</p>
          <Button type="button" className="h-12 gap-2" disabled={!items.some(item => Number(item.unit_total_cost || 0) > 0)} onClick={() => onChange?.(applyBdiToServiceOrderBudgetItems(items, bdiFactor))}><Sparkles className="h-4 w-4" />Aplicar BDI aos itens com custo</Button>
        </div>
      </section>}

      {pricing?.use_bdi && items.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer py-2 font-semibold">Conferir onde o BDI foi aplicado</summary><QuoteBdiScopeGuide
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
        /></details>
      )}

      {items.length > 0 && (
        <div className="space-y-3 rounded-2xl bg-primary p-5 text-base text-primary-foreground sm:p-6">
          <div className="flex flex-wrap justify-between gap-3 text-primary-foreground/80">
            <span>Serviços e mão de obra</span>
            <span>{money(totals.services)}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-3 text-primary-foreground/80">
            <span>Materiais</span>
            <span>{money(totals.materials)}</span>
          </div>
          {adjustment !== 0 && (
            <div className="flex flex-wrap justify-between gap-3 text-primary-foreground/80">
              <span>Ajustes e descontos do orçamento</span>
              <span>{money(adjustment)}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary-foreground/20 pt-4 text-xl font-semibold sm:text-2xl">
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
