import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AdminFinancialMovementModal } from '@/components/admin/AdminFinancialMovementModal';
import { TrendingUp, TrendingDown, Receipt, Pencil, Trash2, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { AdminFinancialCategory } from '@/hooks/useAdminFinancialCategories';
import {
  useDeleteAdminFinancialTransaction,
  isManualAdminTransaction,
  type AdminFinancialTransaction,
} from '@/hooks/useAdminFinancialTransactions';
import { AdminCategoryPill } from './AdminCategoryPill';

interface Props {
  transactions: any[];
  categories: AdminFinancialCategory[];
  /** Quando 'mixed', mostra coluna/badge de tipo. Quando 'income' ou 'expense', oculta. */
  variant?: 'mixed' | 'income' | 'expense';
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const AUTO_HINT = 'Lançamento automático — gerencie pela empresa / Asaas';

export function FinancialTransactionList({ transactions, categories, variant = 'mixed' }: Props) {
  const isMobile = useIsMobile();
  const deleteMutation = useDeleteAdminFinancialTransaction();

  const [editing, setEditing] = useState<AdminFinancialTransaction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminFinancialTransaction | null>(null);

  const labelFor = (name: string) => categories.find((c) => c.name === name)?.label ?? name;

  const startEdit = (t: AdminFinancialTransaction) => { setEditing(t); setEditOpen(true); };
  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteMutation.mutate(pendingDelete.id, { onSettled: () => setPendingDelete(null) });
  };

  if (transactions.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={<Receipt className="h-10 w-10" />}
        title="Nenhum lançamento ainda"
        description="Os lançamentos aparecem aqui conforme as vendas e movimentações forem registradas."
      />
    );
  }

  const dialogs = (
    <>
      <AdminFinancialMovementModal
        open={editOpen}
        onOpenChange={(o) => { setEditOpen(o); if (!o) setEditing(null); }}
        transaction={editing}
      />
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta movimentação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (isMobile) {
    return (
      <>
        <div className="rounded-xl border bg-card overflow-hidden">
          {transactions.map((t) => {
            const isIncome = t.type === 'income';
            const accentColor = isIncome ? '#10b981' : '#ef4444';
            const isManual = isManualAdminTransaction(t);
            const actions: ItemAction[] = isManual
              ? [
                  { key: 'edit', label: 'Editar', icon: <Pencil className="h-4 w-4" />, variant: 'edit', onClick: () => startEdit(t) },
                  { key: 'delete', label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, variant: 'destructive', onClick: () => setPendingDelete(t) },
                ]
              : [
                  { key: 'edit', label: 'Editar', icon: <Pencil className="h-4 w-4" />, variant: 'edit', onClick: () => {}, disabled: true },
                  { key: 'delete', label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, variant: 'destructive', onClick: () => {}, disabled: true },
                  { key: 'hint', label: AUTO_HINT, icon: <Lock className="h-4 w-4" />, onClick: () => {}, disabled: true },
                ];
            return (
              <MobileListItem
                key={t.id}
                actions={actions}
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
                    <AdminCategoryPill name={t.category} categories={categories} size="sm" />
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
        {dialogs}
      </>
    );
  }

  // Desktop preservado — tabela original (com coluna Tipo quando variant=mixed) + coluna de ações.
  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              {variant === 'mixed' && <TableHead>Tipo</TableHead>}
              <TableHead>Categoria</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-[48px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t: any) => {
              const isManual = isManualAdminTransaction(t);
              const actions: RowAction[] = [
                { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => startEdit(t), disabled: !isManual },
                { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => setPendingDelete(t), disabled: !isManual },
                ...(!isManual ? [{ label: AUTO_HINT, icon: Lock, onClick: () => {}, disabled: true }] : []),
              ];
              return (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">{format(new Date(t.transaction_date), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                  {variant === 'mixed' && (
                    <TableCell>
                      <Badge className={t.type === 'income' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-red-500 text-white hover:bg-red-600'}>
                        {t.type === 'income' ? 'Receita' : 'Despesa'}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell>
                    <AdminCategoryPill name={t.category} categories={categories} />
                  </TableCell>
                  <TableCell className="text-sm max-w-[300px] truncate">{t.description || '-'}</TableCell>
                  <TableCell className={cn('text-right font-medium', t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                    {t.type === 'income' ? '+' : '-'}{fmt(Number(t.amount))}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActionsMenu actions={actions} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {dialogs}
    </>
  );
}
