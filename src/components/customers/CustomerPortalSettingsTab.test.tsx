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
    invoices: false,
    documents: false,
    ticket_requests: true,
  },
  publicSections: {
    service_orders: false,
    equipment: false,
    contracts: false,
    charges: false,
    invoices: false,
    documents: false,
    ticket_requests: false,
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
    expect(screen.getByRole('switch', { name: 'Notas fiscais' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Documentos' })).toBeInTheDocument();
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

  // LEI DA ENTREGA: com senha DESLIGADA (o caso da esmagadora maioria dos
  // tenants) a tela continua sendo o switch de sempre — nenhum seletor de 3
  // estados aparece.
  it('mantém o switch simples quando a proteção por senha está desligada', () => {
    renderTab({ passwordEnabled: false });

    expect(screen.queryByRole('group', { name: 'Cobranças' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sem senha' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Cobranças' })).toBeInTheDocument();
  });

  it('com senha ligada, libera uma seção sem senha sem tocar nas demais', () => {
    const onSettingsChange = renderTab({ passwordEnabled: true });

    const osGroup = screen.getByRole('group', { name: 'Ordens de serviço' });
    // Default de toda seção visível = Com senha (nada livre).
    expect(osGroup.querySelector('[aria-pressed="true"]')).toHaveTextContent('Com senha');

    fireEvent.click(screen.getAllByRole('button', { name: 'Sem senha' })[0]);

    expect(onSettingsChange).toHaveBeenCalledWith({
      ...settings,
      passwordEnabled: true,
      permissions: { ...settings.permissions, service_orders: true },
      publicSections: { ...settings.publicSections, service_orders: true },
    });
  });

  it('com senha ligada, "Oculto" tira a seção do portal', () => {
    const onSettingsChange = renderTab({ passwordEnabled: true });

    const chargesGroup = screen.getByRole('group', { name: 'Cobranças' });
    fireEvent.click(
      Array.from(chargesGroup.querySelectorAll('button')).find(
        (button) => button.textContent === 'Oculto',
      )!,
    );

    expect(onSettingsChange).toHaveBeenCalledWith({
      ...settings,
      passwordEnabled: true,
      permissions: { ...settings.permissions, charges: false },
      publicSections: { ...settings.publicSections, charges: false },
    });
  });
});
