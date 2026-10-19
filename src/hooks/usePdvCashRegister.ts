/**
 * Fronteira Supabase do PAINEL DO CAIXA (PDV). Componente nunca chama
 * `supabase.from(...)` direto — é lei da casa.
 *
 * O que este hook NÃO faz: calcular dinheiro por conta própria. Saldo do cofre,
 * abertura, fechamento, sangria e suprimento são as RPCs de
 * `20261018220000_pdv_onda1_rpcs_de_caixa_venda_e_fiado.sql`, que validam no
 * servidor (reserva do cofre, advisory lock, quebra de caixa). O hook só lê e
 * chama; a conta de conferência que a tela PREVÊ antes de confirmar vive em
 * `src/lib/pdv/cash.ts`, espelhando a fórmula da RPC.
 */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import type { FinancialTransaction } from '@/types/database';

export interface PdvTerminal {
  id: string;
  name: string;
  stock_id: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface PdvCashSession {
  id: string;
  company_id: string;
  terminal_id: string;
  opened_by: string | null;
  opened_at: string;
  opening_amount: number;
  closed_by: string | null;
  closed_at: string | null;
  counted_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  status: string;
  notes: string | null;
}

/** Retorno de `pdv_cofre_balance()`. Todo número já vem arredondado do servidor. */
export interface PdvCofreBalance {
  saldo_total: number;
  reservado: number;
  disponivel: number;
  caixas_abertos: number;
  conta_id: string | null;
  conta_nome: string | null;
  controle_estrito: boolean;
}

export interface PdvCloseResult {
  session_id: string;
  terminal_nome: string | null;
  abertura: number;
  vendas_em_dinheiro: number;
  suprimentos: number;
  sangrias: number;
  esperado: number;
  contado: number;
  diferenca: number;
  ajuste_transaction_id: string | null;
  vendas_por_forma: Array<{ method: string; total: number }>;
  aberto_em: string;
  fechado_em: string;
  avisos: string[];
}

/**
 * Retorno de `pdv_revert_cash_movement()`.
 *
 * `na_gaveta_antes` e `na_gaveta_depois` são LIDOS DA TABELA nas duas vezes
 * (não é "antes menos o valor"): o DEPOIS é recalculado pela mesma fórmula do
 * fechamento, já com o filtro de cancelado. É o número que PROVA, na tela, que
 * o dinheiro voltou pro esperado da gaveta.
 */
export interface PdvRevertMovementResult {
  movement_id: string;
  session_id: string;
  kind: string;
  amount: number;
  to_account_id: string | null;
  motivo: string | null;
  cancelado_em: string;
  cancelado_por: string | null;
  na_gaveta_antes: number;
  na_gaveta_depois: number;
  /** Pernas canceladas. Vazio quando o movimento não tinha conta (o dinheiro nunca saiu do cofre). */
  transactions_revertidas: Array<{
    transaction_id: string;
    account_id: string | null;
    transaction_type: string;
    amount: number;
  }>;
}

export interface PdvSessionOrder {
  id: string;
  number: number;
  total: number;
  subtotal: number;
  discount_amount: number;
  status: string;
  customer_id: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface PdvSessionOrderItem {
  order_id: string;
  inventory_id: string | null;
  description: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  total: number;
}

export interface PdvSessionPayment {
  order_id: string;
  method: string;
  amount: number;
  change_amount: number;
  /** Conta que recebeu este pagamento. Aparece no expansível da venda. */
  financial_account_id: string | null;
  financial_transaction_id: string | null;
  received_at: string;
}

export interface PdvSessionMovement {
  id: string;
  kind: string;
  amount: number;
  reason: string | null;
  to_account_id: string | null;
  financial_transaction_id: string | null;
  created_at: string;
  /**
   * Movimento DESFEITO (`pdv_revert_cash_movement`). A linha continua na tabela
   * — `pdv_cash_movements` é livro-razão de dinheiro, append-only no privilégio
   * — e sai da conta: o servidor filtra `cancelled_at IS NULL` no esperado da
   * gaveta, então a tela é OBRIGADA a filtrar igual. Sem isto, a tela prevê um
   * número e o fechamento cobra outro.
   */
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancelled_reason: string | null;
}

export interface PdvSessionTransaction {
  id: string;
  description: string;
  amount: number;
  transaction_type: string;
  category: string | null;
  payment_method: string | null;
  account_id: string | null;
  customer_id: string | null;
  /** Observação do lançamento. Aparece no expansível de receita/despesa. */
  notes: string | null;
  transaction_date: string;
  created_at: string;
}

const SESSION_KEYS = {
  terminals: ['pdv-terminals'] as const,
  sessions: ['pdv-cash-sessions'] as const,
  cofre: ['pdv-cofre-balance'] as const,
  detail: (id: string | null) => ['pdv-cash-session-detail', id] as const,
};

/** Nomes dos operadores das sessões (opened_by / closed_by). */
async function fetchOperatorNames(userIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const { data } = await supabase.from('profiles').select('user_id, full_name').in('user_id', ids);
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ user_id: string; full_name: string | null }>) {
    if (row.full_name) map[row.user_id] = row.full_name;
  }
  return map;
}

export function usePdvCashRegister() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const invalidateCash = () => {
    queryClient.invalidateQueries({ queryKey: SESSION_KEYS.sessions });
    queryClient.invalidateQueries({ queryKey: SESSION_KEYS.cofre });
    queryClient.invalidateQueries({ queryKey: ['pdv-cash-session-detail'] });
    // Sangria/suprimento/quebra de caixa criam lançamento de verdade: o
    // Financeiro tem que reagir junto, senão o saldo da tela de contas fica
    // velho até o próximo refetch natural.
    queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['account-balances'] });
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
  };

  const terminalsQuery = useQuery({
    queryKey: SESSION_KEYS.terminals,
    queryFn: async (): Promise<PdvTerminal[]> => {
      const { data, error } = await supabase
        .from('pdv_terminals')
        .select('id, name, stock_id, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PdvTerminal[];
    },
  });

  /**
   * Sessões abertas (todas as da empresa) + a ÚLTIMA fechada. A aba de
   * multi-caixa fica pra depois (decisão do Tech Lead), mas o dado já vem
   * completo: `pdv_terminals` prevê mais de um caixa por empresa e o cofre
   * reserva o `opening_amount` de cada sessão aberta.
   */
  const sessionsQuery = useQuery({
    queryKey: SESSION_KEYS.sessions,
    queryFn: async () => {
      const [openRes, closedRes] = await Promise.all([
        supabase
          .from('pdv_cash_sessions')
          .select('*')
          .eq('status', 'aberta')
          .order('opened_at', { ascending: true }),
        supabase
          .from('pdv_cash_sessions')
          .select('*')
          .eq('status', 'fechada')
          .order('closed_at', { ascending: false })
          .limit(1),
      ]);
      if (openRes.error) throw openRes.error;
      if (closedRes.error) throw closedRes.error;

      const openSessions = (openRes.data ?? []) as PdvCashSession[];
      const lastClosed = ((closedRes.data ?? []) as PdvCashSession[])[0] ?? null;
      const operators = await fetchOperatorNames([
        ...openSessions.map((s) => s.opened_by),
        lastClosed?.opened_by,
        lastClosed?.closed_by,
      ]);

      return { openSessions, lastClosed, operators };
    },
  });

  const cofreQuery = useQuery({
    queryKey: SESSION_KEYS.cofre,
    queryFn: async (): Promise<PdvCofreBalance> => {
      const { data, error } = await supabase.rpc('pdv_cofre_balance');
      if (error) throw error;
      return data as unknown as PdvCofreBalance;
    },
  });

  const openSessions = sessionsQuery.data?.openSessions ?? [];

  /**
   * Caixa em FOCO. Regra: o caixa que EU abri vem primeiro (é o meu turno);
   * sem nenhum meu, o primeiro aberto da empresa (gestor conferindo o caixa do
   * balconista). Fica explícito pra não virar "o primeiro que o banco devolveu".
   */
  const session = useMemo(() => {
    if (openSessions.length === 0) return null;
    return openSessions.find((s) => s.opened_by === user?.id) ?? openSessions[0];
  }, [openSessions, user?.id]);

  const openSession = useMutation({
    mutationFn: async (vars: { terminalId: string; openingAmount: number }) => {
      const { data, error } = await supabase.rpc('pdv_open_cash_session', {
        p_terminal_id: vars.terminalId,
        p_opening_amount: vars.openingAmount,
      });
      if (error) throw error;
      return data as unknown as PdvCashSession;
    },
    onSuccess: invalidateCash,
  });

  const closeSession = useMutation({
    mutationFn: async (vars: { sessionId: string; countedAmount: number; notes?: string }) => {
      const { data, error } = await supabase.rpc('pdv_close_cash_session', {
        p_session_id: vars.sessionId,
        p_counted_amount: vars.countedAmount,
        p_notes: vars.notes ?? null,
      });
      if (error) throw error;
      return data as unknown as PdvCloseResult;
    },
    onSuccess: invalidateCash,
  });

  const registerMovement = useMutation({
    mutationFn: async (vars: {
      sessionId: string;
      kind: 'sangria' | 'suprimento';
      amount: number;
      toAccountId?: string | null;
      reason?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('pdv_cash_movement', {
        p_session_id: vars.sessionId,
        p_kind: vars.kind,
        p_amount: vars.amount,
        p_to_account_id: vars.toAccountId ?? null,
        p_reason: vars.reason ?? null,
      });
      if (error) throw error;
      return data as unknown as Record<string, unknown>;
    },
    onSuccess: invalidateCash,
  });

  /**
   * Desfaz sangria ou suprimento pela RPC `pdv_revert_cash_movement`, o ÚNICO
   * caminho: ela marca `cancelled_at` no movimento e cancela AS DUAS pernas do
   * par em `financial_transactions` (achadas por `transfer_pair_id`) numa
   * transação só. Nada é apagado — `pdv_cash_movements` é append-only no
   * privilégio (SELECT + INSERT), e quem escreve o cancelamento é a RPC, que é
   * `SECURITY DEFINER`.
   *
   * O erro NÃO é engolido: as três recusas do servidor (caixa já fechado,
   * movimento já desfeito com a data, perna conciliada com o extrato bancário)
   * já vêm em PT-BR pronto pra tela e sobem pro chamador.
   */
  const revertMovement = useMutation({
    mutationFn: async (vars: { movementId: string; reason?: string | null }) => {
      const { data, error } = await supabase.rpc('pdv_revert_cash_movement', {
        p_movement_id: vars.movementId,
        p_reason: vars.reason ?? null,
      });
      if (error) throw error;
      return data as unknown as PdvRevertMovementResult;
    },
    onSuccess: invalidateCash,
  });

  /**
   * Cancela a venda pela RPC `pdv_cancel_order`, o ÚNICO caminho de estorno de
   * venda do PDV: estoque volta por movimento `estorno` (as duas pernas no
   * Kardex), o financeiro recebe `cancelled_at` (marcador canônico da casa: a
   * linha fica viva e sai do saldo e do DRE) e o fiado ganha LINHA NOVA de
   * ajuste, porque o ledger é append-only.
   *
   * Ela CANCELA, não apaga, e isso é proposital — DELETE bateria na trava da
   * conciliação bancária. No histórico do caixa a venda some da lista por
   * consequência: a leitura só traz pedido `pago`/`entregue`.
   */
  const cancelOrder = useMutation({
    mutationFn: async (vars: { orderId: string; reason?: string | null }) => {
      const { data, error } = await supabase.rpc('pdv_cancel_order', {
        p_order_id: vars.orderId,
        p_reason: vars.reason ?? null,
      });
      if (error) throw error;
      return data as unknown as Record<string, unknown>;
    },
    onSuccess: () => {
      invalidateCash();
      // O estorno mexe em estoque e em fiado, não só em dinheiro: as telas de
      // Estoque e o limite do cliente têm que reagir junto.
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-customer-credit'] });
    },
  });

  return {
    terminals: terminalsQuery.data ?? [],
    openSessions,
    session,
    lastClosed: sessionsQuery.data?.lastClosed ?? null,
    operators: sessionsQuery.data?.operators ?? {},
    cofre: cofreQuery.data ?? null,
    /** Carregando o essencial da tela (terminal + sessão). Skeleton depende disto. */
    isLoading: terminalsQuery.isLoading || sessionsQuery.isLoading,
    isLoadingCofre: cofreQuery.isLoading,
    /**
     * Falhou ao LER o essencial. A tela precisa disto separado do "zero
     * terminais": sem isso, servidor fora do ar vira "Nenhum caixa cadastrado"
     * e manda o operador configurar o que já está configurado.
     */
    isError: terminalsQuery.isError || sessionsQuery.isError,
    error: terminalsQuery.error ?? sessionsQuery.error ?? null,
    refetch: () => {
      terminalsQuery.refetch();
      sessionsQuery.refetch();
      cofreQuery.refetch();
    },
    openSession,
    closeSession,
    registerMovement,
    revertMovement,
    cancelOrder,
    refetchCash: invalidateCash,
  };
}

/**
 * A linha INTEIRA de `financial_transactions`, pro formulário do Financeiro
 * poder EDITAR o lançamento avulso do caixa. O histórico carrega só as colunas
 * que a lista mostra; editar precisa do registro completo (parcelas, centro de
 * custo, vencimento), e `TransactionFormDialog` espera `FinancialTransaction`.
 *
 * Busca sob demanda, uma linha, só quando o usuário abre a edição.
 */
export function usePdvLedgerTransaction(transactionId: string | null) {
  const query = useQuery({
    queryKey: ['pdv-ledger-transaction', transactionId],
    enabled: !!transactionId,
    queryFn: async (): Promise<FinancialTransaction | null> => {
      const { data, error } = await supabase
        .from('financial_transactions')
        .select('*')
        .eq('id', transactionId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as FinancialTransaction | null;
    },
  });

  return { transaction: query.data ?? null, isLoading: !!transactionId && query.isLoading };
}

/**
 * Tudo o que a sessão em foco movimentou: vendas, itens (pro CMV), pagamentos,
 * sangrias/suprimentos e os lançamentos avulsos do caixa.
 *
 * JANELA DOS LANÇAMENTOS AVULSOS: `created_at` entre a abertura e o fechamento
 * da sessão, não `transaction_date`. Motivo: `transaction_date` é data (sem
 * hora) e o usuário pode retrodatar; o que amarra o lançamento ao TURNO é a
 * hora em que ele foi feito com o caixa aberto. Não existe coluna de FK entre
 * `financial_transactions` e `pdv_cash_sessions` (ver relatório).
 *
 * SÓ REALIZADO: lançamento `is_paid = false` (conta a pagar/receber) e
 * cancelado ficam fora, igual ao resto do Financeiro. E as pernas de
 * transferência (`transfer_pair_id`) também: dinheiro trocando de bolso não é
 * receita nem despesa.
 */
export function usePdvCashSessionDetail(session: PdvCashSession | null) {
  const sessionId = session?.id ?? null;

  const query = useQuery({
    queryKey: SESSION_KEYS.detail(sessionId),
    enabled: !!sessionId,
    queryFn: async () => {
      const windowStart = session.opened_at;
      const windowEnd = session.closed_at ?? new Date().toISOString();

      const ordersRes = await supabase
        .from('pdv_orders')
        .select('id, number, total, subtotal, discount_amount, status, customer_id, paid_at, created_at')
        .eq('cash_session_id', sessionId)
        .in('status', ['pago', 'entregue'])
        .order('created_at', { ascending: false });
      if (ordersRes.error) throw ordersRes.error;
      const orders = (ordersRes.data ?? []) as PdvSessionOrder[];
      const orderIds = orders.map((o) => o.id);

      const [itemsRes, paymentsRes, movementsRes, txnsRes] = await Promise.all([
        orderIds.length
          ? supabase
              .from('pdv_order_items')
              .select('order_id, inventory_id, description, quantity, unit_cost, unit_price, total')
              .in('order_id', orderIds)
          : Promise.resolve({ data: [], error: null } as never),
        orderIds.length
          ? supabase
              .from('pdv_order_payments')
              .select('order_id, method, amount, change_amount, financial_account_id, financial_transaction_id, received_at')
              .in('order_id', orderIds)
          : Promise.resolve({ data: [], error: null } as never),
        supabase
          .from('pdv_cash_movements')
          // `cancelled_at` VEM NA CONSULTA de propósito, e o movimento desfeito
          // TAMBÉM: quem filtra é a exibição (`buildPdvLedger`). Tirar daqui
          // deixaria o id da perna cancelada fora de `linkedIds` (abaixo) e a
          // perna reapareceria no extrato como "despesa avulsa do caixa".
          .select(
            'id, kind, amount, reason, to_account_id, financial_transaction_id, created_at, cancelled_at, cancelled_by, cancelled_reason',
          )
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false }),
        fetchAllPaginated<PdvSessionTransaction & { is_paid: boolean; cancelled_at: string | null; transfer_pair_id: string | null }>(
          () =>
            supabase
              .from('financial_transactions')
              .select(
                'id, description, amount, transaction_type, category, payment_method, account_id, customer_id, notes, transaction_date, created_at, is_paid, cancelled_at, transfer_pair_id',
              )
              .eq('origin', 'pdv')
              .gte('created_at', windowStart)
              .lte('created_at', windowEnd),
        ).then((data) => ({ data, error: null })),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (movementsRes.error) throw movementsRes.error;

      const items = (itemsRes.data ?? []) as PdvSessionOrderItem[];
      const payments = (paymentsRes.data ?? []) as PdvSessionPayment[];
      const movements = (movementsRes.data ?? []) as PdvSessionMovement[];

      // Lançamento que JÁ É a perna de uma venda ou de uma sangria/suprimento
      // não pode contar de novo como receita/despesa avulsa do caixa.
      const linkedIds = new Set<string>();
      for (const p of payments) if (p.financial_transaction_id) linkedIds.add(p.financial_transaction_id);
      for (const m of movements) if (m.financial_transaction_id) linkedIds.add(m.financial_transaction_id);

      const transactions = (txnsRes.data ?? [])
        .filter((t) => t.is_paid === true && !t.cancelled_at && !t.transfer_pair_id)
        .filter((t) => !linkedIds.has(t.id))
        .map(
          (t): PdvSessionTransaction => ({
            id: t.id,
            description: t.description,
            amount: Number(t.amount) || 0,
            transaction_type: t.transaction_type,
            category: t.category,
            payment_method: t.payment_method,
            account_id: t.account_id,
            customer_id: t.customer_id,
            notes: t.notes,
            transaction_date: t.transaction_date,
            created_at: t.created_at,
          }),
        );

      return { orders, items, payments, movements, transactions };
    },
  });

  return {
    orders: query.data?.orders ?? [],
    items: query.data?.items ?? [],
    payments: query.data?.payments ?? [],
    movements: query.data?.movements ?? [],
    transactions: query.data?.transactions ?? [],
    isLoading: !!sessionId && query.isLoading,
  };
}
