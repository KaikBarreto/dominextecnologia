import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Settings from './Settings';

const useCompanySettingsMock = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasScreenAccess: () => false,
    hasRole: () => false,
    hasPermission: (key: string) => key === 'fn:manage_settings',
    hasPermissionRecord: true,
    isAdminOrGestor: () => false,
  }),
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', timezone: 'America/Sao_Paulo' }),
}));

vi.mock('@/hooks/useCompanySettings', () => ({ useCompanySettings: useCompanySettingsMock }));
vi.mock('@/components/settings/notifications/NotificationSettingsContent', () => ({
  NotificationSettingsContent: ({ canManageRules }: { canManageRules: boolean }) => (
    <div data-testid="personal-notifications">{canManageRules ? 'pode-gerenciar' : 'somente-pessoal'}</div>
  ),
}));

describe('Settings em modo pessoal', () => {
  it('não monta hooks administrativos e preserva permissão explícita das regras', () => {
    render(<Settings />);
    expect(screen.getByTestId('personal-notifications')).toHaveTextContent('pode-gerenciar');
    expect(useCompanySettingsMock).not.toHaveBeenCalled();
  });
});
