import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { osTypeLabels } from '@/types/database';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  subDays, differenceInDays, format, startOfISOWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { DashboardKPIs } from '@/components/dashboard/DashboardKPIs';
import { DashboardCashFlow } from '@/components/dashboard/DashboardCashFlow';
import { DashboardOSEvolution } from '@/components/dashboard/DashboardOSEvolution';
import { DashboardCriticalOS, type CriticalOS } from '@/components/dashboard/DashboardCriticalOS';
import { DashboardStatusSummary } from '@/components/dashboard/DashboardStatusSummary';
import { DashboardTopTechnicians, type TechnicianPerf } from '@/components/dashboard/DashboardTopTechnicians';
import { DashboardOSByType } from '@/components/dashboard/DashboardOSByType';
import { DashboardLiveMap } from '@/components/dashboard/DashboardLiveMap';
import { DateRangeFilter, useDateRangeFilter, type DateRange } from '@/components/ui/DateRangeFilter';

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Bom dia. Aqui está o resumo da sua operação.';
  if (h >= 12 && h < 18) return 'Boa tarde. Veja como está o dia.';
  return 'Boa noite. Resumo do dia de hoje.';
}

function filterByRange<T extends Record<string, any>>(items: T[], field: string, start: Date, end: Date) {
  return items.filter(item => {
    const d = new Date(item[field]);
    return d >= start && d <= end;
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { data: stats, isLoading } = useDashboardStats();
  const isMobile = useIsMobile();

  const { preset, range, setPreset, setRange } = useDateRangeFilter('this_month');

  const start = range.from ?? startOfMonth(new Date());
  const end = range.to ?? endOfMonth(new Date());

  const prevRange = useMemo(() => {
    const diff = differenceInDays(end, start) + 1;
    return { start: subDays(start, diff), end: subDays(start, 1) };
  }, [start, end]);

  // Filtered OS
  const filteredOS = useMemo(() => {
    if (!stats?.allOS) return [];
    return filterByRange(stats.allOS, 'scheduled_date', start, end);
  }, [stats?.allOS, start, end]);

  const prevFilteredOS = useMemo(() => {
    if (!stats?.allOS) return [];
    return filterByRange(stats.allOS, 'scheduled_date', prevRange.start, prevRange.end);
  }, [stats?.allOS, prevRange]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { pendente: 0, agendada: 0, a_caminho: 0, em_andamento: 0, concluida: 0, cancelada: 0 };
    filteredOS.forEach((os: any) => { if (os.status in counts) counts[os.status]++; });
    return counts;
  }, [filteredOS]);

  // KPI data
  const kpiData = useMemo(() => {
    const osAbertas = (statusCounts.pendente || 0) + (statusCounts.agendada || 0) + (statusCounts.em_andamento || 0) + (statusCounts.a_caminho || 0);
    const osPendentes = statusCounts.pendente || 0;
    const osConcluidas = statusCounts.concluida || 0;
    const totalWithResult = osAbertas + osConcluidas;
    const taxaConclusao = totalWithResult > 0 ? Math.round((osConcluidas / totalWithResult) * 100) : 0;

    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const emCampoSet = new Set<string>();
    (stats?.allOS ?? []).forEach((os: any) => {
      if ((os.status === 'em_andamento' || os.status === 'a_caminho') && os.technician_id && os.scheduled_date === todayStr) {
        emCampoSet.add(os.technician_id);
      }
    });

    const filteredFin = stats?.allFinancial ? filterByRange(stats.allFinancial, 'transaction_date', start, end) : [];
    let faturamento = 0;
    filteredFin.forEach((t: any) => { if (t.transaction_type === 'entrada') faturamento += Number(t.amount); });

    const prevFin = stats?.allFinancial ? filterByRange(stats.allFinancial, 'transaction_date', prevRange.start, prevRange.end) : [];
    let prevFaturamento = 0;
    prevFin.forEach((t: any) => { if (t.transaction_type === 'entrada') prevFaturamento += Number(t.amount); });

    const prevOsAbertas = prevFilteredOS.filter((os: any) => ['pendente', 'agendada', 'em_andamento', 'a_caminho'].includes(os.status)).length;

    const trendOS = prevOsAbertas > 0 ? Math.round(((osAbertas - prevOsAbertas) / prevOsAbertas) * 100) : 0;
    const trendFaturamento = prevFaturamento > 0 ? Math.round(((faturamento - prevFaturamento) / prevFaturamento) * 100) : 0;

    return {
      osAbertas,
      osPendentes,
      emCampoAgora: emCampoSet.size,
      taxaConclusao,
      osConcluidas,
      faturamento,
      clientesAtivos: stats?.clientesAtivos ?? 0,
      trendOS,
      trendFaturamento,
    };
  }, [statusCounts, stats, start, end, prevRange, prevFilteredOS]);

  // Cash flow data
  const cashFlowData = useMemo(() => {
    if (!stats?.allFinancial) return { monthlyData: [], totalEntradas: 0, totalSaidas: 0 };
    const now = new Date();
    const threeMonthsAgo = subDays(startOfMonth(now), 1);
    const cfStart = startOfMonth(subDays(startOfMonth(threeMonthsAgo), 1));
    const cfEnd = endOfMonth(now);

    const monthMap = new Map<string, { entradas: number; saidas: number }>();
    for (let i = 2; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = format(m, 'MMM/yy', { locale: ptBR });
      monthMap.set(key, { entradas: 0, saidas: 0 });
    }

    let totalEntradas = 0, totalSaidas = 0;
    stats.allFinancial.forEach((t: any) => {
      const d = new Date(t.transaction_date);
      if (d < cfStart || d > cfEnd) return;
      const key = format(d, 'MMM/yy', { locale: ptBR });
      if (!monthMap.has(key)) return;
      const cur = monthMap.get(key)!;
      const amount = Number(t.amount);
      if (t.transaction_type === 'entrada') { cur.entradas += amount; totalEntradas += amount; }
      else { cur.saidas += amount; totalSaidas += amount; }
    });
    return {
      monthlyData: Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v })),
      totalEntradas,
      totalSaidas,
    };
  }, [stats?.allFinancial]);

  // OS Evolution data
  const evolutionData = useMemo(() => {
    if (!stats?.allOS) return { daily: [], weekly: [], monthly: [] };
    const filtered = filterByRange(stats.allOS, 'scheduled_date', start, end);

    const buildGroup = (keyFn: (d: Date) => string) => {
      const map = new Map<string, { total: number; concluidas: number }>();
      filtered.forEach((os: any) => {
        if (!os.scheduled_date) return;
        const d = new Date(os.scheduled_date);
        const key = keyFn(d);
        if (!map.has(key)) map.set(key, { total: 0, concluidas: 0 });
        const cur = map.get(key)!;
        cur.total++;
        if (os.status === 'concluida') cur.concluidas++;
      });
      return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([period, v]) => ({ period, ...v }));
    };

    return {
      daily: buildGroup(d => format(d, 'dd/MM')),
      weekly: buildGroup(d => `S${format(startOfISOWeek(d), 'dd/MM')}`),
      monthly: buildGroup(d => format(d, 'MMM', { locale: ptBR })),
    };
  }, [stats?.allOS, start, end]);

  // Critical OS
  const criticalOS = useMemo((): CriticalOS[] => {
    if (!stats?.allOS) return [];
    const today = new Date();
    return (stats.allOS as any[])
      .filter(os => {
        if (!os.scheduled_date) return false;
        if (['concluida', 'cancelada'].includes(os.status)) return false;
        const scheduled = new Date(os.scheduled_date);
        return scheduled < startOfDay(today);
      })
      .map(os => ({
        id: os.id,
        orderNumber: os.order_number,
        customerName: os.customer?.name || 'Cliente não informado',
        location: [os.customer?.city, os.customer?.state].filter(Boolean).join(', '),
        daysOverdue: differenceInDays(today, new Date(os.scheduled_date)),
        hasTechnician: !!os.technician_id,
        osType: osTypeLabels[os.os_type as keyof typeof osTypeLabels] || os.os_type,
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [stats?.allOS]);

  // Top technicians
  const topTechnicians = useMemo((): TechnicianPerf[] => {
    if (!stats?.allOS || !stats.profiles) return [];
    const profileMap = new Map(stats.profiles.map((p: any) => [p.user_id, p]));
    const ratingMap = new Map<string, number[]>();
    (stats.ratings ?? []).forEach((r: any) => {
      if (r.quality_rating != null) {
        if (!ratingMap.has(r.service_order_id)) ratingMap.set(r.service_order_id, []);
        ratingMap.get(r.service_order_id)!.push(r.quality_rating);
      }
    });

    const techMap = new Map<string, { completed: number; ratings: number[]; timesMinutes: number[] }>();
    filteredOS.forEach((os: any) => {
      if (os.status !== 'concluida' || !os.technician_id) return;
      if (!techMap.has(os.technician_id)) techMap.set(os.technician_id, { completed: 0, ratings: [], timesMinutes: [] });
      const entry = techMap.get(os.technician_id)!;
      entry.completed++;
      const osRatings = ratingMap.get(os.id);
      if (osRatings) entry.ratings.push(...osRatings);
      if (os.check_in_time && os.check_out_time) {
        const mins = (new Date(os.check_out_time).getTime() - new Date(os.check_in_time).getTime()) / 60000;
        if (mins > 0 && mins < 1440) entry.timesMinutes.push(mins);
      }
    });

    return Array.from(techMap.entries())
      .map(([userId, data]) => {
        const profile = profileMap.get(userId);
        return {
          name: (profile as any)?.full_name || 'Técnico',
          avatarUrl: (profile as any)?.avatar_url,
          completed: data.completed,
          avgRating: data.ratings.length > 0 ? data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length : 0,
          avgTimeMinutes: data.timesMinutes.length > 0 ? data.timesMinutes.reduce((a, b) => a + b, 0) / data.timesMinutes.length : 0,
        };
      })
      .sort((a, b) => b.completed - a.completed);
  }, [filteredOS, stats?.profiles, stats?.ratings]);

  // OS by type
  const osByType = useMemo(() => {
    if (!stats?.allOS) return [];
    const typeMap = new Map<string, number>();
    const serviceTypeMap = new Map(
      (stats.serviceTypes ?? []).map((st: any) => [st.id, st.name])
    );
    filteredOS.forEach((os: any) => {
      const typeName = os.service_type_id && serviceTypeMap.has(os.service_type_id)
        ? serviceTypeMap.get(os.service_type_id)!
        : osTypeLabels[os.os_type as keyof typeof osTypeLabels] || os.os_type;
      typeMap.set(typeName, (typeMap.get(typeName) || 0) + 1);
    });
    return Array.from(typeMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredOS, stats?.serviceTypes]);

  // Technicians in field for live map
  const techsInField = useMemo(() => {
    if (!stats?.allOS || !stats.profiles) return [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const profileMap = new Map(stats.profiles.map((p: any) => [p.user_id, p]));
    const seen = new Set<string>();

    return (stats.allOS as any[])
      .filter(os =>
        (os.status === 'em_andamento' || os.status === 'a_caminho') &&
        os.technician_id &&
        os.scheduled_date === todayStr &&
        os.customer?.lat && os.customer?.lng
      )
      .filter(os => {
        if (seen.has(os.technician_id)) return false;
        seen.add(os.technician_id);
        return true;
      })
      .map(os => {
        const profile = profileMap.get(os.technician_id);
        return {
          name: (profile as any)?.full_name || 'Técnico',
          avatarUrl: (profile as any)?.avatar_url,
          lat: Number(os.customer.lat),
          lng: Number(os.customer.lng),
          customerName: os.customer?.name || '',
        };
      });
  }, [stats?.allOS, stats?.profiles]);

  const firstName = profile?.full_name?.split(' ')[0] || 'Usuário';

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className={isMobile ? 'text-center' : ''}>
          <h1 className="text-xl font-bold text-foreground lg:text-3xl">
            Olá, {firstName}! 👋
          </h1>
          <p className="text-sm text-muted-foreground">{getGreeting()}</p>
        </div>
        <div className={isMobile ? 'flex justify-center' : ''}>
          <DateRangeFilter
            value={range}
            preset={preset}
            onPresetChange={setPreset}
            onRangeChange={setRange}
          />
        </div>
      </div>

      {/* KPIs - always full width, first */}
      <DashboardKPIs data={kpiData} isLoading={isLoading} />

      {/* Main Grid: 3/5 left + 2/5 right on desktop, single column on mobile with custom order */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 lg:gap-6">
        {/* Left column */}
        <div className="contents lg:block lg:space-y-6">
          <div className="order-1 lg:order-none">
            <DashboardLiveMap technicians={techsInField} isLoading={isLoading} />
          </div>
          <div className="order-4 lg:order-none">
            <DashboardCashFlow data={cashFlowData} isLoading={isLoading} />
          </div>
          <div className="order-5 lg:order-none">
            <DashboardOSEvolution data={evolutionData} isLoading={isLoading} />
          </div>
          <div className="order-6 lg:order-none">
            <DashboardTopTechnicians technicians={topTechnicians} isLoading={isLoading} emCampoAgora={kpiData.emCampoAgora} />
          </div>
        </div>

        {/* Right column */}
        <div className="contents lg:block lg:space-y-6">
          <div className="order-2 lg:order-none">
            <DashboardStatusSummary counts={statusCounts} isLoading={isLoading} />
          </div>
          <div className="order-3 lg:order-none">
            <DashboardOSByType data={osByType} isLoading={isLoading} />
          </div>
          <div className="order-7 lg:order-none">
            <DashboardCriticalOS items={criticalOS} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}