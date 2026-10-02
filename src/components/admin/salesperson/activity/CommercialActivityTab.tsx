// ─────────────────────────────────────────────────────────────────────────────
// CommercialActivityTab — espelho de gestão do Diário Comercial do Vendedor.
//
// "O sistema no nosso admin dando um espelho disso tudo, com os totais,
// informações e relatórios, e também os dias em que ele não marcou." — CEO.
//
// Só lê (via `useAllSalespersonActivity`, já gateado por RLS) e agrega com
// `@/utils/salespersonActivityStats` + `./activityAggregate`. Nenhuma escrita
// aqui — quem preenche é a ficha do vendedor (fora da minha partição).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { BarChart3, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/mobile/EmptyState';
import type { DateRange } from '@/components/ui/DateRangeFilter';
import { useAllSalespersonActivity } from '@/hooks/useSalespersonActivity';
import { brtToday } from '@/lib/date-br';
import type { Salesperson } from '@/hooks/useSalespersonData';
import {
  sumActivity, conversionRates, activityCoverage, buildDailySeries, toDateKey,
} from '@/utils/salespersonActivityStats';
import { buildSalespersonActivityAggregates, teamDailyGoal } from './activityAggregate';
import { ActivityTotalsCards } from './ActivityTotalsCards';
import { ActivityFunnelCard } from './ActivityFunnelCard';
import { ActivityGoalChart } from './ActivityGoalChart';
import { SalespeopleActivityTable } from './SalespeopleActivityTable';
import { ActivityMissingDaysList } from './ActivityMissingDaysList';
import { exportSalespersonActivityExcel } from '@/utils/salespersonActivityExport';

interface Props {
  salespeople: Salesperson[];
  range: DateRange;
  /** Gate de UX — espelha `hasMasterAccess || hasFunctionAccess('admin_vendedores_ver_todos')`
   * calculado na página. A segurança de verdade é a RLS da tabela
   * (`salesperson_daily_activity`); isto só evita montar a query à toa e, por
   * defesa extra, NÃO renderiza nada se o estado chegar aqui de forma residual. */
  enabled: boolean;
  isMobile: boolean;
}

function fmtDateBR(key: string): string {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

/** Valor do seletor que representa "todo o time". */
const ALL_SALESPEOPLE = 'all';

export function CommercialActivityTab({ salespeople, range, enabled, isMobile }: Props) {
  const [isExporting, setIsExporting] = useState(false);
  // Escopo da análise. Com o time inteiro, a régua do gráfico é a soma das
  // metas — e um vendedor que não preencheu afunda a linha de todos, escondendo
  // quem bateu. Por isso dá pra isolar UMA pessoa e comparar com a meta DELA.
  const [scopeId, setScopeId] = useState<string>(ALL_SALESPEOPLE);
  const { data: rows = [], isLoading } = useAllSalespersonActivity(enabled);

  const todayKey = brtToday();

  const scopedSalesperson = useMemo(
    () => (scopeId === ALL_SALESPEOPLE ? null : salespeople.find((s) => s.id === scopeId) ?? null),
    [scopeId, salespeople],
  );
  // Vendedor some da lista (desativado/excluído) enquanto estava selecionado →
  // o escopo volta pro time, em vez de mostrar uma tela vazia sem explicação.
  const scopedSalespeople = useMemo(
    () => (scopedSalesperson ? [scopedSalesperson] : salespeople),
    [scopedSalesperson, salespeople],
  );

  // ───────────────────────────────────────────────────────────────────────
  // Resolução do intervalo. `DateRangeFilter` devolve `{from: undefined, to:
  // undefined}` no preset "Todos" — decisão: olhar do primeiro registro
  // existente (entre os vendedores visíveis) até hoje. Sem isso, "Todos" não
  // teria limite inferior e `businessDaysBetween` explodiria tentando cobrir
  // décadas. Sem nenhum registro no banco ainda, o intervalo colapsa em
  // hoje-hoje (zero dia útil "faltando", já que o próprio hoje nunca conta
  // como falta — ver `activityCoverage`).
  // ───────────────────────────────────────────────────────────────────────
  const { fromKey, toKey } = useMemo(() => {
    if (range.from && range.to) {
      return { fromKey: toDateKey(range.from), toKey: toDateKey(range.to) };
    }
    const earliest = rows.reduce<string | null>(
      (min, r) => (min === null || r.activity_date < min ? r.activity_date : min),
      null,
    );
    return { fromKey: earliest ?? todayKey, toKey: todayKey };
  }, [range.from, range.to, rows, todayKey]);

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.activity_date >= fromKey &&
          r.activity_date <= toKey &&
          (!scopedSalesperson || r.salesperson_id === scopedSalesperson.id),
      ),
    [rows, fromKey, toKey, scopedSalesperson],
  );

  const totals = useMemo(() => sumActivity(filteredRows), [filteredRows]);
  const rates = useMemo(() => conversionRates(totals), [totals]);

  const coverage = useMemo(
    () => activityCoverage(filteredRows, fromKey, toKey, todayKey),
    [filteredRows, fromKey, toKey, todayKey],
  );

  const series = useMemo(
    () => buildDailySeries(filteredRows, coverage.businessDays),
    [filteredRows, coverage.businessDays],
  );

  // Régua do gráfico: com um vendedor isolado, é a meta DELE (200/5 por padrão).
  // Com o time inteiro, é a soma das metas dos ativos — o gráfico soma todos os
  // vendedores por dia, e comparar isso com a meta de uma pessoa enganaria.
  const goalContactsRef = useMemo(
    () =>
      scopedSalesperson
        ? scopedSalesperson.daily_goal_contacts
        : teamDailyGoal(salespeople, 'daily_goal_contacts'),
    [scopedSalesperson, salespeople],
  );
  const goalMeetingsRef = useMemo(
    () =>
      scopedSalesperson
        ? scopedSalesperson.daily_goal_meetings_scheduled
        : teamDailyGoal(salespeople, 'daily_goal_meetings_scheduled'),
    [scopedSalesperson, salespeople],
  );

  const aggregates = useMemo(
    () =>
      buildSalespersonActivityAggregates(scopedSalespeople, filteredRows, fromKey, toKey, todayKey)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [scopedSalespeople, filteredRows, fromKey, toKey, todayKey],
  );

  const periodLabel = `${fmtDateBR(fromKey)} a ${fmtDateBR(toKey)}`;
  const scopeLabel = scopedSalesperson ? scopedSalesperson.name : 'Todo o time';

  // Guarda de defesa extra: TODOS os hooks acima já rodaram incondicionalmente
  // (regra dos hooks) — só a partir daqui é seguro cortar o render. Estado
  // residual (ex: a aba ficou selecionada num instante antes da permissão
  // cair) não deve renderizar o espelho completo de todos os vendedores; só a
  // página decide mostrar a TabsTrigger, mas o conteúdo também se nega a
  // existir sem a permissão.
  if (!enabled) return null;

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportSalespersonActivityExcel({
        periodLabel: `${periodLabel} (${scopeLabel})`,
        totals,
        rates,
        perSalesperson: aggregates,
        missingDays: aggregates.map((a) => ({ name: a.name, missingDays: a.missingDays })),
      });
    } catch (error) {
      toast.error('Não foi possível exportar o relatório de atividade comercial.');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // A barra de escopo fica FORA do early-return do estado vazio de propósito:
  // filtrar um vendedor que não preencheu nada zera a lista, e se o seletor
  // desaparecesse junto o usuário ficaria preso num estado vazio sem volta.
  const scopeBar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Select value={scopedSalesperson ? scopeId : ALL_SALESPEOPLE} onValueChange={setScopeId}>
          <SelectTrigger className="h-9 w-full sm:w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SALESPEOPLE}>Todo o time</SelectItem>
            {salespeople.map((sp) => (
              <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs sm:text-sm text-muted-foreground">Período: {periodLabel}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={isExporting || filteredRows.length === 0}
        className="gap-2"
      >
        {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Exportar relatório
      </Button>
    </div>
  );

  if (filteredRows.length === 0) {
    return (
      <div className="space-y-4 min-w-0">
        {scopeBar}
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={<BarChart3 className="h-12 w-12" />}
            title={
              scopedSalesperson
                ? `${scopedSalesperson.name} não registrou nada no período`
                : 'Nenhum registro de atividade comercial no período'
            }
            description="Peça para preencher o diário (Manhã/Tarde) na própria ficha do vendedor, ou troque o período no filtro acima."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      {scopeBar}

      <ActivityTotalsCards counters={totals} />

      <ActivityFunnelCard counters={totals} rates={rates} />

      <div className="grid gap-4 md:grid-cols-2 min-w-0">
        <ActivityGoalChart
          title="Contatos / Prospecções"
          series={series}
          metricKey="contacts"
          goal={goalContactsRef}
          color="#0EA5E9"
        />
        <ActivityGoalChart
          title="Reuniões agendadas"
          series={series}
          metricKey="meetings_scheduled"
          goal={goalMeetingsRef}
          color="#8B5CF6"
        />
      </div>

      <SalespeopleActivityTable rows={aggregates} isMobile={isMobile} />

      <ActivityMissingDaysList rows={aggregates} />
    </div>
  );
}
