import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

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
  max_radius_meters: number;
  allow_off_hours: boolean;
  late_tolerance_min: number;
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
  const today = format(new Date(), 'yyyy-MM-dd');

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

  const currentStatus = useMemo(() => {
    const types = todayRecords.map(r => r.type);
    if (!types.includes('clock_in')) return 'not_started' as const;
    if (types.includes('clock_out')) return 'finished' as const;
    if (types.includes('break_start') && !types.includes('break_end')) return 'on_break' as const;
    return 'working' as const;
  }, [todayRecords]);

  const nextAction = useMemo((): PunchType | null => {
    const types = todayRecords.map(r => r.type);
    if (!types.includes('clock_in')) return 'clock_in';
    if (!types.includes('break_start')) return 'break_start';
    if (!types.includes('break_end')) return 'break_end';
    if (!types.includes('clock_out')) return 'clock_out';
    return null;
  }, [todayRecords]);

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

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', userId)
        .single();
      
      let companyId = profile?.company_id;

      // Fallback: look up company_id via linked employee's creator profile
      if (!companyId) {
        const { data: emp } = await supabase
          .from('employees')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        if (emp) {
          // Try to get company_id from any other profile in the same company
          const { data: anyProfile } = await supabase
            .from('profiles')
            .select('company_id')
            .not('company_id', 'is', null)
            .limit(1)
            .single();
          companyId = anyProfile?.company_id;

          // Also fix the profile for future calls
          if (companyId) {
            await supabase.from('profiles').update({ company_id: companyId }).eq('user_id', userId);
          }
        }
      }

      if (!companyId) throw new Error('Empresa não encontrada. Contate o administrador para vincular sua conta.');

      let photoUrl: string | null = null;
      if (photo) {
        const ext = photo.name.split('.').pop() || 'jpg';
        const path = `${userId}/${today}-${type}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('time-photos')
          .upload(path, photo, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('time-photos').getPublicUrl(path);
        photoUrl = urlData.publicUrl;
      }

      const now = new Date().toISOString();

      const { error: recErr } = await supabase.from('time_records').insert({
        company_id: profile.company_id,
        user_id: userId,
        date: today,
        type,
        recorded_at: now,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        address,
        photo_url: photoUrl,
        device_info: { userAgent: navigator.userAgent, platform: navigator.platform },
        source: 'app',
      });
      if (recErr) throw recErr;

      // Upsert time_sheet
      const allRecords = [...todayRecords, { type, recorded_at: now, is_valid: true } as TimeRecord];
      const { worked, breakMin } = calculateWorkedMinutes(allRecords);

      const clockIn = allRecords.find(r => r.type === 'clock_in');
      const clockOut = type === 'clock_out' ? { recorded_at: now } : allRecords.find(r => r.type === 'clock_out');

      const sheetData: any = {
        company_id: profile.company_id,
        user_id: userId,
        date: today,
        first_clock_in: clockIn?.recorded_at || now,
        total_worked_min: worked,
        total_break_min: breakMin,
        status: type === 'clock_out' ? 'complete' : 'open',
      };
      if (clockOut) {
        sheetData.last_clock_out = clockOut.recorded_at;
        sheetData.balance_min = worked - (sheetData.expected_min || 480);
      }

      if (todaySheet) {
        await supabase.from('time_sheets').update(sheetData).eq('id', todaySheet.id);
      } else {
        sheetData.expected_min = 480;
        await supabase.from('time_sheets').insert(sheetData);
      }

      return type;
    },
    onSuccess: (type) => {
      const labels: Record<PunchType, string> = {
        clock_in: 'Entrada',
        break_start: 'Início do intervalo',
        break_end: 'Fim do intervalo',
        clock_out: 'Saída',
      };
      toast({ title: `✅ ${labels[type]} registrada às ${format(new Date(), 'HH:mm')}` });
      if (navigator.vibrate) navigator.vibrate(200);
      queryClient.invalidateQueries({ queryKey: ['timeRecords'] });
      queryClient.invalidateQueries({ queryKey: ['timeSheet'] });
      queryClient.invalidateQueries({ queryKey: ['timeSheets'] });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao registrar ponto', description: err.message, variant: 'destructive' });
    },
  });

  return {
    todayRecords,
    todaySheet,
    recentSheets,
    currentStatus,
    nextAction,
    loadingRecords,
    registerPunch,
  };
}

// ─── useAdminTimeSheet (for admin dashboard — uses employees) ───
export function useAdminTimeSheet() {
  const { user } = useAuth();
  const today = format(new Date(), 'yyyy-MM-dd');
  const queryClient = useQueryClient();

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

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-time-records')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_records' }, () => {
        queryClient.invalidateQueries({ queryKey: ['adminTimeRecords'] });
        queryClient.invalidateQueries({ queryKey: ['adminTimeSheets'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

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
      // Get company_id from current user's profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
        .single();
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      const { error } = await supabase.from('time_records').insert({
        company_id: profile.company_id,
        employee_id: employeeId,
        date: format(new Date(recordedAt), 'yyyy-MM-dd'),
        type,
        recorded_at: recordedAt,
        source: 'admin',
        notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTimeRecords'] });
      queryClient.invalidateQueries({ queryKey: ['adminTimeSheets'] });
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
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
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
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
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
        .order('recorded_at');
      if (error) throw error;
      return (data || []) as TimeRecord[];
    },
    enabled: !!employeeId && !!date,
  });
}
