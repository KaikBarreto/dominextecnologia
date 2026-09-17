// Prova de DOM real (não só a função pura) de que os filtros "Valor mín." e
// "Valor máx." do CRM estão livres do bug de mil vezes: colar "4.550" num
// `<input type="number">` é lido pelo navegador como decimal internacional e
// vira 4,55 — mil vezes menor (bug real do sócio, 2026-09-17). Este filtro
// nunca grava no banco, mas ainda erraria o resultado mostrado. `onPaste`
// intercepta o colar ANTES do navegador decidir sozinho.
//
// Driver mínimo com createRoot + act (mesmo padrão de ContaFormDialog.test.tsx
// — o repo não usa @testing-library/react). O Sheet (Radix) do FilterButton
// renderiza via Portal em document.body.
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

vi.mock('@/hooks/useLeads', () => ({
  useLeads: () => ({ leads: [], isLoading: false, updateLead: { mutateAsync: vi.fn() } }),
  LEAD_SOURCES: ['Site', 'Indicação'],
}));
vi.mock('@/hooks/useUsers', () => ({ useUsers: () => ({ users: [] }) }));
vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({
    stages: [{ id: 'stage-1', name: 'Novo', color: 'blue', position: 0, pipeline_id: 'pipeline-1' }],
    isLoading: false,
    seedDefaultStages: { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false },
    reorderStages: { mutateAsync: vi.fn() },
    getStageHex: () => '#000000',
  }),
}));
// Onda D (multi-pipeline): CRM.tsx passou a chamar useCrmPipelines. Mock com 1
// único funil = mesmo comportamento visual de antes do D2 (sem seletor de funil).
vi.mock('@/hooks/useCrmPipelines', () => ({
  useCrmPipelines: () => ({
    pipelines: [{ id: 'pipeline-1', name: 'Funil de Vendas', is_default: true }],
    isLoading: false,
    defaultPipeline: { id: 'pipeline-1', name: 'Funil de Vendas', is_default: true },
  }),
}));

// Componentes-filho irrelevantes pro filtro de valor sob teste.
// A 1.24.30 (merge) ligou o prompt de receita ao ganhar a oportunidade, que puxa
// useAuth via useCanLaunchLeadRevenue. Este teste é sobre o PASTE nos filtros de
// valor, não sobre esse fluxo: mocamos o hook inteiro em vez de montar o
// AuthProvider só para satisfazer uma dependência que o caso não exercita.
vi.mock('@/hooks/useLeadWonRevenuePrompt', () => ({
  useLeadWonRevenuePrompt: () => ({
    pendingLead: null,
    askForLead: () => false,
    confirm: () => {},
    dismiss: () => {},
  }),
}));
vi.mock('@/hooks/useCanLaunchLeadRevenue', () => ({ useCanLaunchLeadRevenue: () => false }));
// Onda E2 (aba Tarefas): CRM.tsx passou a chamar useServiceOrders/useProfiles
// pra montar a lista de tarefas vinculadas a oportunidades. Sem mock, os dois
// hooks reais (React Query) quebram o teste com "No QueryClient set" — e o
// caso sob teste é o PASTE no filtro de valor da aba Funil, que não exercita
// a aba Tarefas.
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
// A régua compartilhada de visibilidade de tarefa (src/lib/taskVisibility.ts)
// precisa saber de quais equipes o usuário é membro, então CRM.tsx passou a
// chamar useTeams — que é React Query e derruba o teste sem QueryClient.
vi.mock('@/hooks/useTeams', () => ({ useTeams: () => ({ teamsWithMembers: [] }) }));
// A 1.24.32 (Onda C do CRM) passou a chamar useAuth DIRETO na tela, pra recortar
// as oportunidades por responsável (`fn:manage_crm`). Sem este mock o teste morre
// em "useAuth must be used within an AuthProvider" — e o caso sob teste é o PASTE
// no filtro de valor, que não exercita permissão nenhuma. `hasPermission: true`
// mantém a tela mostrando todas as oportunidades, como era antes do recorte.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-teste' }, hasPermission: () => true, roles: ['admin'], permissions: ['*'], hasPermissionRecord: true }),
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

function mount() {
  act(() => {
    root.render(<CRM />);
  });
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const qAll = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function paste(input: HTMLInputElement, text: string) {
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent & { clipboardData: any };
  pasteEvent.clipboardData = { getData: () => text };
  act(() => {
    input.dispatchEvent(pasteEvent);
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

describe('CRM — filtros de valor (prova real de DOM)', () => {
  it('abrir o sheet de filtros e colar "4.550" no mínimo dá 4550.00', () => {
    mount();
    const filterTrigger = qAll('button').find((b) => /filtros/i.test(b.textContent || ''));
    expect(filterTrigger).toBeTruthy();
    click(filterTrigger!);

    const inputs = qAll('input[type="number"]') as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    const [minInput, maxInput] = inputs;

    paste(minInput, '4.550');
    expect(minInput.value).toBe('4550.00');

    paste(maxInput, '1.234,56');
    expect(maxInput.value).toBe('1234.56');
  });
});
