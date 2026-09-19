// Bug real do CEO (2026-09-19): "ao criar estágios em um segundo pipeline as
// colunas não estão aparecendo, deveria".
//
// CAUSA RAIZ (provada aqui): o kanban trocava o QUADRO INTEIRO pelo card
// "Nenhuma oportunidade" sempre que `filteredLeads.length === 0`. Funil novo
// nasce sem nenhuma oportunidade — então, por mais etapas que o usuário
// criasse, ele nunca via coluna nenhuma, e ainda ficava sem alvo pra arrastar
// um card pra dentro do funil novo. O estágio ESTAVA no banco, com o
// pipeline_id certo; quem escondia era a tela.
//
// Este arquivo prende os dois lados: funil vazio mostra as colunas, e trocar
// de funil recorta as etapas/oportunidades/KPIs do funil selecionado.
//
// Driver mínimo com createRoot + act, mesmo padrão de CRM.stages.test.tsx
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
  { id: 'pipeline-1', name: 'Funil de Vendas', is_default: true, position: 0 },
  { id: 'pipeline-2', name: 'Pós-venda', is_default: false, position: 1 },
];

// Funil 1 tem oportunidade; funil 2 é o recém-criado: tem etapas e NENHUMA
// oportunidade — exatamente o caso que sumia da tela.
const STAGES = [
  { id: 'stage-1', name: 'Leads', color: 'blue', position: 0, pipeline_id: 'pipeline-1' },
  { id: 'stage-2', name: 'Fechado', color: 'green', position: 1, pipeline_id: 'pipeline-1' },
  { id: 'stage-3', name: 'Recebido', color: 'blue', position: 2, pipeline_id: 'pipeline-2' },
  { id: 'stage-4', name: 'Em atendimento', color: 'green', position: 3, pipeline_id: 'pipeline-2' },
  { id: 'stage-5', name: 'Resolvido', color: 'red', position: 4, pipeline_id: 'pipeline-2' },
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

const qAll = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

function mount() {
  act(() => {
    root.render(<CRM />);
  });
}

/** Nomes das colunas do funil visíveis agora. */
function visibleStageNames(): string[] {
  return STAGES.filter((s) =>
    qAll('span.font-semibold.text-sm').some((el) => el.textContent?.trim() === s.name),
  ).map((s) => s.name);
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

describe('CRM — etapas do segundo funil aparecem', () => {
  it('abre no funil padrão mostrando só as etapas dele', () => {
    mount();
    expect(visibleStageNames()).toEqual(['Leads', 'Fechado']);
  });

  it('funil sem NENHUMA oportunidade ainda mostra as colunas dele (bug do CEO)', () => {
    mount();
    clickPipelineTab('pipeline-2');
    // As 3 etapas do funil 2 precisam virar coluna, mesmo com zero cards: sem
    // coluna não existe alvo pra arrastar oportunidade pra dentro do funil.
    expect(visibleStageNames()).toEqual(['Recebido', 'Em atendimento', 'Resolvido']);
  });

  it('o título da tela é o nome do funil selecionado', () => {
    mount();
    expect(document.querySelector('h1')?.textContent?.trim()).toBe('Funil de Vendas');
    clickPipelineTab('pipeline-2');
    expect(document.querySelector('h1')?.textContent?.trim()).toBe('Pós-venda');
  });

  it('voltar pro primeiro funil recorta as etapas de novo', () => {
    mount();
    clickPipelineTab('pipeline-2');
    clickPipelineTab('pipeline-1');
    expect(visibleStageNames()).toEqual(['Leads', 'Fechado']);
  });
});
