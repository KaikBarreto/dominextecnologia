import { Gauge, Infinity as InfinityIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNfseQuota } from '@/hooks/useNfseQuota';
import { formatMoney } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface NfseQuotaBadgeProps {
  companyId: string | null | undefined;
  className?: string;
}

/**
 * Selo de consumo mensal de NFS-e: "142 / 200 emitidas este mês".
 *
 * SATURADO por regra da casa: fundo na cor + texto e ícone brancos. O pill
 * cinza de antes não comunicava nada — o dono da empresa precisa bater o olho
 * e saber se pode emitir hoje. Verde = tranquilo, âmbar = passou de 80% do
 * limite, vermelho = estourou (o servidor bloqueia a emissão).
 * O tooltip explica o nível atual e o próximo, pra a decisão de subir de nível
 * não depender de abrir outra tela.
 */
export function NfseQuotaBadge({ companyId, className }: NfseQuotaBadgeProps) {
  const { quota, isLoading } = useNfseQuota(companyId);
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;

  if (isLoading || !quota) return null;

  const tierLabel = t.quota.tierLabel.replace('{tier}', String(quota.tier));

  /** Linha do próximo nível (some no nível topo). */
  const nextLine = (() => {
    const next = quota.nextTier;
    if (!next) return null;
    const price = formatMoney(next.price, currency, locale);
    if (next.limit == null) {
      return t.quota.tooltipNextUnlimited
        .replace('{name}', next.name)
        .replace('{price}', price);
    }
    return t.quota.tooltipNext
      .replace('{name}', next.name)
      .replace('{limit}', String(next.limit))
      .replace('{price}', price);
  })();

  if (quota.unlimited) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm cursor-help',
              className,
            )}
          >
            <InfinityIcon className="h-3.5 w-3.5 text-white" />
            {t.quota.unlimited}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px]">
          <p className="font-medium">{tierLabel}</p>
          <p className="text-[11px] text-muted-foreground">{t.quota.tooltipUnlimited}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const limit = quota.limit ?? 0;
  const ratio = limit > 0 ? quota.used / limit : 0;
  const level: 'ok' | 'near' | 'full' = ratio >= 1 ? 'full' : ratio >= 0.8 ? 'near' : 'ok';
  const remaining = Math.max(limit - quota.used, 0);

  const bgByLevel: Record<typeof level, string> = {
    ok: 'bg-emerald-500',
    near: 'bg-amber-500',
    full: 'bg-red-500',
  };
  const explainByLevel: Record<typeof level, string> = {
    ok: t.quota.tooltipOk,
    near: t.quota.tooltipNear,
    full: t.quota.tooltipFull,
  };

  const usedLabel = t.quota.used
    .replace('{used}', String(quota.used))
    .replace('{limit}', String(limit));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow-sm cursor-help',
            bgByLevel[level],
            className,
          )}
        >
          <Gauge className="h-3.5 w-3.5 text-white" />
          {usedLabel}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[260px] space-y-1">
        <p className="font-medium">{tierLabel}</p>
        <p className="text-[11px] text-muted-foreground">{explainByLevel[level]}</p>
        {level !== 'full' && (
          <p className="text-[11px] text-muted-foreground">
            {t.quota.tooltipRemaining.replace('{remaining}', String(remaining))}
          </p>
        )}
        {nextLine && <p className="text-[11px] text-muted-foreground">{nextLine}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
