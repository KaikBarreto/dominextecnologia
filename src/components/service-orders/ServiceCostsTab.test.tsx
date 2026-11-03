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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useServiceTypes', () => ({
  useServiceTypes: () => ({
    serviceTypes: [{
      id: 'st-1', name: 'Manutenção', color: '#000000', description: null, is_active: true,
    }],
    isLoading: false,
  }),
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
    saveCost: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false },
    isLoading: false,
    error: null,
  }),
  computeExtraCostsTotal: (lines: { amount: number }[]) => (lines ?? []).reduce((s, l) => s + (l.amount || 0), 0),
}));
vi.mock('@/hooks/useServiceMaterials', () => ({
  useServiceMaterials: () => ({
    materials: [{ subtotal: 25.6 }], totalCost: 25.6, isLoading: false, error: null,
  }),
}));
vi.mock('@/hooks/useServiceCostResources', () => ({
  useServiceCostResources: () => ({
    linkedResources: [{
      id: 'link-1', service_id: 'st-1', resource_id: 'resource-1', override_value: 84.85,
      calculatedCost: 84.85,
      resource: { id: 'resource-1', hourly_rate: 0, category: 'vehicle', name: 'Veículo' },
    }],
    allResources: [], gifts: [],
    totals: { vehicle: 84.85, tool: 0, epi: 0, other: 0, gift: 0, total: 84.85 },
    isLoading: false, error: null,
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { company_id: 'company-1' } }),
}));
vi.mock('@/hooks/usePricingSettings', () => ({ usePricingSettings: () => ({ settings: null }) }));
vi.mock('@/hooks/useCompanyModules', () => ({ useCompanyModules: () => ({ hasModule: () => false }) }));
vi.mock('@/components/service-orders/LinkedResourcesSection', () => ({ LinkedResourcesSection: () => null }));
// Sub-modais não são o alvo deste teste (têm prova própria em
// LaborCalculatorModal.test.tsx e ExtraCostModal.test.tsx) — sempre montados
// pelo ServiceCostsTab mesmo fechados, e puxam useAuth/useEmployees.
vi.mock('@/components/service-orders/LaborCalculatorModal', () => ({ LaborCalculatorModal: () => null }));
vi.mock('@/components/service-orders/ExtraCostModal', () => ({ ExtraCostModal: () => null }));

import { ServiceCostsTab } from './ServiceCostsTab';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(selectService = true) {
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <ServiceCostsTab />
      </QueryClientProvider>,
    );
  });
  if (selectService) {
    const serviceButton = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Manutenção'));
    act(() => {
      serviceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }
}

function paste(input: HTMLInputElement, text: string) {
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(pasteEvent, 'clipboardData', {
    value: { getData: () => text } as Pick<DataTransfer, 'getData'> as DataTransfer,
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
  document.body.innerHTML = '';
});

function moneyInputs() {
  return Array.from(document.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
}

describe('ServiceCostsTab — campos de dinheiro nativos (prova real de DOM)', () => {
  it('usa quadrado saturado com ícone branco e a cor cadastrada na lista e no detalhe', () => {
    mount();

    const avatars = Array.from(document.querySelectorAll('[data-service-type-avatar]')) as HTMLElement[];
    expect(avatars.length).toBeGreaterThanOrEqual(2);
    expect(avatars.every((avatar) => avatar.style.backgroundColor === 'rgb(0, 0, 0)')).toBe(true);
    expect(avatars.every((avatar) => avatar.querySelector('.lucide-wrench'))).toBe(true);
    expect(avatars.every((avatar) => avatar.className.includes('text-white'))).toBe(true);
  });

  it('começa com lista compacta e estado vazio antes da seleção', () => {
    mount(false);

    expect(document.body.textContent).toContain('Tipos de serviço');
    expect(document.body.textContent).toContain('Selecione um tipo de serviço');
    expect(moneyInputs()).toHaveLength(0);
  });

  it('carrega recursos no Resumo sem visitar antes a aba Recursos', () => {
    mount();

    const summaryButton = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Resumo'));
    expect(summaryButton).toBeTruthy();
    act(() => summaryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(document.body.textContent).toContain('84,85');
    expect(document.body.textContent).toContain('120,45');
  });

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

  it('pede confirmação antes de excluir um custo extra inline', () => {
    mount();
    const deleteButton = document.querySelector('button[aria-label^="Excluir custo extra"]') as HTMLButtonElement;
    expect(deleteButton).toBeTruthy();

    act(() => deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(document.body.textContent).toContain('Este custo será removido da composição do serviço');
    expect(moneyInputs()).toHaveLength(2);

    const confirmButton = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Excluir') as HTMLButtonElement;
    act(() => confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(moneyInputs()).toHaveLength(1);
  });
});
