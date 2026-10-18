// Onda "Funis sem valor" (2026-10-17) — o formulário/card dentro de uma obra
// (ou de qualquer funil de processo criado direto no CRM comum, ex: "COMPRAS
// OBRA SHOPPING BOULEVARD") ainda pedia Valor Estimado, Probabilidade e
// Origem — vocabulário de VENDA sem sentido fora do funil comercial.
//
// A régua: `crm_pipelines.tracks_value === false` esconde esses 3 campos e
// renomeia "Previsão Fechamento" pra "Prazo" nos Info Cards do
// LeadDetailModal. A decisão é pelo FUNIL REAL do card (`currentPipelineId`,
// resolvido a partir da etapa), nunca por `projectId` nem pela cardinalidade
// de `pipelines` — ver o comentário de bloco acima de `tracksValue` no
// componente e LeadDetailModal.singleFrontStages.test.tsx.
//
// Driver mínimo com createRoot + act (mesmo padrão de LeadDetailModal.test.tsx
// — o repo não usa @testing-library/react).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

vi.mock('@/hooks/useLeads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useLeads')>();
  return {
    ...actual,
    useLeadInteractions: () => ({
      interactions: [],
      isLoading: false,
      createInteraction: { mutateAsync: vi.fn(), isPending: false },
    }),
    useLeads: () => ({
      deleteLead: { mutateAsync: vi.fn() },
      claimLead: { mutateAsync: vi.fn() },
      updateLeadNotes: { mutate: vi.fn(), isPending: false },
    }),
  };
});

// Duas etapas, cada uma de um funil diferente — uma comercial (tracks_value
// true), outra de processo (tracks_value false).
vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({
    stages: [
      { id: 'stage-comercial', name: 'Leads', color: 'blue', pipeline_id: 'pipeline-comercial', position: 0 },
      { id: 'stage-obra', name: 'A fazer', color: 'muted', pipeline_id: 'pipeline-obra', position: 0 },
    ],
    getStageHex: () => '#000000',
  }),
}));

vi.mock('@/hooks/useCrmPipelines', () => ({
  useCrmPipelines: () => ({
    pipelines: [
      { id: 'pipeline-comercial', name: 'Funil de Vendas', is_default: true, color: '#2563EB', tracks_value: true },
      { id: 'pipeline-obra', name: 'COMPRAS OBRA SHOPPING BOULEVARD', is_default: false, color: '#F59E0B', tracks_value: false },
    ],
  }),
}));

vi.mock('@/hooks/useProjectPipelines', () => ({
  useProjectPipelines: () => ({ pipelines: [] }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isAdminOrGestor: () => true, hasPermission: () => true }),
}));
vi.mock('@/hooks/useCrmPipelineAccess', () => ({
  useCrmPipelineAccess: () => ({ access: [], getPipelineAccessUserIds: () => [], setPipelineAccess: { mutate: vi.fn() } }),
}));
vi.mock('@/hooks/useServiceOrders', () => ({
  useServiceOrders: () => ({
    serviceOrders: [],
    createServiceOrder: { mutateAsync: vi.fn(), isPending: false },
    deleteServiceOrder: { mutateAsync: vi.fn() },
    updateServiceOrder: { mutateAsync: vi.fn() },
  }),
}));
vi.mock('@/hooks/useTaskSubmit', () => ({ useTaskSubmit: () => ({ submitTask: vi.fn() }) }));
vi.mock('@/hooks/useProfiles', () => ({ useProfiles: () => ({ data: [] }) }));
vi.mock('@/components/service-orders/ServiceOrderFormDialog', () => ({ ServiceOrderFormDialog: () => null }));
vi.mock('@/components/schedule/TaskFormDialog', () => ({ TaskFormDialog: () => null }));
vi.mock('@/hooks/useCrmCardTools', () => ({
  useCrmLabels: () => ({ labels: [], isLoading: false }),
  useCrmChecklistTemplates: () => ({ templates: [] }),
  useLeadCardTools: () => ({ labelIds: [], checklists: [], updateCardTools: { mutate: vi.fn(), isPending: false } }),
}));

import { LeadDetailModal } from './LeadDetailModal';
import type { Lead } from '@/hooks/useLeads';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const LEAD_COMERCIAL = {
  id: 'lead-comercial',
  title: 'Instalação de split',
  notes: null,
  stage_id: 'stage-comercial',
  pipeline_id: 'pipeline-comercial',
  customer_id: null,
  customers: null,
  assignees: [],
  value: 1000,
  probability: 50,
  expected_close_date: null,
  // null de propósito: `lead.source` preenchido montaria <OriginBadge>, que
  // chama useCustomerOrigins (useQuery) — sem QueryClientProvider no teste,
  // crashava. O que este teste prende é a presença/ausência do RÓTULO
  // "Origem", não o badge em si.
  source: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
} as unknown as Lead;

const CARD_DA_OBRA = {
  id: 'lead-obra',
  title: 'Comprar 80 condensadoras',
  notes: null,
  stage_id: 'stage-obra',
  pipeline_id: 'pipeline-obra',
  customer_id: null,
  customers: null,
  assignees: [],
  value: 0,
  probability: null,
  expected_close_date: null,
  source: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
} as unknown as Lead;

let container: HTMLDivElement;
let root: Root;

const bodyText = () => document.body.textContent || '';

function mount(lead: Lead) {
  act(() => {
    root.render(
      <LeadDetailModal open lead={lead} onOpenChange={() => {}} onEdit={() => {}} onStageChange={() => {}} />,
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('LeadDetailModal — vocabulário some em funil que não rastreia valor', () => {
  it('funil comercial (tracks_value: true): nada muda, mantém o comportamento de hoje', () => {
    mount(LEAD_COMERCIAL);

    expect(bodyText()).toContain('Valor Estimado');
    expect(bodyText()).toContain('Probabilidade');
    expect(bodyText()).toContain('Origem');
    expect(bodyText()).toContain('Previsão Fechamento');
    expect(bodyText()).not.toContain('Prazo');
  });

  it('funil de processo (tracks_value: false): esconde Valor Estimado, Probabilidade e Origem; renomeia pra "Prazo"', () => {
    mount(CARD_DA_OBRA);

    expect(bodyText()).not.toContain('Valor Estimado');
    expect(bodyText()).not.toContain('Probabilidade');
    expect(bodyText()).not.toContain('Origem');
    expect(bodyText()).not.toContain('Previsão Fechamento');
    expect(bodyText()).toContain('Prazo');
  });
});
