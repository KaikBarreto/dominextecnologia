import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SettingsEmailContent } from './SettingsEmailContent';

let hasBillingModule = true;
const billingCard = vi.fn(() => <div>Motor de cobrança por e-mail</div>);

vi.mock('@/hooks/useCompanyModules', () => ({
  useCompanyModules: () => ({
    hasModule: (code: string) => code === 'cobrancas' && hasBillingModule,
    isLoading: false,
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdminOrGestor: () => true, hasPermission: () => false }),
}));

vi.mock('@/components/settings/CustomerBillingEmailsCard', () => ({
  CustomerBillingEmailsCard: () => billingCard(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SettingsEmailContent', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hasBillingModule = true;
    billingCard.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('mostra a automação financeira quando o módulo Cobranças está ativo', () => {
    act(() => {
      root.render(<MemoryRouter><SettingsEmailContent /></MemoryRouter>);
    });

    expect(container.textContent).toContain('Canal de e-mail');
    expect(container.textContent).toContain('Motor de cobrança por e-mail');
    expect(billingCard).toHaveBeenCalledTimes(1);
  });

  it('não consulta o motor financeiro e mostra o gate sem o módulo Cobranças', () => {
    hasBillingModule = false;
    act(() => {
      root.render(<MemoryRouter><SettingsEmailContent /></MemoryRouter>);
    });

    expect(container.textContent).toContain('Automações de cobrança não contratadas');
    expect(container.textContent).toContain('Contratar Cobranças');
    expect(container.textContent).not.toContain('Motor de cobrança por e-mail');
    expect(billingCard).not.toHaveBeenCalled();
  });
});
