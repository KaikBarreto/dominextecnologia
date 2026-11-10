import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  QuoteServiceCostEditor,
  createQuoteCostComposition,
  getQuoteCostCompositionTotals,
} from './QuoteServiceCostEditor';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

const viewport = vi.hoisted(() => ({ mobile: false }));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => viewport.mobile, useIsCompact: () => viewport.mobile }));
vi.mock('@/components/service-orders/LaborCalculatorModal', () => ({
  LaborCalculatorModal: ({ open }: { open: boolean }) => open ? <div data-testid="labor-calculator">Calculadora de mão de obra</div> : null,
}));
vi.mock('@/components/service-orders/ExtraCostModal', () => ({ ExtraCostModal: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  viewport.mobile = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('QuoteServiceCostEditor', () => {
  it('mantém o cadastro intacto por padrão e exige uma escolha explícita para atualizá-lo', () => {
    const onChange = vi.fn();
    const composition = createQuoteCostComposition({ labor: { hourlyRate: 80, hours: 2 } });
    act(() => root.render(<QuoteServiceCostEditor
      value={{ serviceTypeId: 'service-1', composition }} onChange={onChange}
      bdiFactor={0.68} formatMoney={value => `R$ ${value}`} currencySymbol="R$"
    />));
    const checkbox = container.querySelector<HTMLButtonElement>('[role="checkbox"]');
    expect(checkbox?.getAttribute('data-state')).toBe('unchecked');
    expect(container.textContent).toContain('a composição vale apenas para este orçamento');
    expect(onChange).not.toHaveBeenCalled();
    act(() => checkbox?.click());
    expect(onChange).toHaveBeenCalledWith({ serviceTypeId: 'service-1', composition, saveAsCatalogDefault: true });
  });

  it('mantém mão de obra, insumos e recursos separados no cálculo local', () => {
    const composition = createQuoteCostComposition({
      labor: { hourlyRate: 80, hours: 2.5 },
      supplies: [{ id: 'supply-1', label: 'Fluido', quantity: 3, unitCost: 12.5 }],
      resources: [{ id: 'resource-1', label: 'Plataforma', quantity: 1, unitCost: 150 }],
    });

    expect(getQuoteCostCompositionTotals(composition)).toEqual({
      labor: 200,
      supplies: 37.5,
      resources: 150,
      total: 387.5,
    });
  });

  it('repete as abas do custo do serviço e abre a calculadora compartilhada', () => {
    act(() => {
      root.render(
        <QuoteServiceCostEditor
          value={{ composition: createQuoteCostComposition({ labor: { hourlyRate: 80, hours: 2 } }) }}
          onChange={() => undefined}
          bdiFactor={0.68}
          formatMoney={value => `R$ ${value}`}
          currencySymbol="R$"
        />,
      );
    });

    const laborButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Mão de obra'));
    expect(laborButton?.className).toContain('border-primary');
    expect(container.textContent).toContain('Custo HH');

    const calculatorButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Calcular'));
    act(() => calculatorButton?.click());
    expect(container.querySelector('[data-testid="labor-calculator"]')).toBeTruthy();
  });

  it('no mobile mantém as mesmas abas em navegação horizontal', () => {
    viewport.mobile = true;
    act(() => {
      root.render(
        <QuoteServiceCostEditor
          value={{ composition: createQuoteCostComposition() }}
          onChange={() => undefined}
          bdiFactor={0.68}
          formatMoney={value => `R$ ${value}`}
          currencySymbol="R$"
        />,
      );
    });

    expect(container.textContent).toContain('Custo HH');
    const inputsButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Insumos'));
    act(() => inputsButton?.click());
    expect(container.textContent).toContain('Insumos usados no serviço');
    expect(container.textContent).toContain('Selecionar do estoque');
  });
});
