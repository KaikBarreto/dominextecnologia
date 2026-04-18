import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, ShoppingCart, RefreshCw } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { AdminFinancialCategory } from '@/hooks/useAdminFinancialCategories';

interface Props {
  transactions: any[];
  categories: AdminFinancialCategory[];
  type: 'income' | 'expense';
  onCreate: () => void;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function FinancialMovementSection({ transactions, categories, type, onCreate }: Props) {
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

  const labelFor = (name: string) => categories.find((c) => c.name === name)?.label ?? name;
  const colorFor = (name: string) => categories.find((c) => c.name === name)?.color ?? '#64748b';

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4 border-0 shadow-md bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20"><ShoppingCart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Vendas</p>
                <p className="text-lg font-bold">{fmt(stats.salesTotal)}</p>
                <p className="text-[11px] text-muted-foreground">{stats.salesCount} transações</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 border-0 shadow-md bg-gradient-to-br from-cyan-500/10 to-cyan-500/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/20"><RefreshCw className="h-5 w-5 text-cyan-600 dark:text-cyan-400" /></div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Renovações</p>
                <p className="text-lg font-bold">{fmt(stats.renewalsTotal)}</p>
                <p className="text-[11px] text-muted-foreground">{stats.renewalsCount} transações</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 border-0 shadow-md">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Receitas</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmt(total)}</p>
            <p className="text-[11px] text-muted-foreground">{filtered.length} transações</p>
          </Card>
        </div>
      )}

      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b bg-muted/30 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">{type === 'income' ? 'Receitas' : 'Despesas'}</CardTitle>
            <Button size="sm" onClick={onCreate} className="gap-2">
              <Plus className="h-4 w-4" />{type === 'income' ? 'Nova Receita' : 'Nova Despesa'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm">{format(new Date(t.transaction_date), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                    <TableCell>
                      <Badge variant="outline" style={{ borderColor: colorFor(t.category), color: colorFor(t.category) }}>
                        {labelFor(t.category)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[300px] truncate">{t.description || '-'}</TableCell>
                    <TableCell className={cn('text-right font-medium', type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      {type === 'income' ? '+' : '-'}{fmt(Number(t.amount))}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma transação</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
