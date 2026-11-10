import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type QuoteBdiPricingMode = 'registered' | 'cost_bdi' | 'manual';

export interface QuoteBdiScopeItem {
  item_type: 'servico' | 'material';
  pricing_mode: QuoteBdiPricingMode;
  quantity: number;
  unit_total_cost: number;
  unit_price: number;
  unit_materials_cost?: number;
}

export interface QuoteBdiScopeSummary {
  automatic: {
    services: number;
    materials: number;
    displacement: boolean;
    cost: number;
    customerPrice: number;
  };
  outside: {
    registered: number;
    manual: number;
    displacement: boolean;
    cost: number;
    customerPrice: number;
  };
  hasEmbeddedServiceMaterials: boolean;
}

export function summarizeQuoteBdiScope({
  items,
  useBdi,
  displacementMode,
  displacementCost,
  displacementPrice,
}: {
  items: QuoteBdiScopeItem[];
  useBdi: boolean;
  displacementMode: 'cost_bdi' | 'manual';
  displacementCost: number;
  displacementPrice: number;
}): QuoteBdiScopeSummary {
  const summary: QuoteBdiScopeSummary = {
    automatic: { services: 0, materials: 0, displacement: false, cost: 0, customerPrice: 0 },
    outside: { registered: 0, manual: 0, displacement: false, cost: 0, customerPrice: 0 },
    hasEmbeddedServiceMaterials: false,
  };

  items.forEach((item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    const cost = Math.max(0, Number(item.unit_total_cost) || 0) * quantity;
    const customerPrice = Math.max(0, Number(item.unit_price) || 0) * quantity;
    const automatic = useBdi && item.pricing_mode === 'cost_bdi';

    if (item.item_type === 'servico' && Number(item.unit_materials_cost ?? 0) > 0) {
      summary.hasEmbeddedServiceMaterials = true;
    }

    if (automatic) {
      summary.automatic[item.item_type === 'servico' ? 'services' : 'materials'] += 1;
      summary.automatic.cost += cost;
      summary.automatic.customerPrice += customerPrice;
      return;
    }

    summary.outside[item.pricing_mode === 'registered' ? 'registered' : 'manual'] += 1;
    summary.outside.cost += cost;
    summary.outside.customerPrice += customerPrice;
  });

  if (Math.max(displacementCost, displacementPrice) > 0) {
    const automaticDisplacement = useBdi && displacementMode === 'cost_bdi';
    if (automaticDisplacement) {
      summary.automatic.displacement = true;
      summary.automatic.cost += Math.max(0, displacementCost);
      summary.automatic.customerPrice += Math.max(0, displacementPrice);
    } else {
      summary.outside.displacement = true;
      summary.outside.cost += Math.max(0, displacementCost);
      summary.outside.customerPrice += Math.max(0, displacementPrice);
    }
  }

  return summary;
}

function plural(count: number, singular: string, pluralLabel: string) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

export function QuoteBdiScopeGuide({
  items,
  useBdi,
  bdiFactor,
  displacementMode,
  displacementCost,
  displacementPrice,
  formatMoney,
  compact = false,
}: {
  items: QuoteBdiScopeItem[];
  useBdi: boolean;
  bdiFactor: number;
  displacementMode: 'cost_bdi' | 'manual';
  displacementCost: number;
  displacementPrice: number;
  formatMoney: (value: number) => string;
  compact?: boolean;
}) {
  const summary = summarizeQuoteBdiScope({
    items,
    useBdi,
    displacementMode,
    displacementCost,
    displacementPrice,
  });
  const automaticLabels = [
    summary.automatic.services > 0 ? plural(summary.automatic.services, 'serviço', 'serviços') : null,
    summary.automatic.materials > 0 ? plural(summary.automatic.materials, 'material', 'materiais') : null,
    summary.automatic.displacement ? 'deslocamento' : null,
  ].filter(Boolean);
  const outsideLabels = [
    summary.outside.registered > 0 ? plural(summary.outside.registered, 'preço cadastrado', 'preços cadastrados') : null,
    summary.outside.manual > 0 ? plural(summary.outside.manual, 'preço manual', 'preços manuais') : null,
    summary.outside.displacement ? 'deslocamento manual' : null,
  ].filter(Boolean);

  return (
    <section className={cn('border-y py-4', compact && 'py-3')} aria-label="Aplicação do BDI neste orçamento">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">O que entra no BDI?</h4>
          <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {useBdi
              ? `O sistema transforma custo em preço usando o coeficiente ${bdiFactor.toFixed(4)}. Cada linha ainda pode manter um preço cadastrado ou manual.`
              : 'O BDI está desligado. Nenhuma linha será recalculada automaticamente; o cliente paga os preços cadastrados ou informados manualmente.'}
          </p>
        </div>
        <Badge className={useBdi ? 'border-0 bg-foreground text-background hover:bg-foreground' : 'border-0 bg-slate-600 text-white hover:bg-slate-600'}>
          {useBdi ? `Coeficiente ${bdiFactor.toFixed(4)}` : 'BDI desligado'}
        </Badge>
      </div>

      <div className={cn('mt-4 grid gap-4', compact ? 'grid-cols-1 divide-y' : 'sm:grid-cols-2 sm:divide-x')}>
        <div className={cn('min-w-0', !compact && 'sm:pr-4')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Dentro do BDI automático</p>
          {!compact && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Parte do custo da empresa e calcula quanto cobrar do cliente com imposto, administração e lucro.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {automaticLabels.length > 0 ? automaticLabels.join(' · ') : 'Nenhuma linha usando custo + BDI.'}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Seu custo</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{formatMoney(summary.automatic.cost)}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Cliente paga</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{formatMoney(summary.automatic.customerPrice)}</dd></div>
          </dl>
        </div>

        <div className={cn('min-w-0 border-t pt-4', !compact && 'sm:border-t-0 sm:pl-4 sm:pt-0')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Fora do BDI automático</p>
          {!compact && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Continua no orçamento, mas mantém o preço de venda cadastrado ou o valor digitado por você.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {outsideLabels.length > 0 ? outsideLabels.join(' · ') : 'Nenhuma linha com preço independente.'}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Seu custo conhecido</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{formatMoney(summary.outside.cost)}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Cliente paga</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{formatMoney(summary.outside.customerPrice)}</dd></div>
          </dl>
        </div>
      </div>

      {!compact && (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Materiais adicionados separadamente têm modalidade própria: preço cadastrado, custo de compra + BDI ou valor manual.
          {summary.hasEmbeddedServiceMaterials && ' Os materiais já incluídos na composição de um serviço permanecem dentro do custo desse serviço e não são cobrados novamente.'}
        </p>
      )}
    </section>
  );
}
