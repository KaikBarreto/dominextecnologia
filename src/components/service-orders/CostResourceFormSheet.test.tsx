// Prova de DOM real (não só função pura) de que os três campos de dinheiro
// dos itens de custo do CostResourceFormSheet (custo total do brinde, valor
// anual e valor mensal) estão livres do bug de "mil vezes" do
// <input type="number"> (2026-09-17, "PMOC - Daluz Freguesia": colar "4.550"
// virou R$ 4,55, porque o input nativo lê ponto como separador decimal do
// HTML e normaliza pra 4.55). DIGITAR continua exatamente como sempre foi
// (number nativo); só o COLAR passa a ser interceptado via
// `readPastedCents` (`src/lib/money-paste-mask.ts`).
//
// Driver mínimo com createRoot + act (mesmo padrão de
// ContaFormDialog.test.tsx — o repo não usa @testing-library/react).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/hooks/useCostResources', () => ({
  useCostResourceItems: () => ({ data: undefined }),
}));

import { CostResourceFormSheet } from './CostResourceFormSheet';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(category: 'vehicle' | 'gift') {
  act(() => {
    root.render(
      <CostResourceFormSheet
        open
        onOpenChange={() => {}}
        resource={null}
        category={category}
        onSave={() => {}}
      />
    );
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
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

function moneyInputs() {
  return Array.from(document.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
}

describe('CostResourceFormSheet — campos de dinheiro dos itens (prova real de DOM)', () => {
  it('colar "R$ 4.550" no valor mensal do item dá 4550, não 4.55 (bug do sócio)', () => {
    mount('vehicle');
    // DEFAULT_VEHICLE_ITEMS: os 2 primeiros são mensais ("Depreciação mensal", "Manutenção + Combustível").
    const input = moneyInputs().find(i => i.placeholder === 'Valor mensal');
    expect(input).toBeTruthy();
    expect(input!.type).toBe('number');

    paste(input!, 'R$ 4.550');
    expect(input!.value).toBe('4550');
  });

  it('colar "R$ 4.550" no valor anual do item dá 4550, não 4.55', () => {
    mount('vehicle');
    // DEFAULT_VEHICLE_ITEMS: "Seguro" e "Documentação / IPVA" nascem anuais.
    const input = moneyInputs().find(i => i.placeholder === 'Valor anual');
    expect(input).toBeTruthy();

    paste(input!, 'R$ 4.550');
    expect(input!.value).toBe('4550');
  });

  it('colar "R$ 4.550" no custo total do brinde dá 4550, não 4.55', () => {
    mount('gift');
    const input = moneyInputs().find(i => i.placeholder === '500,00');
    expect(input).toBeTruthy();

    paste(input!, 'R$ 4.550');
    expect(input!.value).toBe('4550');
  });
});
