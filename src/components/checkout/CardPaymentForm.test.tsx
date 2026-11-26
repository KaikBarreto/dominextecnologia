import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// O que estes testes travam: o CardPaymentForm é COMPARTILHADO entre o
// checkout de cobrança (/pagar/:code) e o da assinatura do SaaS. As opções
// vindas do servidor ("cliente escolhe as parcelas") não podem mudar o modo
// antigo (12x fixas da assinatura, ou sem select).

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;
// Radix Select usa APIs de ponteiro que o jsdom não tem.
(Element.prototype as any).hasPointerCapture = (Element.prototype as any).hasPointerCapture || (() => false);
(Element.prototype as any).scrollIntoView = (Element.prototype as any).scrollIntoView || (() => {});

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    countryCode: 'BR',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    isLoading: false,
    setUserLanguage: async () => {},
  }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { CardPaymentForm } from './CardPaymentForm';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

const noop = () => {};
const OPTIONS = [
  { count: 1, installmentValue: 618.98, totalValue: 618.98 },
  { count: 2, installmentValue: 311.1, totalValue: 622.2 },
  { count: 10, installmentValue: 62.55, totalValue: 625.45 },
];

function render(props: Partial<React.ComponentProps<typeof CardPaymentForm>>) {
  act(() => {
    root.render(
      <CardPaymentForm amount={618.98} isLoading={false} onSubmit={noop} onBack={noop} {...props} />,
    );
  });
}

function openInstallmentsAndReadLabels(): string[] {
  const trigger = document.querySelector('#cc-installments') as HTMLButtonElement | null;
  expect(trigger).toBeTruthy();
  act(() => trigger!.click());
  return Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.textContent?.trim() ?? '');
}

// Espaço do Intl (NBSP) vira espaço comum pra comparar.
const norm = (s: string) => s.replace(/ /g, ' ');

describe('CardPaymentForm — opções de parcelamento do servidor', () => {
  it('sem allowInstallments e sem opções: não há select de parcelas (modo antigo)', () => {
    render({ allowInstallments: false });
    expect(document.querySelector('#cc-installments')).toBeNull();
  });

  it('assinatura (allowInstallments): segue com as 12 opções internas', () => {
    render({ allowInstallments: true, amount: 1200 });
    const labels = openInstallmentsAndReadLabels();
    expect(labels).toHaveLength(12);
    expect(labels[11]).toBe('12x de R$ 100,00 sem juros');
  });

  it('cliente paga a taxa: mostra o total de cada opção e nunca "sem juros"', () => {
    render({ installmentOptions: OPTIONS, interestFree: false });
    const labels = openInstallmentsAndReadLabels().map(norm);
    expect(labels).toEqual([
      '1x de R$ 618,98 (à vista)',
      '2x de R$ 311,10 · total R$ 622,20',
      '10x de R$ 62,55 · total R$ 625,45',
    ]);
    expect(labels.some((l) => l.includes('sem juros'))).toBe(false);
  });

  it('empresa paga a taxa: "sem juros" nas opções parceladas', () => {
    render({
      installmentOptions: [
        { count: 1, installmentValue: 600, totalValue: 600 },
        { count: 10, installmentValue: 60, totalValue: 600 },
      ],
      interestFree: true,
    });
    const labels = openInstallmentsAndReadLabels().map(norm);
    expect(labels).toEqual(['1x de R$ 600,00 (à vista)', '10x de R$ 60,00 sem juros']);
  });

  it('avisa o pai ao trocar a opção (resumo e botão refletem o total)', () => {
    const onInstallmentChange = vi.fn();
    render({ installmentOptions: OPTIONS, onInstallmentChange });
    openInstallmentsAndReadLabels();
    const option = Array.from(document.querySelectorAll('[role="option"]'))
      .find((o) => o.textContent?.startsWith('10x')) as HTMLElement;
    act(() => option.click());
    expect(onInstallmentChange).toHaveBeenCalledWith(10);
  });
});
