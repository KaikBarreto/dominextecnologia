import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const paymentState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useCompanyModules', () => ({
  useCompanyModules: () => ({ hasModule: () => true, isLoading: false }),
}));

vi.mock('@/hooks/useTenantPaymentAccount', () => ({
  useTenantPaymentAccount: () => paymentState.current,
}));

vi.mock('@/hooks/useFinancialAccounts', () => ({
  useFinancialAccounts: () => ({ accounts: [] }),
}));

vi.mock('@/hooks/useFinancialCategories', () => ({
  useFinancialCategories: () => ({ categories: [] }),
}));

vi.mock('@/hooks/useTenantCardFees', () => ({
  useTenantFees: () => ({
    card: null,
    pix: null,
    bankSlip: null,
    anticipation: null,
    settlementDays: null,
    source: null,
    extrasSource: null,
    syncedAt: null,
    isLoading: false,
    sync: { isPending: false, mutateAsync: vi.fn() },
  }),
}));

vi.mock('@/components/settings/AsaasFeesCard', () => ({
  AsaasFeesCard: () => null,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});

import { SettingsAsaasContent } from './SettingsAsaasContent';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mutation() {
  return { isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) };
}

function render() {
  act(() => {
    root.render(<SettingsAsaasContent />);
  });
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    const prototype = input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  paymentState.current = {
    status: 'active',
    isActive: true,
    isLoading: false,
    autoPostToFinance: true,
    setAutoPostToFinance: mutation(),
    autoPostFees: true,
    setAutoPostFees: mutation(),
    defaultFinePercent: 2,
    defaultInterestPercent: 1,
    setLateFees: mutation(),
    defaultDueDays: 0,
    defaultDiscountPercent: null,
    defaultDiscountDays: null,
    defaultDescription: 'Descrição persistida',
    allowPix: true,
    allowBoleto: true,
    allowCard: true,
    defaultMaxInstallments: 12,
    defaultFinanceAccountId: null,
    defaultIncomeCategory: null,
    defaultFeeCategory: 'Tarifas de cobrança',
    setChargePreferences: mutation(),
    provision: mutation(),
    deactivate: mutation(),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('SettingsAsaasContent — hidratação independente por seção', () => {
  it('preserva a descrição não salva quando um refetch atualiza o desconto', () => {
    render();
    const description = document.querySelector('#asaas-description') as HTMLTextAreaElement;
    const discount = document.querySelector('#asaas-discount-pct') as HTMLInputElement;
    expect(description.value).toBe('Descrição persistida');
    expect(discount.value).toBe('');

    typeInto(description, 'Rascunho ainda não salvo');
    paymentState.current = { ...paymentState.current, defaultDiscountPercent: 5 };
    render();

    expect(description.value).toBe('Rascunho ainda não salvo');
    expect(discount.value).toBe('5');
  });
});
