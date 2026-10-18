import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomerPortalSettingsTab } from './CustomerPortalSettingsTab';
import type { CustomerPortalSettings } from '@/hooks/useCustomerPortalSettings';

const settings: CustomerPortalSettings = {
  token: 'portal-token',
  isActive: true,
  passwordEnabled: false,
  passwordConfigured: false,
  permissions: {
    service_orders: true,
    equipment: true,
    contracts: true,
    charges: true,
    ticket_requests: true,
  },
};

function renderTab(overrides: Partial<CustomerPortalSettings> = {}) {
  const onSettingsChange = vi.fn();
  render(
    <CustomerPortalSettingsTab
      settings={{ ...settings, ...overrides }}
      onSettingsChange={onSettingsChange}
      password=""
      onPasswordChange={vi.fn()}
      passwordConfirmation=""
      onPasswordConfirmationChange={vi.fn()}
      isEditing
      isLoading={false}
      error={null}
      onRetry={vi.fn()}
    />,
  );
  return onSettingsChange;
}

describe('CustomerPortalSettingsTab', () => {
  it('expõe proteção por senha e todas as permissões configuráveis', () => {
    renderTab();

    expect(screen.getByRole('switch', { name: 'Exigir senha para entrar' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Ordens de serviço' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Equipamentos' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Contratos' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Cobranças' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Abrir chamados' })).toBeInTheDocument();
  });

  it('propaga o bloqueio de uma seção sem alterar as demais permissões', () => {
    const onSettingsChange = renderTab();

    fireEvent.click(screen.getByRole('switch', { name: 'Cobranças' }));

    expect(onSettingsChange).toHaveBeenCalledWith({
      ...settings,
      permissions: { ...settings.permissions, charges: false },
    });
  });

  it('desabilita senha e permissões quando o portal está inativo', () => {
    renderTab({ isActive: false });

    expect(screen.getByRole('switch', { name: 'Exigir senha para entrar' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Ordens de serviço' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Abrir chamados' })).toBeDisabled();
  });
});
