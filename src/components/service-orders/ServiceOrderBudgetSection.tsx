import { Calculator, ReceiptText } from 'lucide-react';
import { QuoteItemsTable } from '@/components/quotes/QuoteItemsTable';
import { Skeleton } from '@/components/ui/skeleton';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { calculateServiceOrderBudgetTotals, type ServiceOrderBudgetItem } from '@/lib/serviceOrderBudget';
import { useLocaleFormatters } from '@/lib/format/hooks';

interface ServiceOrderBudgetSectionProps {
  items: ServiceOrderBudgetItem[];
  onChange?: (items: ServiceOrderBudgetItem[]) => void;
  loading?: boolean;
  /** Total consolidado da OS. Pode incluir desconto/ajuste do orçamento original. */
  totalValue?: number | null;
}
export function ServiceOrderBudgetSection({
  items,
  onChange,
  loading,
  totalValue,
}: ServiceOrderBudgetSectionProps) {
  const { money } = useLocaleFormatters();
  const totals = calculateServiceOrderBudgetTotals(items);
  const finalTotal = totalValue ?? totals.total;
  const adjustment = Math.round((finalTotal - totals.total) * 100) / 100;

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ReceiptText className="h-4 w-4 text-primary" />
          Serviços, mão de obra e materiais
        </h3>
        <p className="text-xs text-muted-foreground">
          Estes valores formam o orçamento da OS e serão sugeridos ao faturar. O consumo real de estoque é registrado separadamente na execução.
        </p>
      </div>

      {!onChange && items.length === 0 ? (
        <NoticeBanner variant="info">
          Esta OS ainda não possui serviços ou materiais orçados.
        </NoticeBanner>
      ) : (
        <QuoteItemsTable
          items={items}
          onChange={next => onChange?.(next as ServiceOrderBudgetItem[])}
          readOnly={!onChange}
        />
      )}

      {items.length > 0 && (
        <div className="ml-auto w-full max-w-sm space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Serviços e mão de obra</span>
            <span>{money(totals.services)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Materiais</span>
            <span>{money(totals.materials)}</span>
          </div>
          {adjustment !== 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Ajustes e descontos do orçamento</span>
              <span>{money(adjustment)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span className="flex items-center gap-1.5">
              <Calculator className="h-4 w-4" /> Total para faturamento
            </span>
            <span>{money(finalTotal)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
