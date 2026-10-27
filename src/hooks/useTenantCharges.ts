import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { QUOTE_CHARGED_IDS_QUERY_KEY } from '@/hooks/useQuoteChargedIds';
import { OS_BILLING_FLAGS_KEY } from '@/hooks/useOsBillingFlags';
import { OS_BILLING_STATE_KEY } from '@/hooks/useOsBillingState';
import { OS_REVENUE_SUMMARY_KEY } from '@/hooks/useOsRevenueSummary';

// ─────────────────────────────────────────────────────────────────────────────
// useTenantCharges — fronteira do Supabase para as COBRANÇAS que o tenant emite
// ao cliente final dele (Asaas BYO). Componente NUNCA chama supabase/edge direto.
//
// Onda 1 = só cobrança avulsa. A criação passa pela edge
// `tenant-asaas-create-charge` (privilegiada); a listagem lê `tenant_charges`
// via PostgREST (RLS por company_id). Nunca expomos custo/margem interna.
// ─────────────────────────────────────────────────────────────────────────────

export type TenantChargeBillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
export type TenantChargeStatus = 'pending' | 'received' | 'confirmed' | 'overdue' | 'refunded' | string;

export interface TenantCharge {
  id: string;
  company_id: string;
  customer_id: string | null;
  value: number;
  description: string | null;
  billing_type: string | null;
  status: string;
  due_date: string | null;
  payment_date: string | null;
  public_short_code: string | null;
  invoice_url: string | null;
  pix_copy_paste: string | null;
  boleto_url: string | null;
  asaas_payment_id: string | null;
  created_at: string;
}

export interface CreateChargeInput {
  customer_id: string;
  value: number;
  due_date: string;
  billing_type: TenantChargeBillingType;
  description?: string;
  /** Multa em % do valor. Só faz sentido quando `fine_type` é 'PERCENTAGE'
   *  (ou ausente). No modo 'FIXED' o valor vai em `fine_value` e este campo
   *  NÃO é enviado — ver a nota de compatibilidade no `create` abaixo. */
  fine_percent?: number;
  /** Multa em R$ (valor fixo). Só é lido pela edge quando `fine_type` = 'FIXED'. */
  fine_value?: number;
  /** Como a multa é cobrada nesta cobrança. Ausente → 'PERCENTAGE' (histórico).
   *  A Asaas aceita os dois em `fine.type`; o default da CONTA continua sendo
   *  percentual, a escolha em reais vale só para esta cobrança. */
  fine_type?: 'PERCENTAGE' | 'FIXED';
  interest_percent?: number;
  discount_percent?: number;
  discount_days?: number;
  installment_count?: number;
  /** Quem paga a taxa do cartão nesta cobrança: 'company' (empresa absorve) ou
   *  'customer' (repasse ao cliente via gross-up). Ausente → default da conta. */
  fee_payer?: 'company' | 'customer';
  /** Origem da cobrança. Quando 'quote', 'contract_installment' ou
   *  'service_order', usar source_id com o UUID da origem. A edge faz dedupe:
   *  chamar duas vezes pro mesmo source_id devolve a mesma cobrança, em vez de
   *  criar outra. */
  source_type?: 'avulso' | 'quote' | 'contract_installment' | 'service_order' | 'receivable';
  /** UUID da origem: orçamento ('quote'), parcela do contrato
   *  ('contract_installment' — id em financial_transactions, não do contrato),
   *  Ordem de Serviço ('service_order') ou conta a receber que JÁ EXISTE
   *  ('receivable' — id da linha-mãe em financial_transactions; é o "cobrar o
   *  saldo", e o `value` TEM que ser o saldo em aberto da conta). */
  source_id?: string | null;
  /** Categoria (nome) do recebível gerado no Financeiro. Ausente/vazio → a edge
   *  usa a categoria padrão da conta de pagamento (default_income_category). */
  category?: string;
  /** Centro de custo do recebível gerado no Financeiro. Ausente/null → sem
   *  centro (sempre opcional, sem default de conta). */
  cost_center_id?: string | null;
  /** Lançar (ou não) o recebível no Financeiro NESTA cobrança. Ausente → a edge
   *  usa o default da conta de pagamento (auto_post_to_finance). */
  post_to_finance?: boolean;
}

/** Resultado do gerar cobrança — allowlist: nunca custo/margem interna. */
export interface CreatedCharge {
  id: string;
  public_short_code: string;
  checkout_url: string;
  invoice_url: string | null;
  pix_copy_paste: string | null;
  boleto_url: string | null;
  value: number;
  due_date: string | null;
  status: string;
  /** Cobrança foi criada, mas o lançamento automático no Financeiro falhou
   *  (não-fatal no edge). Null = lançou certinho (ou nem era pra lançar). */
  financeWarning: string | null;
}

/**
 * Resultado NORMALIZADO da mutation de criar cobrança.
 *
 * `orphan: false` — caminho feliz: cobrança criada no Asaas e registrada em
 *   `tenant_charges`; link de checkout disponível.
 *
 * `orphan: true` — cobrança criada no Asaas (HTTP 207 da edge) mas o INSERT em
 *   `tenant_charges` falhou. O cliente PODE pagar pelo `invoiceUrl` hospedado no
 *   Asaas. Não há `public_short_code`/`checkout_url` próprios nossos.
 *   NÃO tratar como erro — é sucesso parcial.
 */
export type CreateChargeResult =
  | { orphan: false; charge: CreatedCharge }
  | { orphan: true; invoiceUrl: string; asaasPaymentId: string; warning: string };

/**
 * Erro de NEGÓCIO de `tenant-asaas-create-charge`.
 *
 * A edge responde HTTP 200 com `{ ok: false, error_code, message, error }`
 * (mesmo contrato das edges de editar/excluir cobrança): com 4xx o supabase-js
 * devolve `data = null` e a mensagem boa em PT-BR se perderia. O `message` já
 * vem pronto pra mostrar ao usuário.
 *
 * Os códigos de `receivable_*` são do "cobrar o saldo" (source_type
 * 'receivable'). `live_charge_exists` vem com `liveCharge` preenchido: é o
 * caso em que a tela oferece a SUBSTITUIÇÃO explícita (cancelar a atual e
 * emitir a do saldo) — a edge nunca mata cobrança por conta própria.
 */
export type CreateChargeErrorCode =
  | 'invalid_input'
  | 'receivable_not_found'
  | 'receivable_not_chargeable'
  | 'receivable_cancelled'
  | 'receivable_already_paid'
  | 'receivable_no_balance'
  | 'live_charge_exists'
  | 'customer_mismatch'
  | 'value_mismatch';

const KNOWN_CREATE_ERROR_CODES: CreateChargeErrorCode[] = [
  'invalid_input',
  'receivable_not_found',
  'receivable_not_chargeable',
  'receivable_cancelled',
  'receivable_already_paid',
  'receivable_no_balance',
  'live_charge_exists',
  'customer_mismatch',
  'value_mismatch',
];

/** Cobrança viva que está travando a emissão (vem em `live_charge_exists`). */
export interface CreateChargeLiveCharge {
  id: string;
  value: number;
  due_date: string | null;
  status: string;
  billing_type: string | null;
  public_short_code: string | null;
  invoice_url: string | null;
}

export class CreateChargeApiError extends Error {
  code: CreateChargeErrorCode | 'unknown';
  /** Preenchido só em `live_charge_exists`. */
  liveCharge: CreateChargeLiveCharge | null;
  /** Saldo em aberto da conta, quando o servidor informa. */
  balance: number | null;
  constructor(
    message: string,
    code: CreateChargeErrorCode | 'unknown',
    extra: { liveCharge?: CreateChargeLiveCharge | null; balance?: number | null } = {},
  ) {
    super(message);
    this.name = 'CreateChargeApiError';
    this.code = code;
    this.liveCharge = extra.liveCharge ?? null;
    this.balance = extra.balance ?? null;
  }
}

function parseLiveCharge(raw: unknown): CreateChargeLiveCharge | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string') return null;
  return {
    id: row.id,
    value: Number(row.value ?? 0),
    due_date: typeof row.due_date === 'string' ? row.due_date : null,
    status: typeof row.status === 'string' ? row.status : '',
    billing_type: typeof row.billing_type === 'string' ? row.billing_type : null,
    public_short_code: typeof row.public_short_code === 'string' ? row.public_short_code : null,
    invoice_url: typeof row.invoice_url === 'string' ? row.invoice_url : null,
  };
}

/**
 * Monta o erro de criação a partir do corpo da edge. Mantém a MENSAGEM como
 * ela chegava antes (quem só lê `err.message` não muda de comportamento) e
 * acrescenta o `error_code` + a cobrança viva, que é o que a tela de "cobrar o
 * saldo" precisa pra oferecer a substituição.
 */
function createChargeError(body: Record<string, unknown> | null, fallback: string): CreateChargeApiError {
  const rawCode = typeof body?.error_code === 'string' ? body.error_code : '';
  const code: CreateChargeErrorCode | 'unknown' =
    (KNOWN_CREATE_ERROR_CODES as string[]).includes(rawCode) ? (rawCode as CreateChargeErrorCode) : 'unknown';
  const message =
    (typeof body?.message === 'string' && body.message.trim())
    || (typeof body?.error === 'string' && body.error.trim())
    || fallback;
  return new CreateChargeApiError(message, code, {
    liveCharge: parseLiveCharge(body?.live_charge),
    balance: body?.balance == null ? null : Number(body.balance),
  });
}

async function extractEdgeError(error: unknown, data: unknown, fallback: string): Promise<string> {
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    return (data as { error: string }).error;
  }
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx === 'object' && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).clone().json();
      if (body?.error) return String(body.error);
    } catch {
      /* corpo não-JSON — ignora */
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Códigos de erro devolvidos por `tenant-asaas-update-charge` e
 * `tenant-asaas-delete-charge`. Ambas respondem SEMPRE HTTP 200 com
 * `{ ok: false, error_code, message }` — nunca HTTP 4xx/5xx no caminho feliz
 * de validação. `message` já vem em PT-BR do servidor; usamos como texto ao
 * usuário, com fallback traduzido do lado do client quando vier vazio.
 */
export type TenantChargeErrorCode = 'not_found' | 'not_editable' | 'gateway_error' | 'invalid_input';

export class TenantChargeApiError extends Error {
  code: TenantChargeErrorCode | 'unknown';
  constructor(message: string, code: TenantChargeErrorCode | 'unknown') {
    super(message);
    this.name = 'TenantChargeApiError';
    this.code = code;
  }
}

const KNOWN_ERROR_CODES: TenantChargeErrorCode[] = ['not_found', 'not_editable', 'gateway_error', 'invalid_input'];

/**
 * Lê `{ ok, charge?, error_code?, message? }`. Quando `ok !== true`, lança
 * `TenantChargeApiError` com o `message` do servidor (pode vir vazio — quem
 * chama decide o fallback TRADUZIDO, via `t.errors[code]`, em vez de embutir
 * um texto fixo em PT-BR aqui dentro do hook).
 */
function parseChargeApiResponse(data: unknown): Record<string, unknown> {
  const body = data as Record<string, unknown> | null;
  if (body && body.ok === true) return body;
  const rawCode = typeof body?.error_code === 'string' ? body.error_code : undefined;
  const code: TenantChargeErrorCode | 'unknown' =
    rawCode && (KNOWN_ERROR_CODES as string[]).includes(rawCode) ? (rawCode as TenantChargeErrorCode) : 'unknown';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  throw new TenantChargeApiError(message, code);
}

export interface UpdateChargeInput {
  charge_id: string;
  /** Só envia os campos que mudaram — contrato da edge é parcial. */
  value?: number;
  due_date?: string;
  description?: string;
}

export interface UpdateChargeResult {
  charge: {
    id: string;
    value: number;
    due_date: string | null;
    description: string | null;
    status: string;
    invoice_url: string | null;
  };
  financeWarning: string | null;
}

export interface DeleteChargeResult {
  financeWarning: string | null;
}

/** Monta a URL pública amigável do checkout a partir do short_code. */
export function buildCheckoutUrl(shortCode: string): string {
  return `https://dominex.app/pagar/${shortCode}`;
}

export interface UseTenantChargesOptions {
  /** Quando fornecido, a listagem filtra apenas cobranças deste cliente.
   *  Cache isolado por customerId (queryKey diferente). */
  customerId?: string;
  /**
   * Desliga a LISTAGEM, mantendo as mutations.
   *
   * Existe pra quem só precisa de `create`/`update` e não da lista: sem isso,
   * montar este hook numa tela puxa `tenant_charges` da empresa INTEIRA só
   * para existir um botão (mesmo motivo pelo qual `createContractInstallments`
   * vive em useContracts e não em useFinancial). Default true: nenhum chamador
   * existente muda de comportamento.
   */
  enabled?: boolean;
}

export function useTenantCharges(options?: UseTenantChargesOptions) {
  const queryClient = useQueryClient();
  const { companyId } = useUserCompany();
  const { customerId, enabled = true } = options ?? {};

  // queryKey inclui customerId para que o cache seja isolado por cliente.
  const listKey = customerId
    ? ['tenant-charges', companyId, 'customer', customerId]
    : ['tenant-charges', companyId];

  const list = useQuery({
    queryKey: listKey,
    enabled: !!companyId && enabled,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<TenantCharge[]> => {
      if (!companyId) return [];
      let query = supabase
        .from('tenant_charges')
        .select(
          'id, company_id, customer_id, value, description, billing_type, status, due_date, payment_date, public_short_code, invoice_url, pix_copy_paste, boleto_url, asaas_payment_id, created_at',
        )
        .eq('company_id', companyId);
      if (customerId) {
        query = query.eq('customer_id', customerId);
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return (data as TenantCharge[]) ?? [];
    },
  });

  const refund = useMutation({
    mutationFn: async ({ charge_id }: { charge_id: string }): Promise<void> => {
      const { data, error } = await supabase.functions.invoke('tenant-asaas-refund-charge', {
        body: { charge_id },
      });
      if (error) throw new Error(await extractEdgeError(error, data, 'Não foi possível estornar a cobrança.'));
      if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: ['tenant-charges', companyId] });
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    // Espelha o tratamento de erro de `create`: lê a mensagem da edge via
    // extractEdgeError (error.context.clone().json()) e propaga para o caller.
    // O FinanceCobrancas captura no try/catch do handleConfirmRefund.
    onError: async (_err: unknown) => {
      // Erro já foi re-throw pelo mutationFn como Error com mensagem legível.
      // O handler no componente (try/catch) cuida do toast e do fechamento.
    },
  });

  // Edição de valor/vencimento/descrição — só faz sentido para cobrança ainda
  // não paga (a UI só chama isso quando status é PENDING/OVERDUE). A edge é
  // quem decide de verdade (`not_editable` se já foi paga/estornada).
  const update = useMutation({
    mutationFn: async (input: UpdateChargeInput): Promise<UpdateChargeResult> => {
      const body: Record<string, unknown> = { charge_id: input.charge_id };
      if (input.value !== undefined) body.value = input.value;
      if (input.due_date !== undefined) body.due_date = input.due_date;
      if (input.description !== undefined) body.description = input.description;

      const { data, error } = await supabase.functions.invoke('tenant-asaas-update-charge', { body });
      if (error) {
        throw new TenantChargeApiError(
          await extractEdgeError(error, data, 'Não foi possível atualizar a cobrança.'),
          'gateway_error',
        );
      }
      const responseBody = parseChargeApiResponse(data);
      const charge = responseBody.charge as Record<string, unknown> | undefined;
      return {
        charge: {
          id: typeof charge?.id === 'string' ? charge.id : input.charge_id,
          value: typeof charge?.value === 'number' ? charge.value : (input.value ?? 0),
          due_date: typeof charge?.due_date === 'string' ? charge.due_date : null,
          description: typeof charge?.description === 'string' ? charge.description : null,
          status: typeof charge?.status === 'string' ? charge.status : '',
          invoice_url: typeof charge?.invoice_url === 'string' ? charge.invoice_url : null,
        },
        financeWarning: typeof responseBody.finance_warning === 'string' ? responseBody.finance_warning : null,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: ['tenant-charges', companyId] });
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  // Exclusão — mesma regra de status do update. O link de pagamento (checkout
  // próprio + invoice_url do Asaas) para de funcionar assim que a edge cancela
  // a cobrança no gateway.
  const remove = useMutation({
    mutationFn: async ({ charge_id }: { charge_id: string }): Promise<DeleteChargeResult> => {
      const { data, error } = await supabase.functions.invoke('tenant-asaas-delete-charge', {
        body: { charge_id },
      });
      if (error) {
        throw new TenantChargeApiError(
          await extractEdgeError(error, data, 'Não foi possível excluir a cobrança.'),
          'gateway_error',
        );
      }
      const responseBody = parseChargeApiResponse(data);
      return {
        financeWarning: typeof responseBody.finance_warning === 'string' ? responseBody.finance_warning : null,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: ['tenant-charges', companyId] });
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const create = useMutation({
    mutationFn: async (input: CreateChargeInput): Promise<CreateChargeResult> => {
      const body: Record<string, unknown> = {
        customer_id: input.customer_id,
        value: input.value,
        due_date: input.due_date,
        billing_type: input.billing_type,
        description: input.description ?? '',
      };
      // Multa: dois campos SEPARADOS de propósito. `fine_percent` continua
      // sendo "multa em %", e a multa em reais vai em `fine_value` + `fine_type`.
      //
      // Por que não reaproveitar `fine_percent` com um flag de tipo: uma edge
      // ANTIGA (janela entre o deploy do front e o da função) ignoraria
      // `fine_type` e mandaria o número pra Asaas como PERCENTAGE — "R$ 50 de
      // multa" viraria "50% de multa" em produção. Com campos separados, a edge
      // antiga simplesmente não acha `fine_percent`, cai no padrão da conta e a
      // pior consequência é a multa em reais ser ignorada, nunca multiplicada.
      if (input.fine_percent !== undefined) body.fine_percent = input.fine_percent;
      if (input.fine_value !== undefined) body.fine_value = input.fine_value;
      if (input.fine_type !== undefined) body.fine_type = input.fine_type;
      if (input.interest_percent !== undefined) body.interest_percent = input.interest_percent;
      if (input.discount_percent !== undefined) body.discount_percent = input.discount_percent;
      if (input.discount_days !== undefined) body.discount_days = input.discount_days;
      if (input.installment_count !== undefined) body.installment_count = input.installment_count;
      if (input.fee_payer !== undefined) body.fee_payer = input.fee_payer;
      // Repassa origem da cobrança ao edge (source_type + source_id).
      // Default do edge é 'avulso'; 'quote' ativa o dedupe pelo source_id.
      if (input.source_type) body.source_type = input.source_type;
      if (input.source_id != null) body.source_id = input.source_id;
      // Categoria escolhida pelo usuário nesta cobrança — sobrescreve o default
      // da conta (default_income_category) só quando informada.
      if (input.category?.trim()) body.category = input.category.trim();
      // Centro de custo escolhido pelo usuário nesta cobrança. Sem default de
      // conta (ao contrário de categoria) — ausente/null é "sem centro".
      if (input.cost_center_id) body.cost_center_id = input.cost_center_id;
      // Lançar (ou não) o recebível no Financeiro NESTA cobrança. Ausente →
      // a edge usa o default da conta (compatibilidade com frontend antigo).
      if (input.post_to_finance !== undefined) body.post_to_finance = input.post_to_finance;
      const { data, error } = await supabase.functions.invoke('tenant-asaas-create-charge', { body });
      if (error) {
        throw new CreateChargeApiError(
          await extractEdgeError(error, data, 'Não foi possível gerar a cobrança.'),
          'unknown',
        );
      }
      // Erro de NEGÓCIO: HTTP 200 com `ok: false` + `error_code` (+ `error`,
      // repetido pela edge justamente pra não quebrar quem só lia `error`).
      // A mensagem é a mesma de sempre; o `error_code`/`live_charge` é o que o
      // "cobrar o saldo" usa pra oferecer a substituição da cobrança viva.
      if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
        throw createChargeError(data as Record<string, unknown>, 'Não foi possível gerar a cobrança.');
      }

      const responseBody = data as Record<string, unknown> | null;

      // ── Caso ÓRFÃO (HTTP 207): cobrança criada no Asaas mas sem linha em
      //    tenant_charges. A edge devolve `warning` + `invoice_url` (sem
      //    `public_short_code`/`charge`). Tratar como sucesso parcial.
      if (
        responseBody &&
        ('warning' in responseBody || !('public_short_code' in responseBody && responseBody.public_short_code)) &&
        'invoice_url' in responseBody &&
        typeof responseBody.invoice_url === 'string'
      ) {
        return {
          orphan: true,
          invoiceUrl: responseBody.invoice_url as string,
          asaasPaymentId: typeof responseBody.asaas_payment_id === 'string' ? responseBody.asaas_payment_id : '',
          warning: typeof responseBody.warning === 'string' ? responseBody.warning : '',
        };
      }

      // ── Caso NORMAL: edge devolve `{ charge: { ... }, finance_warning }`.
      const charge = (responseBody as { charge?: CreatedCharge } | null)?.charge;
      if (!charge) throw new Error('Não foi possível gerar a cobrança.');
      const financeWarning =
        typeof responseBody?.finance_warning === 'string' ? responseBody.finance_warning : null;
      return { orphan: false, charge: { ...charge, financeWarning } };
    },
    onSuccess: (_result, input) => {
      // Invalida a listagem filtrada (por cliente, se aplicável) e a geral.
      queryClient.invalidateQueries({ queryKey: listKey });
      // Garante que a lista sem filtro (Financeiro) também atualiza quando a
      // mutation veio de um contexto filtrado por cliente.
      queryClient.invalidateQueries({ queryKey: ['tenant-charges', companyId] });
      // Invalida os agregados do Financeiro para que o card "A RECEBER" e as
      // "Últimas movimentações" reflitam a nova transação sem reload de página.
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      // Ao cobrar um orcamento, a lista precisa bloquear sua aprovacao
      // financeira imediatamente. A invalidacao por prefixo cobre qualquer
      // empresa em cache sem depender do contexto de onde o dialog foi aberto.
      if (input.source_type === 'quote') {
        queryClient.invalidateQueries({ queryKey: QUOTE_CHARGED_IDS_QUERY_KEY });
      }
      // O callback da tela de OS também invalida estas leituras, mas manter a
      // regra na fronteira da mutation cobre qualquer outro fluxo presente ou
      // futuro que crie a mesma cobrança sem depender do componente chamador.
      if (input.source_type === 'service_order') {
        queryClient.invalidateQueries({ queryKey: [OS_REVENUE_SUMMARY_KEY] });
        queryClient.invalidateQueries({
          queryKey: input.source_id
            ? [OS_BILLING_STATE_KEY, input.source_id]
            : [OS_BILLING_STATE_KEY],
        });
        queryClient.invalidateQueries({ queryKey: [OS_BILLING_FLAGS_KEY] });
      }
    },
  });

  return {
    charges: list.data ?? [],
    isLoading: list.isLoading,
    isFetching: list.isFetching,
    isError: list.isError,
    error: list.error,
    refetch: list.refetch,
    companyId,
    create,
    refund,
    update,
    remove,
  };
}
