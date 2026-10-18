import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Copy, AlertTriangle } from 'lucide-react';
import type { FinancialImportRowStatus } from '@/hooks/useFinancialImport';
import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';

/**
 * Selo saturado do status de uma linha da conferência (`ready`/`duplicate`/
 * `blocked`) — mesma régua do `ReconciliationStatusBadge`: fundo saturado,
 * ícone branco direto, nunca outline dessaturado.
 */
export function ImportRowStatusBadge({ status, locale }: { status: FinancialImportRowStatus; locale: LocaleCode }) {
  const t = MESSAGES[locale].app.finance.spreadsheetImport.status;

  if (status === 'ready') {
    return (
      <Badge variant="success" className="gap-1 whitespace-nowrap">
        <CheckCircle2 className="h-3 w-3" />
        {t.ready}
      </Badge>
    );
  }
  if (status === 'duplicate') {
    return (
      <Badge variant="muted" className="gap-1 whitespace-nowrap">
        <Copy className="h-3 w-3" />
        {t.duplicate}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1 whitespace-nowrap">
      <AlertTriangle className="h-3 w-3" />
      {t.blocked}
    </Badge>
  );
}
