import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ShoppingCart, RefreshCw } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { AdminFinancialCategory } from '@/hooks/useAdminFinancialCategories';
import { FinancialTransactionList } from './FinancialTransactionList';

interface Props {
  transactions: any[];
  categories: AdminFinancialCategory[];
  type: 'income' | 'expense';
  onCreate: () => void;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function FinancialMovementSection({ transactions, categories, type, onCreate }: Props) {
  const isMobile = useIsMobile();
  const filtered = transactions.filter((t) => t.type === type);
  const total = filtered.reduce((s, t) => s + Number(t.amount), 0);

  const stats = useMemo(() => {
    if (type !== 'income') return null;
    const sales = filtered.filter((t) => ['sale', 'first_sale'].includes(t.category));
    const renewals = filtered.filter((t) => t.category === 'renewal');
    return {
      salesTotal: sales.reduce((s, t) => s + Number(t.amount), 0),
      salesCount: sales.length,
      renewalsTotal: renewals.reduce((s, t) => s + Number(t.amount), 0),
      renewalsCount: renewals.length,
    };
  }, [filtered, type]);

  const totalLabel = type === 'income' ? 'Total Receitas' : 'Total Despesas';
  const totalColor = type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4 border shadow-sm bg-card">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500"><ShoppingCart className="h-5 w-5 text-white" /></div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Vendas</p>
                <p className="text-lg font-bold">{fmt(stats.salesTotal)}</p>
                <p className="text-[11px] text-muted-foreground">{stats.salesCount} transações</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 border shadow-sm bg-card">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500"><RefreshCw className="h-5 w-5 text-white" /></div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Renovações</p>
                <p className="text-lg font-bold">{fmt(stats.renewalsTotal)}</p>
                <p className="text-[11px] text-muted-foreground">{stats.renewalsCount} transações</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 border shadow-sm bg-card">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-600"><ShoppingCart className="h-5 w-5 text-white" /></div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{totalLabel}</p>
                <p className={cn('text-lg font-bold', totalColor)}>{fmt(total)}</p>
                <p className="text-[11px] text-muted-foreground">{filtered.length} transações</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Resumo (só pra despesas, já que receitas tem o bloco acima) */}
      {!stats && (
        <Card className="p-4 border shadow-sm bg-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{totalLabel}</p>
              <p className={cn('text-xl font-bold', totalColor)}>{fmt(total)}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">{filtered.length} transações</p>
          </div>
        </Card>
      )}

      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b bg-muted/30 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">{type === 'income' ? 'Receitas' : 'Despesas'}</CardTitle>
            {/* Botão inline só no desktop. Mobile usa FAB no parent. */}
            {!isMobile && (
              <Button size="sm" onClick={onCreate} className="gap-2">
                <Plus className="h-4 w-4" />{type === 'income' ? 'Nova Receita' : 'Nova Despesa'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <FinancialTransactionList
            transactions={filtered}
            categories={categories}
            variant={type}
          />
        </CardContent>
      </Card>
    </div>
  );
}
