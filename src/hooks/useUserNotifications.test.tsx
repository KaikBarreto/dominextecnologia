import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserNotifications } from './useUserNotifications';

const mocks = vi.hoisted(() => {
  const rows = [
    {
      id: 'notification-1',
      user_id: 'user-1',
      company_id: 'company-1',
      event_id: 'event-1',
      type: 'billing.charge_paid',
      title: 'Pagamento recebido',
      message: 'Pagamento de R$ 250,00 recebido de Empresa Teste.',
      action_url: '/financeiro/cobrancas?charge=charge-1',
      icon: 'circle-dollar-sign',
      read_at: null,
      created_at: '2026-11-12T10:00:00.000Z',
      expires_at: null,
      category: 'finance',
      priority: 'high',
      entity_type: 'tenant_charge',
      entity_id: 'charge-1',
      dismissed_at: null,
      in_app_visible: true,
    },
  ];

  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockResolvedValue({ data: rows, error: null });

  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);

  const supabase = {
    from: vi.fn(() => query),
    rpc: vi.fn((name: string) => {
      if (name === 'count_unread_user_notifications') {
        return Promise.resolve({ data: 1, error: null });
      }
      return Promise.resolve({ data: true, error: null });
    }),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };

  return { channel, query, rows, supabase };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    profile: { company_id: 'company-1' },
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: mocks.supabase }));

describe('useUserNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
    mocks.query.is.mockReturnValue(mocks.query);
    mocks.query.order.mockReturnValue(mocks.query);
    mocks.query.limit.mockResolvedValue({ data: mocks.rows, error: null });
    mocks.channel.on.mockReturnValue(mocks.channel);
    mocks.channel.subscribe.mockReturnValue(mocks.channel);
  });

  it('carrega somente o feed visivel da empresa e assina atualizacoes do usuario', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result, unmount } = renderHook(() => useUserNotifications(), { wrapper });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    expect(result.current.notifications[0]).toMatchObject({
      type: 'billing.charge_paid',
      in_app_visible: true,
    });
    expect(result.current.unreadCount).toBe(1);
    expect(mocks.supabase.from).toHaveBeenCalledWith('user_notifications');
    expect(mocks.query.eq).toHaveBeenCalledWith('company_id', 'company-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('in_app_visible', true);
    expect(mocks.query.is).toHaveBeenCalledWith('dismissed_at', null);
    expect(mocks.supabase.rpc).toHaveBeenCalledWith('count_unread_user_notifications', {
      _company_id: 'company-1',
    });
    expect(mocks.supabase.channel).toHaveBeenCalledWith('user_notifications:user-1');
    expect(mocks.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'user_notifications', filter: 'user_id=eq.user-1' }),
      expect.any(Function),
    );

    unmount();
    expect(mocks.supabase.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });
});
