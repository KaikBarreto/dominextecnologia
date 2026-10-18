// Onda 1 de "Projetos" (gestão de obras) — regressão achada no QA de navegador
// em 2026-10-17, DEPOIS de LeadDetailModal.projectScope.test.tsx passar verde.
//
// Aquele teste mocka DUAS frentes de propósito, pra o select de FUNIL existir.
// Com duas frentes, `hasMultiplePipelines` é true e o select de ETAPA também
// filtrava direito. O buraco estava no caso real mais comum: **um projeto com
// UMA frente só**. Aí `hasMultiplePipelines` vira false e o código caía num
// fallback `: stages` — e `stages` vem de `useCrmStages`, que traz TODAS as
// etapas da empresa, sem filtro.
//
// Resultado em produção (provado no navegador): dentro de uma obra com uma
// frente, o select de etapa listava "Lead", "Proposta", "Negociação",
// "Fechado (Ganho)" etc. Escolher qualquer uma move o card da obra pro funil
// comercial, porque o gatilho `trg_leads_resolve_pipeline` recalcula o
// `pipeline_id` a partir do `stage_id`. Um clique de distância.
//
// A régua que este teste prende: o select de etapa filtra por
// `currentPipelineId`, NUNCA por quantos funis existem no escopo.
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

// As 4 etapas da ÚNICA frente do projeto + as etapas comerciais que o hook de
// stages traz junto (ele nunca filtra por funil).
vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({
    stages: [
      { id: 'stage-obra-1', name: 'A fazer', color: 'muted', pipeline_id: 'pipeline-obra', position: 0 },
      { id: 'stage-obra-2', name: 'Em execução', color: 'info', pipeline_id: 'pipeline-obra', position: 1 },
      { id: 'stage-obra-3', name: 'Concluído', color: 'success', pipeline_id: 'pipeline-obra', position: 2, is_won: true },
      { id: 'stage-obra-4', name: 'Cancelado', color: 'destructive', pipeline_id: 'pipeline-obra', position: 3, is_lost: true },
      { id: 'stage-com-1', name: 'Lead', color: 'muted', pipeline_id: 'pipeline-comercial', position: 0 },
      { id: 'stage-com-2', name: 'Proposta', color: 'info', pipeline_id: 'pipeline-comercial', position: 1 },
      { id: 'stage-com-3', name: 'Fechado (Ganho)', color: 'success', pipeline_id: 'pipeline-comercial', position: 2, is_won: true },
    ],
    getStageHex: () => '#000000',
  }),
}));

vi.mock('@/hooks/useCrmPipelines', () => ({
  useCrmPipelines: () => ({
    pipelines: [{ id: 'pipeline-comercial', name: 'Funil de Vendas', is_default: true, color: '#2563EB' }],
  }),
}));

// UMA frente só — é esta a condição que abria o buraco.
vi.mock('@/hooks/useProjectPipelines', () => ({
  useProjectPipelines: () => ({
    pipelines: [{ id: 'pipeline-obra', name: 'Compras', is_default: false, color: '#F59E0B' }],
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

const CARD_DA_OBRA = {
  id: 'lead-obra-1',
  title: 'Comprar 80 condensadoras',
  notes: null,
  stage_id: 'stage-obra-1',
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

const qAll = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

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

describe('LeadDetailModal — projeto com UMA frente: o select de etapa não pode vazar etapa comercial', () => {
  it('lista só as 4 etapas da frente, nunca Lead/Proposta/Fechado (Ganho)', () => {
    act(() => {
      root.render(
        <LeadDetailModal
          open
          lead={CARD_DA_OBRA}
          onOpenChange={() => {}}
          onEdit={() => {}}
          onStageChange={() => {}}
          projectId="project-1"
        />,
      );
    });

    // Radix abre por teclado no jsdom (pointerdown não é entregue).
    const trigger = qAll('[role="combobox"]')[0];
    expect(trigger).toBeTruthy();
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    const options = qAll('[role="option"]').map((o) => (o.textContent || '').trim());

    expect(options).toEqual(expect.arrayContaining(['A fazer', 'Em execução', 'Concluído', 'Cancelado']));
    // As comerciais: nenhuma. É isto que impede o card da obra de pular pro
    // quadro de vendas com um clique.
    expect(options).not.toEqual(expect.arrayContaining(['Lead']));
    expect(options).not.toEqual(expect.arrayContaining(['Proposta']));
    expect(options).not.toEqual(expect.arrayContaining(['Fechado (Ganho)']));
    expect(options).toHaveLength(4);
  });
});
