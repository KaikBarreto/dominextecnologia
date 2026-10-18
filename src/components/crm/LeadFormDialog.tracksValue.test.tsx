// Onda "Funis sem valor" (2026-10-17) — o formulário de card dentro de uma
// obra (ou de qualquer funil de processo criado direto no CRM comum, ex:
// "COMPRAS OBRA SHOPPING BOULEVARD") ainda pedia Valor Estimado,
// Probabilidade e Origem — vocabulário de VENDA sem sentido fora do funil
// comercial.
//
// A régua: `crm_pipelines.tracks_value === false` esconde esses 3 campos,
// renomeia "Vendedor Responsável"→"Responsável" e "Previsão Fechamento"→
// "Prazo", e troca o título "Nova Oportunidade" por "Novo card" (o botão que
// abre este diálogo dentro do projeto já diz "Novo card"). A decisão é pelo
// funil REAL do estágio selecionado (`formData.stage_id`), nunca por
// `projectId` nem pela cardinalidade de `pipelines`.
//
// Driver mínimo com createRoot + act (mesmo padrão de LeadFormDialog.test.tsx
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

const createLead = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false };
const updateLead = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false };

vi.mock('@/hooks/useLeads', () => ({
  useLeads: () => ({
    createLead,
    updateLead,
  }),
}));
vi.mock('@/hooks/useCustomers', () => ({ useCustomers: () => ({ customers: [] }) }));
vi.mock('@/hooks/useUsers', () => ({ useUsers: () => ({ users: [] }) }));

// Duas etapas, cada uma de um funil diferente — uma comercial (tracks_value
// true), outra de processo (tracks_value false).
vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({
    stages: [
      { id: 'stage-comercial', name: 'Leads', pipeline_id: 'pipeline-comercial' },
      { id: 'stage-obra', name: 'A fazer', pipeline_id: 'pipeline-obra' },
    ],
    getStageHex: () => '#000000',
  }),
}));
vi.mock('@/hooks/useCrmPipelines', () => ({
  useCrmPipelines: () => ({
    pipelines: [
      { id: 'pipeline-comercial', name: 'Funil de Vendas', is_default: true, tracks_value: true },
      { id: 'pipeline-obra', name: 'COMPRAS OBRA SHOPPING BOULEVARD', is_default: false, tracks_value: false },
    ],
  }),
}));
vi.mock('@/hooks/useProjectPipelines', () => ({
  useProjectPipelines: () => ({ pipelines: [] }),
}));
vi.mock('@/components/customers/CustomerSelectField', () => ({ CustomerSelectField: () => null }));
vi.mock('@/components/customers/OriginSelectField', () => ({ OriginSelectField: () => null }));

import { LeadFormDialog } from './LeadFormDialog';
import type { Lead } from '@/hooks/useLeads';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(lead?: Lead) {
  act(() => {
    root.render(<LeadFormDialog open onOpenChange={() => {}} lead={lead} />);
  });
}

const bodyText = () => document.body.textContent || '';
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

const LEAD_DA_OBRA = {
  id: 'lead-obra-1',
  title: 'Comprar 80 condensadoras',
  customer_id: null,
  value: 0,
  probability: null,
  // null de propósito: `source` preenchido montaria o OriginSelectField real
  // (mockado aqui como null, então sem risco) — mas mantemos coerente com o
  // card de obra, que não tem origem de lead.
  source: null,
  stage_id: 'stage-obra',
  expected_close_date: null,
  notes: null,
  assigned_to: null,
} as unknown as Lead;

beforeEach(() => {
  createLead.mutateAsync.mockClear();
  updateLead.mutateAsync.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('LeadFormDialog — vocabulário some em funil que não rastreia valor', () => {
  it('funil comercial (tracks_value: true): nada muda, mantém o comportamento de hoje', () => {
    mount(); // novo card, cai no primeiro estágio em escopo = stage-comercial

    expect(bodyText()).toContain('Nova Oportunidade');
    expect(bodyText()).toContain('Valor Estimado');
    expect(bodyText()).toContain('Probabilidade');
    expect(bodyText()).toContain('Origem');
    expect(bodyText()).toContain('Vendedor Responsável');
    expect(bodyText()).toContain('Previsão Fechamento');
    expect(bodyText()).not.toContain('Novo card');
    expect(bodyText()).not.toContain('Prazo');
  });

  it('funil de processo (tracks_value: false): esconde Valor/Probabilidade/Origem, renomeia rótulos e o título', () => {
    mount(LEAD_DA_OBRA);

    expect(bodyText()).not.toContain('Valor Estimado');
    expect(bodyText()).not.toContain('Probabilidade');
    expect(bodyText()).not.toContain('Origem');
    expect(bodyText()).not.toContain('Vendedor Responsável');
    expect(bodyText()).not.toContain('Previsão Fechamento');
    expect(bodyText()).toContain('Responsável');
    expect(bodyText()).toContain('Prazo');
    // Criar e editar seguem a MESMA régua. Antes, editar dizia "Editar
    // Oportunidade" enquanto criar já dizia "Novo card" — os dois diálogos
    // se contradiziam na mesma tela do mesmo funil.
    expect(bodyText()).toContain('Editar card');
    expect(bodyText()).not.toContain('Editar Oportunidade');
    // O campo também: dizia "Título da Oportunidade" logo abaixo de "Editar card".
    expect(bodyText()).toContain('Título do card');
    expect(bodyText()).not.toContain('Título da Oportunidade');
  });

  it('abrir pra CRIAR um card num funil de processo mostra o título "Novo card"', () => {
    // defaultStageIdForNewLead cai no primeiro estágio em escopo — com os
    // dois funis mockados, é "stage-comercial" (ordem da lista). Usamos
    // presetPipelineId pra forçar o escopo no funil de obra, do mesmo jeito
    // que a tela real faz ao abrir o form de dentro do projeto.
    act(() => {
      root.render(
        <LeadFormDialog open onOpenChange={() => {}} presetPipelineId="pipeline-obra" />,
      );
    });

    expect(bodyText()).toContain('Novo card');
    expect(bodyText()).not.toContain('Nova Oportunidade');
  });

  it('salvar um card num funil sem valores funciona (payload válido mesmo com os campos escondidos)', async () => {
    mount(LEAD_DA_OBRA);

    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(updateLead.mutateAsync).toHaveBeenCalledTimes(1);
    const payload = updateLead.mutateAsync.mock.calls[0][0];
    expect(payload.id).toBe('lead-obra-1');
    // Os campos escondidos continuam com o default de sempre — esconder não
    // pode deixar o payload inválido/ausente.
    expect(payload.value).toBe(0);
    // `lead.probability` é `null` em LEAD_DA_OBRA — o efeito de carga do form
    // aplica o default de sempre (`lead.probability ?? 50`), igual ao
    // caminho comercial. Esconder o campo não muda esse default.
    expect(payload.probability).toBe(50);
  });
});
