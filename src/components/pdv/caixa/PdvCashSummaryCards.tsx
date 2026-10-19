import { ArrowDownCircle, ArrowUpCircle, ShoppingCart, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { cn } from '@/lib/utils';
import type { SessionResult } from '@/lib/pdv/cash';
import { kpiValueSizeClass } from '@/components/financial/kpiChipSize';
import type { pdv } from '@/lib/i18n/messages/app/pdv';

type SummaryTexts = (typeof pdv)['pt-br']['cashPanel']['summary'];

interface PdvCashSummaryCardsProps {
  texts: SummaryTexts;
  result: SessionResult;
  valuesVisible: boolean;
  money: (value: number) => string;
  number: (value: number, opts?: Intl.NumberFormatOptions) => string;
}

/**
 * Resumo do caixa atual: Vendido, Receitas, Despesas e LUCRO.
 *
 * O lucro aqui é REAL, não projeção: `pdv_order_items.unit_cost` é snapshot do
 * custo na hora da venda, então a margem bruta é medida. A EcoSistema precisa
 * chamar isso de "projeção" porque lá o custo do material não é conhecido.
 *
 * KPI em card SATURADO com texto na cor de contraste do token (régua da casa,
 * mesmo padrão dos cards de Receitas/Despesas do Financeiro).
 */
export function PdvCashSummaryCards({
  texts,
  result,
  valuesVisible,
  money,
  number,
}: PdvCashSummaryCardsProps) {
  const hidden = '•••••';
  const show = (value: number) => (valuesVisible ? money(value) : hidden);
  const profitPositive = result.profit >= 0;

  const formatted = [result.sold, result.revenues, result.expenses, result.profit].map(show);
  const valueSize = kpiValueSizeClass(formatted);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {texts.title}
      </h2>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Kpi
          label={texts.sold}
          value={formatted[0]}
          valueSize={valueSize}
          icon={<ShoppingCart className="h-4 w-4" />}
          className="bg-info text-info-foreground"
        />
        <Kpi
          label={texts.revenues}
          value={formatted[1]}
          valueSize={valueSize}
          icon={<ArrowUpCircle className="h-4 w-4" />}
          className="bg-success text-success-foreground"
        />
        <Kpi
          label={texts.expenses}
          value={formatted[2]}
          valueSize={valueSize}
          icon={<ArrowDownCircle className="h-4 w-4" />}
          className="bg-destructive text-destructive-foreground"
        />
        <Kpi
          label={texts.profit}
          value={formatted[3]}
          valueSize={valueSize}
          icon={
            profitPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />
          }
          className={cn(
            profitPositive ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground',
          )}
          footer={
            <>
              <span className="block">{texts.cmv.replace('{value}', show(result.cmv))}</span>
              {result.marginPct != null && valuesVisible && (
                <span className="block">
                  {texts.margin.replace(
                    '{value}',
                    `${number(result.marginPct, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
                  )}
                </span>
              )}
            </>
          }
        />
      </div>

      {/* Custo zero infla o lucro em silêncio. A tela avisa em vez de deixar o
          número mentir. */}
      {result.itemsWithoutCost > 0 && (
        <NoticeBanner variant="warning">
          {texts.noCostWarning.replace('{count}', String(result.itemsWithoutCost))}
        </NoticeBanner>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  valueSize,
  icon,
  className,
  footer,
}: {
  label: string;
  value: string;
  valueSize: string;
  icon: React.ReactNode;
  className: string;
  footer?: React.ReactNode;
}) {
  return (
    <Card className={cn('border-0', className)}>
      <CardContent className="flex h-full flex-col gap-1 p-3 sm:p-4">
        <div className="flex items-center gap-1.5">
          {icon}
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider sm:text-xs">
            {label}
          </p>
        </div>
        <p className={cn('font-extrabold tabular-nums', valueSize, 'sm:text-2xl')}>{value}</p>
        {footer && <div className="mt-auto pt-1 text-[10px] leading-tight sm:text-xs">{footer}</div>}
      </CardContent>
    </Card>
  );
}
