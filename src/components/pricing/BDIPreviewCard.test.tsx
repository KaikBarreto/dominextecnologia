// Prova de DOM real (não só a função pura) de que o campo "Custo do serviço"
// do simulador de BDI está livre do bug de mil vezes: colar "4.550" num
// `<input type="number">` é lido pelo navegador como decimal internacional e
// vira 4,55 — mil vezes menor (bug real do sócio, 2026-09-17). Este campo
// nunca persiste (simulador em memória), mas ainda distorceria a prévia
// mostrada em tela. `onPaste` intercepta o colar ANTES do navegador decidir
// sozinho.
//
// Driver mínimo com createRoot + act (mesmo padrão de ContaFormDialog.test.tsx
// — o repo não usa @testing-library/react).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/hooks/usePricingSettings', () => ({
  usePricingSettings: () => ({ settings: null }),
}));

import { BDIPreviewCard } from './BDIPreviewCard';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(props: React.ComponentProps<typeof BDIPreviewCard> = {}) {
  act(() => {
    root.render(<BDIPreviewCard {...props} />);
  });
}

const q = (sel: string) => container.querySelector(sel) as HTMLInputElement | null;

function paste(input: HTMLInputElement, text: string) {
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(pasteEvent, 'clipboardData', {
    value: { getData: () => text },
  });
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

describe('BDIPreviewCard — campo "Custo do serviço" (prova real de DOM)', () => {
  it('colar "4.550" dá 4550 (não 4.55, o bug do sócio)', () => {
    mount();
    const input = q('input[type="number"]');
    expect(input).toBeTruthy();
    paste(input!, '4.550');
    expect(input!.value).toBe('4550');
  });

  it('colar "1.234,56" dá 1234.56', () => {
    mount();
    const input = q('input[type="number"]');
    paste(input!, '1.234,56');
    expect(input!.value).toBe('1234.56');
  });

  it('usa as taxas locais do formulário na composição sem depender da persistência', () => {
    mount({
      previewSettings: {
        taxRate: 8,
        adminRate: 7,
        profitRate: 5,
        kmCost: 1,
        cardDiscountRate: 6,
        cardInstallments: 10,
      },
    });

    expect(container.textContent).toContain('BDI = 1 − (8% + 7% + 5%)');
    expect(container.textContent).toContain('BDI = 0.8000');
  });
});
