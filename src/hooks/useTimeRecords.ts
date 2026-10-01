import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { dateInTz, timeInTz, todayInTz } from '@/lib/timezone';
import { getErrorMessage } from '@/utils/errorMessages';
import { MESSAGES } from '@/lib/i18n/messages';
import type { LocaleCode } from '@/lib/i18n/locales';

// ─── Types ───────────────────────────────────────────
export type PunchType = 'clock_in' | 'break_start' | 'break_end' | 'clock_out';
export type SheetStatus = 'open' | 'complete' | 'incomplete' | 'justified' | 'holiday' | 'day_off';

export interface TimeRecord {
  id: string;
  company_id: string;
  user_id: string | null;
  employee_id: string | null;
  date: string;
  type: PunchType;
  recorded_at: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  photo_url: string | null;
  device_info: any;
  source: string;
  notes: string | null;
  is_valid: boolean;
  created_at: string;
  edited_at: string | null;
  edited_by: string | null;
  original_recorded_at: string | null;
  invalidated_at: string | null;
  invalidated_by: string | null;
}

export interface TimeSheet {
  id: string;
  company_id: string;
  user_id: string | null;
  employee_id: string | null;
  date: string;
  first_clock_in: string | null;
  last_clock_out: string | null;
  total_worked_min: number | null;
  total_break_min: number | null;
  expected_min: number | null;
  balance_min: number | null;
  status: SheetStatus;
  justified_by: string | null;
  justification: string | null;
  created_at: string;
}

export interface TimeSettings {
  id: string;
  company_id: string;
  default_in: string;
  default_out: string;
  default_break_min: number;
  require_selfie: boolean;
  require_geolocation: boolean;
  kiosk_require_face: boolean;
  max_radius_meters: number;
  allow_off_hours: boolean;
  late_tolerance_min: number;
  // Batida feita ANTES desta hora, havendo jornada aberta do dia anterior,
  // pertence ao dia anterior — é a jornada noturna que cruza a meia-noite
  // (migration 20260930150000_ponto_multiplas_jornadas.sql). Quem decide de
  // fato é `resolve_punch_day` no banco; aqui é só a régua que o gestor edita.
  overnight_until: string;
}

export interface TimeSchedule {
  id: string;
  company_id: string;
  user_id: string | null;
  employee_id: string | null;
  weekday: number;
  expected_in: string;
  expected_out: string;
  break_minutes: number;
  is_work_day: boolean;
}

export interface EmployeeBasic {
  id: string;
  name: string;
  position: string | null;
  photo_url: string | null;
  is_active: boolean;
}

// ─── Dia canônico da batida ───
// `todayInTz`, `dateInTz` e `timeInTz` moram em `@/lib/timezone` (uma
// implementação só, reusada aqui e no export do espelho). O dia e a hora do
// ponto seguem o fuso da EMPRESA, nunca o do aparelho. O porquê está lá.

// ─── Helper: traduz os erros das RPCs de batida ───
//
// `register_time_punch` e `register_time_punch_service` levantam exceção com o
// CÓDIGO no texto da mensagem (`punch_out_of_order`, `forbidden_force_date`,
// ...). Mostrar esse texto cru pro gestor é mostrar jargão de banco; mostrar o
// genérico esconde a causa. Este mapa resolve os dois problemas, nos 4 idiomas.
const PUNCH_ERROR_CODES = [
  'punch_out_of_order',
  'punch_invalid_type',
  'punch_missing_identity',
  'company_not_found',
  'employee_not_linked',
  'employee_not_in_company',
  'not_authenticated',
  'forbidden_force_date',
  // `forbidden` é PREFIXO de `forbidden_force_date`: tem que vir DEPOIS, senão
  // a batida em outra data mostraria a mensagem errada.
  'forbidden',
] as const;

export function punchErrorMessage(err: unknown, locale: LocaleCode): string {
  const dict = MESSAGES[locale].app.employees.timeclock.punchErrors;
  const raw = typeof err === 'string'
    ? err
    : (err as { message?: string } | null)?.message ?? '';
  for (const code of PUNCH_ERROR_CODES) {
    if (raw.includes(code)) return dict[code];
  }
  // Não é erro conhecido da RPC: cai no tradutor genérico do app (constraint,
  // rede, RLS), e só então na mensagem genérica de ponto.
  return getErrorMessage(err) || dict.generic;
}

// ─── Helper: calculate worked minutes from records ───
export function calculateWorkedMinutes(records: TimeRecord[]): { worked: number; breakMin: number } {
  const sorted = [...records].filter(r => r.is_valid).sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );

  let worked = 0;
  let breakMin = 0;
  let lastWorkStart: Date | null = null;
  let lastBreakStart: Date | null = null;

  for (const rec of sorted) {
    const t = new Date(rec.recorded_at);
    if (rec.type === 'clock_in') {
      lastWorkStart = t;
    } else if (rec.type === 'break_start' && lastWorkStart) {
      worked += (t.getTime() - lastWorkStart.getTime()) / 60000;
      lastWorkStart = null;
      lastBreakStart = t;
    } else if (rec.type === 'break_end') {
      if (lastBreakStart) breakMin += (t.getTime() - lastBreakStart.getTime()) / 60000;
      lastBreakStart = null;
      lastWorkStart = t;
    } else if (rec.type === 'clock_out' && lastWorkStart) {
      worked += (t.getTime() - lastWorkStart.getTime()) / 60000;
      lastWorkStart = null;
    }
  }

  // If still working (no clock_out yet), count up to now
  if (lastWorkStart) {
    worked += (Date.now() - lastWorkStart.getTime()) / 60000;
  }
  if (lastBreakStart) {
    breakMin += (Date.now() - lastBreakStart.getTime()) / 60000;
  }

  return { worked: Math.round(worked), breakMin: Math.round(breakMin) };
}

export function formatMinutes(min: number): string {
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  const sign = min < 0 ? '-' : '';
  return `${sign}${h}h${String(m).padStart(2, '0')}min`;
}

// ─── useWorkedMinutes ───
export function useWorkedMinutes(records: TimeRecord[]) {
  const [minutes, setMinutes] = useState(0);
  useEffect(() => {
    const calc = () => setMinutes(calculateWorkedMinutes(records).worked);
    calc();
    const iv = setInterval(calc, 30000);
    return () => clearInterval(iv);
  }, [records]);
  return minutes;
}

// ─── useTimeRecord (for technician — still uses user_id) ───
export function useTimeRecord(userId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Fuso da EMPRESA, não do aparelho. Entra na queryKey, no filtro `date` e no
  // path da selfie, sempre o mesmo valor.
  const { locale, timezone } = useAppLocaleContext();
  const clockDay = todayInTz(timezone);

  // Empresa + funcionário vinculado: a RPC do dia da jornada e a das ações
  // permitidas precisam dos dois. Uma consulta só, cacheada.
  const { data: punchIdentity } = useQuery({
    queryKey: ['punchIdentity', userId],
    queryFn: async () => {
      if (!userId) return null;
      const [{ data: profile }, { data: linkedEmployee }] = await Promise.all([
        supabase.from('profiles').select('company_id').eq('user_id', userId).maybeSingle(),
        supabase.from('employees').select('id').eq('user_id', userId).maybeSingle(),
      ]);
      return {
        companyId: (profile?.company_id as string | null) ?? null,
        employeeId: (linkedEmployee?.id as string | null) ?? null,
      };
    },
    enabled: !!userId,
  });

  // ─── DIA DA JORNADA, não dia do calendário ───
  // `resolve_punch_day` devolve o dia ANTERIOR quando há jornada aberta lá, é
  // madrugada (antes de `time_settings.overnight_until`) e a jornada tem menos
  // de 16h. Regra da Portaria 671/2021, implementada UMA VEZ SÓ no banco
  // (migration 20260930150000_ponto_multiplas_jornadas.sql) — nunca reescrita
  // aqui em TS: essa duplicação é exatamente o que gerou o bug da Imperium.
  // Fallback pro dia do relógio: falha na RPC não pode deixar ninguém sem ponto.
  const { data: resolvedDay } = useQuery({
    queryKey: ['punchDay', punchIdentity?.companyId, punchIdentity?.employeeId, clockDay],
    queryFn: async () => {
      if (!punchIdentity?.companyId || !punchIdentity?.employeeId) return clockDay;
      const { data, error } = await supabase.rpc('resolve_punch_day', {
        p_company_id: punchIdentity.companyId,
        p_employee_id: punchIdentity.employeeId,
        p_at: new Date().toISOString(),
      });
      // supabase.rpc NÃO lança: o erro vem no retorno.
      if (error || typeof data !== 'string' || !data) return clockDay;
      return data;
    },
    enabled: !!userId,
    refetchInterval: 60000,
  });

  const today = resolvedDay ?? clockDay;

  const { data: todayRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ['timeRecords', userId, today],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('time_records')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .eq('is_valid', true)
        .order('recorded_at');
      if (error) throw error;
      return (data || []) as TimeRecord[];
    },
    enabled: !!userId,
    refetchInterval: 30000,
  });

  const { data: todaySheet } = useQuery({
    queryKey: ['timeSheet', userId, today],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('time_sheets')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();
      if (error) throw error;
      return data as TimeSheet | null;
    },
    enabled: !!userId,
  });

  const { data: recentSheets = [] } = useQuery({
    queryKey: ['timeSheets', userId, 'recent'],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('time_sheets')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(7);
      if (error) throw error;
      return (data || []) as TimeSheet[];
    },
    enabled: !!userId,
  });

  // ─── AÇÕES PERMITIDAS: vêm do BANCO, não de uma cópia em TS ───
  // `allowed_punch_actions` decide pelo ÚLTIMO evento válido do dia, o que
  // libera a 2ª jornada (clock_out → clock_in) e a jornada SEM intervalo
  // (clock_in → clock_out). Havia uma segunda implementação desta regra aqui,
  // divergente da da edge — foi ela que travou o dia seguinte na Imperium.
  //
  // ⚠️ `allowed_punch_actions` é SECURITY INVOKER, e a policy de SELECT de
  // `time_records` pra `authenticated` é `user_id = auth.uid()`. Batida de
  // quiosque/link público grava `user_id = NULL` e o app não a enxerga — o
  // mesmo recorte que este hook já tinha (`.eq('user_id', userId)`), então não
  // é regressão. O valor CONFIÁVEL é o `allowed_actions` que a própria RPC de
  // registro devolve (calculado dentro do SECURITY DEFINER, que vê tudo), e é
  // ele que usamos pra atualizar o cache depois de bater.
  const { data: allowedActionsData } = useQuery({
    queryKey: ['allowedPunchActions', punchIdentity?.companyId, punchIdentity?.employeeId, today],
    queryFn: async (): Promise<PunchType[]> => {
      if (!punchIdentity?.companyId || !punchIdentity?.employeeId) return [];
      const { data, error } = await supabase.rpc('allowed_punch_actions', {
        p_company_id: punchIdentity.companyId,
        p_employee_id: punchIdentity.employeeId,
        p_date: today,
      });
      if (error || !Array.isArray(data)) return [];
      return data as PunchType[];
    },
    enabled: !!userId && !!punchIdentity?.companyId && !!punchIdentity?.employeeId,
  });

  const allowedActions = useMemo<PunchType[]>(
    () => allowedActionsData ?? [],
    [allowedActionsData],
  );

  // Mesma régua do `deriveStatus` da tela pública: lista com `clock_out` =
  // trabalhando; só `break_end` = em intervalo; só `clock_in` = não começou (dia
  // vazio) ou jornada anterior encerrada (dia com batidas).
  const currentStatus = useMemo(() => {
    if (allowedActions.length === 0) return 'finished' as const;
    if (allowedActions.includes('clock_out')) return 'working' as const;
    if (allowedActions.includes('break_end')) return 'on_break' as const;
    return todayRecords.length === 0 ? ('not_started' as const) : ('finished' as const);
  }, [allowedActions, todayRecords.length]);

  /**
   * Ação SUGERIDA (primeiro item da lista). Mantida só pra compatibilidade de
   * quem lê o campo singular — a régua de verdade é `allowedActions`.
   */
  const nextAction = useMemo(
    (): PunchType | null => allowedActions[0] ?? null,
    [allowedActions],
  );

  const registerPunch = useMutation({
    mutationFn: async ({
      type, photo, coords, address,
    }: {
      type: PunchType;
      photo: File | null;
      coords: { latitude: number; longitude: number } | null;
      address: string | null;
    }) => {
      if (!userId) throw new Error('Usuário não identificado');

      // Fetch profile and linked employee in parallel
      const [{ data: profile }, { data: linkedEmployee }] = await Promise.all([
        supabase.from('profiles').select('company_id').eq('user_id', userId).single(),
        supabase.from('employees').select('id').eq('user_id', userId).maybeSingle(),
      ]);
      
      let companyId = profile?.company_id;
      const employeeId = linkedEmployee?.id || null;

      // Fallback: look up company_id via any profile
      if (!companyId) {
        const { data: anyProfile } = await supabase
          .from('profiles')
          .select('company_id')
          .not('company_id', 'is', null)
          .limit(1)
          .single();
        companyId = anyProfile?.company_id;
        if (companyId) {
          await supabase.from('profiles').update({ company_id: companyId }).eq('user_id', userId);
        }
      }

      if (!companyId) throw new Error('Empresa não encontrada. Contate o administrador para vincular sua conta.');

      // Selfie da batida: `photo_url` guarda o PATH do Storage, NÃO uma URL.
      //
      // O bucket `time-photos` virou PRIVADO na migration 20260418165057, então a
      // URL pública que este código gravava antes simplesmente NÃO ABRE — e a
      // selfie é a evidência jurídica da batida. Quem for LER isso tem que
      // assinar o path (createSignedUrl) em vez de usar o valor direto.
      //
      // DISCRIMINADOR (é o que permite assinar na leitura sem migrar dados):
      // valor ANTIGO começa com "http" (URL pública morta, gravada até 1.24.x);
      // valor NOVO é path puro. O leitor decide pelo prefixo: `startsWith('http')`
      // → parseia a URL pra extrair o path; senão → já é o path do bucket
      // `time-photos`. Mesma regra vale pro que a edge `time-clock-portal` grava.
      let photoPath: string | null = null;
      if (photo) {
        const ext = photo.name.split('.').pop() || 'jpg';
        const path = `${userId}/${today}-${type}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('time-photos')
          .upload(path, photo, { upsert: true });
        if (upErr) throw upErr;
        photoPath = path;
      }

      const now = new Date().toISOString();

      // ─── UMA chamada só: resolve o dia, valida a ordem, insere e recomputa o
      // espelho, tudo na MESMA transação (`register_time_punch`, SECURITY
      // DEFINER). `company_id` NÃO viaja no payload — a RPC o deriva de
      // `auth.uid()`, então o client não escolhe tenant.
      //
      // ⚠️ NÃO mandamos `date`: quem decide o dia da batida é
      // `resolve_punch_day` dentro da RPC. Montar o dia aqui é o que partia a
      // jornada noturna em duas datas.
      //
      // O bloco que montava `time_sheets` à mão MORREU aqui: ele divergia do
      // `recompute_time_sheet` do banco (marcava `complete` em QUALQUER
      // clock_out e escrevia `balance_min` mesmo com jornada aberta, gerando
      // -8h falsas). Espelho é responsabilidade do banco, ponto.
      //
      // ⚠️ `supabase.rpc` NÃO lança em erro: o erro vem no retorno.
      const { data: punchResult, error: recErr } = await supabase.rpc('register_time_punch', {
        p_type: type,
        p_recorded_at: now,
        p_employee_id: employeeId ?? undefined,
        p_latitude: coords?.latitude ?? undefined,
        p_longitude: coords?.longitude ?? undefined,
        p_address: address ?? undefined,
        // PATH do Storage (bucket time-photos é privado), nunca URL.
        p_photo_url: photoPath ?? undefined,
        p_device_info: { userAgent: navigator.userAgent, platform: navigator.platform },
        p_source: 'app',
      });
      if (recErr) throw recErr;

      const result = (punchResult ?? {}) as {
        date?: string;
        allowed_actions?: PunchType[];
      };

      return { type, allowedActions: result.allowed_actions ?? [], date: result.date ?? today };
    },
    onSuccess: ({ type, allowedActions: actionsAfter, date: punchDate }) => {
      const labels: Record<PunchType, string> = {
        clock_in: 'Entrada',
        break_start: 'Início do intervalo',
        break_end: 'Fim do intervalo',
        clock_out: 'Saída',
      };
      // A hora do toast sai no fuso da EMPRESA, o mesmo que o espelho de ponto
      // usa pra mostrar esse registro depois. Com o relógio do aparelho, quem
      // batia às 08:00 via 08:00 no toast e 09:00 no espelho, e abria chamado.
      toast({ title: `✅ ${labels[type]} registrada às ${timeInTz(new Date(), timezone)}` });
      if (navigator.vibrate) navigator.vibrate(200);
      // Estado JÁ ATUALIZADO, calculado dentro do SECURITY DEFINER (que enxerga
      // inclusive batida de quiosque, invisível pro SELECT do app). Semeia o
      // cache antes do refetch pra tela não piscar a ação errada.
      if (actionsAfter.length > 0) {
        queryClient.setQueryData(
          ['allowedPunchActions', punchIdentity?.companyId, punchIdentity?.employeeId, punchDate],
          actionsAfter,
        );
      }
      queryClient.invalidateQueries({ queryKey: ['timeRecords'] });
      queryClient.invalidateQueries({ queryKey: ['timeSheet'] });
      queryClient.invalidateQueries({ queryKey: ['timeSheets'] });
      queryClient.invalidateQueries({ queryKey: ['allowedPunchActions'] });
      queryClient.invalidateQueries({ queryKey: ['punchDay'] });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao registrar ponto', description: punchErrorMessage(err, locale), variant: 'destructive' });
    },
  });

  return {
    todayRecords,
    todaySheet,
    recentSheets,
    currentStatus,
    /** Lista de ações permitidas agora (contrato novo, vem do banco). */
    allowedActions,
    /** Primeiro item de `allowedActions` — compatibilidade com quem lê o singular. */
    nextAction,
    /** Dia da jornada ao qual a próxima batida pertence. */
    punchDay: today,
    loadingRecords,
    registerPunch,
  };
}

// ─── useAdminTimeSheet (for admin dashboard — uses employees) ───
export function useAdminTimeSheet() {
  const { user } = useAuth();
  const { companyId } = useUserCompany();
  // Mesma regra do useTimeRecord: o dia do painel é o dia da EMPRESA.
  const { locale, timezone } = useAppLocaleContext();
  const today = todayInTz(timezone);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const tPunchErrors = MESSAGES[locale].app.employees.timeclock.punchErrors;

  // Fetch employees instead of profiles
  const { data: employees = [] } = useQuery({
    queryKey: ['allEmployees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, position, photo_url, is_active')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data || []) as EmployeeBasic[];
    },
  });

  const { data: todayRecords = [], isLoading } = useQuery({
    queryKey: ['adminTimeRecords', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_records')
        .select('*')
        .eq('date', today)
        .eq('is_valid', true)
        .order('recorded_at');
      if (error) throw error;
      return (data || []) as TimeRecord[];
    },
    refetchInterval: 60000,
  });

  const { data: todaySheets = [] } = useQuery({
    queryKey: ['adminTimeSheets', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_sheets')
        .select('*')
        .eq('date', today);
      if (error) throw error;
      return (data || []) as TimeSheet[];
    },
    refetchInterval: 60000,
  });

  // Realtime subscription — filtro de tenant (v1.9.26 fix de auditoria)
  // RLS já impede leitura cross-tenant, mas o filtro server-side no canal
  // evita receber eventos de outras companies que seriam descartados depois.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`admin-time-records-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_records',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['adminTimeRecords'] });
          queryClient.invalidateQueries({ queryKey: ['adminTimeSheets'] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, companyId]);

  const getRecordsForEmployee = useCallback((employeeId: string) =>
    todayRecords.filter(r => r.employee_id === employeeId), [todayRecords]);

  const getSheetForEmployee = useCallback((employeeId: string) =>
    todaySheets.find(s => s.employee_id === employeeId) || null, [todaySheets]);

  const getEmployeeStatus = useCallback((employeeId: string): 'present' | 'absent' | 'on_break' | 'finished' | 'late' => {
    const records = getRecordsForEmployee(employeeId);
    if (records.length === 0) return 'absent';
    const types = records.map(r => r.type);
    if (types.includes('clock_out')) return 'finished';
    if (types.includes('break_start') && !types.includes('break_end')) return 'on_break';
    return 'present';
  }, [getRecordsForEmployee]);

  const kpis = useMemo(() => {
    let present = 0, absent = 0, onBreak = 0, finished = 0;
    employees.forEach(emp => {
      const s = getEmployeeStatus(emp.id);
      if (s === 'present' || s === 'late') present++;
      else if (s === 'absent') absent++;
      else if (s === 'on_break') onBreak++;
      else if (s === 'finished') finished++;
    });
    return { present, absent, onBreak, finished };
  }, [employees, getEmployeeStatus]);

  const registerManualPunch = useMutation({
    mutationFn: async ({ employeeId, type, recordedAt, notes }: {
      employeeId: string; type: PunchType; recordedAt: string; notes: string;
    }) => {
      // Batida manual é lançamento em documento de jornada: o dia sai do fuso
      // da EMPRESA no instante que o admin informou, não do fuso do aparelho
      // dele. Admin em Lisboa lançando 00:30 pra empresa em Cuiabá grava o dia
      // de Cuiabá, que ainda é o dia anterior, e não o dia de Lisboa.
      const punchDate = dateInTz(recordedAt, timezone);

      // `p_force_date` é o QUE DIFERENCIA o lançamento do gestor da batida do
      // funcionário: com ele a RPC NÃO valida a ordem das ações, de propósito —
      // é assim que o gestor grava a saída que alguém esqueceu de bater, mesmo
      // que a sequência do dia fique "fora de ordem". Sem ele, corrigir dia
      // fechado seria impossível.
      //
      // Quem pode: só admin/gestor. A RPC barra o resto com `forbidden_force_date`
      // (não é gate de UI — é `is_admin_or_gestor` dentro do SECURITY DEFINER).
      //
      // `company_id` NÃO viaja mais no payload: a RPC o deriva de `auth.uid()`.
      // E o `recompute_time_sheet` manual sumiu — a RPC recomputa o espelho na
      // MESMA transação, então não existe mais a janela em que a batida está
      // gravada e o Histórico ainda não sabe.
      //
      // ⚠️ `supabase.rpc` NÃO lança: o erro vem no retorno.
      const { error } = await supabase.rpc('register_time_punch', {
        p_type: type,
        p_recorded_at: recordedAt,
        p_employee_id: employeeId,
        p_source: 'admin',
        p_notes: notes,
        p_force_date: punchDate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTimeRecords'] });
      queryClient.invalidateQueries({ queryKey: ['adminTimeSheets'] });
      queryClient.invalidateQueries({ queryKey: ['timeRecordsDay'] });
      queryClient.invalidateQueries({ queryKey: ['timeHistory'] });
      queryClient.invalidateQueries({ queryKey: ['timeSheet'] });
      queryClient.invalidateQueries({ queryKey: ['timeSheets'] });
      queryClient.invalidateQueries({ queryKey: ['allowedPunchActions'] });
      queryClient.invalidateQueries({ queryKey: ['punchDay'] });
    },
    onError: (err: unknown) => {
      // Antes este erro não tinha destino: `mutateAsync` rejeitava, o modal não
      // capturava e o gestor via a tela parada sem explicação. Agora o código da
      // RPC vira copy PT-BR (e nos outros 3 idiomas).
      toast({
        title: tPunchErrors.title,
        description: punchErrorMessage(err, locale),
        variant: 'destructive',
      });
    },
  });

  return {
    employees, todayRecords, todaySheets, isLoading,
    getRecordsForEmployee, getSheetForEmployee, getEmployeeStatus,
    kpis, registerManualPunch,
  };
}

// ─── useTimeHistory ───
export function useTimeHistory(filters: {
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ['timeHistory', filters],
    queryFn: async () => {
      let query = supabase.from('time_sheets').select('*').order('date', { ascending: false });
      if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
      if (filters.startDate) query = query.gte('date', filters.startDate);
      if (filters.endDate) query = query.lte('date', filters.endDate);
      if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
      const { data, error } = await query.limit(500);
      if (error) throw error;
      return (data || []) as TimeSheet[];
    },
  });
}

// ─── useTimeSettings ───
export function useTimeSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['timeSettings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_settings').select('*').maybeSingle();
      if (error) throw error;
      return data as TimeSettings | null;
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: Partial<TimeSettings>) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
        .single();
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      if (settings?.id) {
        const { error } = await supabase.from('time_settings').update({ ...values, updated_at: new Date().toISOString() }).eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('time_settings').insert({ ...values, company_id: profile.company_id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeSettings'] });
      toast({ title: 'Configurações salvas!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getErrorMessage(e), variant: 'destructive' }),
  });

  return { settings, isLoading, upsert };
}

// ─── useTimeSchedules (uses employee_id) ───
export function useTimeSchedules() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['timeSchedules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_schedules').select('*').order('employee_id').order('weekday');
      if (error) throw error;
      return (data || []) as TimeSchedule[];
    },
  });

  const upsertSchedule = useMutation({
    mutationFn: async (items: Array<Omit<TimeSchedule, 'id' | 'user_id'>>) => {
      if (items.length === 0) return;
      const employeeId = items[0].employee_id;
      if (employeeId) {
        await supabase.from('time_schedules').delete().eq('employee_id', employeeId);
      }
      const { error } = await supabase.from('time_schedules').insert(items as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeSchedules'] });
      toast({ title: 'Jornada atualizada!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getErrorMessage(e), variant: 'destructive' }),
  });

  return { schedules, isLoading, upsertSchedule };
}

// ─── useTimeRecordsForDay (fetch records for a specific employee+date) ───
export function useTimeRecordsForDay(employeeId: string | null, date: string | null) {
  return useQuery({
    queryKey: ['timeRecordsDay', employeeId, date],
    queryFn: async () => {
      if (!employeeId || !date) return [];
      const { data, error } = await supabase
        .from('time_records')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('date', date)
        // is_valid é nullable — null conta como válida (batida nunca excluída).
        .or('is_valid.is.null,is_valid.eq.true')
        .order('recorded_at');
      if (error) throw error;
      return (data || []) as TimeRecord[];
    },
    enabled: !!employeeId && !!date,
  });
}

// ─── usePunchMutations (editar horário / excluir batida — TimeDayDetailModal) ───
export function usePunchMutations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.timeclock.dayDetail;

  const invalidateAfterPunchChange = () => {
    queryClient.invalidateQueries({ queryKey: ['timeRecordsDay'] });
    queryClient.invalidateQueries({ queryKey: ['adminTimeRecords'] });
    queryClient.invalidateQueries({ queryKey: ['adminTimeSheets'] });
    queryClient.invalidateQueries({ queryKey: ['timeHistory'] });
    queryClient.invalidateQueries({ queryKey: ['timeSheet'] });
    queryClient.invalidateQueries({ queryKey: ['timeSheets'] });
  };

  const updatePunch = useMutation({
    mutationFn: async ({ record, type, recordedAt, notes }: {
      record: TimeRecord;
      type: PunchType;
      recordedAt: string;
      notes: string;
    }) => {
      if (!record.employee_id) throw new Error('Batida sem funcionário vinculado');
      const employeeId = record.employee_id;
      // Dia-calendário no fuso da EMPRESA, igual o lançamento manual — no fuso do
      // aparelho do gestor a edição de fim de noite cairia no dia errado.
      const newDate = dateInTz(recordedAt, timezone);
      const oldDate = record.date;

      const { error } = await supabase
        .from('time_records')
        .update({
          recorded_at: recordedAt,
          date: newDate,
          type,
          notes,
          edited_at: new Date().toISOString(),
          edited_by: user?.id ?? null,
          original_recorded_at: record.original_recorded_at ?? record.recorded_at,
        })
        .eq('id', record.id);
      if (error) throw error;

      // Recomputa o dia novo E o antigo quando a edição atravessa a virada do
      // dia — recomputar só o novo deixa o espelho do dia antigo com saldo
      // fantasma (a batida some de lá sem o time_sheets ser refeito).
      const datesToRecompute = new Set([newDate, oldDate]);
      for (const d of datesToRecompute) {
        const { error: recomputeError } = await supabase.rpc('recompute_time_sheet', {
          p_company_id: record.company_id,
          p_employee_id: employeeId,
          p_date: d,
        });
        if (recomputeError) throw recomputeError;
      }
    },
    onSuccess: () => {
      toast({ title: t.toastUpdated });
      invalidateAfterPunchChange();
    },
    onError: (err: any) => {
      toast({ title: t.toastUpdateError, description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const deletePunch = useMutation({
    mutationFn: async (record: TimeRecord) => {
      if (!record.employee_id) throw new Error('Batida sem funcionário vinculado');

      const { error } = await supabase
        .from('time_records')
        .update({
          is_valid: false,
          invalidated_at: new Date().toISOString(),
          invalidated_by: user?.id ?? null,
        })
        .eq('id', record.id);
      if (error) throw error;

      const { error: recomputeError } = await supabase.rpc('recompute_time_sheet', {
        p_company_id: record.company_id,
        p_employee_id: record.employee_id,
        p_date: record.date,
      });
      if (recomputeError) throw recomputeError;
    },
    onSuccess: () => {
      toast({ title: t.toastDeleted });
      invalidateAfterPunchChange();
    },
    onError: (err: any) => {
      toast({ title: t.toastDeleteError, description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  return { updatePunch, deletePunch };
}
