// Prova de DOM real (não só função pura) de que o campo "Valor (R$)" do lead
// no painel master Auctus (CRM interno) está livre do bug de mil vezes:
// <input type="number"> aceitava colar "4.550" como float válido do HTML, e
// Number("4.550") devolvia 4.55 — mil vezes menor. Aqui o campo é usado pra
// registrar o valor estimado de uma negociação.
//
// Igual aos demais campos de dinheiro da leva (ver ContaFormDialog.test.tsx):
// máscara de centavos + `onPaste` via `src/lib/money-paste-mask.ts`, não
// `NumericInput` — dinheiro tem formatação própria (régua da casa).
//
// Driver mínimo com createRoot + act, mesmo padrão de
// ContaFormDialog.test.tsx (o repo não usa @testing-library/react).
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

const createLead = { mutate: vi.fn(), isPending: false };
const updateLead = { mutate: vi.fn(), isPending: false };
const EMPTY_ARRAY: any[] = [];
const QUERY_RESULT = { data: EMPTY_ARRAY };

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => QUERY_RESULT,
}));
vi.mock('@/hooks/useAdminCrm', () => ({
  useAdminLeads: () => ({ createLead, updateLead }),
  // Referência nova de propósito: reproduz o filtro por pipeline do hook real.
  // O formulário deve depender do id da etapa padrão, nunca do array inteiro.
  useAdminCrmStages: () => ({
    stages: [{ id: 'stage-1', name: 'Novo Lead', color: '#64748b', is_won: false, is_lost: false }],
  }),
}));
vi.mock('@/hooks/useCompanyOrigins', () => ({
  useCompanyOrigins: () => ({ origins: EMPTY_ARRAY }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/hooks/useAdminPermissions', () => ({
  useAdminPermissions: () => ({ linkedSalespersonId: null }),
}));
vi.mock('@/components/schedule/AssigneeMultiSelect', () => ({
  AssigneeMultiSelect: ({ onChangeUsers }: { onChangeUsers: (ids: string[]) => void }) => (
    <button type="button" onClick={() => onChangeUsers(['user-1', 'user-2'])}>
      Selecionar dois responsáveis
    </button>
  ),
}));
vi.mock('@/components/admin/AdminSegmentMultiSelect', () => ({
  AdminSegmentMultiSelect: ({ onChange }: { onChange: (segments: string[]) => void }) => (
    <button type="button" onClick={() => onChange(['refrigeracao', 'eletrica'])}>
      Selecionar dois segmentos
    </button>
  ),
}));

import { AdminLeadFormDialog } from './AdminLeadFormDialog';
import type { AdminLead } from '@/hooks/useAdminCrm';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(pipelineId?: string, editingLead?: AdminLead) {
  act(() => {
    root.render(<AdminLeadFormDialog open onOpenChange={() => {}} pipelineId={pipelineId} editingLead={editingLead} />);
  });
}

function makeLead(overrides: Partial<AdminLead> = {}): AdminLead {
  return {
    id: 'lead-1',
    title: 'Projeto original',
    company_name: 'Empresa Alfa',
    contact_name: 'João Silva',
    email: 'joao@alfa.com',
    phone: '11988887777',
    value: 4550,
    probability: 50,
    expected_close_date: '2026-10-10',
    source: 'Indicação',
    segment: 'refrigeracao',
    segments: ['refrigeracao'],
    stage_id: 'stage-1',
    notes: 'Observação completa',
    loss_reason: null,
    created_by: 'user-1',
    responsible_id: 'user-1',
    pipeline_id: 'pipeline-1',
    created_at: '2026-09-01T12:00:00Z',
    updated_at: '2026-09-01T12:00:00Z',
    assignees: [{ user_id: 'user-1', is_primary: true }],
    ...overrides,
  };
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
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
  createLead.mutate.mockClear();
  updateLead.mutate.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('AdminLeadFormDialog — campo de valor do lead (prova real de DOM)', () => {
  it('mantém a digitação mesmo quando o hook recria a lista de etapas', () => {
    mount();
    const input = q('input[placeholder="Ex: João Silva"]') as HTMLInputElement;

    typeInto(input, 'João Silva');

    expect(input.value).toBe('João Silva');
  });

  it('não usa mais <input type="number"> (o bug do sócio nasceu daí)', () => {
    mount();
    const input = q('#admin-lead-value') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe('text');
  });

  it('digitar "455000" dá 4.550,00 (centavos, mesmo padrão dos outros campos de dinheiro)', () => {
    mount();
    const input = q('#admin-lead-value') as HTMLInputElement;
    typeInto(input, '455000');
    expect(input.value).toBe('4.550,00');
  });

  it('colar "R$ 4.550" (valor pronto, sem centavos) dá 4.550,00 — não 4,55 e não 45,50', () => {
    mount();
    const input = q('#admin-lead-value') as HTMLInputElement;
    paste(input, 'R$ 4.550');
    expect(input.value).toBe('4.550,00');
  });

  it('salvar após colar "R$ 4.550" envia value=4550 pro hook de criação (não 4.55)', () => {
    mount();
    typeInto(q('input[placeholder="Ex: Implantação na Empresa Alfa"]') as HTMLInputElement, 'Projeto Alfa');
    const input = q('#admin-lead-value') as HTMLInputElement;
    paste(input, 'R$ 4.550');

    const saveButton = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Criar oportunidade',
    ) as HTMLButtonElement;
    act(() => {
      saveButton.click();
    });

    expect(createLead.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ value: 4550 }),
      expect.anything(),
    );
  });

  it('cria a oportunidade dentro do funil selecionado', () => {
    mount('pipeline-parcerias');
    typeInto(q('input[placeholder="Ex: Implantação na Empresa Alfa"]') as HTMLInputElement, 'Projeto Parcerias');

    const saveButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Criar oportunidade',
    ) as HTMLButtonElement;
    act(() => saveButton.click());

    expect(createLead.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ pipeline_id: 'pipeline-parcerias' }),
      expect.anything(),
    );
  });

  it('envia todos os responsáveis selecionados e preserva a ordem do principal', () => {
    mount();
    typeInto(q('input[placeholder="Ex: Implantação na Empresa Alfa"]') as HTMLInputElement, 'Projeto Alfa');

    const selectAssignees = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Selecionar dois responsáveis',
    ) as HTMLButtonElement;
    const saveButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Criar oportunidade',
    ) as HTMLButtonElement;

    act(() => selectAssignees.click());
    act(() => saveButton.click());

    expect(createLead.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ assignee_user_ids: ['user-1', 'user-2'] }),
      expect.anything(),
    );
  });

  it('edita o nome usado no card e envia todos os campos persistentes', () => {
    mount(undefined, makeLead());
    const titleInput = q('input[placeholder="Ex: Implantação na Empresa Alfa"]') as HTMLInputElement;
    typeInto(titleInput, 'Projeto atualizado');

    const saveButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Salvar',
    ) as HTMLButtonElement;
    act(() => saveButton.click());

    expect(updateLead.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'lead-1',
        title: 'Projeto atualizado',
        company_name: 'Empresa Alfa',
        contact_name: 'João Silva',
        email: 'joao@alfa.com',
        phone: '(11) 98888-7777',
        value: 4550,
        probability: 50,
        source: 'Indicação',
        segment: 'refrigeracao',
        segments: ['refrigeracao'],
        stage_id: 'stage-1',
        expected_close_date: '2026-10-10',
        notes: 'Observação completa',
        loss_reason: null,
        assignee_user_ids: ['user-1'],
        pipeline_id: 'pipeline-1',
      }),
      expect.anything(),
    );
  });

  it('salva múltiplos segmentos e mantém o primeiro no campo legado', () => {
    mount(undefined, makeLead());
    const segmentsButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Selecionar dois segmentos',
    ) as HTMLButtonElement;
    const saveButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Salvar',
    ) as HTMLButtonElement;

    act(() => segmentsButton.click());
    act(() => saveButton.click());

    expect(updateLead.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        segments: ['refrigeracao', 'eletrica'],
        segment: 'refrigeracao',
      }),
      expect.anything(),
    );
  });

  it('não permite criar oportunidade sem nome', () => {
    mount();
    const saveButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Criar oportunidade',
    ) as HTMLButtonElement;

    expect(saveButton.disabled).toBe(true);
    act(() => saveButton.click());
    expect(createLead.mutate).not.toHaveBeenCalled();
  });
});
