import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAdminFinancialCategories } from '@/hooks/useAdminFinancialCategories';
import {
  useCategorizeLedgerItem,
  type LedgerAsaasItem,
} from '@/hooks/useAsaasReconciliation';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  item: LedgerAsaasItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog (drawer no mobile) pra categorizar um movimento "a categorizar".
 *
 * Mostra só categorias do tipo certo: crédito → income, débito → expense.
 * Confirma → useCategorizeLedgerItem → o movimento vira "Categorizado".
 */
export function CategorizeLedgerModal({ item, open, onOpenChange }: Props) {
  const { data: categories = [] } = useAdminFinancialCategories();
  const categorize = useCategorizeLedgerItem();
  const [selected, setSelected] = useState<string>('');

  const isIncome = item?.direction === 'credit';

  // Só categorias compatíveis com o sentido do movimento.
  const options = useMemo(
    () => categories.filter((c) => c.type === (isIncome ? 'income' : 'expense')),
    [categories, isIncome],
  );

  // Reseta a seleção sempre que abre num item diferente.
  useEffect(() => {
    setSelected(item?.category && options.some((o) => o.name === item.category) ? item.category : '');
  }, [item, options]);

  if (!item) return null;

  const handleConfirm = () => {
    if (!selected) return;
    categorize.mutate(
      {
        ledgerId: item.id,
        category: selected,
        adminTransactionId: item.admin_financial_transaction_id,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Categorizar movimento"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={categorize.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selected || categorize.isPending}>
            {categorize.isPending ? 'Salvando...' : 'Confirmar'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Resumo do movimento */}
        <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {format(new Date(item.occurred_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
            <span
              className={cn(
                'text-base font-semibold whitespace-nowrap',
                isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
              )}
            >
              {isIncome ? '+' : '-'}
              {fmt(Number(item.amount))}
            </span>
          </div>
          <p className="text-sm">{item.description || 'Movimento sem descrição'}</p>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
              isIncome
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-500/15 text-red-700 dark:text-red-400',
            )}
          >
            {isIncome ? 'Entrada' : 'Saída'}
          </span>
        </div>

        {/* Seleção de categoria */}
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Categoria ({isIncome ? 'receita' : 'despesa'})
          </label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha uma categoria" />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Nenhuma categoria de {isIncome ? 'receita' : 'despesa'} disponível.
                </div>
              ) : (
                options.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.label}
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
    </ResponsiveModal>
  );
}
