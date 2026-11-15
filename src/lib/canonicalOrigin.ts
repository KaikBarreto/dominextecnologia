import { CANONICAL_APP_ORIGIN, LEGACY_APP_HOSTNAME } from '@/config/site';

const LEGACY_CLEANUP_TIMEOUT_MS = 1_500;

type ServiceWorkerContainerLike = Pick<ServiceWorkerContainer, 'getRegistrations'>;
type CacheStorageLike = Pick<CacheStorage, 'keys' | 'delete'>;

interface CanonicalOriginRuntime {
  href: string;
  replace: (url: string) => void;
  serviceWorker?: ServiceWorkerContainerLike;
  cacheStorage?: CacheStorageLike;
  timeoutMs?: number;
}

/**
 * Preserva rota, query e hash ao migrar a origem legada para a origem canônica.
 * Outros domínios (localhost, previews e white-label futuro) ficam intocados.
 */
export function getCanonicalRedirectUrl(href: string): string | null {
  const current = new URL(href);
  if (current.hostname !== LEGACY_APP_HOSTNAME) return null;

  return `${CANONICAL_APP_ORIGIN}${current.pathname}${current.search}${current.hash}`;
}

async function clearLegacyRuntime(
  serviceWorker?: ServiceWorkerContainerLike,
  cacheStorage?: CacheStorageLike,
): Promise<void> {
  const cleanupTasks: Promise<unknown>[] = [];

  if (serviceWorker) {
    cleanupTasks.push(
      serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      ),
    );
  }

  if (cacheStorage) {
    cleanupTasks.push(
      cacheStorage.keys().then((keys) =>
        Promise.all(keys.map((key) => cacheStorage.delete(key))),
      ),
    );
  }

  await Promise.allSettled(cleanupTasks);
}

/**
 * Remove os artefatos PWA da origem antiga antes de sair dela. Há timeout para
 * nenhum navegador ficar preso caso Safari/CacheStorage não responda.
 */
export async function normalizeCanonicalOrigin(
  runtime: CanonicalOriginRuntime = {
    href: window.location.href,
    replace: (url) => window.location.replace(url),
    serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    cacheStorage: 'caches' in window ? window.caches : undefined,
  },
): Promise<boolean> {
  const target = getCanonicalRedirectUrl(runtime.href);
  if (!target) return false;

  const timeoutMs = runtime.timeoutMs ?? LEGACY_CLEANUP_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(resolve, timeoutMs);
  });

  await Promise.race([
    clearLegacyRuntime(runtime.serviceWorker, runtime.cacheStorage),
    timeout,
  ]);
  if (timeoutId !== undefined) clearTimeout(timeoutId);

  runtime.replace(target);
  return true;
}
