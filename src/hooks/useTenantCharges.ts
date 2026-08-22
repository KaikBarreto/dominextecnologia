import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';

// ─────────────────────────────────────────────────────────────────────────────
// useTenantCharges — fronteira do Supabase para as COBRANÇAS que o tenant emite
// ao cliente final dele (Asaas BYO). Componente NUNCA chama supabase/edge direto.
//
// Onda 1 = só cobrança avulsa. A criação passa pela edge
// `tenant-asaas-create-charge` (privilegiada); a listagem lê `tenant_charges`
// via PostgREST (RLS por company_id). Nunca expomos custo/margem interna.
// ─────────────────────────────────────────────────────────────────────────────

export type TenantChargeBillingType = 'PIX' | 'BOLETO' | 'UNDEFINED';
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
  created_at: string;
}

export interface CreateChargeInput {
  customer_id: string;
  value: number;
  due_date: string;
  billing_type: TenantChargeBillingType;
  description?: string;
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

/** Monta a URL pública amigável do checkout a partir do short_code. */
export function buildCheckoutUrl(shortCode: string): string {
  return `https://dominex.app/pagar/${shortCode}`;
}

export interface UseTenantChargesOptions {
  /** Quando fornecido, a listagem filtra apenas cobranças deste cliente.
   *  Cache isolado por customerId (queryKey diferente). */
  customerId?: string;
}

export function useTenantCharges(options?: UseTenantChargesOptions) {
  const queryClient = useQueryClient();
  const { companyId } = useUserCompany();
  const { customerId } = options ?? {};

  // queryKey inclui customerId para que o cache seja isolado por cliente.
  const listKey = customerId
    ? ['tenant-charges', companyId, 'customer', customerId]
    : ['tenant-charges', companyId];

  const list = useQuery({
    queryKey: listKey,
    enabled: !!companyId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<TenantCharge[]> => {
      if (!companyId) return [];
      let query = supabase
        .from('tenant_charges')
        .select(
          'id, company_id, customer_id, value, description, billing_type, status, due_date, payment_date, public_short_code, invoice_url, pix_copy_paste, boleto_url, created_at',
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

  const create = useMutation({
    mutationFn: async (input: CreateChargeInput): Promise<CreateChargeResult> => {
      const { data, error } = await supabase.functions.invoke('tenant-asaas-create-charge', {
        body: {
          customer_id: input.customer_id,
          value: input.value,
          due_date: input.due_date,
          billing_type: input.billing_type,
          description: input.description ?? '',
        },
      });
      if (error) throw new Error(await extractEdgeError(error, data, 'Não foi possível gerar a cobrança.'));
      if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }

      const body = data as Record<string, unknown> | null;

      // ── Caso ÓRFÃO (HTTP 207): cobrança criada no Asaas mas sem linha em
      //    tenant_charges. A edge devolve `warning` + `invoice_url` (sem
      //    `public_short_code`/`charge`). Tratar como sucesso parcial.
      if (
        body &&
        ('warning' in body || !('public_short_code' in body && body.public_short_code)) &&
        'invoice_url' in body &&
        typeof body.invoice_url === 'string'
      ) {
        return {
          orphan: true,
          invoiceUrl: body.invoice_url as string,
          asaasPaymentId: typeof body.asaas_payment_id === 'string' ? body.asaas_payment_id : '',
          warning: typeof body.warning === 'string' ? body.warning : '',
        };
      }

      // ── Caso NORMAL: edge devolve `{ charge: { ... } }` com short_code.
      const charge = (body as { charge?: CreatedCharge } | null)?.charge;
      if (!charge) throw new Error('Não foi possível gerar a cobrança.');
      return { orphan: false, charge };
    },
    onSuccess: () => {
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
    },
  });

  return {
    charges: list.data ?? [],
    isLoading: list.isLoading,
    companyId,
    create,
  };
}
