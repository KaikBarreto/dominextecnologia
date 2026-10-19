// Prova de DOM real (não só a função pura) de que os campos "Valor Unit." de
// serviço e material do QuoteItemsTable estão livres do bug de mil vezes:
// colar "4.550" num `<input type="number">` é lido pelo navegador como
// decimal internacional e vira 4,55 — mil vezes menor (bug real do sócio,
// 2026-09-17). `onPaste` intercepta o colar ANTES do navegador decidir
// sozinho.
//
// Driver mínimo com createRoot + act (mesmo padrão de ContaFormDialog.test.tsx
// — o repo não usa @testing-library/react).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/hooks/useServiceTypes', () => ({
  useServiceTypes: () => ({
    serviceTypes: [{
      id: 'svc-1',
      name: 'Manutenção',
      is_active: true,
      color: '#000',
      default_price: 175.5,
    }],
  }),
}));
vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({ items: [{ id: 'inv-1', name: 'Filtro', sale_price: 50, cost_price: 30 }] }),
}));
vi.mock('@/components/ui/SearchableSelect', () => ({
  SearchableSelect: ({ options, value, onValueChange, placeholder }: {
    options: Array<{ value: string; label: string }>;
    value: string;
    onValueChange: (value: string) => void;
    placeholder: string;
  }) => (
    <select aria-label={placeholder} value={value} onChange={(event) => onValueChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
}));

import { QuoteItemsTable } from './QuoteItemsTable';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<QuoteItemsTable items={[]} onChange={() => {}} />);
  });
}

const qAll = (sel: string) => Array.from(container.querySelectorAll(sel)) as HTMLInputElement[];

function paste(input: HTMLInputElement, text: string) {
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(pasteEvent, 'clipboardData', { value: { getData: () => text } });
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
});

describe('QuoteItemsTable — campo "Valor Unit." (prova real de DOM)', () => {
  it('selecionar serviço preenche quantidade 1 e o valor padrão cadastrado', () => {
    mount();
    const serviceSelect = container.querySelector(
      'select[aria-label="Selecionar serviço..."]',
    ) as HTMLSelectElement;

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(serviceSelect, 'svc-1');
      serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const quantityInputs = qAll('input[placeholder="0"]');
    const priceInputs = qAll('input[type="number"]');
    expect(quantityInputs[0].value).toBe('1');
    expect(priceInputs[0].value).toBe('175.5');
  });

  it('linha de serviço: colar "4.550" dá 4550 (não 4.55, o bug do sócio)', () => {
    mount();
    // 1ª linha de input é a de Serviços; a 2ª é a de Materiais.
    const inputs = qAll('input[type="number"]');
    expect(inputs.length).toBe(2);
    paste(inputs[0], '4.550');
    expect(inputs[0].value).toBe('4550.00');
  });

  it('linha de material: colar "1.234,56" dá 1234.56', () => {
    mount();
    const inputs = qAll('input[type="number"]');
    paste(inputs[1], '1.234,56');
    expect(inputs[1].value).toBe('1234.56');
  });
});
