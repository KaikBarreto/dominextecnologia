// Prova de DOM real (não só a função pura) de que o campo "Valor" do
// CreateOpportunityDialog está livre do bug de mil vezes: colar "4.550" num
// `<input type="number">` é lido pelo navegador como decimal internacional e
// vira 4,55 — mil vezes menor (bug real do sócio, 2026-09-17). `onPaste`
// intercepta o colar ANTES do navegador decidir sozinho.
//
// Driver mínimo com createRoot + act (mesmo padrão de ContaFormDialog.test.tsx
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

vi.mock('@/hooks/use-mobile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-mobile')>();
  return { ...actual, useIsMobile: () => false };
});

vi.mock('@/hooks/useLeads', () => ({
  useLeads: () => ({ createLead: { mutateAsync: vi.fn(), isPending: false } }),
}));
vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({ stages: [{ id: 'stage-1', name: 'Novo' }] }),
}));

import { CreateOpportunityDialog } from './CreateOpportunityDialog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(
      <CreateOpportunityDialog
        open
        onOpenChange={() => {}}
        customer={{ id: 'cust-1', name: 'Cliente Teste' } as any}
      />,
    );
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

describe('CreateOpportunityDialog — campo de valor (prova real de DOM)', () => {
  it('colar "4.550" dá 4550 (não 4.55, o bug do sócio)', () => {
    mount();
    const input = q('#opportunity-value') as HTMLInputElement;
    expect(input).toBeTruthy();
    paste(input, '4.550');
    expect(input.value).toBe('4550.00');
  });

  it('colar "1.234,56" dá 1234.56', () => {
    mount();
    const input = q('#opportunity-value') as HTMLInputElement;
    paste(input, '1.234,56');
    expect(input.value).toBe('1234.56');
  });
});
