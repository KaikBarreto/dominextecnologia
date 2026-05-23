import type { PortalPayload } from '@/types/pmocPortal';

/**
 * Cliente do portal PMOC público (Onda B — v1.9.1).
 *
 * Por enquanto opera em **modo mock** — a edge function `pmoc-portal-share`
 * será criada pelo dev-database depois. O contrato (path + query string)
 * já é o final: quando a edge subir, o switch automático passa a usar dados reais
 * sem precisar de mudança na página.
 *
 * Regra:
 * - Token que começa com "demo_" ou env `VITE_USE_MOCK_PMOC_PORTAL=true` → MOCK.
 * - Qualquer outro token → fetch real na edge function.
 *
 * Quando a edge function chegar, o Database só precisa garantir que tokens reais
 * NÃO começam com "demo_" (já é a convenção planejada — base32 sem prefixo).
 *
 * Plano mestre: docs/planos/2026-05-23-pmoc-v1.9-arquitetura.md §2.4
 * Plano da onda: docs/planos/2026-05-23-pmoc-onda-B-portal-publico.md §3.2 / §3.4
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

const USE_MOCK_ENV =
  (import.meta as any).env?.VITE_USE_MOCK_PMOC_PORTAL === 'true';

function shouldUseMock(token: string): boolean {
  if (USE_MOCK_ENV) return true;
  // Token de demonstração — útil em links de doc/preview antes do Database deployar.
  if (token.startsWith('demo_') || token === 'demo') return true;
  // Sem env do Supabase configurada → cai em mock pra não quebrar dev local.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return true;
  return false;
}

/**
 * Busca o payload público de um portal PMOC.
 *
 * Erros:
 *  - `portal_not_found` — token inválido / contrato não-PMOC / contrato cancelado.
 *  - `portal_network_error` — falha de rede / edge function indisponível.
 */
export async function fetchPmocPortal(token: string): Promise<PortalPayload> {
  if (shouldUseMock(token)) {
    return buildMockPayload(token);
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/pmoc-portal-share?token=${encodeURIComponent(
        token,
      )}`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY ?? '',
          'Content-Type': 'application/json',
        },
      },
    );

    if (res.status === 404 || res.status === 400) {
      throw new Error('portal_not_found');
    }
    if (!res.ok) {
      throw new Error('portal_network_error');
    }

    const data = (await res.json()) as PortalPayload;
    return data;
  } catch (err) {
    if (err instanceof Error && err.message === 'portal_not_found') throw err;
    throw new Error('portal_network_error');
  }
}

// ---------------------------------------------------------------------------
// MOCK payload — usado em dev/preview enquanto a edge function não existe.
// Não vaza pra produção: tokens reais não começam com "demo_".
// ---------------------------------------------------------------------------

function buildMockPayload(token: string): PortalPayload {
  return {
    unit: {
      name: 'Unidade Centro — Filial 1',
      address: 'Av. Paulista, 1000 — Bela Vista, São Paulo/SP',
      customer_name: 'Restaurante Bom Sabor Ltda',
    },
    contract: {
      name: 'PMOC — Unidade Centro',
      start_date: '2026-01-15',
      frequency_label: 'Mensal',
      next_pmoc_generation_date: '2026-06-15',
      compliance_text: 'Conforme Lei Federal 13.589/2018',
      health_status: 'em_dia',
      overdue_count: 0,
    },
    responsible_technician: {
      full_name: 'João da Silva Pereira',
      cft_crea: 'CREA-SP 1234567',
      modality: 'Engenheiro Mecânico',
    },
    tenant: {
      name: 'Refrigeração Exemplo Ltda',
      logo_url: null,
      primary_color: '#5555FF',
    },
    history: [
      {
        os_number: 1284,
        scheduled_date: '2026-05-15',
        completed_date: '2026-05-15',
        status: 'concluida',
        service_type_label: 'Manutenção Preventiva',
        description:
          'Limpeza de filtros, checagem de pressão de gás e medição de temperatura de insuflamento.',
        technician_first_name: 'Carlos',
        public_photos: [],
        rating: 5,
      },
      {
        os_number: 1252,
        scheduled_date: '2026-04-15',
        completed_date: '2026-04-15',
        status: 'concluida',
        service_type_label: 'Manutenção Preventiva',
        description: 'Inspeção visual, limpeza geral e troca de filtros.',
        technician_first_name: 'Carlos',
        public_photos: [],
        rating: 5,
      },
      {
        os_number: 1228,
        scheduled_date: '2026-03-15',
        completed_date: '2026-03-15',
        status: 'concluida',
        service_type_label: 'Manutenção Preventiva',
        description: 'Limpeza de evaporadora e checagem de carga de gás.',
        technician_first_name: 'Rafael',
        public_photos: [],
        rating: 4,
      },
    ],
    documents_placeholder: [
      { type: 'pmoc_formal', label: 'PMOC Formal', available: false },
      { type: 'termo_rt', label: 'Termo do Responsável Técnico', available: false },
      { type: 'cronograma', label: 'Cronograma de Manutenções', available: false },
      { type: 'certificado', label: 'Certificado de Conformidade', available: false },
    ],
    // Onda C — mock dos documentos reais (até a edge function deployar).
    // Em mock dev, marcamos como `available: false` pra mostrar o card real
    // com fallback "Disponível em breve" + permitir testes visuais.
    documents_real: [
      {
        type: 'dossie_pmoc',
        label: 'Dossiê PMOC (Capa + Termo + Certificado)',
        available: false,
      },
      {
        type: 'cronograma_anual',
        label: 'Cronograma 12 meses',
        available: false,
      },
    ],
  };
}

/** URL pública canônica do portal — usada em UI interna e geração de QR Code. */
export function buildPmocPortalUrl(token: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://dominex.app');
  return `${base}/pmoc/unidade/${token}`;
}
