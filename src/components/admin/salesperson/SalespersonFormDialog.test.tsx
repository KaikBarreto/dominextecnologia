// Prova de DOM real (não só função pura) de que o campo "Salário Fixo (R$)"
// de SalespersonFormDialog está livre do bug de mil vezes:
// <input type="number"> aceitava colar "4.550" como float válido do HTML, e
// Number("4.550") devolvia 4.55 — mil vezes menor. Aqui é o salário fixo real
// de um vendedor.
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

const mutateAsync = vi.fn().mockResolvedValue({ id: 'sp-new' });

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [] }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/hooks/useSalespersonData', () => ({
  useSaveSalesperson: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }) },
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: vi.fn() }) },
    from: () => ({ update: () => ({ eq: vi.fn() }) }),
  },
}));

import { SalespersonFormDialog } from './SalespersonFormDialog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<SalespersonFormDialog open onOpenChange={() => {}} />);
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
  mutateAsync.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('SalespersonFormDialog — campo de salário fixo (prova real de DOM)', () => {
  it('não usa mais <input type="number"> (o bug do sócio nasceu daí)', () => {
    mount();
    const input = q('#sp-salary') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe('text');
  });

  it('digitar "455000" dá 4.550,00 (centavos, mesmo padrão dos outros campos de dinheiro)', () => {
    mount();
    const input = q('#sp-salary') as HTMLInputElement;
    typeInto(input, '455000');
    expect(input.value).toBe('4.550,00');
  });

  it('colar "R$ 4.550" (valor pronto, sem centavos) dá 4.550,00, não 4,55 e não 45,50', () => {
    mount();
    const input = q('#sp-salary') as HTMLInputElement;
    paste(input, 'R$ 4.550');
    expect(input.value).toBe('4.550,00');
  });

  it('salvar após colar "R$ 4.550" envia salary=4550 pro hook (não 4.55)', async () => {
    mount();
    const nameInput = q('#sp-name') as HTMLInputElement;
    typeInto(nameInput, 'João Vendedor');

    const salaryInput = q('#sp-salary') as HTMLInputElement;
    paste(salaryInput, 'R$ 4.550');

    const form = document.querySelector('#salesperson-form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ salary: 4550 }),
    );
  });
});
