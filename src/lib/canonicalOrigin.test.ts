import { describe, expect, it, vi } from 'vitest';
import { getCanonicalRedirectUrl, normalizeCanonicalOrigin } from './canonicalOrigin';

describe('getCanonicalRedirectUrl', () => {
  it('preserva rota, query e hash ao migrar dominex.app para www', () => {
    expect(
      getCanonicalRedirectUrl('https://dominex.app/os-tecnico/abc?modo=cliente#detalhes'),
    ).toBe('https://www.dominex.app/os-tecnico/abc?modo=cliente#detalhes');
  });

  it.each([
    'https://www.dominex.app/dashboard',
    'https://preview.dominex.app/dashboard',
    'http://localhost:8080/dashboard',
  ])('não altera uma origem válida: %s', (href) => {
    expect(getCanonicalRedirectUrl(href)).toBeNull();
  });
});
describe('normalizeCanonicalOrigin', () => {
  it('remove Service Workers e caches legados antes de redirecionar', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const deleteCache = vi.fn().mockResolvedValue(true);
    const replace = vi.fn();

    const redirected = await normalizeCanonicalOrigin({
      href: 'https://dominex.app/dashboard?aba=agenda',
      replace,
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
      } as unknown as ServiceWorkerContainer,
      cacheStorage: {
        keys: vi.fn().mockResolvedValue(['workbox-precache-v1']),
        delete: deleteCache,
      },
      timeoutMs: 100,
    });

    expect(redirected).toBe(true);
    expect(unregister).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledWith('workbox-precache-v1');
    expect(replace).toHaveBeenCalledWith(
      'https://www.dominex.app/dashboard?aba=agenda',
    );
  });

  it('não limpa nem redireciona quando já está na origem canônica', async () => {
    const getRegistrations = vi.fn();
    const replace = vi.fn();

    const redirected = await normalizeCanonicalOrigin({
      href: 'https://www.dominex.app/dashboard',
      replace,
      serviceWorker: { getRegistrations } as unknown as ServiceWorkerContainer,
    });

    expect(redirected).toBe(false);
    expect(getRegistrations).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redireciona mesmo quando a limpeza do navegador falha', async () => {
    const replace = vi.fn();

    await normalizeCanonicalOrigin({
      href: 'https://dominex.app/',
      replace,
      serviceWorker: {
        getRegistrations: vi.fn().mockRejectedValue(new Error('Safari indisponível')),
      } as unknown as ServiceWorkerContainer,
      timeoutMs: 100,
    });

    expect(replace).toHaveBeenCalledWith('https://www.dominex.app/');
  });
});
