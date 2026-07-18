import { Gauge, Infinity as InfinityIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNfseQuota } from '@/hooks/useNfseQuota';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface NfseQuotaBadgeProps {
  companyId: string | null | undefined;
  className?: string;
}

/**
 * Selo discreto de consumo mensal de NFS-e: "142 / 200 emitidas este mês"
 * (ou "Ilimitado" no nível topo). A partir de 80% do limite vira tom de alerta
 * (warning) pra avisar que está perto de estourar. Mobile-first, inline — não
 * é painel, é só um medidor.
 */
export function NfseQuotaBadge({ companyId, className }: NfseQuotaBadgeProps) {
  const { quota, isLoading } = useNfseQuota(companyId);
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;

  if (isLoading || !quota) return null;

  if (quota.unlimited) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground',
          className,
        )}
      >
        <InfinityIcon className="h-3.5 w-3.5" />
        {t.quota.unlimited}
      </span>
    );
  }

  const limit = quota.limit ?? 0;
  const ratio = limit > 0 ? quota.used / limit : 0;
  const isNear = ratio >= 0.8;

  const usedLabel = t.quota.used
    .replace('{used}', String(quota.used))
    .replace('{limit}', String(limit));

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        isNear
          ? 'border-warning/40 bg-warning/10 text-warning'
          : 'border-border bg-muted/40 text-muted-foreground',
        className,
      )}
    >
      <Gauge className="h-3.5 w-3.5" />
      <span className={cn(isNear && 'font-semibold')}>{usedLabel}</span>
    </span>
  );
}
