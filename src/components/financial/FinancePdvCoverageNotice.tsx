import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FINANCE_PDV_COVERAGE_NOTE, hasPdvFinancialSources } from '@/lib/finance-pdv-coverage';

/** A financial ledger is not the delivered-sales reconciliation read model. */
export function FinancePdvCoverageNotice({ transactions }: {
  transactions: ReadonlyArray<{ id: string; origin?: string | null; pdv_financial_role?: string | null }>;
}) {
  if (!hasPdvFinancialSources(transactions)) return null;
  return (
    <Alert className="border-border bg-background" role="status">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Confira antes de fechar o resultado da empresa</AlertTitle>
      <AlertDescription>
        {FINANCE_PDV_COVERAGE_NOTE}
      </AlertDescription>
    </Alert>
  );
}
