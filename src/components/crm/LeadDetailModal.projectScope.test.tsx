// Onda 1 de "Projetos" (gestão de obras, 2026-10-17) — prova de DOM real
// (createRoot + act, mesmo padrão de LeadDetailModal.test.tsx) do ponto mais
// perigoso do briefing:
//
// Aberto DE DENTRO de um projeto (prop `projectId`), o seletor "mover pra
// outro funil" tem que listar SÓ as frentes DAQUELE projeto
// (`useProjectPipelines`) — NUNCA o funil comercial (`useCrmPipelines`). Um
// funil comercial aparecendo ali é um clique acidental de distância de jogar
// o card da obra pro quadro de vendas (e CRM.projectPipelines.test.tsx já
// prova que card de obra nunca pode aparecer em /crm).
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
// Radix Select chama scrollIntoView ao abrir — jsdom não implementa.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

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

// Etapas das DUAS frentes do projeto + uma do funil comercial (pra provar que
// o select de ETAPA também não vaza, embora o foco do briefing seja o de FUNIL).
vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({
    stages: [
      { id: 'stage-obra-1', name: 'A fazer', color: 'muted', pipeline_id: 'pipeline-obra-1', position: 0 },
      { id: 'stage-obra-2', name: 'A fazer', color: 'muted', pipeline_id: 'pipeline-obra-2', position: 0 },
      { id: 'stage-comercial-1', name: 'Lead', color: 'muted', pipeline_id: 'pipeline-comercial', position: 0 },
    ],
    getStageHex: () => '#000000',
  }),
}));

// Funil COMERCIAL — nunca pode aparecer no select deste teste.
vi.mock('@/hooks/useCrmPipelines', () => ({
  useCrmPipelines: () => ({
    pipelines: [{ id: 'pipeline-comercial', name: 'Funil de Vendas', is_default: true, color: '#2563EB' }],
  }),
}));

// Frentes do PROJETO — são as únicas que podem aparecer quando `projectId`
// está presente. Duas frentes (não uma): com só uma, `hasMultiplePipelines`
// seria false e o select nem renderizaria — o teste precisa do select ATIVO
// pra provar o que ele lista.
vi.mock('@/hooks/useProjectPipelines', () => ({
  useProjectPipelines: () => ({
    pipelines: [
      { id: 'pipeline-obra-1', name: 'Frente Elétrica', is_default: false, color: '#F59E0B' },
      { id: 'pipeline-obra-2', name: 'Frente Dutos', is_default: false, color: '#22C55E' },
    ],
  }),
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
vi.mock('@/hooks/useProfiles', () => ({
  useProfiles: () => ({ data: [] }),
}));
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

const LEAD_IN_FRONT_1 = {
  id: 'lead-obra-1',
  title: 'Instalação do chiller',
  notes: null,
  stage_id: 'stage-obra-1',
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

const qAll = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

function mount(projectId: string | null) {
  act(() => {
    root.render(
      <LeadDetailModal
        open
        lead={LEAD_IN_FRONT_1}
        onOpenChange={() => {}}
        onEdit={() => {}}
        onStageChange={() => {}}
        projectId={projectId}
      />,
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

describe('LeadDetailModal — escopo de funil dentro de um Projeto (prova real de DOM)', () => {
  it('com projectId: o select de "mover pra outro funil" lista SÓ as frentes do projeto, nunca o funil comercial', () => {
    mount('project-1');

    // O gatilho já mostra o funil ATUAL ("Frente Elétrica", a do lead) —
    // nunca o comercial.
    expect(document.body.textContent).toContain('Frente Elétrica');
    expect(document.body.textContent).not.toContain('Funil de Vendas');

    // Abre o dropdown (Radix abre por teclado no jsdom, que não entrega
    // pointerdown) pra inspecionar a LISTA DE OPÇÕES de verdade — não só o
    // valor já selecionado no gatilho.
    const trigger = qAll('[role="combobox"]')[0];
    expect(trigger).toBeTruthy();
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    const options = qAll('[role="option"]').map((o) => o.textContent || '');
    expect(options.some((text) => text.includes('Frente Dutos'))).toBe(true);
    expect(options.some((text) => text.includes('Frente Elétrica'))).toBe(true);
    // O funil COMERCIAL nunca pode aparecer — é a exata armadilha do briefing.
    expect(options.some((text) => text.includes('Funil de Vendas'))).toBe(false);
  });

  it('sem projectId (caminho comercial de sempre): continua oferecendo o funil comercial', () => {
    // Só 1 funil comercial → hasMultiplePipelines é false → o select nem
    // renderiza (mesmo comportamento de antes desta mudança). A prova aqui é
    // que NADA quebrou: a modal monta normalmente no caminho comercial.
    mount(null);
    expect(document.body.textContent).toContain('Instalação do chiller');
    expect(document.body.textContent).not.toContain('Frente Dutos');
    expect(document.body.textContent).not.toContain('Frente Elétrica');
  });
});
