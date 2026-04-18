import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const PRIVATE_BUCKETS = ['employee-photos', 'time-photos', 'financial-receipts'] as const;
const SIGNED_TTL_SECONDS = 3600; // 1 hora

const cache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Extrai o bucket e path de uma URL pública/assinada do Supabase Storage.
 * Retorna null se não for uma URL de storage reconhecida.
 */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    // Formatos esperados:
    // /storage/v1/object/public/<bucket>/<path>
    // /storage/v1/object/sign/<bucket>/<path>?token=...
    const match = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return { bucket: match[1], path: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

/**
 * Resolve uma URL de storage. Se for de um bucket privado, gera signed URL com cache TTL.
 * Caso contrário, devolve a URL original.
 */
export async function resolveStorageUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const parsed = parseStorageUrl(url);
  if (!parsed) return url;
  if (!PRIVATE_BUCKETS.includes(parsed.bucket as any)) return url;

  const cacheKey = `${parsed.bucket}/${parsed.path}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, SIGNED_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.warn('Falha ao gerar signed URL', parsed.bucket, error?.message);
    return null;
  }

  cache.set(cacheKey, {
    url: data.signedUrl,
    // Expira 60s antes do TTL real para evitar uso de URL prestes a expirar
    expiresAt: Date.now() + (SIGNED_TTL_SECONDS - 60) * 1000,
  });
  return data.signedUrl;
}

/**
 * Hook React para resolver assincronamente uma URL de storage (gera signed URL se necessário).
 */
export function useSignedUrl(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(url ?? null);

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setResolved(null);
      return;
    }
    resolveStorageUrl(url).then((value) => {
      if (!cancelled) setResolved(value);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return resolved;
}
