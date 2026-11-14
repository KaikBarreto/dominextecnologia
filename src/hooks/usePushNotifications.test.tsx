import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMocks = vi.hoisted(() => ({
  enablePushNotifications: vi.fn(),
  getPushPermissionState: vi.fn(),
  listPushDevices: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { company_id: 'company-1' } }),
}));

vi.mock('@/lib/pushNotifications', () => ({
  disablePushNotifications: vi.fn(),
  deactivatePushDevice: vi.fn(),
  enablePushNotifications: pushMocks.enablePushNotifications,
  getPushPermissionState: pushMocks.getPushPermissionState,
  listPushDevices: pushMocks.listPushDevices,
  supportsWebPush: () => true,
}));

import { usePushNotifications } from './usePushNotifications';

describe('usePushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'granted' },
    });
  });

  it('não transforma ativação concluída em erro se a lista de aparelhos atrasar', async () => {
    pushMocks.getPushPermissionState.mockResolvedValue('available');
    pushMocks.enablePushNotifications.mockResolvedValue('subscribed');
    pushMocks.listPushDevices
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.enable()).resolves.toBe('subscribed');
    });

    expect(result.current.state).toBe('subscribed');
    expect(result.current.isPending).toBe(false);
  });
});
