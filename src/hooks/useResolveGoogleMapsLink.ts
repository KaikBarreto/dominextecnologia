import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Encapsula a chamada à edge function `resolve-google-maps-link`.
 *
 * Recebe um link do Google Maps (ex: https://maps.app.goo.gl/...) e devolve
 * o link de avaliação direto (write review) e o placeId.
 *
 * Contrato da edge:
 *   Sucesso: { reviewUrl: string, placeId: string }
 *   Erro:    { error: 'invalid_url' | 'no_feature_id' | 'unauthorized' }
 */

export type ResolveGoogleMapsError = 'invalid_url' | 'no_feature_id' | 'unauthorized' | 'unknown';

export interface ResolveGoogleMapsResult {
  reviewUrl: string;
  placeId: string;
}

export function useResolveGoogleMapsLink() {
  const [isResolving, setIsResolving] = useState(false);

  async function resolve(url: string): Promise<ResolveGoogleMapsResult> {
    setIsResolving(true);
    try {
      const { data, error } = await supabase.functions.invoke<
        ResolveGoogleMapsResult | { error: ResolveGoogleMapsError }
      >('resolve-google-maps-link', { body: { url } });

      if (error) {
        let code: ResolveGoogleMapsError = 'unknown';
        const ctx = (error as { context?: unknown }).context;
        const responseObj = ctx instanceof Response
          ? ctx
          : (typeof (ctx as { json?: unknown })?.json === 'function' ? ctx as Response : null);
        if (responseObj) {
          try {
            const body = await responseObj.clone().json();
            if (body?.error) code = body.error as ResolveGoogleMapsError;
          } catch { /* mantém 'unknown' */ }
        }
        throw { code };
      }

      if (!data) {
        throw { code: 'unknown' as ResolveGoogleMapsError };
      }

      // Tipa como erro se tiver a chave `error`
      if ('error' in data) {
        throw { code: data.error as ResolveGoogleMapsError };
      }

      return data as ResolveGoogleMapsResult;
    } finally {
      setIsResolving(false);
    }
  }

  return { resolve, isResolving };
}
