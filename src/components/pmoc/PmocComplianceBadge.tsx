import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

/**
 * Selo visual "Conforme Lei Federal 13.589/2018".
 *
 * Aparece sempre que uma OS / contrato / documento PMOC quer comunicar
 * conformidade regulatória. Padronizado em 3 variantes pra cobrir os
 * principais contextos:
 *
 * - `chip`    — inline pequeno, pra listas e cards (label curto).
 * - `ribbon`  — banner horizontal de destaque, pra header de página/OS.
 * - `footer`  — linha discreta no rodapé (PDF / portal público — Onda C).
 *
 * Cores semânticas: usa token `info` (não compete com success/warning/destructive
 * que já têm significados de ação no app).
 *
 * Onda A da v1.9.0 — Lei Federal 13.589/2018.
 * Mestre: `docs/planos/2026-05-23-pmoc-v1.9-arquitetura.md` §2.10.
 */
export type PmocComplianceBadgeVariant = 'chip' | 'ribbon' | 'footer';

export interface PmocComplianceBadgeProps {
  variant?: PmocComplianceBadgeVariant;
  className?: string;
  /** Quando true, renderiza com tooltip explicando a lei. */
  withTooltip?: boolean;
}

function ChipBody({ className, t }: { className?: string; t: ReturnType<typeof usePmocBadgeT> }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5',
        'text-[10px] font-semibold uppercase tracking-wide text-white',
        'border border-blue-700 whitespace-nowrap',
        className,
      )}
      aria-label={t.chipAriaLabel}
    >
      <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{t.label}</span>
    </span>
  );
}

function RibbonBody({ className, t }: { className?: string; t: ReturnType<typeof usePmocBadgeT> }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border border-blue-700 bg-blue-600 px-3 py-2',
        'text-white',
        className,
      )}
      role="note"
      aria-label={t.chipAriaLabel}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/80">
          {t.ribbonLabel}
        </p>
        <p className="text-sm font-semibold leading-tight">
          {t.ribbonSubtitle}
        </p>
      </div>
    </div>
  );
}

function FooterBody({ className, t }: { className?: string; t: ReturnType<typeof usePmocBadgeT> }) {
  return (
    <p
      className={cn(
        'flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground',
        className,
      )}
    >
      <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{t.footerText}</span>
    </p>
  );
}

function usePmocBadgeT() {
  const { locale } = useAppLocaleContext();
  return MESSAGES[locale].app.pmoc.complianceBadge;
}

export function PmocComplianceBadge({
  variant = 'chip',
  className,
  withTooltip = false,
}: PmocComplianceBadgeProps) {
  const t = usePmocBadgeT();

  const body =
    variant === 'chip' ? (
      <ChipBody className={className} t={t} />
    ) : variant === 'ribbon' ? (
      <RibbonBody className={className} t={t} />
    ) : (
      <FooterBody className={className} t={t} />
    );

  if (!withTooltip) return body;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span wrapper garante alvo de hover em variantes inline */}
        <span className="inline-flex">{body}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        {t.tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}
