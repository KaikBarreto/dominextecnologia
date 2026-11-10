import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface QuoteNumberReservation {
  id: string;
  number: number;
  expiresAt: number;
}

interface Options {
  companyId?: string | null;
  userId?: string | null;
  requestId?: string | null;
  isOpen: boolean;
  isEditing?: boolean;
  enabled?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESERVATION_ERROR = 'Não foi possível reservar o número do orçamento. Tente novamente.';
const CONFIRMATION_ERROR = 'Não foi possível confirmar o número do orçamento. Tente novamente.';
const TIMEOUT_ERROR = 'A reserva do número demorou mais que o esperado. Tente novamente.';
const EXPIRED_ERROR = 'A reserva do número expirou. Gere outro número para continuar.';
const CONSUMED_ERROR = 'Este número já foi usado. Confira o orçamento salvo na lista antes de gerar outro número.';
export type QuoteNumberReservationErrorKind = 'expired' | 'consumed' | 'unavailable' | 'invalid_response';
class ReservationError extends Error {
  constructor(message: string, readonly kind: QuoteNumberReservationErrorKind) { super(message); }
}
const normalizeId = (value: string | null | undefined) => value && UUID.test(value) ? value.toLowerCase() : null;

function parseReservation(data: unknown): QuoteNumberReservation | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const result = data as Record<string, unknown>;
  const id = typeof result.reservation_id === 'string' ? normalizeId(result.reservation_id) : null;
  const number = result.quote_number;
  const expiresAt = typeof result.expires_at === 'string' ? Date.parse(result.expires_at) : NaN;
  if (!id || typeof number !== 'number' || !Number.isSafeInteger(number) || number <= 0
      || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return { id, number, expiresAt };
}

/**
 * Reserva confirmada pelo servidor. A chave inclui as duas identidades e o
 * requestId persistido no rascunho: nunca calcula MAX+1 nem usa número offline.
 */
export function useQuoteNumberReservation(options: Options) {
  const [expiryTick, setExpiryTick] = useState(0);
  const companyId = normalizeId(options.companyId);
  const userId = normalizeId(options.userId);
  const requestId = normalizeId(options.requestId);
  const active = options.isOpen && !options.isEditing && options.enabled !== false
    && !!companyId && !!userId && !!requestId;

  const query = useQuery({
    queryKey: ['quote-number-reservation', companyId, userId, requestId],
    enabled: active,
    // Um remount imediato do StrictMode reaproveita a mesma promise/resultado.
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
    queryFn: async (): Promise<QuoteNumberReservation> => {
      if (!companyId || !userId || !requestId) throw new ReservationError(RESERVATION_ERROR, 'unavailable');
      const abort = new AbortController();
      let timeout: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          abort.abort();
          reject(new ReservationError(TIMEOUT_ERROR, 'unavailable'));
        }, 10_000);
      });
      try {
        // O signal pertence ao deadline, não ao observer React. Um cleanup do
        // StrictMode não cancela para depois disparar uma reserva duplicada;
        // a resposta fica apenas na chave de origem, oculta após fechar/trocar.
        const { data, error } = await Promise.race([supabase.rpc('reserve_quote_number', {
          p_company_id: companyId,
          p_user_id: userId,
          p_request_id: requestId,
        }).abortSignal(abort.signal), deadline]);
        if (error?.code === 'QNR02') throw new ReservationError(EXPIRED_ERROR, 'expired');
        if (error?.code === 'QNR03') throw new ReservationError(CONSUMED_ERROR, 'consumed');
        if (error) throw new ReservationError(abort.signal.aborted ? TIMEOUT_ERROR : RESERVATION_ERROR, 'unavailable');
        const reservation = parseReservation(data);
        if (!reservation || reservation.id !== requestId) throw new ReservationError(CONFIRMATION_ERROR, 'invalid_response');
        return reservation;
      } catch (error) {
        if (abort.signal.aborted) throw new ReservationError(TIMEOUT_ERROR, 'unavailable');
        if (error instanceof ReservationError) throw error;
        // SQLSTATE, tabela, constraint e payload do servidor nunca vão para a UI.
        throw new ReservationError(RESERVATION_ERROR, 'unavailable');
      } finally {
        clearTimeout(timeout!);
      }
    },
  });

  const { refetch } = query;
  useEffect(() => {
    if (!active || !query.data) return;
    const remaining = query.data.expiresAt - Date.now();
    if (remaining <= 0) return;
    // Timers do navegador têm teto de ~24 dias. Reagenda em blocos para que
    // uma aba suspensa/aberta por muito tempo não anuncie uma reserva vencida.
    const timer = setTimeout(() => setExpiryTick(tick => tick + 1), Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [active, query.data, expiryTick]);
  const retry = useCallback(async () => {
    if (active) await refetch();
  }, [active, refetch]);
  const expired = !!query.data && query.data.expiresAt <= Date.now();
  return {
    reservation: active && !query.isFetching && !query.isError && !expired ? query.data ?? null : null,
    isLoading: active && query.isFetching,
    error: active ? expired ? EXPIRED_ERROR : query.error?.message ?? null : null,
    errorKind: active ? expired ? 'expired' as const : query.error instanceof ReservationError ? query.error.kind : null : null,
    retry,
  };
}
