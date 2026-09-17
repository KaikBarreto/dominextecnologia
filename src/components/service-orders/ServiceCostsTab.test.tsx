// Prova de DOM real (não só função pura) de que os dois campos de dinheiro
// nativos do ServiceCostsTab (custo por hora e valor de custo extra) estão
// livres do bug de "mil vezes" do <input type="number"> (2026-09-17,
// "PMOC - Daluz Freguesia": colar "4.550" virou R$ 4,55, porque o input
// nativo lê ponto como separador decimal do HTML e normaliza pra 4.55).
// DIGITAR continua exatamente como sempre foi (number nativo); só o COLAR
// passa a ser interceptado via `readPastedCents`
// (`src/lib/money-paste-mask.ts`).
//
// Driver mínimo com createRoot + act (mesmo padrão de
// ContaFormDialog.test.tsx — o repo não usa @testing-library/react).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/hooks/useServiceTypes', () => ({
  useServiceTypes: () => ({ serviceTypes: [{ id: 'st-1', name: 'Manutenção', color: '#000000' }] }),
}));
vi.mock('@/hooks/useServiceCosts', () => ({
  useServiceCosts: () => ({
    cost: {
      id: 'cost-1',
      hourly_rate: 0,
      hours: 1,
      notes: '',
      extra_costs: [{ label: 'Peça extra', amount: 10 }],
    },
    saveCost: { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false },
  }),
  computeExtraCostsTotal: (lines: { amount: number }[]) => (lines ?? []).reduce((s, l) => s + (l.amount || 0), 0),
}));
vi.mock('@/hooks/useServiceMaterials', () => ({ useServiceMaterials: () => ({ totalCost: 0 }) }));
vi.mock('@/hooks/usePricingSettings', () => ({ usePricingSettings: () => ({ settings: null }) }));
vi.mock('@/hooks/useCompanyModules', () => ({ useCompanyModules: () => ({ hasModule: () => false }) }));
vi.mock('@/components/service-orders/LinkedResourcesSection', () => ({ LinkedResourcesSection: () => null }));
// Sub-modais não são o alvo deste teste (têm prova própria em
// LaborCalculatorModal.test.tsx e ExtraCostModal.test.tsx) — sempre montados
// pelo ServiceCostsTab mesmo fechados, e puxam useAuth/useEmployees.
vi.mock('@/components/service-orders/LaborCalculatorModal', () => ({ LaborCalculatorModal: () => null }));
vi.mock('@/components/service-orders/ExtraCostModal', () => ({ ExtraCostModal: () => null }));

import { ServiceCostsTab } from './ServiceCostsTab';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<ServiceCostsTab />);
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

describe('ServiceCostsTab — campos de dinheiro nativos (prova real de DOM)', () => {
  it('colar "R$ 4.550" no custo por hora dá 4550, não 4.55 (bug do sócio)', () => {
    mount();
    const inputs = moneyInputs();
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    const hourlyInput = inputs[0]; // Custo / hora (R$) é o primeiro number field da aba
    expect(hourlyInput.type).toBe('number');

    paste(hourlyInput, 'R$ 4.550');
    expect(hourlyInput.value).toBe('4550');
  });

  it('colar "R$ 4.550" no valor do custo extra dá 4550, não 4.55', () => {
    mount();
    const inputs = moneyInputs();
    const extraInput = inputs[1]; // linha de custo extra pré-carregada ("Peça extra")
    expect(extraInput).toBeTruthy();

    paste(extraInput, 'R$ 4.550');
    expect(extraInput.value).toBe('4550');
  });
});
