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
// Referências ESTÁVEIS (não recriar array/objeto a cada chamada do mock):
// um array literal novo a cada render vira dependência "sempre diferente" no
// useEffect do componente (depende de `stages`) e entra em loop infinito de
// render — não é o bug de dinheiro, é armadilha de mock.
const EMPTY_ARRAY: any[] = [];
const QUERY_RESULT = { data: EMPTY_ARRAY };

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => QUERY_RESULT,
}));
vi.mock('@/hooks/useAdminCrm', () => ({
  useAdminLeads: () => ({ createLead, updateLead }),
  useAdminCrmStages: () => ({ stages: EMPTY_ARRAY }),
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

import { AdminLeadFormDialog } from './AdminLeadFormDialog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<AdminLeadFormDialog open onOpenChange={() => {}} />);
  });
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
    const input = q('#admin-lead-value') as HTMLInputElement;
    paste(input, 'R$ 4.550');

    const saveButton = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Criar Lead',
    ) as HTMLButtonElement;
    act(() => {
      saveButton.click();
    });

    expect(createLead.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ value: 4550 }),
      expect.anything(),
    );
  });
});
