import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';
import { parseFinancialSheet, type ParsedRow, type ParsedSheet } from '@/utils/financialImport/parseSheet';

// ─────────────────────────────────────────────────────────────────────────────
// useFinancialImport — fronteira do Supabase pra importação financeira por
// planilha (upload → conferência → gravação → desfazer).
//
// Programado contra o contrato em
// `docs/planos/2026-10-18-contrato-rpcs-planilha.md`, hoje já aplicado no banco
// (migration `20261018121000_importacao_financeira_planilha.sql`).
//
// ⚠️ NÃO reintroduza um wrapper que tipe o nome da RPC como `string`.
// `supabase.rpc('preview_financial_import', { p_file_hash, p_rows })` é chamado
// DIRETO de propósito: assim o `types.ts` gerado confere o NOME da função e o
// NOME de cada argumento em tempo de compilação. Só o retorno é convertido (o
// tipo gerado é `Json`).
//
// Por quê: um wrapper `(fn: string, args?: Record<string, unknown>)` desliga
// essa checagem inteira. Foi exatamente assim que a Compra direta ficou um dia
// quebrada em produção — a tela chamava duas RPCs que não existiam no banco,
// com typecheck 100% verde, e o erro só aparecia no clique do cliente. Com a
// chamada direta, RPC inexistente ou argumento renomeado é erro de compilação.
//
// NENHUM componente de `src/components/financial/importSpreadsheet/` ou
// `ImportSpreadsheetDialog.tsx` chama `supabase.rpc(...)` direto — tudo passa
// por aqui.
// ─────────────────────────────────────────────────────────────────────────────

/* ─────────────────────────── hash do arquivo (idempotência de arquivo) ─────────────────────────── */

/**
 * SHA-256 dos bytes crus do arquivo (hex). Mesma função de
 * `useBankReconciliation.ts` (não exportada por lá, reimplementada aqui — é
 * só a conta, não uma lib). A RPC usa pra bloquear reupload do MESMO arquivo;
 * o `contentKey` que o parser calcula por linha é ignorado pelo servidor e
 * serve só pra exibição.
 */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Lê e faz o hash do arquivo de uma vez — ponto único de entrada do upload. */
export async function parseAndHashFinancialSheet(
  file: File,
): Promise<{ parsed: ParsedSheet; fileHash: string; fileName: string; bytes: ArrayBuffer }> {
  const bytes = await file.arrayBuffer();
  const [parsed, fileHash] = await Promise.all([parseFinancialSheet(bytes), sha256Hex(bytes)]);
  return { parsed, fileHash, fileName: file.name, bytes };
}

/* ─────────────────────────── shape de `p_rows` (contrato, snake_case) ─────────────────────────── */

export interface FinancialImportRowInput {
  row_number: number;
  date: string; // YYYY-MM-DD
  /**
   * Vencimento (coluna "Vencimento" do molde). Opcional: em branco numa linha
   * não paga o servidor usa a data do lançamento, e em linha paga ele ignora
   * com aviso. Ver `ParsedRow.dueDate`.
   */
  due_date: string | null; // YYYY-MM-DD
  type: 'entrada' | 'saida';
  description: string;
  amount: number;
  category: string | null;
  category_id?: string;
  account: string | null;
  account_id?: string;
  cost_center: string | null;
  cost_center_id?: string;
  payment_method: string | null;
  /** Molde novo (colunas "Cliente"/"Fornecedor" separadas, desde 2026-10-18). */
  customer: string | null;
  supplier: string | null;
  /** Molde VELHO (coluna única "Cliente/Fornecedor") — compatibilidade. Precedência no servidor: `*_id` > `customer`/`supplier` > `counterparty`. */
  counterparty: string | null;
  customer_id?: string;
  supplier_id?: string;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
}

/**
 * Correção manual feita na tela de conferência pra uma linha `blocked`. O ID
 * vence quando enviado (regra do contrato) — por isso aqui só guardamos o
 * que o usuário RESOLVEU, nunca sobrescrevemos o texto cru da planilha.
 */
export interface FinancialImportRowOverride {
  category_id?: string;
  account_id?: string;
  cost_center_id?: string;
  payment_method?: string;
}

/**
 * Linha "sendável": tem todos os campos ESTRUTURALMENTE obrigatórios
 * (data, tipo, descrição, valor) resolvidos pelo parser. Categoria/conta/
 * centro de custo/forma de pagamento/contraparte podem vir vazios — é o
 * SERVIDOR que resolve e devolve o status por campo (`'empty'`, `'not_found'`...).
 *
 * Linha SEM esses 4 campos básicos (data inválida, valor inválido, tipo não
 * inferível, descrição vazia) nunca chega a ser enviada: o contrato não tem
 * um status de resolução pra eles, então o problema só se resolve editando a
 * planilha e reenviando o arquivo — não tem correção inline pra isso.
 */
export function isFinancialImportRowSendable(row: ParsedRow): boolean {
  return (
    row.state !== 'skipped' &&
    row.date !== null &&
    row.type !== null &&
    row.amount !== null &&
    !!row.description
  );
}

export interface BuildFinancialImportPayloadResult {
  rows: FinancialImportRowInput[];
  /** Linhas com problema ESTRUTURAL (fora do alcance da correção inline) — nunca vão pro servidor. */
  excludedRowNumbers: number[];
}

/**
 * `ParsedRow[]` (camelCase, saída do parser) + overrides locais →
 * `p_rows` (snake_case, o que a RPC espera). Pura — sem rede, sem Supabase.
 * Testável isoladamente.
 */
export function buildFinancialImportPayload(
  rows: ParsedRow[],
  overrides: Record<number, FinancialImportRowOverride> = {},
): BuildFinancialImportPayloadResult {
  const payloadRows: FinancialImportRowInput[] = [];
  const excludedRowNumbers: number[] = [];

  for (const row of rows) {
    if (!isFinancialImportRowSendable(row)) {
      if (row.state !== 'skipped') excludedRowNumbers.push(row.rowNumber);
      continue;
    }
    const override = overrides[row.rowNumber];
    const payloadRow: FinancialImportRowInput = {
      row_number: row.rowNumber,
      date: row.date as string,
      due_date: row.dueDate,
      type: row.type as 'entrada' | 'saida',
      description: row.description as string,
      amount: row.amount as number,
      category: row.category,
      account: row.account,
      cost_center: row.costCenter,
      payment_method: override?.payment_method ?? row.paymentMethod,
      customer: row.customer,
      supplier: row.supplier,
      counterparty: row.counterparty,
      is_paid: row.isPaid,
      paid_date: row.paidDate,
      notes: row.notes,
    };
    if (override?.category_id) payloadRow.category_id = override.category_id;
    if (override?.account_id) payloadRow.account_id = override.account_id;
    if (override?.cost_center_id) payloadRow.cost_center_id = override.cost_center_id;
    payloadRows.push(payloadRow);
  }

  return { rows: payloadRows, excludedRowNumbers };
}

/* ─────────────────────────── shapes de resposta (contrato) ─────────────────────────── */

export type FinancialImportRowStatus = 'ready' | 'duplicate' | 'blocked';

export type FinancialImportFieldStatus =
  | 'ok'
  | 'empty'
  | 'not_found'
  | 'ambiguous'
  | 'inactive'
  | 'wrong_type'
  | 'card_account';

export type FinancialImportCounterpartyStatus = FinancialImportFieldStatus | 'matched_customer' | 'matched_supplier';

export interface FinancialImportIssue {
  field: string;
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface FinancialImportExistingImport {
  id: string;
  file_name: string;
  created_at: string;
  created_count: number;
  status: 'applied' | 'reverted';
}

export interface FinancialImportPreviewRow {
  row_number: number;
  content_key: string;
  batch_rank: number;
  existing_count: number;
  status: FinancialImportRowStatus;
  date: string;
  /** Vencimento JÁ RESOLVIDO pelo servidor (fallback e regra de linha paga aplicados). */
  due_date: string | null;
  transaction_type: 'entrada' | 'saida';
  description: string;
  amount: number;
  signed_amount: number;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
  category_input: string | null;
  category_id: string | null;
  category_name: string | null;
  category_status: FinancialImportFieldStatus;
  account_input: string | null;
  account_id: string | null;
  account_name: string | null;
  account_type: string | null;
  account_status: FinancialImportFieldStatus;
  cost_center_input: string | null;
  cost_center_id: string | null;
  cost_center_name: string | null;
  cost_center_status: FinancialImportFieldStatus;
  payment_method_input: string | null;
  payment_method: string | null;
  payment_method_status: FinancialImportFieldStatus;
  counterparty_input: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  counterparty_name: string | null;
  counterparty_status: FinancialImportCounterpartyStatus;
  is_duplicate: boolean;
  issues: FinancialImportIssue[];
}

export interface FinancialImportPreviewResult {
  already_imported: boolean;
  existing_import: FinancialImportExistingImport | null;
  row_count: number;
  ready_count: number;
  blocked_count: number;
  duplicate_count: number;
  total_in: number;
  total_out: number;
  rows: FinancialImportPreviewRow[];
}

export interface FinancialImportSkippedSample {
  row_number: number;
  date: string;
  amount: number;
  description: string;
  reason: 'duplicate' | 'invalid';
  message: string;
}

export interface FinancialImportApplyResult {
  already_imported: boolean;
  import_id: string;
  row_count: number;
  created_count: number;
  skipped_count: number;
  skipped_dup_count: number;
  skipped_invalid_count: number;
  skipped_samples: FinancialImportSkippedSample[];
  total_in: number;
  total_out: number;
}

export interface FinancialImportKeptRow {
  financial_transaction_id: string;
  row_number: number;
  transaction_date: string;
  description: string;
  amount: number;
  transaction_type: 'entrada' | 'saida';
  reasons: string[];
  reason_label: string;
}

export interface FinancialImportRevertResult {
  import_id: string;
  status: 'applied' | 'reverted';
  deleted_count: number;
  kept_count: number;
  kept: FinancialImportKeptRow[];
  message: string;
}

/* ─────────────────────────── histórico ("Importações anteriores") ─────────────────────────── */

/**
 * Linha de `financial_imports` pro histórico exibido no diálogo. `status` sai
 * do banco como `string` (coluna sem enum) — a UI narrowa pra `'applied'`/
 * `'reverted'` na leitura, nunca com `as`.
 */
export interface FinancialImportHistoryItem {
  id: string;
  file_name: string | null;
  created_at: string;
  row_count: number;
  created_count: number;
  skipped_count: number;
  status: string;
  source: string;
}

/**
 * Últimas 20 importações da empresa (RLS de `financial_imports` já restringe
 * o escopo — nada de filtro `company_id` aqui). Sem RPC: é um `select` direto,
 * a mesma tabela que `apply_financial_import`/`revert_financial_import` leem
 * e escrevem no banco.
 */
export function useFinancialImportHistory() {
  return useQuery<FinancialImportHistoryItem[]>({
    queryKey: ['financial-imports-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_imports')
        .select('id, file_name, created_at, row_count, created_count, skipped_count, status, source')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw new Error(getFinancialImportErrorMessage(error));
      return data ?? [];
    },
    staleTime: 5_000,
  });
}

/* ─────────────────────────── erro das RPCs ─────────────────────────── */

/**
 * O contrato garante que o Postgres já devolve a mensagem em PT-BR para
 * `P0001` (regra de negócio), `22023` (argumento inválido, ex: >5000 linhas)
 * e `42501` (acesso/permissão, inclusive `can_delete_finance` faltando no
 * desfazer) — repassamos essas três literalmente. Mesmo critério de
 * `useBankReconciliation.ts`/`useCostCenters.ts`.
 */
function getFinancialImportErrorMessage(error: unknown): string {
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

/* ─────────────────────────── hook principal ─────────────────────────── */

export function useFinancialImport() {
  const queryClient = useQueryClient();

  const invalidateFinance = () => {
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    queryClient.invalidateQueries({ queryKey: ['financial'] });
    queryClient.invalidateQueries({ queryKey: ['account-balances'] });
    queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['credit-card-bills'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  };

  /** Preview — NÃO grava nada, só resolve/classifica cada linha. */
  const preview = useMutation<
    FinancialImportPreviewResult,
    Error,
    { fileHash: string; rows: FinancialImportRowInput[] }
  >({
    mutationFn: async ({ fileHash, rows }) => {
      const { data, error } = await supabase.rpc('preview_financial_import', {
        p_file_hash: fileHash,
        p_rows: rows as unknown as Json,
      });
      if (error) throw new Error(getFinancialImportErrorMessage(error));
      return data as unknown as FinancialImportPreviewResult;
    },
  });

  /** Grava só as linhas enviadas em `rows` (a tela filtra pelas marcadas antes de chamar). */
  const apply = useMutation<
    FinancialImportApplyResult,
    Error,
    { fileName: string; fileHash: string; rows: FinancialImportRowInput[] }
  >({
    mutationFn: async ({ fileName, fileHash, rows }) => {
      const { data, error } = await supabase.rpc('apply_financial_import', {
        p_file_name: fileName,
        p_file_hash: fileHash,
        p_rows: rows as unknown as Json,
      });
      if (error) throw new Error(getFinancialImportErrorMessage(error));
      return data as unknown as FinancialImportApplyResult;
    },
    onSuccess: (result) => {
      // `already_imported` não cria linha nova em `financial_imports` — nada
      // pra atualizar no histórico. Fora isso, o registro entrou agora (com
      // `created_count` 0 ou não), então o histórico precisa refletir.
      if (!result.already_imported) {
        queryClient.invalidateQueries({ queryKey: ['financial-imports-history'] });
        if (result.created_count > 0) invalidateFinance();
      }
    },
  });

  /** Desfaz uma importação: remove o que ainda não foi tocado, recusa (com motivo) o resto. */
  const revert = useMutation<FinancialImportRevertResult, Error, { importId: string }>({
    mutationFn: async ({ importId }) => {
      const { data, error } = await supabase.rpc('revert_financial_import', { p_import_id: importId });
      if (error) throw new Error(getFinancialImportErrorMessage(error));
      return data as unknown as FinancialImportRevertResult;
    },
    onSuccess: (result) => {
      // O status muda mesmo quando `deleted_count` é 0 (nada pra remover) ou
      // quando a reversão é parcial — o histórico tem que refletir sempre.
      queryClient.invalidateQueries({ queryKey: ['financial-imports-history'] });
      if (result.deleted_count > 0) invalidateFinance();
    },
  });

  return { preview, apply, revert };
}
