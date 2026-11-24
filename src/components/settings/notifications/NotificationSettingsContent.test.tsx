import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationSettingsContent } from './NotificationSettingsContent';

const updateRule = vi.fn();
const updatePreference = vi.fn();
const updateQuietHours = vi.fn();
const useIsMobileMock = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/hooks/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    companyId: 'empresa-1', rules: [], preferences: [], isLoading: false, error: null,
    updateRule, updatePreference, updateQuietHours, isSavingRule: false, isSavingPreference: false,
  }),
}));

vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    state: 'available', isSubscribed: false, isLoading: false, isPending: false, devices: [],
    enable: vi.fn(), disable: vi.fn(), disableDevice: vi.fn(),
  }),
}));

vi.mock('@/hooks/useProfiles', () => ({
  useActiveCompanyProfiles: () => ({ isLoading: false, data: [] }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: useIsMobileMock }));
vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ timezone: 'America/Sao_Paulo' }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
  observe() { return undefined; }
  unobserve() { return undefined; }
  disconnect() { return undefined; }
});
describe('NotificationSettingsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useIsMobileMock.mockReturnValue(false);
  });

  it('não mostra regras da empresa para quem só pode editar as próprias preferências', () => {
    render(<NotificationSettingsContent canManageRules={false} />);
    expect(screen.getByText('Minhas notificações')).toBeInTheDocument();
    expect(screen.queryByText('Regras da empresa')).not.toBeInTheDocument();
    expect(screen.getByText('Push neste aparelho')).toBeInTheDocument();
  });

  it('abre o detalhe contextual de uma regra para gestores', () => {
    render(<NotificationSettingsContent canManageRules />);
    fireEvent.click(screen.getByText('Regras da empresa'));
    expect(screen.getByText('Selecione um aviso')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Compromissos do dia'));
    expect(screen.getByText('Quem recebe')).toBeInTheDocument();
    expect(screen.getByText('Responsáveis padrão')).toBeInTheDocument();
  });

  it('no celular troca a lista pelo detalhe e oferece retorno', () => {
    useIsMobileMock.mockReturnValue(true);
    render(<NotificationSettingsContent canManageRules />);
    fireEvent.click(screen.getByText('Regras da empresa'));
    fireEvent.click(screen.getByText('Cobrança paga'));
    expect(screen.getByText('Voltar aos avisos')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Buscar aviso')).not.toBeInTheDocument();
  });
});
