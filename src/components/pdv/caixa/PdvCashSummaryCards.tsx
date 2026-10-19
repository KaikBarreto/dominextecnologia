import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { cn } from '@/lib/utils';
import type { SessionResult } from '@/lib/pdv/cash';
import type { pdv } from '@/lib/i18n/messages/app/pdv';
import { PdvAnimatedMoney } from '@/components/pdv/caixa/PdvAnimatedMoney';

type SummaryTexts = (typeof pdv)['pt-br']['cashPanel']['summary'];

interface PdvCashSummaryCardsProps {
  texts: SummaryTexts;
  result: SessionResult;
  valuesVisible: boolean;
  money: (value: number) => string;
  number: (value: number, opts?: Intl.NumberFormatOptions) => string;
}

/**
 * Resumo do caixa atual na hierarquia compacta aprovada para o Caixa:
 * vendido, comprado (CMV), lucro e despesas.
 *
 * O lucro aqui é REAL, não projeção: `pdv_order_items.unit_cost` é snapshot do
 * custo na hora da venda, então a margem bruta é medida. A EcoSistema precisa
 * chamar isso de "projeção" porque lá o custo do material não é conhecido.
 *
 * Sem cards saturados: a cor diferencia o valor e a página continua fácil de
 * percorrer sem competir visualmente com as ações rápidas.
 */
export function PdvCashSummaryCards({
  texts,
  result,
  valuesVisible,
  money,
  number,
}: PdvCashSummaryCardsProps) {
  const profitPositive = result.profit >= 0;

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em]">
        {texts.title}
      </h2>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
        <SummaryValue
          label={texts.sold}
          value={result.sold}
          valuesVisible={valuesVisible}
          money={money}
          className="text-green-600 dark:text-green-500"
        />
        <SummaryValue
          label={texts.purchased}
          value={result.cmv}
          valuesVisible={valuesVisible}
          money={money}
          className="text-blue-600 dark:text-blue-500"
        />
        <SummaryValue
          label={texts.profit}
          value={result.profit}
          valuesVisible={valuesVisible}
          money={money}
          className={cn(
            profitPositive
              ? 'text-orange-600 dark:text-orange-500'
              : 'text-red-600 dark:text-red-500',
          )}
          helper={
            result.marginPct != null && valuesVisible
              ? texts.margin.replace(
                  '{value}',
                  `${number(result.marginPct, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
                )
              : undefined
          }
        />
        <SummaryValue
          label={texts.expenses}
          value={result.expenses}
          valuesVisible={valuesVisible}
          money={money}
          className="text-red-600 dark:text-red-500"
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

function SummaryValue({
  label,
  value,
  valuesVisible,
  money,
  className,
  helper,
}: {
  label: string;
  value: number;
  valuesVisible: boolean;
  money: (value: number) => string;
  className: string;
  helper?: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
        {label}
      </p>
      <p className={cn('truncate text-xl font-extrabold tabular-nums sm:text-2xl', className)}>
        <PdvAnimatedMoney value={value} visible={valuesVisible} money={money} />
      </p>
      {helper && <p className="text-[10px] text-muted-foreground sm:text-xs">{helper}</p>}
    </div>
  );
}
