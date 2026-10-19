import { supabase } from '@/integrations/supabase/client';
import { zonedDateTimeToUtc } from '@/lib/timezone';
import type { ServiceOrderScheduleSlot } from '@/types/database';

// Nome do RPC centralizado: componentes e hooks não dependem do contrato SQL.
const BOOK_SERVICE_ORDER_RPC = 'schedule_book_service_order';

export type ScheduleResourceType = 'technician' | 'team';

export interface ScheduleConflictItem {
  service_order_id: string;
  order_number?: number | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  duration_minutes?: number | null;
  assignee_names?: string[];
}

export interface ScheduleBookingOverride {
  schedule_override?: boolean;
  schedule_override_reason?: string;
  /** ID client-side preservado entre tentativa normal e override/retry da UI. */
  schedule_request_id?: string;
}

export class ScheduleConflictError extends Error {
  readonly conflicts: ScheduleConflictItem[];

  constructor(conflicts: ScheduleConflictItem[] = []) {
    super('Já existe outro atendimento nesse horário para o responsável selecionado.');
    this.name = 'ScheduleConflictError';
    this.conflicts = conflicts;
  }
}

interface DatabaseErrorLike {
  code?: string;
  message?: string;
  details?: string;
}

function isConflictDatabaseError(error: DatabaseErrorLike | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return text.includes('public_api_schedule_conflict') || text.includes('schedule_conflict');
}

export function normalizeScheduleBookingError(error: unknown): unknown {
  if (error && typeof error === 'object' && isConflictDatabaseError(error as DatabaseErrorLike)) {
    return new ScheduleConflictError();
  }
  return error;
}

function assertOverrideReason(input: ScheduleBookingOverride) {
  if (input.schedule_override && (input.schedule_override_reason?.trim().length ?? 0) < 10) {
    throw new Error('A justificativa do conflito deve ter pelo menos 10 caracteres.');
  }
}

export interface BookServiceOrderScheduleInput extends ScheduleBookingOverride {
  service_order_id: string;
  resource_type: ScheduleResourceType;
  resource_id: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  schedule_plan?: ServiceOrderScheduleSlot[];
  timezone: string;
}

/**
 * Reserva/reagenda uma OS atomicamente. O RPC atualiza a data/hora/duração e o
 * responsável direto na mesma transação que trava e sincroniza a reserva.
 */
export async function bookServiceOrderSchedule(input: BookServiceOrderScheduleInput): Promise<void> {
  assertOverrideReason(input);
  const plan = input.schedule_plan?.length ? input.schedule_plan : null;
  const firstSlot = plan?.[0];
  const scheduledDate = firstSlot?.date ?? input.scheduled_date;
  const scheduledTime = firstSlot?.time ?? input.scheduled_time;
  const durationMinutes = firstSlot?.duration_minutes ?? input.duration_minutes;
  const startsAt = zonedDateTimeToUtc(scheduledDate, scheduledTime, input.timezone);
  const endsAt = new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString();

  const overrideJustification = input.schedule_override
    ? input.schedule_override_reason?.trim() || null
    : null;
  const rpcName = plan
    ? 'schedule_book_service_order_plan'
    : BOOK_SERVICE_ORDER_RPC;
  const rpcArgs = plan
    ? {
        p_service_order_id: input.service_order_id,
        p_resource_type: input.resource_type,
        p_resource_id: input.resource_id,
        p_starts_at: startsAt,
        p_schedule_plan: plan,
        p_override_justification: overrideJustification,
      }
    : {
        p_service_order_id: input.service_order_id,
        p_resource_type: input.resource_type,
        p_resource_id: input.resource_id,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
        p_override_justification: overrideJustification,
      };

  const { error } = await supabase.rpc(rpcName as never, rpcArgs as never);

  if (error) {
    throw normalizeScheduleBookingError(error);
  }
}

export function isScheduleConflictError(error: unknown): error is ScheduleConflictError {
  return error instanceof ScheduleConflictError;
}
