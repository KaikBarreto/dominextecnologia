// Prova de DOM real (createRoot + act, mesmo padrão de LeadFormDialog.test.tsx
// — o repo não usa @testing-library/react) de dois comportamentos pedidos
// pelo CEO em 2026-09-19:
//
// 1) Observações edita direto (autosave com debounce), sem precisar clicar em
//    "Editar" — e o autosave NÃO pode disparar uma chamada por tecla digitada.
// 2) A aba Histórico mostra o registro automático de mudança de estágio
//    ("De X para Y") gravado como uma interação especial em lead_interactions
//    (ver src/lib/leadStageHistory.ts).
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

const { updateLeadNotesMutate } = vi.hoisted(() => ({
  updateLeadNotesMutate: vi.fn(),
}));

vi.mock('@/hooks/useLeads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useLeads')>();
  return {
    ...actual,
    useLeadInteractions: () => ({
      interactions: (globalThis as any).__testInteractions ?? [],
      isLoading: false,
      createInteraction: { mutateAsync: vi.fn(), isPending: false },
    }),
    useLeads: () => ({
      deleteLead: { mutateAsync: vi.fn() },
      claimLead: { mutateAsync: vi.fn() },
      updateLeadNotes: { mutate: updateLeadNotesMutate, isPending: false },
    }),
  };
});
vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({
    stages: [{ id: 'stage-1', name: 'Leads', color: 'blue' }],
    getStageHex: () => '#000000',
  }),
}));
vi.mock('@/hooks/useCrmPipelines', () => ({
  useCrmPipelines: () => ({ pipelines: [{ id: 'pipeline-1', name: 'Funil de Vendas', is_default: true }] }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isAdminOrGestor: () => true, hasPermission: () => true }),
}));
// ACL por funil (D3): o modal passou a ler `crm_pipeline_access` pra montar o
// select de "mover de funil". Sem QueryClient no teste, o hook real derruba a
// montagem — e o caso sob teste é o autosave/histórico, não a ACL.
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
  useProfiles: () => ({
    data: [{ user_id: 'user-1', full_name: 'Ana Vendedora', avatar_url: null }],
  }),
}));
vi.mock('@/components/service-orders/ServiceOrderFormDialog', () => ({ ServiceOrderFormDialog: () => null }));
vi.mock('@/components/schedule/TaskFormDialog', () => ({ TaskFormDialog: () => null }));

import { LeadDetailModal } from './LeadDetailModal';
import type { Lead } from '@/hooks/useLeads';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const BASE_LEAD = {
  id: 'lead-1',
  title: 'Instalação de split',
  notes: 'Observação inicial.',
  stage_id: 'stage-1',
  customer_id: null,
  customers: null,
  assignees: [],
  value: 1000,
  probability: 50,
  expected_close_date: null,
  source: null,
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
} as unknown as Lead;

let container: HTMLDivElement;
let root: Root;

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const qAll = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

function mount(lead: Lead, interactions: any[] = []) {
  (globalThis as any).__testInteractions = interactions;
  act(() => {
    root.render(
      <LeadDetailModal open lead={lead} onOpenChange={() => {}} onEdit={() => {}} onStageChange={() => {}} />,
    );
  });
}

function typeInTextarea(textarea: HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(textarea, text);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function clickHistoryTab() {
  // Radix Tabs troca de aba no `onMouseDown` (não `onClick`) — precisa
  // disparar o evento de verdade (mesmo padrão de CompanyFormModal.test.tsx).
  const tab = qAll('button[role="tab"]').find((b) => /histórico/i.test(b.textContent || ''));
  expect(tab).toBeTruthy();
  act(() => {
    tab!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  updateLeadNotesMutate.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
  vi.useRealTimers();
  delete (globalThis as any).__testInteractions;
});

describe('LeadDetailModal — Observações edita direto, com autosave (prova real de DOM)', () => {
  it('digitar várias teclas em sequência dispara UMA chamada de save só, depois do debounce', () => {
    mount(BASE_LEAD);
    const textarea = q('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('Observação inicial.');

    typeInTextarea(textarea, 'Observação inicial. C');
    typeInTextarea(textarea, 'Observação inicial. Cl');
    typeInTextarea(textarea, 'Observação inicial. Cli');
    typeInTextarea(textarea, 'Observação inicial. Clie');

    // Ainda dentro do debounce: nada foi salvo.
    expect(updateLeadNotesMutate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    // Só UMA chamada, com o texto final — não uma por tecla.
    expect(updateLeadNotesMutate).toHaveBeenCalledTimes(1);
    expect(updateLeadNotesMutate).toHaveBeenCalledWith(
      { id: 'lead-1', notes: 'Observação inicial. Clie' },
      expect.anything(),
    );
  });

  it('não salva de novo se o texto não mudou desde o último save', () => {
    mount(BASE_LEAD);
    const textarea = q('textarea') as HTMLTextAreaElement;
    typeInTextarea(textarea, 'Observação nova.');
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(updateLeadNotesMutate).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // Sem nova digitação, não deve re-disparar.
    expect(updateLeadNotesMutate).toHaveBeenCalledTimes(1);
  });
});

describe('LeadDetailModal — aba Histórico mostra mudança de estágio (prova real de DOM)', () => {
  it('interação de mudança de estágio mostra "De X para Y" e quem fez', () => {
    mount(BASE_LEAD, [
      {
        id: 'interaction-1',
        lead_id: 'lead-1',
        interaction_type: 'mudanca_estagio',
        description: JSON.stringify({
          from_stage_id: 'stage-0',
          from_stage_name: 'Novo Lead',
          to_stage_id: 'stage-1',
          to_stage_name: 'Leads',
        }),
        next_action: null,
        next_action_date: null,
        created_by: 'user-1',
        created_at: '2026-09-19T12:00:00.000Z',
      },
    ]);
    clickHistoryTab();

    const label = qAll('p').find((p) => /mudança de estágio/i.test(p.textContent || ''));
    expect(label).toBeTruthy();
    const desc = qAll('p').find((p) => /De "Novo Lead" para "Leads"/i.test(p.textContent || ''));
    expect(desc).toBeTruthy();
    const byLine = qAll('p').find((p) => /Ana Vendedora/i.test(p.textContent || ''));
    expect(byLine).toBeTruthy();
  });
});
