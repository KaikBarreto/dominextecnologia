import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { getErrorMessage } from '@/utils/errorMessages';
import { parseOfx, computeDedupKey, type OfxStatement } from '@/utils/ofx/parseOfx';
export type { StatementImportSummary } from '@/lib/reconciliation/types';
import type {
  CardPayBillResult,
  CreateCardPurchaseResult,
  CreateEmployeeMovementResult,
  CreateImportResult,
  CreateTransactionResult,
  CreateTransferResult,
  FinalizeResult,
  FlipSignResult,
  IgnoreBatchResult,
  ListCardBillsResult,
  ListTransferLegsResult,
  MatchCardBillPaymentResult,
  MatchCardPurchaseResult,
  MatchExistingResult,
  PayCardBillResult,
  ReconEntryPayload,
  ReconciliationState,
  ReopenReconciliationResult,
  SearchCandidatesResult,
  SearchCardPurchasesResult,
  SettleTransactionResult,
  StatementImportSummary,
  UnignoreBatchResult,
  UnmatchEntryResult,
} from '@/lib/reconciliation/types';

/**
 * Fronteira do Supabase pra conciliação bancária E de fatura de cartão
 * (mesmo hook, dois modos pelo `kind` do import — ver
 * `docs/planos/2026-10-18-conciliacao-fatura-cartao.md`). NENHUM componente
 * de `src/components/reconciliation/` chama `supabase.from(...)`/`.rpc(...)`
 * direto — tudo passa por aqui.
 *
 * ⚠️ As RPCs são chamadas DIRETO em `supabase.rpc('nome', { args })`, nunca por
 * um wrapper que tipe o nome como `string`: é isso que faz o `types.ts` gerado
 * conferir o NOME da função e o NOME de cada argumento na compilação. Só o
 * retorno é convertido. Um wrapper desliga essa checagem, e foi exatamente
 * assim que a Compra direta ficou um dia quebrada em produção — tela chamando
 * RPC inexistente com typecheck verde, erro só no clique do cliente.
 */

/**
 * Mensagem de erro das RPCs de conciliação. O contrato garante que o Postgres
 * já devolve a mensagem em PT-BR para `P0001` (regra de negócio), `22023`
 * (argumento inválido) e `42501` (acesso/permissão, inclusive
 * `can_delete_finance` faltando) — repassamos essas três literalmente.
 * Qualquer outro código (rede, RLS, constraint) cai no tratamento genérico.
 */
function getReconErrorMessage(error: unknown): string {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (
    e &&
    typeof e === 'object' &&
    typeof e.code === 'string' &&
    (e.code === 'P0001' || e.code === '22023' || e.code === '42501') &&
    typeof e.message === 'string' &&
    e.message.trim()
  ) {
    return e.message.trim();
  }
  return getErrorMessage(error);
}

/**
 * Bound de tempo pra nenhum refetch travar o pipeline de uma mutation pra
 * sempre. O React Query SÓ marca `isPending: false` depois que a promise
 * retornada/aguardada dentro de `onSuccess` resolve — se ficarmos presos
 * aguardando (rede lenta, aba em background, race do próprio React Query),
 * o botão que depende de `isPending` fica desabilitado até a página
 * recarregar. Nunca `await` isso sem teto: resolve com `undefined` no timeout
 * e deixa a leitura natural da query assentar depois, em background.
 */
function withTimeout<T>(promise: Promise<T>, ms = 8_000): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(undefined);
      }
    }, ms);
    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(undefined);
        }
      },
    );
  });
}

/** SHA-256 dos bytes crus do arquivo (hex) — a RPC usa pra bloquear reupload. */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** `OfxStatement` → payload snake_case de `p_entries`. Um único `seen` compartilhado. */
export function buildEntryPayload(st: OfxStatement): ReconEntryPayload[] {
  const seen = new Set<string>();
  return st.entries.map((entry, ordinal) => ({
    fitid: entry.fitid,
    dedup_key: computeDedupKey(st, entry, ordinal, seen),
    posted_at: entry.postedAt,
    amount: entry.amount,
    trn_type: entry.trnType,
    memo: entry.memo,
    name: entry.name,
    sign_suspect: entry.signSuspect,
  }));
}

/* ─────────────────────── lista de imports da conta (retomar/histórico) ─────────────────────── */

export function useStatementImports(accountId: string | null | undefined) {
  return useQuery<StatementImportSummary[]>({
    queryKey: ['bank-statement-imports', accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data, error } = await supabase.rpc('get_statement_imports', { p_account_id: accountId });
      if (error) throw error;
      return (data ?? []) as unknown as StatementImportSummary[];
    },
    enabled: !!accountId,
    staleTime: 5_000,
  });
}

/* ─────────────────────────── hook principal ─────────────────────────── */

export function useBankReconciliation(importId: string | null | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation;

  const invalidateFinance = () => {
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    queryClient.invalidateQueries({ queryKey: ['account-balances'] });
    queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['credit-card-bills'] });
    queryClient.invalidateQueries({ queryKey: ['employee-movements'] });
    queryClient.invalidateQueries({ queryKey: ['all-employee-movements'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  };

  /**
   * Refetch do estado + lista de imports (progresso do card "continuar").
   * CHAMAR SEM `await` dentro de `onSuccess`/`onSettled` das mutations — ver
   * `withTimeout`. A função em si continua assíncrona porque quem só quer
   * "recarregar e seguir depois" (ex: ao trocar de linha) ainda pode
   * aguardá-la deliberadamente; só a mutation não deve.
   */
  const refetchState = async () => {
    try {
      await withTimeout(
        Promise.all([
          importId
            ? queryClient.refetchQueries({ queryKey: ['bank-reconciliation-state', importId] })
            : Promise.resolve(),
          queryClient.refetchQueries({ queryKey: ['bank-statement-imports'] }),
        ]),
      );
    } catch {
      // não-fatal: a próxima leitura natural da query já resolve.
    }
  };

  /** Mutations que mexem em saldo também disparam o refetch de saldo — em background, sem travar a mutation. */
  const refetchStateAndBalances = async () => {
    await refetchState();
    try {
      await withTimeout(queryClient.refetchQueries({ queryKey: ['account-balances'] }));
    } catch {
      // não-fatal.
    }
  };

  const stateQuery = useQuery<ReconciliationState | null>({
    queryKey: ['bank-reconciliation-state', importId],
    queryFn: async () => {
      if (!importId) return null;
      const { data, error } = await supabase.rpc('get_bank_reconciliation_state', { p_import_id: importId });
      if (error) throw error;
      return (data ?? null) as unknown as ReconciliationState | null;
    },
    enabled: !!importId,
    staleTime: 2_000,
  });

  /* ── Importar extrato .OFX ── */
  const importOfx = useMutation<
    CreateImportResult,
    unknown,
    { file: File; accountId: string }
  >({
    mutationFn: async ({ file, accountId }) => {
      const bytes = await file.arrayBuffer();
      const st = parseOfx(bytes);
      if (!st.entries.length) throw new Error('nenhuma_transacao');

      const fileHash = await sha256Hex(bytes);
      const entries = buildEntryPayload(st);

      const { data, error } = await supabase.rpc('create_bank_statement_import', {
        p_account_id: accountId,
        p_file_name: file.name,
        p_file_hash: fileHash,
        p_bank_id: st.bankId,
        p_acct_id: st.acctId,
        p_period_start: st.periodStart,
        p_period_end: st.periodEnd,
        p_ledger_balance: st.ledgerBalance,
        p_ledger_balance_date: st.ledgerBalanceDate,
        p_entries: entries as unknown as Json,
      });
      if (error) throw error;
      return data as unknown as CreateImportResult;
    },
    onSuccess: (res) => {
      // Fire-and-forget: a mutation não pode ficar "pendurada" esperando o
      // refetch assentar (ver `withTimeout`).
      void withTimeout(
        Promise.all([
          queryClient.refetchQueries({ queryKey: ['bank-reconciliation-state', res.import_id] }),
          queryClient.refetchQueries({ queryKey: ['bank-statement-imports'] }),
        ]),
      );
    },
    onError: (error) => {
      const msg = (error as { message?: string })?.message ?? '';
      if (msg === 'nenhuma_transacao') {
        toast({ variant: 'destructive', title: t.toasts.importErrorTitle, description: t.toasts.importEmptyFile });
        return;
      }
      toast({ variant: 'destructive', title: t.toasts.importErrorTitle, description: getReconErrorMessage(error) });
    },
  });

  /* ── Casar com movimento existente (sugestão ou escolha entre candidatos) ── */
  const matchExisting = useMutation<
    MatchExistingResult,
    unknown,
    { entryId: string; financialTransactionId: string; confidence?: 'auto' | 'manual'; allowAnyDate?: boolean }
  >({
    mutationFn: async ({ entryId, financialTransactionId, confidence = 'manual', allowAnyDate = false }) => {
      const { data, error } = await supabase.rpc('reconcile_match_existing', {
        p_entry_id: entryId,
        p_financial_transaction_id: financialTransactionId,
        p_confidence: confidence,
        p_allow_any_date: allowAnyDate,
      });
      if (error) throw error;
      return data as unknown as MatchExistingResult;
    },
    onSuccess: () => {
      void refetchState();
      toast({ title: t.toasts.matchedTitle });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.matchErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── Busca manual (sem janela de data) ── */
  const searchCandidates = async (entryId: string, query?: string): Promise<SearchCandidatesResult> => {
    const { data, error } = await supabase.rpc('reconcile_search_candidates', {
      p_entry_id: entryId,
      p_query: query ?? null,
    });
    if (error) throw error;
    return data as unknown as SearchCandidatesResult;
  };

  /* ── Candidatos de fatura de cartão ── */
  const listCardBills = async (entryId: string): Promise<ListCardBillsResult> => {
    const { data, error } = await supabase.rpc('reconcile_list_card_bills', { p_entry_id: entryId });
    if (error) throw error;
    return data as unknown as ListCardBillsResult;
  };

  /* ── Pernas de transferência já existentes ── */
  const listTransferLegs = async (entryId: string): Promise<ListTransferLegsResult> => {
    const { data, error } = await supabase.rpc('reconcile_list_transfer_legs', { p_entry_id: entryId });
    if (error) throw error;
    return data as unknown as ListTransferLegsResult;
  };

  /* ── Baixar conta a pagar/receber (baixa TOTAL) ── */
  const settleTransaction = useMutation<
    SettleTransactionResult,
    unknown,
    { entryId: string; financialTransactionId: string }
  >({
    mutationFn: async ({ entryId, financialTransactionId }) => {
      const { data, error } = await supabase.rpc('reconcile_settle_transaction', {
        p_entry_id: entryId,
        p_financial_transaction_id: financialTransactionId,
      });
      if (error) throw error;
      return data as unknown as SettleTransactionResult;
    },
    onSuccess: () => {
      void refetchStateAndBalances();
      invalidateFinance();
      toast({ title: t.toasts.settledTitle });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.settleErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── Criar lançamento avulso ── */
  const createTransaction = useMutation<
    CreateTransactionResult,
    unknown,
    {
      entryId: string;
      categoryId: string;
      description: string;
      costCenterId?: string | null;
      customerId?: string | null;
      supplierId?: string | null;
      notes?: string | null;
    }
  >({
    mutationFn: async ({ entryId, categoryId, description, costCenterId, customerId, supplierId, notes }) => {
      const { data, error } = await supabase.rpc('reconcile_create_transaction', {
        p_entry_id: entryId,
        p_category_id: categoryId,
        p_description: description,
        p_cost_center_id: costCenterId ?? null,
        p_customer_id: customerId ?? null,
        p_supplier_id: supplierId ?? null,
        p_notes: notes ?? null,
      });
      if (error) throw error;
      return data as unknown as CreateTransactionResult;
    },
    onSuccess: () => {
      void refetchStateAndBalances();
      invalidateFinance();
      toast({ title: t.toasts.createdTitle });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.createErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── Transferência entre contas (cria o par ou casa com perna existente) ── */
  const createTransfer = useMutation<
    CreateTransferResult,
    unknown,
    { entryId: string; otherAccountId: string; description?: string | null }
  >({
    mutationFn: async ({ entryId, otherAccountId, description }) => {
      const { data, error } = await supabase.rpc('reconcile_create_transfer', {
        p_entry_id: entryId,
        p_other_account_id: otherAccountId,
        p_description: description ?? null,
      });
      if (error) throw error;
      return data as unknown as CreateTransferResult;
    },
    onSuccess: (res) => {
      void refetchStateAndBalances();
      invalidateFinance();
      toast({ title: res.reused_existing_pair ? t.toasts.transferMatchedTitle : t.toasts.transferCreatedTitle });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.transferErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── Pagar fatura de cartão (reusa pay_credit_card_bill por dentro) ── */
  const payCardBill = useMutation<
    PayCardBillResult,
    unknown,
    { entryId: string; billId: string; amount?: number | null; notes?: string | null }
  >({
    mutationFn: async ({ entryId, billId, amount, notes }) => {
      const { data, error } = await supabase.rpc('reconcile_pay_card_bill', {
        p_entry_id: entryId,
        p_bill_id: billId,
        p_amount: amount ?? null,
        p_notes: notes ?? null,
      });
      if (error) throw error;
      return data as unknown as PayCardBillResult;
    },
    onSuccess: () => {
      void refetchStateAndBalances();
      invalidateFinance();
      toast({ title: t.toasts.cardBillPaidTitle });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.cardBillErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── MODO CARTÃO: lançar a compra que faltava ──
   * `credit_card_bill_date` NUNCA é mandado pelo client (a RPC é
   * SECURITY DEFINER e calcula no servidor por `compute_credit_card_bill_date`
   * — ver `docs/planos/2026-10-18-conciliacao-fatura-cartao.md` §5). A compra
   * nasce `is_paid = false`: `invalidateFinance` por causa de
   * `credit-card-bills`/Contas a Pagar, que passam a mostrar essa compra.
   */
  const createCardPurchase = useMutation<
    CreateCardPurchaseResult,
    unknown,
    {
      entryId: string;
      categoryId: string;
      description?: string | null;
      costCenterId?: string | null;
      supplierId?: string | null;
      notes?: string | null;
    }
  >({
    mutationFn: async ({ entryId, categoryId, description, costCenterId, supplierId, notes }) => {
      const { data, error } = await supabase.rpc('reconcile_create_card_purchase', {
        p_entry_id: entryId,
        p_category_id: categoryId,
        p_description: description ?? null,
        p_cost_center_id: costCenterId ?? null,
        p_supplier_id: supplierId ?? null,
        p_notes: notes ?? null,
      });
      if (error) throw error;
      return data as unknown as CreateCardPurchaseResult;
    },
    onSuccess: () => {
      void refetchStateAndBalances();
      invalidateFinance();
      toast({ title: t.toasts.cardPurchaseCreatedTitle });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.cardPurchaseErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── MODO CARTÃO: casar com compra já lançada (vínculo puro, NÃO quita) ── */
  const matchCardPurchase = useMutation<
    MatchCardPurchaseResult,
    unknown,
    { entryId: string; financialTransactionId: string; allowAnyDate?: boolean }
  >({
    mutationFn: async ({ entryId, financialTransactionId, allowAnyDate = false }) => {
      const { data, error } = await supabase.rpc('reconcile_match_card_purchase', {
        p_entry_id: entryId,
        p_financial_transaction_id: financialTransactionId,
        p_allow_any_date: allowAnyDate,
      });
      if (error) throw error;
      return data as unknown as MatchCardPurchaseResult;
    },
    onSuccess: () => {
      void refetchState();
      toast({ title: t.toasts.cardPurchaseMatchedTitle });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.matchErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── MODO CARTÃO: casar a linha de crédito com um pagamento de fatura JÁ registrado ── */
  const matchCardBillPayment = useMutation<
    MatchCardBillPaymentResult,
    unknown,
    { entryId: string; financialTransactionId: string }
  >({
    mutationFn: async ({ entryId, financialTransactionId }) => {
      const { data, error } = await supabase.rpc('reconcile_match_card_bill_payment', {
        p_entry_id: entryId,
        p_financial_transaction_id: financialTransactionId,
      });
      if (error) throw error;
      return data as unknown as MatchCardBillPaymentResult;
    },
    onSuccess: () => {
      void refetchState();
      toast({ title: t.toasts.cardPaymentMatchedTitle });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.matchErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── MODO CARTÃO: registrar o pagamento da fatura a partir da própria linha de crédito ── */
  const cardPayBill = useMutation<
    CardPayBillResult,
    unknown,
    { entryId: string; billId: string; paymentAccountId: string; amount?: number | null; notes?: string | null }
  >({
    mutationFn: async ({ entryId, billId, paymentAccountId, amount, notes }) => {
      const { data, error } = await supabase.rpc('reconcile_card_pay_bill', {
        p_entry_id: entryId,
        p_bill_id: billId,
        p_payment_account_id: paymentAccountId,
        p_amount: amount ?? null,
        p_notes: notes ?? null,
      });
      if (error) throw error;
      return data as unknown as CardPayBillResult;
    },
    onSuccess: () => {
      void refetchStateAndBalances();
      invalidateFinance();
      toast({ title: t.toasts.cardBillPaidTitle });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.cardBillErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── MODO CARTÃO: busca manual (compras + pagamentos de fatura já registrados) ── */
  const searchCardPurchases = async (entryId: string, query?: string): Promise<SearchCardPurchasesResult> => {
    const { data, error } = await supabase.rpc('reconcile_search_card_purchases', {
      p_entry_id: entryId,
      p_query: query ?? null,
    });
    if (error) throw error;
    return data as unknown as SearchCardPurchasesResult;
  };

  /* ── Vale de funcionário (idempotency key gerada e guardada pelo CALLER) ── */
  const createEmployeeMovement = useMutation<
    CreateEmployeeMovementResult,
    unknown,
    {
      entryId: string;
      employeeId: string;
      idempotencyKey: string;
      description?: string | null;
      costCenterId?: string | null;
    }
  >({
    mutationFn: async ({ entryId, employeeId, idempotencyKey, description, costCenterId }) => {
      const { data, error } = await supabase.rpc('reconcile_create_employee_movement', {
        p_entry_id: entryId,
        p_employee_id: employeeId,
        // A RPC só aceita 'vale' — ver contrato e briefing (bônus/folha nunca
        // são oferecidos como destino de linha de extrato).
        p_kind: 'vale',
        p_idempotency_key: idempotencyKey,
        p_description: description ?? null,
        p_cost_center_id: costCenterId ?? null,
      });
      if (error) throw error;
      return data as unknown as CreateEmployeeMovementResult;
    },
    onSuccess: () => {
      void refetchStateAndBalances();
      invalidateFinance();
      toast({ title: t.toasts.employeeValeTitle });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.employeeValeErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── Inverter sinal (linha única ou lote) — recalcula opening_balance ── */
  const flipSign = useMutation<
    FlipSignResult,
    unknown,
    { entryIds: string[]; flipped: boolean }
  >({
    mutationFn: async ({ entryIds, flipped }) => {
      const { data, error } = await supabase.rpc('reconcile_flip_sign', {
        p_entry_ids: entryIds,
        p_flipped: flipped,
      });
      if (error) throw error;
      return data as unknown as FlipSignResult;
    },
    onSuccess: (res) => {
      // opening_balance mudou → estado precisa refletir no rodapé (em background).
      void refetchState();
      toast({
        title: res.flipped ? t.toasts.signFlippedTitle : t.toasts.signUnflippedTitle,
        description: t.toasts.signFlippedCount.replace('{count}', String(res.changed_count)),
      });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.signFlipErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── Ignorar (linha única) ── */
  const ignoreEntry = useMutation<{ entry_id: string; status: 'ignored' }, unknown, { entryId: string }>({
    mutationFn: async ({ entryId }) => {
      const { data, error } = await supabase.rpc('reconcile_ignore_entry', { p_entry_id: entryId });
      if (error) throw error;
      return data as unknown as { entry_id: string; status: 'ignored' };
    },
    onSuccess: () => {
      void refetchState();
      toast({ title: t.toasts.ignoredTitle });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.ignoreErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── Ignorar em lote ── */
  const ignoreEntriesBatch = useMutation<IgnoreBatchResult, unknown, { entryIds: string[] }>({
    mutationFn: async ({ entryIds }) => {
      if (!importId) throw new Error('import_ausente');
      const { data, error } = await supabase.rpc('reconcile_ignore_entries_batch', {
        p_entry_ids: entryIds,
        p_import_id: importId,
      });
      if (error) throw error;
      return data as unknown as IgnoreBatchResult;
    },
    onSuccess: (res) => {
      void refetchState();
      toast({ title: t.toasts.ignoredBatchTitle.replace('{count}', String(res.ignored_count)) });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.ignoreErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── Restaurar (desfazer ignorar) em lote ── */
  const unignoreEntriesBatch = useMutation<UnignoreBatchResult, unknown, { entryIds: string[] }>({
    mutationFn: async ({ entryIds }) => {
      if (!importId) throw new Error('import_ausente');
      const { data, error } = await supabase.rpc('reconcile_unignore_entries_batch', {
        p_entry_ids: entryIds,
        p_import_id: importId,
      });
      if (error) throw error;
      return data as unknown as UnignoreBatchResult;
    },
    onSuccess: (res) => {
      void refetchState();
      toast({ title: t.toasts.unignoredBatchTitle.replace('{count}', String(res.unignored_count)) });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.ignoreErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── Desfazer conciliação — mostra em PT-BR O QUE foi desfeito ── */
  const unmatchEntry = useMutation<UnmatchEntryResult, unknown, { entryId: string }>({
    mutationFn: async ({ entryId }) => {
      const { data, error } = await supabase.rpc('reconcile_unmatch_entry', { p_entry_id: entryId });
      if (error) throw error;
      return data as unknown as UnmatchEntryResult;
    },
    onSuccess: (res) => {
      void refetchStateAndBalances();
      invalidateFinance();
      const descriptions: Record<UnmatchEntryResult['undone'], string> = {
        none: t.undone.none,
        link: t.undone.link,
        settlement_reverted: t.undone.settlementReverted,
        transaction_deleted: t.undone.transactionDeleted,
        transfer_pair_deleted: t.undone.transferPairDeleted,
        card_bill_payment_reverted: t.undone.cardBillPaymentReverted,
        employee_vale_deleted: t.undone.employeeValeDeleted,
        card_purchase_deleted: t.undone.cardPurchaseDeleted,
      };
      toast({ title: t.toasts.unmatchedTitle, description: descriptions[res.undone] ?? descriptions.none });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.unmatchErrorTitle, description: getReconErrorMessage(error) }),
  });

  /* ── Finalizar ── */
  const finalize = useMutation<FinalizeResult, unknown, { importId: string }>({
    mutationFn: async ({ importId: id }) => {
      const { data, error } = await supabase.rpc('finalize_bank_reconciliation', { p_import_id: id });
      if (error) throw error;
      return data as unknown as FinalizeResult;
    },
    onSuccess: () => {
      void refetchState();
      toast({ title: t.toasts.finalizedTitle });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.finalizeErrorTitle, description: getReconErrorMessage(error) }),
  });

  /**
   * ── Reabrir conciliação finalizada ──
   * Inverso exato de `finalize`. Vale pros DOIS modos (banco e cartão) — não
   * é destino de linha, é ação do import inteiro, oferecida quando
   * `state.can_reopen` é `true` (achado de QA: finalizar era porta sem volta).
   */
  const reopenReconciliation = useMutation<ReopenReconciliationResult, unknown, { importId: string }>({
    mutationFn: async ({ importId: id }) => {
      const { data, error } = await supabase.rpc('reopen_bank_reconciliation', { p_import_id: id });
      if (error) throw error;
      return data as unknown as ReopenReconciliationResult;
    },
    onSuccess: () => {
      void refetchState();
      toast({ title: t.toasts.reopenedTitle });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t.toasts.reopenErrorTitle, description: getReconErrorMessage(error) }),
  });

  // NÃO envolver este retorno em `useMemo`. Cada `useMutation` já devolve um
  // objeto fresco a cada render refletindo seu estado real (`data`,
  // `isPending`, etc.) — essa é a fonte da verdade. Um `useMemo` aqui com
  // array de deps que não inclua TODAS essas mutations (como havia antes,
  // só com `[stateQuery.data, stateQuery.isLoading, importId]`) prende o
  // objeto retornado no snapshot do último render em que uma dessas 3 deps
  // mudou — e quando nenhuma delas muda (ex: `create_bank_statement_import`
  // resolve com `import_id: null` no ramo `nothing_new`, então `importId`
  // continua `null`), o consumidor recebe pra sempre o `importOfx` "idle"
  // de antes do `.mutate()`, mesmo com a mutation já resolvida com dados
  // reais. Foi exatamente esse o bug do diálogo de reimportar OFX: a RPC
  // respondia 200 e a tela ficava parada na escolha de arquivo.
  return {
    state: stateQuery.data ?? null,
    isLoading: stateQuery.isLoading,
    importOfx,
    matchExisting,
    searchCandidates,
    listCardBills,
    listTransferLegs,
    settleTransaction,
    createTransaction,
    createTransfer,
    payCardBill,
    createEmployeeMovement,
    flipSign,
    ignoreEntry,
    ignoreEntriesBatch,
    unignoreEntriesBatch,
    unmatchEntry,
    finalize,
    reopenReconciliation,
    // Modo cartão (20261018140000_conciliacao_fatura_cartao.sql).
    createCardPurchase,
    matchCardPurchase,
    matchCardBillPayment,
    cardPayBill,
    searchCardPurchases,
  };
}
