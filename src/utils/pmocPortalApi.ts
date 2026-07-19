import type { PortalPayload } from '@/types/pmocPortal';
import { supabase } from '@/integrations/supabase/client';
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
 * Busca o payload do Portal do Contrato (PMOC e não-PMOC).
 *
 * Quando há sessão logada, envia o header `Authorization` pra a edge detectar
 * o membro da empresa dona (viewer_can_fill / acesso a portal privado). Anônimo
 * → sem header (comportamento público padrão).
 *
 * Erros:
 *  - `PortalModuleUnavailableError` — módulo "Portal do Cliente" fora da assinatura.
 *  - `PortalPrivateError` — portal privado + visitante sem permissão.
 *  - `portal_not_found` — token inválido / contrato cancelado.
 *  - `portal_network_error` — falha de rede / edge function indisponível.
 */
export async function fetchPmocPortal(token: string): Promise<PortalPayload> {
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
      | { access: 'denied'; company_name?: string | null };

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

    return data as PortalPayload;
  } catch (err) {
    if (err instanceof PortalModuleUnavailableError) throw err;
    if (err instanceof PortalPrivateError) throw err;
    if (err instanceof Error && err.message === 'portal_not_found') throw err;
    throw new Error('portal_network_error');
  }
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
