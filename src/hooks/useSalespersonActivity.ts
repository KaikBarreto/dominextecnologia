// ─────────────────────────────────────────────────────────────────────────────
// useSalespersonActivity — fronteira do Supabase pro Diário Comercial.
//
// O diário é o registro, por DIA e por PERÍODO (manhã/tarde), de quantos
// contatos/prospecções o vendedor fez, quantas reuniões agendou, quantas
// realizou e quantas vendas fechou.
//
// ⚠️ A trava de retroativo NÃO está aqui. Ela vive na RLS de
// `public.salesperson_daily_activity`: o vendedor só consegue INSERT/UPDATE com
// `activity_date = public.brt_today()`. Este hook espelha a regra na UX (botão
// desabilitado, aviso) pra ele não tomar erro de banco na cara — mas quem
// garante é o banco. Admin master (`is_super_admin`) escreve qualquer data, e é
// a válvula de escape pra corrigir dia esquecido.
//
// Privacidade: a RLS devolve ao vendedor SÓ as linhas dele, e o espelho
// completo exige `admin_vendedores_ver_todos`. Ou seja, `useAllSalespersonActivity`
// é seguro de chamar — o banco apara o resultado, não a UI.
//
// Agregação (totais, funil, dias sem registro, aderência à meta) mora em
// `@/utils/salespersonActivityStats`, fora deste arquivo, pra que a ficha do
// vendedor e o espelho da listagem somem exatamente igual.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import { toast } from 'sonner';
import { brtToday } from '@/lib/date-br';
import type { ActivityPeriod } from '@/utils/activityArtFormat';
import type { DailyActivityRow } from '@/utils/salespersonActivityStats';

export type { ActivityPeriod, DailyActivityRow };

/** Rótulo PT-BR do período. O painel Auctus é PT-BR only (decisão do CEO),
 * então não há chave de i18n aqui de propósito. */
export const ACTIVITY_PERIOD_LABEL: Record<ActivityPeriod, string> = {
  morning: 'Manhã',
  afternoon: 'Tarde',
};

export const ACTIVITY_PERIODS: ActivityPeriod[] = ['morning', 'afternoon'];

/** Rótulo PT-BR de cada contador — fonte única pra tabela, card e gráfico. */
export const ACTIVITY_METRIC_LABEL = {
  contacts: 'Contatos / Prospecções',
  meetings_scheduled: 'Reuniões agendadas',
  meetings_held: 'Reuniões realizadas',
  sales_count: 'Vendas',
} as const;

/** Metas diárias travadas pelo CEO (2026-10-02). São só o DEFAULT do banco —
 * cada vendedor pode ter a própria régua em `salespeople`. */
export const DEFAULT_DAILY_GOAL_CONTACTS = 200;
export const DEFAULT_DAILY_GOAL_MEETINGS_SCHEDULED = 5;

const TABLE = 'salesperson_daily_activity';

/** Chave do unique no banco — é o `onConflict` do upsert. */
const CONFLICT_TARGET = 'salesperson_id,activity_date,period';

// ─────────────────────────────────────────────────────────────────────────────
// Leitura
// ─────────────────────────────────────────────────────────────────────────────

/** Diário de UM vendedor, mais recente primeiro. */
export function useSalespersonActivity(salespersonId: string | undefined) {
  return useQuery({
    queryKey: ['salesperson_daily_activity', salespersonId],
    enabled: !!salespersonId,
    queryFn: async () => {
      if (!salespersonId) return [];
      return await fetchAllPaginated<DailyActivityRow>(() =>
        supabase
          .from(TABLE)
          .select('*')
          .eq('salesperson_id', salespersonId)
          .order('activity_date', { ascending: false })
          .order('period', { ascending: true }),
      );
    },
  });
}

/**
 * Diário de TODOS os vendedores visíveis ao usuário — alimenta o espelho da
 * listagem. Quem não tem `admin_vendedores_ver_todos` recebe só as próprias
 * linhas (aparo da RLS, não da UI).
 */
export function useAllSalespersonActivity(enabled = true) {
  return useQuery({
    queryKey: ['all_salesperson_daily_activity'],
    enabled,
    queryFn: async () => {
      return await fetchAllPaginated<DailyActivityRow>(() =>
        supabase.from(TABLE).select('*').order('activity_date', { ascending: false }),
      );
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Escrita
// ─────────────────────────────────────────────────────────────────────────────

export interface UpsertDailyActivityPayload {
  salesperson_id: string;
  /** 'yyyy-MM-dd'. Para o vendedor, o banco só aceita o dia de hoje em BRT. */
  activity_date: string;
  period: ActivityPeriod;
  contacts: number;
  meetings_scheduled: number;
  meetings_held: number;
  sales_count: number;
  notes?: string | null;
}

/** Mensagem de erro da RLS de retroativo, em PT-BR. Código `42501` (ou o
 * `new row violates row-level security policy` do PostgREST) nesta tabela quer
 * dizer uma coisa só: tentou gravar dia que não é hoje, ou de outro vendedor. */
function friendlyActivityError(error: unknown): string {
  const message = String((error as { message?: string })?.message ?? '');
  const code = String((error as { code?: string })?.code ?? '');
  if (code === '42501' || /row-level security/i.test(message)) {
    return 'Registro permitido somente no próprio dia. Dia anterior não pode mais ser alterado.';
  }
  return message || 'Erro ao salvar o registro do período.';
}

/**
 * Cria ou atualiza o registro de um período. UPSERT no unique
 * (salesperson_id, activity_date, period) — salvar duas vezes o mesmo período
 * corrige o valor em vez de duplicar a linha.
 *
 * Idempotente de propósito: o botão "Salvar período" pode ser apertado duas
 * vezes (conexão ruim, PWA) sem inflar os números.
 */
export function useUpsertDailyActivity() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpsertDailyActivityPayload) => {
      const user = (await supabase.auth.getUser()).data.user;

      const { data, error } = await supabase
        .from(TABLE)
        .upsert(
          {
            salesperson_id: payload.salesperson_id,
            activity_date: payload.activity_date,
            period: payload.period,
            contacts: payload.contacts,
            meetings_scheduled: payload.meetings_scheduled,
            meetings_held: payload.meetings_held,
            sales_count: payload.sales_count,
            notes: payload.notes?.trim() ? payload.notes.trim() : null,
            created_by: user?.id ?? null,
          } as never,
          { onConflict: CONFLICT_TARGET },
        )
        .select()
        .single();

      if (error) throw error;
      return data as unknown as DailyActivityRow;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['salesperson_daily_activity', variables.salesperson_id] });
      qc.invalidateQueries({ queryKey: ['all_salesperson_daily_activity'] });
      toast.success(`${ACTIVITY_PERIOD_LABEL[variables.period]} registrada`);
    },
    onError: (error: unknown) => toast.error(friendlyActivityError(error)),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Regra de "pode editar?"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Espelha a RLS na UX: só o admin master escreve dia que não é hoje.
 *
 * ⚠️ Chame com `brtToday()` recalculado no render, nunca com data guardada em
 * estado — na virada da meia-noite BRT o valor velho discordaria da RLS e o
 * vendedor tomaria erro de banco num botão que a UI deixou habilitado.
 */
export function canEditActivityDate(dateKey: string, isMaster: boolean): boolean {
  return isMaster || dateKey === brtToday();
}
