import type { PortalPayload } from '@/types/pmocPortal';
import { supabase } from '@/integrations/supabase/client';
import { supabaseAnon } from '@/integrations/supabase/anonClient';
import { buildSlugSegment } from '@/utils/prettyLinks';

/**
 * Cliente do Portal do Contrato (PMOC e não-PMOC).
 *
 * Em produção, faz fetch à edge function `pmoc-portal-share` (verify_jwt=false).
 *
 * Modo mock:
 *  - Token começa com "demo_" ou env `VITE_USE_MOCK_PMOC_PORTAL=true`.
 *  - Sem env do Supabase configurada (fallback dev local).
 *
 * Tokens reais NÃO começam com "demo_" (convenção: 32 hex chars).
 *
 * Schema:
 *  - docs/planos/2026-05-23-pmoc-v1.9-arquitetura.md §2.4
 *  - Redesign 2026-05-24 — payload_version 1.4.0 (header espelha ReportHeader).
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

const USE_MOCK_ENV =
  (import.meta as any).env?.VITE_USE_MOCK_PMOC_PORTAL === 'true';

function shouldUseMock(token: string): boolean {
  if (USE_MOCK_ENV) return true;
  if (token.startsWith('demo_') || token === 'demo') return true;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return true;
  return false;
}

/**
 * Erro específico: a empresa dona NÃO tem o módulo "Portal do Cliente" na
 * assinatura. Distinto de `portal_not_found` (token inválido) — a edge devolve
 * HTTP 200 com `{ error: 'module_unavailable', company_name }`. Carrega o nome
 * da empresa pra exibir discretamente na tela neutra.
 */
export class PortalModuleUnavailableError extends Error {
  readonly companyName: string | null;
  constructor(companyName: string | null) {
    super('module_unavailable');
    this.name = 'PortalModuleUnavailableError';
    this.companyName = companyName;
  }
}

/**
 * Erro específico: o Portal do Contrato está PRIVADO (portal_is_public=false) e
 * quem abriu NÃO é membro logado da empresa dona. A edge devolve HTTP 200 com
 * `{ access: 'denied', company_name }`. Distinto de `portal_not_found` (token
 * inválido) e de `module_unavailable` (módulo fora da assinatura). A tela
 * "Portal privado" oferece login pra quem é da empresa.
 */
export class PortalPrivateError extends Error {
  readonly companyName: string | null;
  constructor(companyName: string | null) {
    super('portal_private');
    this.name = 'PortalPrivateError';
    this.companyName = companyName;
  }
}

/**
 * Erro específico: TODO o Portal do Contrato está atrás da senha — nenhuma seção
 * é livre e o visitante não tem sessão. A edge devolve HTTP 200 com
 * `{ access: 'password_required', company_name }` e NENHUM dado de negócio no
 * corpo. A tela mostra o `PortalUnlockCard` em tela cheia.
 *
 * Distinto de `PortalPrivateError` (portal privado, só membro da empresa entra)
 * e de `PortalModuleUnavailableError` (módulo fora da assinatura).
 */
export class PortalPasswordRequiredError extends Error {
  readonly companyName: string | null;
  constructor(companyName: string | null) {
    super('password_required');
    this.name = 'PortalPasswordRequiredError';
    this.companyName = companyName;
  }
}

/**
 * Nome da chave de sessão no `sessionStorage`, por token de portal.
 *
 * Uma chave POR TOKEN (e não uma global) porque o mesmo navegador pode abrir
 * portais de contratos — e de tenants — diferentes. Espelha o Portal do Cliente
 * (`dominex_customer_portal_session_<token>`). `sessionStorage` e não
 * `localStorage`: a sessão do síndico morre quando ele fecha a aba.
 */
export function contractPortalSessionKey(token: string): string {
  return `dominex_contract_portal_session_${token}`;
}

/**
 * Busca o payload do Portal do Contrato (PMOC e não-PMOC).
 *
 * Quando há sessão logada, envia o header `Authorization` pra a edge detectar
 * o membro da empresa dona (viewer_can_fill / acesso a portal privado). Anônimo
 * → sem header (comportamento público padrão).
 *
 * Erros:
 *  - `PortalModuleUnavailableError` — módulo "Portal do Cliente" fora da assinatura.
 *  - `PortalPrivateError` — portal privado + visitante sem permissão.
 *  - `PortalPasswordRequiredError` — portal inteiro atrás da senha, sem sessão.
 *  - `portal_not_found` — token inválido / contrato cancelado.
 *  - `portal_network_error` — falha de rede / edge function indisponível.
 *
 * `sessionToken` é a sessão do Portal do Cliente DONO do contrato (criada por
 * `contract_portal_login`). Vai no header `X-Portal-Session` — NUNCA na query
 * string, que cai em log de CDN/proxy e vaza no `Referer`. Sem sessão, a edge
 * entrega só as seções livres (e corta o cadastro da unidade do payload).
 */
export async function fetchPmocPortal(
  token: string,
  sessionToken?: string | null,
): Promise<PortalPayload> {
  if (shouldUseMock(token)) {
    return buildMockPayload(token);
  }

  try {
    // Sessão atual (se houver): mandamos o access_token pra a edge resolver o
    // viewer logado da empresa dona. Sem sessão, segue anônimo (read-only).
    let accessToken: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      accessToken = data.session?.access_token ?? null;
    } catch {
      accessToken = null;
    }

    const headers: Record<string, string> = {
      apikey: SUPABASE_ANON_KEY ?? '',
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    // Sessão do portal (senha do cliente). A edge valida server-side pela RPC
    // `contract_portal_session_is_valid` antes de servir seção protegida.
    if (sessionToken) {
      headers['X-Portal-Session'] = sessionToken;
    }

    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/pmoc-portal-share?token=${encodeURIComponent(
        token,
      )}`,
      { method: 'GET', headers },
    );

    if (res.status === 404 || res.status === 400) {
      throw new Error('portal_not_found');
    }
    if (!res.ok) {
      throw new Error('portal_network_error');
    }

    const data = (await res.json()) as
      | PortalPayload
      | { error: 'module_unavailable'; company_name?: string | null }
      | { access: 'denied'; company_name?: string | null }
      | { access: 'password_required'; company_name?: string | null };

    // Módulo fora da assinatura: HTTP 200, mas o corpo sinaliza indisponível.
    // Lança erro tipado próprio — NÃO é "token inválido" nem erro de rede.
    if (data && typeof data === 'object' && (data as any).error === 'module_unavailable') {
      throw new PortalModuleUnavailableError(
        (data as { company_name?: string | null }).company_name ?? null,
      );
    }

    // Portal privado + visitante sem permissão: HTTP 200 { access:'denied' }.
    // Estado próprio — a tela oferece login pra quem é da empresa dona.
    if (data && typeof data === 'object' && (data as any).access === 'denied') {
      throw new PortalPrivateError(
        (data as { company_name?: string | null }).company_name ?? null,
      );
    }

    // Portal INTEIRO atrás da senha (nenhuma seção livre, sem sessão):
    // HTTP 200 { access:'password_required' }, sem dado de negócio no corpo.
    if (
      data
      && typeof data === 'object'
      && (data as { access?: string }).access === 'password_required'
    ) {
      throw new PortalPasswordRequiredError(
        (data as { company_name?: string | null }).company_name ?? null,
      );
    }

    return data as PortalPayload;
  } catch (err) {
    if (err instanceof PortalModuleUnavailableError) throw err;
    if (err instanceof PortalPrivateError) throw err;
    if (err instanceof PortalPasswordRequiredError) throw err;
    if (err instanceof Error && err.message === 'portal_not_found') throw err;
    throw new Error('portal_network_error');
  }
}

/**
 * Abre um chamado (OS corretiva) a partir do Portal do Contrato.
 *
 * Esta funcao e a FRONTEIRA do Supabase pra essa acao: a pagina nao escreve em
 * `service_orders`. O papel `anon` nao tem INSERT nessa tabela (a varredura de
 * 18/10/2026 revogou o privilegio e o botao passou a devolver
 * `42501 permission denied for table service_orders` na cara do cliente final),
 * entao quem cria a linha e a RPC SECURITY DEFINER
 * `create_contract_portal_ticket`, que resolve customer/company/contract pelo
 * PROPRIO token do portal e revalida no servidor: contrato vivo, portal publico,
 * assinatura da empresa, modulo "Portal do Cliente" e tamanho da descricao.
 *
 * `token` e o mesmo da URL do portal: 32 hex (`public_pmoc_token`) OU slug
 * terminando no codigo curto de 12 chars (`public_short_code`). A RPC aceita as
 * duas formas, com a mesma regra da edge `pmoc-portal-share`.
 *
 * Erros propagados crus (o chamador traduz pelo `code`, pra sair no idioma do
 * portal e nao no texto do banco):
 *  - `42501` — portal indisponivel, privado, assinatura vencida ou modulo fora.
 *  - `22023` — descricao fora da faixa de 10 a 2000 caracteres.
 *
 * `sessionToken` (2026-10-21): a RPC exige sessao valida quando
 * `portal_sections->>'ocorrencias' = 'password'` e RECUSA quando 'hidden'. Com
 * 'free' (ou chave ausente, que e o caso de todo link ja compartilhado) a sessao
 * e ignorada — a chamada sem sessao continua valendo exatamente como antes.
 */
export async function createPmocPortalTicket(
  token: string,
  description: string,
  sessionToken?: string | null,
): Promise<void> {
  const { error } = await supabaseAnon.rpc('create_contract_portal_ticket', {
    p_token: token,
    p_description: description.trim(),
    // `p_session_token?: string` no types.ts (DEFAULT NULL no banco): sem sessao
    // mandamos `undefined`, que o JSON.stringify do supabase-js simplesmente
    // omite — e a RPC cai no DEFAULT NULL, igual a chamada de 2 argumentos.
    p_session_token: sessionToken || undefined,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// MOCK payload — usado em dev/preview enquanto a edge function não existe.
// Não vaza pra produção: tokens reais não começam com "demo_".
// ---------------------------------------------------------------------------

function buildMockPayload(_token: string): PortalPayload {
  // Datas relativas pra mock parecer "vivo" — base = hoje.
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const offset = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return iso(d);
  };

  return {
    generated_at: new Date().toISOString(),
    payload_version: '1.6.0',
    // Mock = contrato PMOC público, viewer anônimo (read-only). Flip pra testar.
    access: 'granted',
    viewer_can_fill: false,
    is_pmoc: true,
    unit: {
      name: 'Restaurante Bom Sabor Ltda',
      address: 'Av. Paulista, 1000 - Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    },
    contract: {
      name: 'PMOC - Unidade Centro',
      start_date: '2026-01-15',
      frequency_label: 'Mensal',
      next_pmoc_generation_date: offset(15),
      next_maintenance_date: offset(15),
      compliance_text: 'Conforme Lei Federal 13.589/2018',
      status_label: 'Ativo',
      health_status: 'em_dia',
      overdue_count: 0,
    },
    health: {
      status: 'em_dia',
      overdue_count: 0,
    },
    responsible_technician: {
      full_name: 'João da Silva Pereira',
      cft_crea: 'CREA-SP 1234567',
      modality: 'Engenheiro Mecânico',
      registry_number: null,
    },
    tenant: {
      name: 'Refrigeração Exemplo Ltda',
      logo_url: null,
      primary_color: '#5555FF',
      address: 'Rua dos Bobos, 0',
      city: 'São Paulo',
      state: 'SP',
      // Flip pra `true` em dev pra testar modo white-label.
      white_label_enabled: false,
      document: '12.345.678/0001-90',
      phone: '(11) 98765-4321',
      email: 'contato@exemplo.com.br',
      zip_code: '01310-100',
      // null = não white-label → o front cai no DEFAULT_HEADER_CONFIG.
      report_header: null,
      // Mock usa pt-br/BRL/SP (padrão); flip pra 'en'/'USD' pra testar i18n.
      language: 'pt-br',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
    },
    // Onda redesign — OSs futuras (cronograma).
    schedule: [
      {
        number: 1310,
        scheduled_date: offset(15),
        completed_at: null,
        status: 'agendada',
        status_label: 'Agendada',
        service_type_label: 'Manutenção Preventiva',
        public_description:
          'Limpeza de filtros, checagem de pressão de gás e medição de temperatura de insuflamento.',
        technician_first_name: null,
        public_photos: [],
        rating: null,
        rating_comment: null,
      },
      {
        number: 1311,
        scheduled_date: offset(45),
        completed_at: null,
        status: 'agendada',
        status_label: 'Agendada',
        service_type_label: 'Manutenção Preventiva',
        public_description: 'Inspeção visual, limpeza geral e troca de filtros.',
        technician_first_name: null,
        public_photos: [],
        rating: null,
        rating_comment: null,
      },
      {
        number: 1312,
        scheduled_date: offset(75),
        completed_at: null,
        status: 'pendente',
        status_label: 'Pendente',
        service_type_label: 'Manutenção Preventiva',
        public_description: 'Manutenção periódica conforme cronograma.',
        technician_first_name: null,
        public_photos: [],
        rating: null,
        rating_comment: null,
      },
    ],
    history: [
      {
        number: 1284,
        scheduled_date: offset(-9),
        completed_at: offset(-9),
        status: 'concluida',
        status_label: 'Concluída',
        service_type_label: 'Manutenção Preventiva',
        public_description:
          'Limpeza de filtros, checagem de pressão de gás e medição de temperatura de insuflamento.',
        technician_first_name: 'Carlos',
        public_photos: [],
        rating: 5,
        rating_comment: 'Atendimento muito bom, equipe pontual.',
      },
      {
        number: 1252,
        scheduled_date: offset(-39),
        completed_at: offset(-39),
        status: 'concluida',
        status_label: 'Concluída',
        service_type_label: 'Manutenção Preventiva',
        public_description: 'Inspeção visual, limpeza geral e troca de filtros.',
        technician_first_name: 'Carlos',
        public_photos: [],
        rating: 5,
        rating_comment: null,
      },
      {
        number: 1228,
        scheduled_date: offset(-69),
        completed_at: offset(-69),
        status: 'concluida',
        status_label: 'Concluída',
        service_type_label: 'Manutenção Preventiva',
        public_description: 'Limpeza de evaporadora e checagem de carga de gás.',
        technician_first_name: 'Rafael',
        public_photos: [],
        rating: 4,
        rating_comment: null,
      },
    ],
    // Ocorrências (1.6.0) — linha do tempo completa das visitas (mirror de
    // schedule + history com `id`). Em mock, ids fictícios.
    occurrences: [
      {
        id: 'mock-os-1310',
        number: 1310,
        scheduled_date: offset(15),
        completed_at: null,
        status: 'agendada',
        status_label: 'Agendada',
        service_type_label: 'Manutenção Preventiva',
        public_description:
          'Limpeza de filtros, checagem de pressão de gás e medição de temperatura de insuflamento.',
        technician_first_name: null,
        public_photos: [],
        rating: null,
        rating_comment: null,
      },
      {
        id: 'mock-os-1284',
        number: 1284,
        scheduled_date: offset(-9),
        completed_at: offset(-9),
        status: 'concluida',
        status_label: 'Concluída',
        service_type_label: 'Manutenção Preventiva',
        public_description:
          'Limpeza de filtros, checagem de pressão de gás e medição de temperatura de insuflamento.',
        technician_first_name: 'Carlos',
        public_photos: [],
        rating: 5,
        rating_comment: 'Atendimento muito bom, equipe pontual.',
      },
    ],
    // Onda C/E — documentos reais.
    // Em mock dev marcamos como `available: false` pra mostrar fallback.
    documents: [
      {
        type: 'termo_rt',
        label: 'Termo de Responsabilidade Técnica (TRT)',
        available: false,
        version: null,
        generated_at: null,
        pdf_url: null,
        signature_status: 'pending',
      },
      {
        type: 'dossie_pmoc',
        label: 'Dossiê PMOC (Capa + Termo + Certificado)',
        available: false,
        version: null,
        generated_at: null,
        pdf_url: null,
        signature_status: 'pending',
      },
      {
        type: 'cronograma_anual',
        label: 'Cronograma 12 meses',
        available: false,
        version: null,
        generated_at: null,
        pdf_url: null,
        signature_status: null,
      },
    ],
  };
}

/**
 * URL pública canônica do Portal do Contrato — usada em UI interna e QR Code.
 *
 * Retrocompatível com as duas formas de chamada:
 *  - `buildPmocPortalUrl(token)` (assinatura antiga, ainda funciona).
 *  - `buildPmocPortalUrl({ shortCode, name, token })` → link amigável
 *    `…/contrato/unidade/<slug-do-nome>-<codigo>`. Sem `shortCode`, cai pro
 *    `token` (32hex) antigo — links antigos abrem PRA SEMPRE.
 */
export function buildPmocPortalUrl(
  tokenOrArgs:
    | string
    | { shortCode?: string | null; name?: string | null; token?: string | null },
  origin?: string,
): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://dominex.app');

  if (typeof tokenOrArgs === 'string') {
    return `${base}/contrato/unidade/${tokenOrArgs}`;
  }

  const { shortCode, name, token } = tokenOrArgs;
  if (shortCode) {
    const segment = buildSlugSegment([name], shortCode, 'contrato');
    return `${base}/contrato/unidade/${segment}`;
  }
  // Fallback retrocompat: sem código curto, usa o token antigo.
  return `${base}/contrato/unidade/${token ?? ''}`;
}
