/**
 * Editar e excluir COBRANÇA, uma implementação só para as duas telas que
 * listam cobrança: a Central de Cobranças (FinanceCobrancas) e a ficha do
 * cliente (CustomerDetail).
 *
 * Aqui mora o estado do formulário de edição, a chamada das mutations, o
 * tratamento de erro da edge e o aviso persistente de "o lançamento no
 * financeiro ficou para trás". As travas (quem pode ser editada/excluída/
 * estornada) moram em `@/lib/tenantChargeRules` — este hook não decide nada
 * sozinho, e por isso as duas telas não podem divergir.
 *
 * O hook chama `useTenantCharges` por dentro e devolve `charges`/`isLoading`
 * para a tela: uma chamada só por tela (o React Query deduplica por queryKey,
 * mas duas assinaturas do mesmo hook na mesma tela seria desperdício).
 */
import { useState } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import {
  useTenantCharges,
  TenantChargeApiError,
  type TenantCharge,
  type UseTenantChargesOptions,
} from '@/hooks/useTenantCharges';

export interface UseChargeActionsOptions extends UseTenantChargesOptions {
  /** Chamado depois de uma exclusão que deu certo (ex.: limpar seleção em lote). */
  onDeleted?: (chargeId: string) => void;
}

export function useChargeActions(options?: UseChargeActionsOptions) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.central;
  const { toast } = useToast();
  const { onDeleted, ...chargesOptions } = options ?? {};
  const { charges, isLoading, refund, update, remove } = useTenantCharges(chargesOptions);

  // ── Editar cobrança (valor, vencimento, descrição) ──────────────────────────
  const [editTarget, setEditTarget] = useState<TenantCharge | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editDueDate, setEditDueDate] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // ── Excluir cobrança ────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<TenantCharge | null>(null);

  // Aviso PERSISTENTE (faixa que não some sozinha): a cobrança foi alterada ou
  // removida no gateway, mas o lançamento no Financeiro ficou para trás (ex.:
  // já estava baixado). Some só quando o usuário dispensa.
  const [warningBanner, setWarningBanner] = useState<string | null>(null);

  /** Mensagem final ao usuário: prioriza o `message` do servidor (já em
   *  PT-BR); cai no fallback TRADUZIDO por código quando ele vier vazio. */
  const errorMessage = (err: unknown): string => {
    if (err instanceof TenantChargeApiError) {
      if (err.message) return err.message;
      return t.errors[err.code] ?? t.errors.unknown;
    }
    return err instanceof Error && err.message ? err.message : t.errors.unknown;
  };

  const showFinanceWarning = (warning: string | null) => {
    if (!warning) return;
    toast({ variant: 'destructive', title: t.financeWarning.title, description: warning });
    setWarningBanner(warning);
  };

  const openEditDialog = (charge: TenantCharge) => {
    setEditTarget(charge);
    setEditAmount(charge.value);
    setEditDueDate(charge.due_date ?? '');
    setEditDescription(charge.description ?? '');
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    if (!editAmount || editAmount <= 0) {
      toast({ variant: 'destructive', title: t.editDialog.validation.valueRequired });
      return;
    }
    if (!editDueDate) {
      toast({ variant: 'destructive', title: t.editDialog.validation.dueDateRequired });
      return;
    }
    // Contrato da edge é parcial: só envia o que realmente mudou.
    const patch: { charge_id: string; value?: number; due_date?: string; description?: string } = {
      charge_id: editTarget.id,
    };
    if (editAmount !== editTarget.value) patch.value = editAmount;
    if (editDueDate !== (editTarget.due_date ?? '')) patch.due_date = editDueDate;
    if (editDescription !== (editTarget.description ?? '')) patch.description = editDescription;

    try {
      const result = await update.mutateAsync(patch);
      toast({ title: t.editDialog.success });
      showFinanceWarning(result.financeWarning);
      setEditTarget(null);
    } catch (err) {
      toast({ variant: 'destructive', title: t.editDialog.errorTitle, description: errorMessage(err) });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const chargeId = deleteTarget.id;
    try {
      const result = await remove.mutateAsync({ charge_id: chargeId });
      toast({ title: t.deleteDialog.success });
      showFinanceWarning(result.financeWarning);
      onDeleted?.(chargeId);
    } catch (err) {
      toast({ variant: 'destructive', title: t.deleteDialog.errorTitle, description: errorMessage(err) });
    } finally {
      setDeleteTarget(null);
    }
  };

  return {
    // dados da listagem (repasse do useTenantCharges)
    charges,
    isLoading,
    refund,
    update,
    remove,
    // editar
    editTarget,
    openEditDialog,
    closeEditDialog: () => setEditTarget(null),
    editAmount,
    setEditAmount,
    editDueDate,
    setEditDueDate,
    editDescription,
    setEditDescription,
    submitEdit,
    // excluir
    deleteTarget,
    requestDelete: setDeleteTarget,
    cancelDelete: () => setDeleteTarget(null),
    confirmDelete,
    // aviso + erros
    warningBanner,
    dismissWarning: () => setWarningBanner(null),
    showFinanceWarning,
    errorMessage,
  };
}

export type ChargeActions = ReturnType<typeof useChargeActions>;
