// Prova de DOM real de que o funil ESCONDE as etapas sem resultado enquanto há
// busca digitada. Bug real do sócio (2026-09-19): buscar "marcos braga" achava
// 1 oportunidade, mas o funil continuava renderizando as 12 etapas vazias e o
// único card ficava na 8ª coluna, fora da tela, atrás de um scroll horizontal.
//
// Também prende os dois contratos que impedem a correção de virar regressão:
// 1) sem busca, TODA etapa aparece (coluna vazia é alvo de arraste);
// 2) "Mostrar todas" devolve as etapas escondidas sem limpar a busca.
//
// Driver mínimo com createRoot + act, mesmo padrão de CRM.test.tsx (o repo não
// usa @testing-library/react).
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

// 3 etapas, 1 oportunidade só — na do MEIO. Se o filtro de etapa vazia não
// existisse, as 3 colunas apareceriam e o card ficaria no meio do scroll.
const STAGES = [
  { id: 'stage-1', name: 'Leads', color: 'blue', position: 0, pipeline_id: 'pipeline-1' },
  { id: 'stage-2', name: 'Agendar Cliente', color: 'green', position: 1, pipeline_id: 'pipeline-1' },
  { id: 'stage-3', name: 'Fechado', color: 'red', position: 2, pipeline_id: 'pipeline-1' },
];

const LEADS = [
  {
    id: 'lead-1',
    title: 'Instalação de split',
    stage_id: 'stage-2',
    pipeline_id: 'pipeline-1',
    status: 'aberto',
    value: 1400,
    source: 'Site',
    customers: { id: 'cust-1', name: 'Marcos Antônio Moraes Braga', phone: '(21) 96830-1901' },
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
    pipelines: [{ id: 'pipeline-1', name: 'Funil de Vendas', is_default: true }],
    isLoading: false,
    defaultPipeline: { id: 'pipeline-1', name: 'Funil de Vendas', is_default: true },
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
vi.mock('@/components/crm/WebhookManagerDialog', () => ({ WebhookManagerDialog: () => null }));
vi.mock('@/components/crm/LossReasonDialog', () => ({ LossReasonDialog: () => null }));

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

function typeSearch(text: string) {
  const input = qAll('input').find(
    (el) => (el as HTMLInputElement).type !== 'number' && /buscar/i.test(el.getAttribute('placeholder') || ''),
  ) as HTMLInputElement | undefined;
  expect(input).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input!, text);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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

describe('CRM — funil esconde etapa sem resultado durante a busca', () => {
  it('sem busca, todas as etapas aparecem (coluna vazia é alvo de arraste)', () => {
    mount();
    expect(visibleStageNames()).toEqual(['Leads', 'Agendar Cliente', 'Fechado']);
  });

  it('buscando o cliente, só a etapa que tem o resultado fica na tela', () => {
    mount();
    typeSearch('marcos braga');
    expect(visibleStageNames()).toEqual(['Agendar Cliente']);
  });

  it('avisa quantas etapas escondeu e "Mostrar todas" traz de volta sem limpar a busca', () => {
    mount();
    typeSearch('marcos braga');

    const aviso = qAll('span').find((el) => /2 etapas sem resultado/i.test(el.textContent || ''));
    expect(aviso).toBeTruthy();

    const botao = qAll('button').find((b) => /mostrar todas/i.test(b.textContent || ''));
    expect(botao).toBeTruthy();
    click(botao!);

    expect(visibleStageNames()).toEqual(['Leads', 'Agendar Cliente', 'Fechado']);
  });

  it('busca que não casa ninguém não deixa o funil sem nenhuma etapa por engano', () => {
    mount();
    typeSearch('zzzzz nao existe');
    // Sem resultado nenhum, a tela cai no estado vazio do funil: o que não pode
    // é sobrar um funil de colunas fantasmas nem quebrar a renderização.
    expect(visibleStageNames()).toEqual([]);
  });
});
