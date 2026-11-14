import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invalidatePdvReportCaches } from '@/hooks/pdvReportCache';

export interface OpenCardAuthorization {
  id: string;
  orderId: string;
  orderNumber: number;
  customerName: string;
  method: 'debito' | 'credito';
  amount: number;
  authorizedAt: string;
}

export interface CardSettlementWorkspace {
  payments: OpenCardAuthorization[];
  accounts: Array<{ id: string; name: string }>;
  companyToday: string;
}

type RpcError = { code?: string; message?: string; details?: string };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;
const ROOT = ['pdv-card-settlements-v3'] as const;

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;

export function projectCardSettlementWorkspace(value: unknown): CardSettlementWorkspace {
  const root = object(value);
  const companyToday = text(root.company_today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(companyToday)) throw new Error('O resumo de cartões recebido está incompleto.');
  const payments = (Array.isArray(root.payments) ? root.payments : []).map((item) => {
    const row = object(item);
    const amount = number(row.amount);
    const method: OpenCardAuthorization['method'] | null = row.method === 'debito'
      ? 'debito'
      : row.method === 'credito'
        ? 'credito'
        : null;
    if (!text(row.id) || !text(row.order_id) || !Number.isInteger(number(row.order_number))
      || !text(row.customer_name) || method === null
      || !Number.isFinite(amount) || amount <= 0 || !text(row.authorized_at)) {
      throw new Error('O resumo de cartões recebido está incompleto.');
    }
    return { id: text(row.id), orderId: text(row.order_id), orderNumber: number(row.order_number),
      customerName: text(row.customer_name), method, amount, authorizedAt: text(row.authorized_at) };
  });
  const accounts = (Array.isArray(root.accounts) ? root.accounts : []).map((item) => {
    const row = object(item);
    if (!text(row.id) || !text(row.name)) throw new Error('O resumo de cartões recebido está incompleto.');
    return { id: text(row.id), name: text(row.name) };
  });
  return { payments, accounts, companyToday };
}

function mapError(error: RpcError): Error {
  const combined = `${error.details ?? ''} ${error.message ?? ''}`;
  const code = (combined.match(/code=(pdv_[a-z0-9_]+)/i)?.[1] ?? '').toLowerCase();
  const messages: Record<string, string> = {
    pdv_card_permission_denied: 'Seu perfil não permite conciliar cartões.',
    pdv_card_bank_permission_denied: 'Seu perfil não permite usar contas bancárias.',
    pdv_card_input_invalid: 'Revise adquirente, NSU, parcelas, taxa e data.',
    pdv_card_account_invalid: 'Escolha uma conta bancária ativa.',
    pdv_card_authorization_not_found: 'Esta autorização não está mais disponível.',
    pdv_card_already_settled: 'Esta autorização já foi conciliada.',
    pdv_card_nsu_duplicated: 'Este NSU já foi conciliado nesta adquirente.',
    pdv_card_fee_invalid: 'A taxa não pode ser maior que o valor da venda.',
    pdv_card_cash_session_denied: 'Este cartão pertence a outro caixa ou terminal.',
  };
  return new Error(messages[code] ?? 'Não foi possível atualizar os cartões agora. Tente novamente.');
}

async function call(name: string, args?: Record<string, unknown>) {
  const { data, error } = await rpc(name, args);
  if (error) throw mapError(error);
  return data;
}

export interface SettleCardInput {
  paymentId: string;
  accountId: string;
  settledOn: string;
  acquirer: string;
  nsu: string;
  installments: number;
  feeAmount: number;
  idempotencyKey: string;
}

export function usePdvCardSettlements(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ROOT,
    enabled,
    queryFn: async () => projectCardSettlementWorkspace(await call('pdv_list_open_card_authorizations_v3')),
    staleTime: 20_000,
    retry: false,
  });
  const settle = useMutation({
    mutationFn: (input: SettleCardInput) => call('pdv_settle_card_authorization_v3', {
      p_payment_id: input.paymentId,
      p_account_id: input.accountId,
      p_settled_on: input.settledOn,
      p_acquirer: input.acquirer.trim(),
      p_nsu: input.nsu.trim(),
      p_installments: input.installments,
      p_fee_amount: input.feeAmount,
      p_idempotency_key: input.idempotencyKey,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ROOT });
      await queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      await invalidatePdvReportCaches(queryClient);
    },
  });
  return { ...query, workspace: query.data ?? null, settle };
}
