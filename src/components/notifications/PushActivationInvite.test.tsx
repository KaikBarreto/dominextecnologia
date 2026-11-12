import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PushActivationInvite } from './PushActivationInvite';

const enable = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    profile: { company_id: 'company-1' },
    isAdminUser: false,
  }),
}));

vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    support: 'supported',
    state: 'available',
    isLoading: false,
    isPending: false,
    enable,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('PushActivationInvite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    window.localStorage.clear();
    enable.mockResolvedValue('subscribed');
  });

  it('convida para ativar sem abrir a permissão automaticamente', async () => {
    render(<PushActivationInvite />);
    expect(enable).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(1_800));
    expect(screen.getByText('Não perca nenhum aviso importante')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ativar notificações' }));
    await act(async () => Promise.resolve());
    expect(enable).toHaveBeenCalledTimes(1);
  });

  it('respeita o adiamento por sete dias neste aparelho', async () => {
    const first = render(<PushActivationInvite />);
    await act(async () => vi.advanceTimersByTime(1_800));
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    first.unmount();

    render(<PushActivationInvite />);
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(screen.queryByText('Não perca nenhum aviso importante')).not.toBeInTheDocument();
  });
});
