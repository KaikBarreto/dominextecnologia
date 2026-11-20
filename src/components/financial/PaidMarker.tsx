import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDateTime } from '@/lib/format';

interface PaidMarkerSource {
  paid_marked_at?: string | null;
  settledBy?: { full_name: string | null; email: string | null } | null;
}

/**
 * Quem deu baixa num lançamento e quando.
 *
 * O carimbo é gravado pelo banco na hora em que o lançamento vira pago ou
 * recebido (o app não escolhe o nome). Baixa antiga, de antes do registro
 * existir, não tem carimbo: aí o componente só devolve o conteúdo, sem dica.
 * Baixa feita pelo sistema (importação, rotina) mostra a data sem nome.
 */
export function describePaidMarker(
  source: PaidMarkerSource | null | undefined,
  texts: { by: string; system: string },
  formatWhen: (value: string) => string,
): string | null {
  if (!source?.paid_marked_at) return null;
  const when = formatWhen(source.paid_marked_at);
  const name = source.settledBy?.full_name?.trim() || source.settledBy?.email?.trim();
  return name
    ? texts.by.replace('{name}', name).replace('{when}', when)
    : texts.system.replace('{when}', when);
}

interface PaidMarkerProps {
  transaction: unknown;
  children: ReactNode;
  /** Mostra também "por Fulano" ao lado, para o celular (não existe hover). */
  inline?: boolean;
}

export function PaidMarker({ transaction, children, inline = false }: PaidMarkerProps) {
  const { locale, timezone } = useAppLocaleContext();
  const texts = MESSAGES[locale].app.finance.paidMarker;
  const source = transaction as PaidMarkerSource | null;
  const label = describePaidMarker(source, texts, (value) => formatDateTime(value, locale, timezone));
  if (!label) return <>{children}</>;

  const name = source?.settledBy?.full_name?.trim();
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{children}</span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{label}</p>
        </TooltipContent>
      </Tooltip>
      {inline && name && (
        <span className="text-[10px] text-muted-foreground">
          {texts.inlineBy.replace('{name}', name.split(/\s+/)[0])}
        </span>
      )}
    </>
  );
}
