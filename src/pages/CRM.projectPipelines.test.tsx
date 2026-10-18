// Onda 1 de "Projetos" (gestão de obras, 2026-10-17): `crm_pipelines.project_id`
// passa a existir no banco. `project_id IS NULL` é funil comercial (aparece em
// /crm); `project_id NOT NULL` é frente de projeto (aparece só dentro do
// projeto, tela de outro Dev). `useCrmPipelines` (o hook de /crm) já filtra
// isso no SELECT — mas `useCrmStages`/`useLeads` NÃO filtram nada no banco, e
// dois `useMemo` em CRM.tsx caíam em "mostre TUDO da empresa" quando nenhum
// funil estava selecionado. Este arquivo prende que uma frente de projeto
// (stage/lead/tarefa com pipeline_id fora da lista que useCrmPipelines
// devolve) NUNCA aparece em /crm — nem no caminho normal, nem no fallback.
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

// Mutável: cada teste ajusta antes de montar. `useCrmPipelines` é o hook já
// escopado a `project_id IS NULL` — aqui simulamos o SELECT já filtrado
// (pipeline-obra nunca entra nesta lista) e também a janela de corrida em que
// a query ainda não resolveu (pipelines vazio, defaultPipeline nulo).
const pipelinesState = vi.hoisted(() => ({
  pipelines: [] as any[],
  defaultPipeline: null as any,
}));

// `useCrmStages` e `useLeads` NÃO filtram por project_id — trazem TUDO da
// empresa, inclusive a frente de projeto. É isso que torna o fallback de
// CRM.tsx perigoso se ele cair em "allStages"/"visibleLeads" crus.
const STAGES = [
  { id: 'stage-1', name: 'Leads', color: 'blue', position: 0, pipeline_id: 'pipeline-1', is_won: false, is_lost: false },
  { id: 'stage-2', name: 'Fechado', color: 'green', position: 1, pipeline_id: 'pipeline-1', is_won: true, is_lost: false },
  { id: 'stage-obra-1', name: 'Planejamento', color: 'blue', position: 0, pipeline_id: 'pipeline-obra', is_won: false, is_lost: false },
  { id: 'stage-obra-2', name: 'Execução', color: 'green', position: 1, pipeline_id: 'pipeline-obra', is_won: true, is_lost: false },
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
    id: 'lead-obra-1',
    title: 'Frente Obra X',
    stage_id: 'stage-obra-1',
    pipeline_id: 'pipeline-obra',
    status: 'aberto',
    value: 50000,
    source: 'Indicação',
    customers: { id: 'cust-2', name: 'Indústria X', phone: null },
    assignees: [],
  },
];

// Tarefas vinculadas às duas oportunidades acima, pra provar que a aba
// Tarefas também não vaza a de projeto (decisão do CEO, 2026-10-17).
const SERVICE_ORDERS = [
  {
    id: 'task-1',
    entry_type: 'tarefa',
    lead_id: 'lead-1',
    task_title: 'Ligar pro cliente comercial',
    status: 'pendente',
    scheduled_date: null,
    technician_id: null,
    team_id: null,
    created_by: 'user-teste',
    _assignee_user_ids: [],
  },
  {
    id: 'task-obra-1',
    entry_type: 'tarefa',
    lead_id: 'lead-obra-1',
    task_title: 'Vistoria da frente de obra',
    status: 'pendente',
    scheduled_date: null,
    technician_id: null,
    team_id: null,
    created_by: 'user-teste',
    _assignee_user_ids: [],
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
    pipelines: pipelinesState.pipelines,
    isLoading: false,
    defaultPipeline: pipelinesState.defaultPipeline,
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
    serviceOrders: SERVICE_ORDERS,
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

function clickTasksTab() {
  const tab = qAll('button').find((b) => b.textContent?.trim() === 'Tarefas');
  expect(tab).toBeTruthy();
  act(() => {
    tab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  // Padrão: empresa já com o funil comercial resolvido (caso são de todo dia).
  pipelinesState.pipelines = [{ id: 'pipeline-1', name: 'Funil de Vendas', is_default: true, position: 0, project_id: null }];
  pipelinesState.defaultPipeline = pipelinesState.pipelines[0];
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

describe('CRM — frente de projeto nunca aparece em /crm', () => {
  it('1. funil comercial resolvido: coluna e card da frente de projeto não aparecem', () => {
    mount();
    expect(document.body.textContent).not.toContain('Planejamento');
    expect(document.body.textContent).not.toContain('Execução');
    expect(document.body.textContent).not.toContain('Frente Obra X');
  });

  it('2. fallback (defaultPipeline: null, nenhum funil selecionado): frente de projeto continua fora', () => {
    // Simula a janela de corrida real: useCrmPipelines ainda não resolveu
    // (NO_PIPELINES = []), mas useCrmStages/useLeads já trouxeram tudo.
    pipelinesState.pipelines = [];
    pipelinesState.defaultPipeline = null;
    mount();
    expect(document.body.textContent).not.toContain('Planejamento');
    expect(document.body.textContent).not.toContain('Execução');
    expect(document.body.textContent).not.toContain('Frente Obra X');
  });

  it('3. não-regressão: funil comercial sem projeto continua aparecendo normalmente', () => {
    mount();
    // LeadCard é mockado (null), então o card em si não renderiza texto — a
    // prova de não-regressão é a coluna/contagem/valor do funil comercial
    // batendo com SÓ o lead comercial (1 / R$ 1.400,00), nunca somando o
    // lead-obra-1 (R$ 50.000,00) que está fora da lista de pipelines globais.
    expect(document.body.textContent).toContain('Leads');
    expect(document.body.textContent).toContain('Fechado');
    expect(document.body.textContent).toContain('Total no funil');
    expect(document.body.textContent).toContain('1');
    // formatMoney usa espaço fino não-quebrável (U+00A0) entre "R$" e o
    // valor — \s do regex cobre isso, um toContain com espaço normal não bate.
    expect(document.body.textContent).toMatch(/R\$\s*1\.400,00/);
    expect(document.body.textContent).not.toMatch(/R\$\s*50\.000,00/);
  });

  it('4. aba Tarefas não lista tarefa cujo lead está numa frente de projeto', () => {
    mount();
    clickTasksTab();
    expect(document.body.textContent).toContain('Ligar pro cliente comercial');
    expect(document.body.textContent).not.toContain('Vistoria da frente de obra');
  });
});
