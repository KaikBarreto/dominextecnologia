// Prova de DOM real (não só a função pura) de que o campo "Valor estimado" do
// LeadFormDialog está livre do bug de mil vezes: colar "4.550" num
// `<input type="number">` é lido pelo navegador como decimal internacional e
// vira 4,55 — mil vezes menor (bug real do sócio, 2026-09-17). `onPaste`
// intercepta o colar ANTES do navegador decidir sozinho.
//
// Driver mínimo com createRoot + act (mesmo padrão de ContaFormDialog.test.tsx
// — o repo não usa @testing-library/react). O Dialog do Radix renderiza via
// Portal em document.body.
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

vi.mock('@/hooks/useLeads', () => ({
  useLeads: () => ({
    createLead: { mutateAsync: vi.fn(), isPending: false },
    updateLead: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useCustomers', () => ({ useCustomers: () => ({ customers: [] }) }));
vi.mock('@/hooks/useUsers', () => ({ useUsers: () => ({ users: [] }) }));
vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({ stages: [{ id: 'stage-1', name: 'Novo' }], getStageHex: () => '#000000' }),
}));
// Onda D (multi-pipeline): LeadFormDialog passou a chamar useCrmPipelines pra
// agrupar o select de estágio por funil. Mock com 1 único funil = mesmo
// comportamento visual de antes do D2 (select plano, sem seções).
vi.mock('@/hooks/useCrmPipelines', () => ({
  useCrmPipelines: () => ({ pipelines: [{ id: 'pipeline-1', name: 'Funil de Vendas', is_default: true }] }),
}));
vi.mock('@/components/customers/CustomerSelectField', () => ({ CustomerSelectField: () => null }));
vi.mock('@/components/customers/OriginSelectField', () => ({ OriginSelectField: () => null }));

import { LeadFormDialog } from './LeadFormDialog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<LeadFormDialog open onOpenChange={() => {}} />);
  });
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

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

describe('LeadFormDialog — campo de valor estimado (prova real de DOM)', () => {
  it('colar "4.550" dá 4550 (não 4.55, o bug do sócio)', () => {
    mount();
    const input = q('#value') as HTMLInputElement;
    expect(input).toBeTruthy();
    paste(input, '4.550');
    expect(input.value).toBe('4550');
  });

  it('colar "1.234,56" dá 1234.56', () => {
    mount();
    const input = q('#value') as HTMLInputElement;
    paste(input, '1.234,56');
    expect(input.value).toBe('1234.56');
  });
});
