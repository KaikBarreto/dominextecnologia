import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invalidatePdvOrderCancellationCaches } from '@/hooks/pdvOrderCancellationCache';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Excluir pelo Financeiro um lançamento que veio do PDV.
 *
 * A régua é a do CEO: "faz todos os efeitos como se nunca tivesse acontecido".
 * Para lançamento de venda isso é CANCELAR A VENDA INTEIRA (estoque volta,
 * dinheiro sai da gaveta aberta, todos os recebimentos da venda deixam de
 * contar). Quem decide o caminho é o servidor (`finance_pdv_transaction_undo_plan_v1`),
 * e quem executa é o mesmo cancelamento da tela do caixa, chamado por dentro
 * de `finance_delete_pdv_transaction_v1`. Não existe um segundo jeito de
 * desfazer a mesma venda.
 */

export type PdvUndoEffect =
  | 'stock_returned'
  | 'finance_cancelled'
  | 'drawer_returned'
  | 'closed_session_kept'
  | 'customer_debt_cancelled'
  | 'card_cancelled'
  | 'finance_deleted';

export interface PdvUndoPlan {
  transactionId: string;
  path: 'cancel_order' | 'reverse_cash_event' | 'delete_transaction' | 'unsupported' | 'not_pdv';
  allowed: boolean;
  alreadyDone: boolean;
  blockCode: string | null;
  message: string | null;
  orderNumber: number | null;
  effects: PdvUndoEffect[];
}

export interface PdvUndoResult {
  action: 'order_cancelled' | 'cash_event_reversed' | 'deleted';
  idempotent: boolean;
  orderNumber: number | null;
}

/** Linha do financeiro que precisa passar pelo desfazer do PDV, e não pelo DELETE comum. */
export function isPdvFinancialRow(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return r.origin === 'pdv'
    || r.pdv_financial_role != null
    || r.pdv_settlement_group_id != null
    || r.pdv_cash_session_id != null;
}

/**
 * As recusas do servidor já vêm em PT-BR legível ao cliente final, marcadas com
 * `code=pdv_...` no DETAIL. Elas valem mais que a tradução genérica do SQLSTATE.
 */
export function pdvUndoErrorMessage(error: unknown): string {
  const raw = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const details = typeof raw.details === 'string' ? raw.details : '';
  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  if (message && /(?:^|\s)code=pdv_[a-z0-9_]+/i.test(details)) return message;
  return getErrorMessage(error);
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && value !== null && value !== undefined ? n : null;
}

export function parsePdvUndoPlan(data: unknown): PdvUndoPlan {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const effects = Array.isArray(raw.effects) ? (raw.effects as PdvUndoEffect[]) : [];
  return {
    transactionId: String(raw.transaction_id ?? ''),
    path: (raw.path as PdvUndoPlan['path']) ?? 'unsupported',
    allowed: raw.allowed === true,
    alreadyDone: raw.already_done === true,
    blockCode: typeof raw.block_code === 'string' ? raw.block_code : null,
    message: typeof raw.message === 'string' ? raw.message : null,
    orderNumber: toNumber(raw.order_number),
    effects,
  };
}

export function usePdvUndoPlan(transactionId: string | null) {
  const scope = usePdvAuthorizedQueryScope();
  return useQuery({
    queryKey: ['finance-pdv-undo-plan', transactionId, ...scope.key],
    enabled: scope.ready && !!transactionId,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('finance_pdv_transaction_undo_plan_v1', {
        p_transaction_id: transactionId as string,
      });
      if (error) throw error;
      return parsePdvUndoPlan(data);
    },
  });
}

export function useFinancePdvUndo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { transactionId: string; reason: string }): Promise<PdvUndoResult> => {
      const { data, error } = await supabase.rpc('finance_delete_pdv_transaction_v1', {
        p_transaction_id: vars.transactionId,
        p_reason: vars.reason,
      });
      if (error) throw error;
      const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      if (raw.ok !== true) {
        throw new Error('O lançamento não foi excluído. Atualize a tela e tente novamente.');
      }
      return {
        action: (raw.action as PdvUndoResult['action']) ?? 'deleted',
        idempotent: raw.idempotent === true,
        orderNumber: toNumber(raw.order_number),
      };
    },
    onSuccess: async () => {
      // Mesmas raízes do cancelamento pela tela do caixa (estoque, gaveta,
      // cofre, financeiro, conta do cliente), mais os resumos do Financeiro.
      await invalidatePdvOrderCancellationCaches(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['finance-pdv-undo-plan'] });
    },
  });
}
