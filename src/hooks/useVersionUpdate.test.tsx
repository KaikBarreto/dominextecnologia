import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_VERSION } from '@/config/version';
import { useVersionUpdate } from './useVersionUpdate';

describe('useVersionUpdate', () => {
  beforeEach(() => window.localStorage.clear());

  it('não consome a novidade antes de ela realmente vencer a fila', async () => {
    window.localStorage.setItem('app_version', '1.39.33');
    const first = renderHook(() => useVersionUpdate());

    await waitFor(() => expect(first.result.current.showUpdateNotification).toBe(true));
    expect(window.localStorage.getItem('notification_shown_version')).toBeNull();
    expect(window.localStorage.getItem('app_version')).toBe('1.39.33');

    // Se outro overlay ainda estava à frente e a página recarregou, a novidade
    // continua pendente em vez de desaparecer sem nunca ter sido vista.
    first.unmount();
    const second = renderHook(() => useVersionUpdate());
    await waitFor(() => expect(second.result.current.showUpdateNotification).toBe(true));

    act(() => second.result.current.markNotificationShown());
    expect(window.localStorage.getItem('notification_shown_version')).toBe(APP_VERSION);
    expect(window.localStorage.getItem('app_version')).toBe(APP_VERSION);
  });
});
