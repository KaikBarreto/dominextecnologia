import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * `datacenter_tunnel` = saída própria num VPS/nuvem (ex.: VM gratuita da Oracle
 * com SOCKS5). Dá um IP distinto por tenant, mas continua sendo IP de datacenter:
 * é degrau intermediário entre não ter nada e o residencial, não substituto.
 */
export type WhatsappProxyKind = 'residential_static' | 'mobile' | 'datacenter_tunnel';
export type WhatsappProxyProtocol = 'http' | 'https' | 'socks5';
export type WhatsappProxyStatus = 'free' | 'assigned' | 'blocked';

/**
 * Um IP do pool da Dominex. A credencial NUNCA vem nesta estrutura: ela vive no
 * Vault sob o nome em `secret_name`, e a edge nunca a devolve, nem mascarada.
 */
export interface WhatsappProxy {
  id: string;
  label: string;
  kind: WhatsappProxyKind;
  host: string;
  port: number;
  protocol: WhatsappProxyProtocol;
  region: string | null;
  /** Nome do segredo no Vault. `null` = fornecedor que autentica pelo IP de origem. */
  secret_name: string | null;
  /** Conveniência do servidor: existe credencial no Vault para este IP. */
  has_credential: boolean;
  status: WhatsappProxyStatus;
  monthly_cost: number | null;
  notes: string | null;
  assigned_connection_id: string | null;
  /** Empresa dona da conexão que usa este IP, resolvida no servidor. */
  assigned_company_name: string | null;
  last_check_at: string | null;
  last_check_ok: boolean | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsappProxyInput {
  label: string;
  kind: WhatsappProxyKind;
  host: string;
  port: number;
  protocol: WhatsappProxyProtocol;
  region?: string | null;
  monthly_cost?: number | null;
  notes?: string | null;
  /** Vão pro Vault, nunca pra tabela. Ausentes = proxy sem autenticação. */
  username?: string;
  password?: string;
}

const queryKey = ['admin-whatsapp-proxies'] as const;

/**
 * Lê a mensagem PT-BR do corpo do erro da edge. `FunctionsHttpError` guarda o
 * `Response` original em `.context`; sem abrir ele, a UI mostraria só
 * "Edge Function returned a non-2xx status code".
 *
 * NOTA: há uma cópia desta função em `useWhatsappConnections.ts`. As duas
 * nasceram em sessões paralelas; vale extrair pra `src/lib/` quando as duas
 * ondas estiverem commitadas, pra não editar o arquivo da outra sessão agora.
 */
async function edgeError(error: unknown, fallback: string): Promise<Error> {
  const resp = (error as { context?: Response })?.context;
  try {
    const body = (await resp?.json?.()) as { message?: string; error?: string } | undefined;
    const message = body?.message || body?.error;
    if (message) return new Error(message);
  } catch {
    /* corpo não-JSON: cai no fallback */
  }
  return new Error((error as Error)?.message || fallback);
}

async function callProxyEdge<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp-proxy-manage', { body });
  if (error) throw await edgeError(error, fallback);
  if (data?.error) throw new Error(data.message || data.error);
  return data as T;
}

/**
 * Pool de IPs residenciais do WhatsApp, no painel master Auctus. Todas as
 * escritas passam pela edge `whatsapp-proxy-manage`: a tabela
 * `whatsapp_proxies` tem INSERT/UPDATE/DELETE revogados para `authenticated`,
 * e a leitura também vem da edge pra resolver o nome da empresa dona do IP
 * (que o super_admin não alcança por RLS, já que não pertence a empresa nenhuma).
 */
export function useAdminWhatsappProxies() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const list = useQuery({
    queryKey,
    queryFn: async () => {
      const data = await callProxyEdge<{ proxies: WhatsappProxy[] }>(
        { action: 'list' },
        'Não foi possível carregar o pool de IPs.',
      );
      return data.proxies ?? [];
    },
  });

  const create = useMutation({
    mutationFn: (input: WhatsappProxyInput) =>
      callProxyEdge<{ proxy: WhatsappProxy }>(
        { action: 'create', ...input },
        'Não foi possível cadastrar o IP.',
      ),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: (input: Partial<WhatsappProxyInput> & { proxy_id: string; status?: 'free' | 'blocked' }) =>
      callProxyEdge<{ proxy: WhatsappProxy }>(
        { action: 'update', ...input },
        'Não foi possível atualizar o IP.',
      ),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (proxyId: string) =>
      callProxyEdge<{ ok: boolean }>(
        { action: 'delete', proxy_id: proxyId },
        'Não foi possível excluir o IP.',
      ),
    onSuccess: invalidate,
  });

  const release = useMutation({
    mutationFn: (connectionId: string) =>
      callProxyEdge<{ ok: boolean }>(
        { action: 'release', connection_id: connectionId },
        'Não foi possível liberar o IP.',
      ),
    onSuccess: invalidate,
  });

  const healthcheck = useMutation({
    mutationFn: (proxyId?: string) =>
      callProxyEdge<{ checked: number }>(
        proxyId ? { action: 'healthcheck', proxy_id: proxyId } : { action: 'healthcheck' },
        'Não foi possível verificar o IP.',
      ),
    onSuccess: invalidate,
  });

  return {
    proxies: list.data ?? [],
    isLoading: list.isLoading,
    error: list.error as Error | null,
    create,
    update,
    remove,
    release,
    healthcheck,
  };
}
