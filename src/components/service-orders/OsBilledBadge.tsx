import { TrendingUp, CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { getOsBillingStatus, type OsBillingSnapshot } from '@/lib/os-billing';
import { cn } from '@/lib/utils';

/**
 * Selo "esta OS já foi faturada", pra listagem, card e agenda.
 *
 * Dois estados, com a MESMA precedência do diálogo (`getOsBillingStatus`):
 * cobrança viva ganha de receita, porque é a informação mais específica (e
 * `hasRevenue` também fica true quando a cobrança já gerou o recebível).
 *
 * `compact` é a versão de linha de tabela/card: só o rótulo, sem o valor, pra
 * não competir com o número da OS. A versão cheia mostra o dinheiro.
 */
export function OsBilledBadge({
  snapshot,
  compact = false,
  className,
}: {
  snapshot: OsBillingSnapshot | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.osBilling.badge;

  const status = getOsBillingStatus(snapshot ?? null);
  if (status.kind === 'none') return null;

  if (status.kind === 'charge') {
    return (
      <Badge variant="info" className={cn('gap-1 whitespace-nowrap', className)}>
        <CreditCard className="h-3 w-3 shrink-0" />
        {compact || status.value == null
          ? t.charged
          : t.chargedWithValue.replace('{value}', formatMoney(status.value, currency, locale))}
      </Badge>
    );
  }

  return (
    <Badge variant="success" className={cn('gap-1 whitespace-nowrap', className)}>
      <TrendingUp className="h-3 w-3 shrink-0" />
      {compact
        ? t.billed
        : t.billedWithValue.replace('{value}', formatMoney(status.total, currency, locale))}
    </Badge>
  );
}
