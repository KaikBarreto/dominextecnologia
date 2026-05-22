import { useIsMobile } from '@/hooks/use-mobile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { AdminFinancialCategory } from '@/hooks/useAdminFinancialCategories';

interface Props {
  transactions: any[];
  categories: AdminFinancialCategory[];
  /** Quando 'mixed', mostra coluna/badge de tipo. Quando 'income' ou 'expense', oculta. */
  variant?: 'mixed' | 'income' | 'expense';
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function FinancialTransactionList({ transactions, categories, variant = 'mixed' }: Props) {
  const isMobile = useIsMobile();

  const labelFor = (name: string) => categories.find((c) => c.name === name)?.label ?? name;
  const colorFor = (name: string) => categories.find((c) => c.name === name)?.color ?? '#64748b';

  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="h-12 w-12" />}
        title="Nenhuma transação"
        description="Não há lançamentos no período selecionado."
      />
    );
  }

  if (isMobile) {
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        {transactions.map((t) => {
          const isIncome = t.type === 'income';
          const accentColor = isIncome ? '#10b981' : '#ef4444';
          return (
            <MobileListItem
              key={t.id}
              leading={
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-white shrink-0"
                  style={{ backgroundColor: accentColor }}
                >
                  {isIncome ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                </div>
              }
              title={
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{t.description || labelFor(t.category) || 'Lançamento'}</span>
                </div>
              }
              subtitle={
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <span>{format(new Date(t.transaction_date), 'dd/MM/yyyy', { locale: ptBR })}</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorFor(t.category) }} />
                    {labelFor(t.category)}
                  </span>
                </div>
              }
              trailing={
                <span
                  className={cn(
                    'text-sm font-semibold whitespace-nowrap',
                    isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {isIncome ? '+' : '-'}{fmt(Number(t.amount))}
                </span>
              }
            />
          );
        })}
      </div>
    );
  }

  // Desktop preservado — tabela original (com coluna Tipo quando variant=mixed).
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            {variant === 'mixed' && <TableHead>Tipo</TableHead>}
            <TableHead>Categoria</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((t: any) => (
            <TableRow key={t.id}>
              <TableCell className="text-sm">{format(new Date(t.transaction_date), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
              {variant === 'mixed' && (
                <TableCell>
                  <Badge className={t.type === 'income' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/30' : 'bg-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-500/30'}>
                    {t.type === 'income' ? 'Receita' : 'Despesa'}
                  </Badge>
                </TableCell>
              )}
              <TableCell>
                <Badge variant="outline" style={{ borderColor: colorFor(t.category), color: colorFor(t.category) }}>
                  {labelFor(t.category)}
                </Badge>
              </TableCell>
              <TableCell className="text-sm max-w-[300px] truncate">{t.description || '-'}</TableCell>
              <TableCell className={cn('text-right font-medium', t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                {t.type === 'income' ? '+' : '-'}{fmt(Number(t.amount))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
