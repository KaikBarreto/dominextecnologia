import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsaasFeesCard } from './AsaasFeesCard';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AsaasFeesCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('separa as taxas do cartão por faixa de parcelas', () => {
    act(() => {
      root.render(
        <AsaasFeesCard
          data={{
            card: {
              operationValue: 0.49,
              oneInstallment: 1.99,
              upToSix: 2.49,
              upToTwelve: 2.99,
              upToTwentyOne: 3.29,
            },
            pix: { fixed: 0.99, percent: 0, freeCount: 100 },
            bankSlip: { fixed: 0.99 },
            anticipation: {
              monthlyPercent: 1.7,
              bankSlipMonthlyPercent: 5.79,
              cardDetachedMonthlyPercent: 1.25,
              cardInstallmentMonthlyPercent: 1.7,
            },
            settlementDays: { pix: 0, bankSlip: 1, card: 32 },
            source: 'asaas',
            extrasSource: 'asaas',
          }}
          syncedAt="2026-10-14T12:00:00.000Z"
          isLoading={false}
          isSyncing={false}
          onSync={() => {}}
        />,
      );
    });

    const ranges = [...container.querySelectorAll('dl > div')];
    expect(ranges).toHaveLength(4);
    expect(ranges.map((range) => range.textContent)).toEqual([
      'À vista (1x)1,99%',
      '2 a 6x2,49%',
      '7 a 12x2,99%',
      '13 a 21x3,29%',
    ]);
    expect(container.textContent?.split('\u00a0').join(' ')).toContain('+ R$ 0,49 por cobrança');
  });
});
