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

import { useEffect, useMemo } from 'react';
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
  stock_id: string | null;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
  /** Venda cancelada que esta linha substituiu, quando nasceu de uma edição. */
  replaces_order_id: string | null;
  replaces_order_number: number | null;
  salesperson_id: string | null;
}

type PdvSessionOrderRow = Omit<PdvSessionOrder, 'replaces_order_number'>;

export function attachReplacementOrderNumbers(
  orders: PdvSessionOrderRow[],
  replacedOrders: Array<Pick<PdvSessionOrder, 'id' | 'number'>>,
): PdvSessionOrder[] {
  const numberById = new Map(replacedOrders.map((order) => [order.id, order.number]));

  return orders.map((order) => ({
    ...order,
    replaces_order_number: order.replaces_order_id
      ? (numberById.get(order.replaces_order_id) ?? null)
      : null,
  }));
}

export interface PdvSessionOrderItem {
  order_id: string;
  inventory_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  unit_price: number;
  discount_amount: number;
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
  /** Competência financeira real da venda, inclusive quando retrodatada. */
  transaction_date: string | null;
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
  created_by: string | null;
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
  supplier_id: string | null;
  /** Observação do lançamento. Aparece no expansível de receita/despesa. */
  notes: string | null;
  transaction_date: string;
  created_at: string;
  created_by: string | null;
}

export interface PdvSessionActorProfile {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

const SESSION_KEYS = {
  terminals: ['pdv-terminals'] as const,
  sessions: ['pdv-cash-sessions'] as const,
  operators: (ids: string[]) => ['pdv-cash-session-operators', ...ids] as const,
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

export function usePdvCashRegister(focusedSessionId: string | null = null) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const invalidateCash = () => {
    queryClient.invalidateQueries({ queryKey: SESSION_KEYS.sessions });
    queryClient.invalidateQueries({ queryKey: ['pdv-cash-session-operators'] });
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
    staleTime: 5 * 60 * 1000,
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
      return { openSessions, lastClosed };
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

  // Nome do operador é conteúdo secundário. Antes, esta terceira chamada de
  // rede mantinha a TELA INTEIRA em skeleton mesmo depois de terminal e sessão
  // já terem chegado. Agora o caixa abre com os dados essenciais e o nome é
  // preenchido assim que a consulta de perfis termina.
  const operatorIds = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...(sessionsQuery.data?.openSessions ?? []).map((item) => item.opened_by),
            sessionsQuery.data?.lastClosed?.opened_by,
            sessionsQuery.data?.lastClosed?.closed_by,
          ].filter((id): id is string => Boolean(id)),
        ),
      ).sort(),
    [sessionsQuery.data?.lastClosed?.closed_by, sessionsQuery.data?.lastClosed?.opened_by, sessionsQuery.data?.openSessions],
  );
  const operatorsQuery = useQuery({
    queryKey: SESSION_KEYS.operators(operatorIds),
    enabled: operatorIds.length > 0,
    queryFn: () => fetchOperatorNames(operatorIds),
    staleTime: 5 * 60 * 1000,
  });

  const cofreQuery = useQuery({
    queryKey: SESSION_KEYS.cofre,
    queryFn: async (): Promise<PdvCofreBalance> => {
      const { data, error } = await supabase.rpc('pdv_cofre_balance');
      if (error) throw error;
      return data as unknown as PdvCofreBalance;
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

  const openSessions = useMemo(
    () => sessionsQuery.data?.openSessions ?? [],
    [sessionsQuery.data?.openSessions],
  );

  /**
   * Caixa em FOCO. Regra: o caixa que EU abri vem primeiro (é o meu turno);
   * sem nenhum meu, o primeiro aberto da empresa (gestor conferindo o caixa do
   * balconista). Fica explícito pra não virar "o primeiro que o banco devolveu".
   */
  const session = useMemo(() => {
    if (openSessions.length === 0) return null;
    return (
      openSessions.find((s) => s.id === focusedSessionId) ??
      openSessions.find((s) => s.opened_by === user?.id) ??
      openSessions[0]
    );
  }, [focusedSessionId, openSessions, user?.id]);

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
    operators: operatorsQuery.data ?? {},
    cofre: cofreQuery.data ?? null,
    /** Carregando o essencial da tela (terminal + sessão). Skeleton depende disto. */
    isLoading: terminalsQuery.isLoading || sessionsQuery.isLoading,
    isLoadingCofre: cofreQuery.isLoading,
    isErrorCofre: cofreQuery.isError,
    cofreError: cofreQuery.error ?? null,
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
    refetchCofre: cofreQuery.refetch,
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
 * Nomes apenas dos clientes que aparecem no turno em foco.
 *
 * O Caixa antes montava este mapa chamando `useCustomers()`, que baixa todas as
 * colunas de todos os clientes (com paginacao) no carregamento inicial. Aqui a
 * lista e secundaria, minima e explicitamente limitada a empresa da sessao.
 */
export function usePdvCashCustomerNames(
  customerIds: string[],
  companyId: string | null | undefined,
) {
  const ids = useMemo(
    () => Array.from(new Set(customerIds.filter(Boolean))).sort(),
    [customerIds],
  );

  const query = useQuery({
    queryKey: ['pdv-cash-customer-names', companyId ?? null, ...ids],
    enabled: !!companyId && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name')
        .eq('company_id', companyId as string)
        .in('id', ids);
      if (error) throw error;

      const names: Record<string, string> = {};
      for (const customer of data ?? []) names[customer.id] = customer.name;
      return names;
    },
    staleTime: 5 * 60 * 1000,
  });

  return query.data ?? {};
}

/** Perfis mínimos dos responsáveis exibidos no histórico, carregados sem bloquear os valores do caixa. */
export function usePdvCashActorProfiles(
  userIds: string[],
  companyId: string | null | undefined,
) {
  const ids = useMemo(
    () => Array.from(new Set(userIds.filter(Boolean))).sort(),
    [userIds],
  );
  const query = useQuery({
    queryKey: ['pdv-cash-actor-profiles', companyId ?? null, ...ids],
    enabled: !!companyId && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, avatar_url')
        .eq('company_id', companyId as string)
        .in('user_id', ids);
      if (error) throw error;
      const actors: Record<string, PdvSessionActorProfile> = {};
      for (const profile of data ?? []) {
        actors[profile.user_id] = {
          name: profile.full_name ?? null,
          email: profile.email ?? null,
          avatarUrl: profile.avatar_url ?? null,
        };
      }
      return actors;
    },
    staleTime: 5 * 60 * 1000,
  });
  return query.data ?? {};
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
  const queryClient = useQueryClient();
  const sessionId = session?.id ?? null;

  const query = useQuery({
    queryKey: SESSION_KEYS.detail(sessionId),
    enabled: !!sessionId,
    queryFn: async () => {
      const windowStart = session.opened_at;
      const windowEnd = session.closed_at ?? new Date().toISOString();

      const ordersRes = await supabase
        .from('pdv_orders')
        .select('id, number, total, subtotal, discount_amount, status, customer_id, stock_id, notes, paid_at, created_at, replaces_order_id, salesperson_id')
        .eq('cash_session_id', sessionId)
        .eq('company_id', session.company_id)
        .in('status', ['pago', 'entregue'])
        .order('created_at', { ascending: false });
      if (ordersRes.error) throw ordersRes.error;
      const orderRows = (ordersRes.data ?? []) as PdvSessionOrderRow[];
      const orderIds = orderRows.map((order) => order.id);
      const replacedOrderIds = [
        ...new Set(
          orderRows
            .map((order) => order.replaces_order_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      const [itemsRes, paymentsRes, movementsRes, txnsRes, replacedOrdersRes] = await Promise.all([
        orderIds.length
          ? supabase
              .from('pdv_order_items')
              .select('order_id, inventory_id, description, quantity, unit, unit_cost, unit_price, discount_amount, total')
              .in('order_id', orderIds)
          : Promise.resolve({ data: [], error: null } as never),
        orderIds.length
          ? supabase
              .from('pdv_order_payments')
              .select('order_id, method, amount, change_amount, financial_account_id, financial_transaction_id, received_at, financial_transaction:financial_transactions!pdv_order_payments_financial_transaction_id_fkey(transaction_date)')
              .in('order_id', orderIds)
          : Promise.resolve({ data: [], error: null } as never),
        supabase
          .from('pdv_cash_movements')
          // `cancelled_at` VEM NA CONSULTA de propósito, e o movimento desfeito
          // TAMBÉM: quem filtra é a exibição (`buildPdvLedger`). Tirar daqui
          // deixaria o id da perna cancelada fora de `linkedIds` (abaixo) e a
          // perna reapareceria no extrato como "despesa avulsa do caixa".
          .select(
            'id, kind, amount, reason, to_account_id, financial_transaction_id, created_at, created_by, cancelled_at, cancelled_by, cancelled_reason',
          )
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false }),
        fetchAllPaginated<PdvSessionTransaction & { is_paid: boolean; cancelled_at: string | null; transfer_pair_id: string | null }>(
          () =>
            supabase
              .from('financial_transactions')
              .select(
                'id, description, amount, transaction_type, category, payment_method, account_id, customer_id, supplier_id, notes, transaction_date, created_at, created_by, is_paid, cancelled_at, transfer_pair_id',
              )
              .eq('origin', 'pdv')
              .gte('created_at', windowStart)
              .lte('created_at', windowEnd),
        ).then((data) => ({ data, error: null })),
        replacedOrderIds.length
          ? supabase
              .from('pdv_orders')
              .select('id, number')
              .eq('company_id', session.company_id)
              .in('id', replacedOrderIds)
          : Promise.resolve({ data: [], error: null } as never),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (movementsRes.error) throw movementsRes.error;
      if (replacedOrdersRes.error) throw replacedOrdersRes.error;

      const orders = attachReplacementOrderNumbers(
        orderRows,
        (replacedOrdersRes.data ?? []) as Array<Pick<PdvSessionOrder, 'id' | 'number'>>,
      );
      const items = (itemsRes.data ?? []) as PdvSessionOrderItem[];
      const payments = (paymentsRes.data ?? []).map((raw) => {
        const row = raw as unknown as Omit<PdvSessionPayment, 'transaction_date'> & {
          financial_transaction?: { transaction_date: string } | null;
        };
        const { financial_transaction: transaction, ...payment } = row;
        return {
          ...payment,
          transaction_date: transaction?.transaction_date ?? null,
        } as PdvSessionPayment;
      });
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
            supplier_id: t.supplier_id,
            notes: t.notes,
            transaction_date: t.transaction_date,
            created_at: t.created_at,
            created_by: t.created_by,
          }),
        );

      return { orders, items, payments, movements, transactions };
    },
    // Ao voltar da Venda ou do Financeiro, revalida mesmo que outro fluxo tenha
    // esquecido uma invalidacao. Durante refetch, o cache anterior continua na
    // tela e os valores animam ate o novo total — sem skeleton regressivo.
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

  useEffect(() => {
    if (!sessionId || !session?.company_id) return;

    const refreshDetail = () => {
      queryClient.invalidateQueries({ queryKey: SESSION_KEYS.detail(sessionId) });
    };
    const refreshFinancial = () => {
      refreshDetail();
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
      queryClient.invalidateQueries({ queryKey: SESSION_KEYS.cofre });
    };

    // Filtro por company_id e session_id e obrigatorio: alem de reduzir trafego,
    // impede que eventos de outro tenant provoquem leituras cruzadas ou revelem
    // padrao de atividade. RLS continua sendo a barreira final no servidor.
    const channel = supabase
      .channel(`pdv-cash-live:${session.company_id}:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'financial_transactions',
          filter: `company_id=eq.${session.company_id}`,
        },
        refreshFinancial,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pdv_orders',
          filter: `cash_session_id=eq.${sessionId}`,
        },
        refreshDetail,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pdv_cash_movements',
          filter: `session_id=eq.${sessionId}`,
        },
        refreshFinancial,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, session?.company_id, sessionId]);

  return {
    orders: query.data?.orders ?? [],
    items: query.data?.items ?? [],
    payments: query.data?.payments ?? [],
    movements: query.data?.movements ?? [],
    transactions: query.data?.transactions ?? [],
    isLoading: !!sessionId && query.isLoading,
    isError: !!sessionId && query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
