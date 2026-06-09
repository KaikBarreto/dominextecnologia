import { useIsMobile } from '@/hooks/use-mobile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { TrendingUp, TrendingDown, Tag, Banknote } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { AdminFinancialCategory } from '@/hooks/useAdminFinancialCategories';
import type { LedgerAsaasItem } from '@/hooks/useAsaasReconciliation';
import { ReconciliationStatusBadge } from './ReconciliationStatusBadge';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  items: LedgerAsaasItem[];
  categories: AdminFinancialCategory[];
  /** Abre o modal de categorização pra um item "a categorizar". */
  onCategorize: (item: LedgerAsaasItem) => void;
}

/**
 * Extrato espelhado do Asaas (`ledger_asaas`).
 *
 * Crédito = entrada (verde), débito = saída (vermelho). Cada linha mostra o
 * badge de status; itens "A categorizar" ganham ação pra classificar.
 */
export function LedgerAsaasList({ items, categories, onCategorize }: Props) {
  const isMobile = useIsMobile();

  const labelFor = (name: string | null) =>
    name ? categories.find((c) => c.name === name)?.label ?? name : null;
  const colorFor = (name: string | null) =>
    (name ? categories.find((c) => c.name === name)?.color : null) ?? '#64748b';

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Banknote className="h-12 w-12" />}
        title="Nenhum movimento"
        description="Sincronize com o Asaas para trazer o extrato."
      />
    );
  }

  if (isMobile) {
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        {items.map((it) => {
          const isIncome = it.direction === 'credit';
          const accentColor = isIncome ? '#10b981' : '#ef4444';
          const pending = it.status === 'pending_categorization';
          const catLabel = labelFor(it.category);
          return (
            <MobileListItem
              key={it.id}
              onClick={pending ? () => onCategorize(it) : undefined}
              leading={
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-white shrink-0"
                  style={{ backgroundColor: accentColor }}
                >
                  {isIncome ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                </div>
              }
              title={
                <span className="truncate">{it.description || 'Movimento Asaas'}</span>
              }
              subtitle={
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <span>{format(new Date(it.occurred_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                  {catLabel && (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorFor(it.category) }} />
                      {catLabel}
                    </span>
                  )}
                  <ReconciliationStatusBadge status={it.status} />
                </div>
              }
              trailing={
                <span
                  className={cn(
                    'text-sm font-semibold whitespace-nowrap',
                    isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {isIncome ? '+' : '-'}
                  {fmt(Number(it.amount))}
                </span>
              }
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-right">Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => {
            const isIncome = it.direction === 'credit';
            const pending = it.status === 'pending_categorization';
            const catLabel = labelFor(it.category);
            return (
              <TableRow key={it.id}>
                <TableCell className="text-sm whitespace-nowrap">
                  {format(new Date(it.occurred_at), 'dd/MM/yyyy', { locale: ptBR })}
                </TableCell>
                <TableCell className="text-sm max-w-[280px] truncate">
                  {it.description || '-'}
                </TableCell>
                <TableCell>
                  {catLabel ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-sm"
                      style={{ color: colorFor(it.category) }}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorFor(it.category) }} />
                      {catLabel}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <ReconciliationStatusBadge status={it.status} />
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-medium whitespace-nowrap',
                    isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {isIncome ? '+' : '-'}
                  {fmt(Number(it.amount))}
                </TableCell>
                <TableCell className="text-right">
                  {pending && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onCategorize(it)}>
                      <Tag className="h-3.5 w-3.5" />
                      Categorizar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
