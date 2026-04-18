import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  income: number;
  expenses: number;
  transactionsCount: number;
  onOpenIncome: () => void;
  onOpenExpense: () => void;
  onCreateIncome: () => void;
  onCreateExpense: () => void;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function FinancialSummaryCards({ income, expenses, transactionsCount, onOpenIncome, onOpenExpense, onCreateIncome, onCreateExpense }: Props) {
  const net = income - expenses;
  return (
    <Card className="overflow-hidden border-0 shadow-lg bg-gradient-to-br from-card to-muted/20">
      <CardContent className="p-6 md:p-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6 border-b border-border/50">
          <div className="text-center space-y-1 p-4 rounded-xl bg-muted/40 border border-border/50">
            <div className="flex items-center justify-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Saldo do Período</span>
            </div>
            <p className={cn('text-2xl md:text-3xl font-bold tracking-tight', net >= 0 ? 'text-foreground' : 'text-destructive')}>{fmt(net)}</p>
          </div>
          <div className="text-center space-y-1 p-4 rounded-xl bg-muted/40 border border-border/50">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transações</span>
            <p className="text-2xl md:text-3xl font-bold tracking-tight">{transactionsCount}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6">
          <div className="space-y-2">
            <button type="button" onClick={onOpenIncome} className="w-full flex flex-col sm:flex-row items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer group">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500 ring-4 ring-emerald-600/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Receitas</p>
                <p className="text-lg md:text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmt(income)}</p>
              </div>
            </button>
            <Button size="sm" className="w-full gap-2 bg-emerald-500 hover:bg-emerald-600 text-white" onClick={onCreateIncome}>
              <Plus className="h-4 w-4" />Nova Receita
            </Button>
          </div>
          <div className="space-y-2">
            <button type="button" onClick={onOpenExpense} className="w-full flex flex-col sm:flex-row items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all cursor-pointer group">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-500 ring-4 ring-red-600/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                <TrendingDown className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">Despesas</p>
                <p className="text-lg md:text-xl font-bold text-red-600 dark:text-red-400">{fmt(expenses)}</p>
              </div>
            </button>
            <Button size="sm" className="w-full gap-2 bg-red-500 hover:bg-red-600 text-white" onClick={onCreateExpense}>
              <Plus className="h-4 w-4" />Nova Despesa
            </Button>
          </div>
        </div>
        <div className="mt-4 p-4 rounded-xl bg-muted/50 border border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Resultado do período</span>
            <span className={cn('text-lg font-bold', net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {net >= 0 ? '+' : ''}{fmt(net)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
