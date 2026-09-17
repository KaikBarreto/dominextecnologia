import { Badge } from '@/components/ui/badge';
import { IconPreview } from '@/components/customers/originIcons';
import { useCustomerOrigins, findOriginByName } from '@/hooks/useCustomerOrigins';
import { cn } from '@/lib/utils';

interface OriginBadgeProps {
  /** `leads.source` — texto livre, casado pelo nome com o catálogo de origens. */
  source?: string | null;
  className?: string;
  iconClassName?: string;
}

/**
 * Badge de origem do lead: ícone + cor do catálogo (`customer_origins`)
 * quando o nome salvo em `leads.source` casa com uma origem ativa; cai no
 * badge neutro de sempre quando a origem foi renomeada/apagada do catálogo
 * ou o lead não tem origem definida.
 *
 * Usado no `LeadCard` (kanban) e no `LeadDetailModal` (bloco "Origem") pra
 * manter a mesma regra de visual nos dois lugares.
 */
export function OriginBadge({ source, className, iconClassName }: OriginBadgeProps) {
  const { activeOrigins } = useCustomerOrigins();

  if (!source) return null;

  const origin = findOriginByName(activeOrigins, source);

  if (!origin) {
    return (
      <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', className)}>
        {source}
      </Badge>
    );
  }

  return (
    <Badge
      className={cn('gap-1 border-0 text-white text-[10px] px-1.5 py-0', className)}
      style={{ backgroundColor: origin.color }}
    >
      <IconPreview name={origin.icon} className={iconClassName ?? 'h-2.5 w-2.5'} />
      {source}
    </Badge>
  );
}
