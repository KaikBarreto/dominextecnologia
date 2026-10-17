// Onda 1 de "Projetos" (gestão de obras, 2026-10-17) — tela de DENTRO do
// projeto (/projetos/:id). Driver mínimo com createRoot + act, mesmo padrão
// de ContractDetail.test.tsx (o repo não usa @testing-library/react pra
// montagem de PÁGINA — só pra hooks puros, ver useProjectPipelines.test.tsx).
//
// Diálogos secundários (LeadFormDialog, LeadDetailModal, StageManagerDialog,
// ProjectFormDialog, LeadCard) são mockados como `() => null` — mesma prática
// já usada em CRM.projectPipelines.test.tsx — porque eles cascateiam pra uma
// dúzia de outros hooks (useCrmPipelineAccess, useCrmCardTools, selects de
// cliente/origem) irrelevantes pro que esta suíte prova. `ProjectPipelineFormDialog`
// fica REAL de propósito: é o diálogo sob teste no ponto 2 (criação de frente).
//
// O ponto 4 do briefing ("seletor de funil não oferece comercial") mora em
// src/components/crm/LeadDetailModal.projectScope.test.tsx: testar o
// LeadDetailModal de dentro do ProjectDetail montado aqui exigiria desmockar
// uma dúzia de hooks cascata só pra chegar no Select — isolar o componente
// sob teste (mesmo padrão de LeadDetailModal.test.tsx) é mais direto e mais
// robusto. Ambos os arquivos são cobertos pelo mesmo comando de verificação
// (`src/pages/ProjectDetail.test.tsx` + o glob `src/components/crm/`).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ id: 'project-1' }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('@/hooks/use-mobile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-mobile')>();
  return { ...actual, useIsMobile: () => false };
});

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    isLoading: false,
    setUserLanguage: async () => {},
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    isAdminOrGestor: () => true,
    hasPermission: () => true,
    roles: ['admin'],
    permissions: ['*'],
    hasPermissionRecord: true,
  }),
}));

const PROJECT = {
  id: 'project-1',
  code: 7,
  name: 'Obra Teste',
  description: null,
  customer_id: null,
  responsible_user_id: null,
  status: 'em_andamento',
  start_date: '2026-10-01',
  end_date: '2026-12-01',
  color: '#2563EB',
  company_id: 'company-1',
  created_by: 'user-1',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({
    projects: [PROJECT],
    isLoading: false,
    createProject: { mutate: vi.fn(), isPending: false },
    updateProject: { mutate: vi.fn(), isPending: false },
    deleteProject: { mutate: vi.fn(), isPending: false },
  }),
}));

// Mutável entre testes — cada `it` ajusta antes de montar (mesmo padrão de
// `pipelinesState` em CRM.projectPipelines.test.tsx).
const progressState = vi.hoisted(() => ({ row: null as any }));
vi.mock('@/hooks/useProjectProgress', () => ({
  useProjectProgress: () => ({ getProgress: () => progressState.row }),
}));

const { createProjectPipelineMutate, pipelinesState } = vi.hoisted(() => ({
  createProjectPipelineMutate: vi.fn(),
  pipelinesState: { list: [] as any[] },
}));
vi.mock('@/hooks/useProjectPipelines', () => ({
  useProjectPipelines: () => ({
    pipelines: pipelinesState.list,
    createProjectPipeline: { mutate: createProjectPipelineMutate, isPending: false },
    updateProjectPipeline: { mutate: vi.fn(), isPending: false },
    deleteProjectPipeline: { mutate: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({ stages: [] }),
}));
vi.mock('@/hooks/useLeads', () => ({
  useLeads: () => ({ leads: [], updateLead: { mutateAsync: vi.fn() } }),
}));
vi.mock('@/hooks/useCustomers', () => ({ useCustomers: () => ({ customers: [] }) }));
vi.mock('@/hooks/useUsers', () => ({ useUsers: () => ({ users: [] }) }));
vi.mock('@/hooks/useServiceOrders', () => ({
  useServiceOrders: () => ({ serviceOrders: [], updateServiceOrder: { mutateAsync: vi.fn() } }),
}));
vi.mock('@/hooks/useProfiles', () => ({ useProfiles: () => ({ data: [] }) }));
vi.mock('@/hooks/useTeams', () => ({ useTeams: () => ({ teamsWithMembers: [] }) }));
vi.mock('@/hooks/useTaskSubmit', () => ({ useTaskSubmit: () => ({ submitTask: vi.fn() }) }));

// Diálogos secundários — irrelevantes pro que esta suíte prova (ver cabeçalho).
vi.mock('@/components/crm/LeadFormDialog', () => ({ LeadFormDialog: () => null }));
vi.mock('@/components/crm/LeadDetailModal', () => ({ LeadDetailModal: () => null }));
vi.mock('@/components/crm/StageManagerDialog', () => ({ StageManagerDialog: () => null }));
vi.mock('@/components/crm/LeadCard', () => ({ LeadCard: () => null }));
vi.mock('@/components/projects/ProjectFormDialog', () => ({ ProjectFormDialog: () => null }));

import ProjectDetail from './ProjectDetail';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function mount() {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ProjectDetail />
      </QueryClientProvider>,
    );
  });
}

const qAll = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function clickTabByLabel(label: string) {
  const el = qAll('[role="button"]').find((b) => b.textContent?.trim() === label);
  expect(el).toBeTruthy();
  click(el!);
}

beforeEach(() => {
  pipelinesState.list = [];
  progressState.row = null;
  createProjectPipelineMutate.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('ProjectDetail — tela de dentro do projeto (prova real de DOM)', () => {
  it('1. as três abas (Visão geral, Frentes, Tarefas) renderizam', () => {
    mount();
    expect(document.body.textContent).toContain('Visão geral');
    expect(document.body.textContent).toContain('Frentes');
    expect(document.body.textContent).toContain('Tarefas');
  });

  it('2. criar frente chama createProjectPipeline com o nome digitado (sem funil preexistente)', () => {
    mount();
    clickTabByLabel('Frentes');

    // Projeto sem nenhuma frente: EmptyState com ação de criar.
    const createBtn = qAll('button').find((b) => /criar frente de trabalho/i.test(b.textContent || ''));
    expect(createBtn).toBeTruthy();
    click(createBtn!);

    const nameInput = q('#project-front-name') as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(nameInput, 'Elétrica');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveBtn = qAll('button').find((b) => b.textContent?.trim() === 'Salvar');
    expect(saveBtn).toBeTruthy();
    click(saveBtn!);

    expect(createProjectPipelineMutate).toHaveBeenCalledTimes(1);
    expect(createProjectPipelineMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Elétrica' }),
      expect.anything(),
    );
  });

  it('3. Visão geral mostra "—" sem etapa de ganho, e o percentual quando há progresso', () => {
    progressState.row = { project_id: 'project-1', done_count: 0, active_count: 0, lost_count: 0, has_won_stage: false };
    mount();
    expect(document.body.textContent).toContain('—');
    expect(document.body.textContent).not.toMatch(/\d+%/);

    act(() => root.unmount());
    root = createRoot(container);
    progressState.row = { project_id: 'project-1', done_count: 3, active_count: 5, lost_count: 2, has_won_stage: true };
    mount();
    expect(document.body.textContent).toContain('60%');
  });
});
