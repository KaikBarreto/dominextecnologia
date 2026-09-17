// Prova de DOM real (não só função pura) de que o campo de valor do
// ExtraCostModal está livre do bug de "mil vezes" do <input type="number">
// (2026-09-17, "PMOC - Daluz Freguesia": colar "4.550" virou R$ 4,55, porque
// o input nativo lê ponto como separador decimal do HTML e normaliza pra
// 4.55). DIGITAR continua exatamente como sempre foi (number nativo); só o
// COLAR passa a ser interceptado via `readPastedCents`
// (`src/lib/money-paste-mask.ts`).
//
// Driver mínimo com createRoot + act (mesmo padrão de
// ContaFormDialog.test.tsx e numeric-input-paste-proof.test.tsx — o repo não
// usa @testing-library/react).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ExtraCostModal } from './ExtraCostModal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(onAdd: (label: string, amount: number) => void) {
  act(() => {
    root.render(<ExtraCostModal open onOpenChange={() => {}} onAdd={onAdd} />);
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

function getAmountInput() {
  // Continua <input type="number"> de propósito (digitar não muda) — achamos
  // pelo tipo, já que o campo não tem id estável.
  return document.querySelector('input[type="number"]') as HTMLInputElement;
}

describe('ExtraCostModal — campo de valor (prova real de DOM)', () => {
  it('continua <input type="number"> (digitar não muda)', () => {
    mount(() => {});
    const input = getAmountInput();
    expect(input).toBeTruthy();
    expect(input.type).toBe('number');
  });

  it('colar "R$ 4.550" (valor pronto) dá 4550, não 4.55 (bug do sócio)', () => {
    let added: number | null = null;
    mount((_label, amount) => { added = amount; });
    const input = getAmountInput();

    paste(input, 'R$ 4.550');
    expect(input.value).toBe('4550');

    const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Adicionar'));
    expect(confirmBtn).toBeTruthy();
    act(() => { confirmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(added).toBe(4550);
  });

  it('colar "1.234,56" dá 1234.56', () => {
    mount(() => {});
    const input = getAmountInput();
    paste(input, '1.234,56');
    expect(input.value).toBe('1234.56');
  });
});
