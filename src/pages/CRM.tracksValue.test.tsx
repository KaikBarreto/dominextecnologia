// Onda "funil sem valores" (2026-10-17): `crm_pipelines.tracks_value` desliga
// o vocabulário de venda (R$, "Total de Leads", Probabilidade) pra funis de
// projeto/processo (ex: Contratos de Manutenção) que não têm dinheiro
// envolvido. Este teste prende o contrato visual: um funil com
// `tracks_value: false` troca R$ por contagem de cards nos KPIs e no
// cabeçalho das colunas do kanban, sem afetar o funil padrão (tracks_value
// ausente = `true`, mesmo comportamento de sempre).
//
// Driver mínimo com createRoot + act, mesmo padrão de CRM.pipelines.test.tsx
// (o repo não usa @testing-library/react).
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

vi.mock('@/hooks/use-mobile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-mobile')>();
  return { ...actual, useIsMobile: () => false };
});

const PIPELINES = [
  { id: 'pipeline-1', name: 'Funil de Vendas', is_default: true, position: 0, tracks_value: true },
  { id: 'pipeline-2', name: 'Contratos de Manutenção', is_default: false, position: 1, tracks_value: false },
];

const STAGES = [
  { id: 'stage-1', name: 'Leads', color: 'blue', position: 0, pipeline_id: 'pipeline-1', is_won: false, is_lost: false },
  { id: 'stage-2', name: 'Fechado', color: 'green', position: 1, pipeline_id: 'pipeline-1', is_won: true, is_lost: false },
  { id: 'stage-3', name: 'Recebido', color: 'blue', position: 2, pipeline_id: 'pipeline-2', is_won: false, is_lost: false },
  { id: 'stage-4', name: 'Concluído', color: 'green', position: 3, pipeline_id: 'pipeline-2', is_won: true, is_lost: false },
];

const LEADS = [
  {
    id: 'lead-1',
    title: 'Instalação de split',
    stage_id: 'stage-1',
    pipeline_id: 'pipeline-1',
    status: 'aberto',
    value: 1400,
    source: 'Site',
    customers: { id: 'cust-1', name: 'Marcos Braga', phone: '(21) 96830-1901' },
    assignees: [],
  },
  {
    id: 'lead-2',
    title: 'Contrato Edifício Alfa',
    stage_id: 'stage-3',
    pipeline_id: 'pipeline-2',
    status: 'aberto',
    value: 0,
    source: 'Indicação',
    customers: { id: 'cust-2', name: 'Edifício Alfa', phone: null },
    assignees: [],
  },
  {
    id: 'lead-3',
    title: 'Contrato Edifício Beta',
    stage_id: 'stage-4',
    pipeline_id: 'pipeline-2',
    status: 'aberto',
    value: 0,
    source: 'Indicação',
    customers: { id: 'cust-3', name: 'Edifício Beta', phone: null },
    assignees: [],
  },
];

vi.mock('@/hooks/useLeads', () => ({
  useLeads: () => ({ leads: LEADS, isLoading: false, updateLead: { mutateAsync: vi.fn() } }),
  LEAD_SOURCES: ['Site', 'Indicação'],
}));
vi.mock('@/hooks/useUsers', () => ({ useUsers: () => ({ users: [] }) }));
vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({
    stages: STAGES,
    isLoading: false,
    seedDefaultStages: { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false },
    reorderStages: { mutateAsync: vi.fn() },
    getStageHex: () => '#000000',
  }),
}));
vi.mock('@/hooks/useCrmPipelines', () => ({
  useCrmPipelines: () => ({
    pipelines: PIPELINES,
    isLoading: false,
    defaultPipeline: PIPELINES[0],
    setDefaultPipeline: { mutate: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useLeadWonRevenuePrompt', () => ({
  useLeadWonRevenuePrompt: () => ({
    pendingLead: null,
    askForLead: () => false,
    confirm: () => {},
    dismiss: () => {},
  }),
}));
vi.mock('@/hooks/useCanLaunchLeadRevenue', () => ({ useCanLaunchLeadRevenue: () => false }));
vi.mock('@/hooks/useServiceOrders', () => ({
  useServiceOrders: () => ({
    serviceOrders: [],
    isLoading: false,
    createServiceOrder: { mutateAsync: vi.fn(), isPending: false },
    updateServiceOrder: { mutateAsync: vi.fn() },
    deleteServiceOrder: { mutateAsync: vi.fn() },
  }),
}));
vi.mock('@/hooks/useProfiles', () => ({ useProfiles: () => ({ data: [] }) }));
vi.mock('@/hooks/useTeams', () => ({ useTeams: () => ({ teamsWithMembers: [] }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-teste' },
    hasPermission: () => true,
    isAdminOrGestor: () => true,
    roles: ['admin'],
    permissions: ['*'],
    hasPermissionRecord: true,
  }),
}));
vi.mock('@/components/crm/LeadFormDialog', () => ({ LeadFormDialog: () => null }));
vi.mock('@/components/crm/LeadDetailModal', () => ({ LeadDetailModal: () => null }));
vi.mock('@/components/crm/LeadCard', () => ({ LeadCard: () => null }));
vi.mock('@/components/crm/StageManagerDialog', () => ({ StageManagerDialog: () => null }));
vi.mock('@/components/crm/PipelineManagerDialog', () => ({ PipelineManagerDialog: () => null }));
vi.mock('@/components/crm/PipelineAccessDialog', () => ({ PipelineAccessDialog: () => null }));
vi.mock('@/components/crm/WebhookManagerDialog', () => ({ WebhookManagerDialog: () => null }));
vi.mock('@/components/crm/LossReasonDialog', () => ({ LossReasonDialog: () => null }));
vi.mock('@/hooks/useTaskSubmit', () => ({ useTaskSubmit: () => ({ submitTask: vi.fn() }) }));
vi.mock('@/components/schedule/TaskFormDialog', () => ({ TaskFormDialog: () => null }));

import CRM from './CRM';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<CRM />);
  });
}

function clickPipelineTab(pipelineId: string) {
  const tab = document.querySelector(`[data-pipeline-tab="${pipelineId}"]`) as HTMLElement | null;
  expect(tab).toBeTruthy();
  act(() => {
    tab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('CRM — funil sem valores (tracks_value: false)', () => {
  it('funil padrão (tracks_value ausente/true) continua mostrando R$ nos KPIs', () => {
    mount();
    expect(document.body.textContent).toContain('R$');
    expect(document.body.textContent).not.toContain('Em andamento');
  });

  it('funil sem valores troca R$ por contagem de cards nos KPIs', () => {
    mount();
    clickPipelineTab('pipeline-2');
    expect(document.body.textContent).not.toContain('R$');
    expect(document.body.textContent).toContain('Em andamento');
    // Card 1 continua de contagem, só o rótulo mudou de "Total de Leads"
    // pra "Total no funil" (vale pros dois funis, não é exclusivo do D3).
    expect(document.body.textContent).toContain('Total no funil');
  });

  it('cabeçalho das colunas do kanban não mostra "R$ 0,00" no funil sem valores', () => {
    mount();
    clickPipelineTab('pipeline-2');
    expect(document.body.textContent).not.toMatch(/R\$\s*0,00/);
  });
});
