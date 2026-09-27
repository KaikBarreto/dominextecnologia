import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { FinancialAccount } from '@/hooks/useFinancialAccounts';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
  }),
}));

vi.mock('@/hooks/useCanManageFinanceSettings', () => ({
  useCanManageFinanceSettings: () => false,
}));

vi.mock('@/components/ui/SearchableSelect', () => ({
  SearchableSelect: ({ placeholder }: { placeholder?: string }) => (
    <button type="button">{placeholder}</button>
  ),
}));

vi.mock('@/components/financial/accountSelectOptions', () => ({
  buildAccountOptions: (accounts: Array<{ id: string; name: string }>) => accounts.map((account) => ({
    value: account.id,
    label: account.name,
  })),
}));

vi.mock('./AccountFormDialog', () => ({
  AccountFormDialog: () => null,
}));

import { TransferFormDialog } from './TransferFormDialog';
import { MESSAGES } from '@/lib/i18n/messages';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = MESSAGES['pt-br'].app.finance.transferForm;
const makeAccount = (id: string, name: string): FinancialAccount => ({
  id,
  company_id: 'company-1',
  name,
  type: 'banco',
  initial_balance: 0,
  color: '#000000',
  icon: 'landmark',
  is_active: true,
  sort_order: 0,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
});

const accounts: FinancialAccount[] = [
  makeAccount('acc-1', 'Conta origem'),
  makeAccount('acc-2', 'Conta destino'),
];

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
  document.body.innerHTML = '';
});

function mount() {
  act(() => {
    root.render(
      <TransferFormDialog
        open
        onOpenChange={() => {}}
        accounts={accounts}
        onSubmit={async () => {}}
      />,
    );
  });
}

function labelByText(text: string): HTMLLabelElement {
  const label = Array.from(document.querySelectorAll('label'))
    .find((item) => item.textContent?.trim() === text) as HTMLLabelElement | undefined;
  if (!label) throw new Error(`Label não encontrado: ${text}`);
  return label;
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button'))
    .find((item) => item.textContent?.trim() === text) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Botão não encontrado: ${text}`);
  return button;
}

describe('TransferFormDialog — responsividade em 390px', () => {
  it('empilha origem e destino, girando a seta apenas no mobile', () => {
    mount();

    const routeGrid = labelByText(t.originLabel).parentElement?.parentElement;
    expect(routeGrid?.className).toContain('grid-cols-1');
    expect(routeGrid?.className).toContain('sm:grid-cols-[1fr_auto_1fr]');

    const arrow = routeGrid?.querySelector('svg');
    expect(arrow?.getAttribute('class')).toContain('rotate-90');
    expect(arrow?.getAttribute('class')).toContain('sm:rotate-0');
  });

  it('empilha valor/data e ações abaixo de 640px', () => {
    mount();

    const moneyGrid = labelByText(t.amountLabel).parentElement?.parentElement;
    expect(moneyGrid?.className).toContain('grid-cols-1');
    expect(moneyGrid?.className).toContain('sm:grid-cols-2');

    const footer = buttonByText(t.cancelLabel).parentElement;
    expect(footer?.className).toContain('flex-col-reverse');
    expect(footer?.className).toContain('sm:flex-row');
  });
});
