import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Calculates the monthly work hours for an employee.
 * Priority: employee custom schedule > company time settings > fallback 176h.
 */
export function useEmployeeWorkHours(employeeId?: string | null) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const { data: companySettings } = useQuery({
    queryKey: ['time-settings-company', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from('time_settings')
        .select('default_in, default_out, default_break_min')
        .eq('company_id', companyId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  const { data: employeeSchedule } = useQuery({
    queryKey: ['time-schedule-employee', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data } = await supabase
        .from('time_schedules')
        .select('weekday, expected_in, expected_out, break_minutes, is_work_day')
        .eq('employee_id', employeeId);
      return data;
    },
    enabled: !!employeeId,
  });

  const result = useMemo(() => {
    // 1) Employee custom schedule
    if (employeeSchedule && employeeSchedule.length > 0) {
      const workDays = employeeSchedule.filter((s: any) => s.is_work_day);
      if (workDays.length > 0) {
        let totalMin = 0;
        for (const d of workDays) {
          const inTime = d.expected_in?.split(':').map(Number) || [8, 0];
          const outTime = d.expected_out?.split(':').map(Number) || [17, 0];
          const workMin = (outTime[0] * 60 + (outTime[1] || 0)) - (inTime[0] * 60 + (inTime[1] || 0)) - (d.break_minutes || 0);
          totalMin += Math.max(workMin, 0);
        }
        const dailyHours = totalMin / workDays.length / 60;
        const workDaysPerMonth = Math.round(workDays.length * (30 / 7));
        const monthlyHours = dailyHours * workDaysPerMonth;
        return { dailyHours, monthlyHours: Math.round(monthlyHours), workDaysPerMonth, source: 'employee' as const };
      }
    }

    // 2) Company time settings
    if (companySettings?.default_in && companySettings?.default_out) {
      const inP = companySettings.default_in.split(':').map(Number);
      const outP = companySettings.default_out.split(':').map(Number);
      const workMin = (outP[0] * 60 + (outP[1] || 0)) - (inP[0] * 60 + (inP[1] || 0)) - (companySettings.default_break_min || 0);
      const dailyHours = Math.max(workMin, 0) / 60;
      const monthlyHours = Math.round(dailyHours * 22);
      return { dailyHours, monthlyHours, workDaysPerMonth: 22, source: 'company' as const };
    }

    // 3) Fallback
    return { dailyHours: 8, monthlyHours: 176, workDaysPerMonth: 22, source: 'default' as const };
  }, [employeeSchedule, companySettings]);

  return result;
}
