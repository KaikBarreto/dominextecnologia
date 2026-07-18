import { useMemo, useState } from 'react';
import { Wrench, FilterX, ClipboardCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { cn } from '@/lib/utils';
import { sectionLabel } from '@/utils/sectionLabel';
import { formatBrtDateTime } from '@/lib/date-br';
import type { ContractActivityExecutionRow } from '@/hooks/useContractPmocExecution';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

/**
 * View PURA do "Histórico PMOC" — prova de cumprimento da Planilha PMOC
 * tarefa-a-tarefa. Recebe as linhas já carregadas (`rows`) e agrupa
 * visita → equipamento → tarefa, com selo SATURADO de conformidade e carimbo de
 * quando/quem (America/Sao_Paulo). NÃO chama Supabase nem hook — o caller
 * resolve os dados (aba autenticada via hook; portal público via payload da
 * edge). Mobile-first, PT-BR, tema do contexto que a renderiza.
 */

type ExecutionHistoryT = ReturnType<typeof useExecutionHistoryT>;

function useExecutionHistoryT() {
  const { locale } = useAppLocaleContext();
  return MESSAGES[locale].app.pmoc.executionHistory;
}

/** Data BR (DD/MM/AAAA) a partir de um date-only "yyyy-MM-dd", sem off-by-one. */
function formatDateOnlyBR(dateOnly: string | null | undefined, noDateLabel: string): string {
  if (!dateOnly) return noDateLabel;
  const [y, m, d] = dateOnly.split('-').map(Number);
  if (!y || !m || !d) return noDateLabel;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/** Status de conformidade da tarefa → selo SATURADO (régua do time). */
function conformityBadge(status: ContractActivityExecutionRow['conformity_status'], t: ExecutionHistoryT) {
  switch (status) {
    case 'conforme':
      return { label: t.conformity.conforme, className: 'bg-emerald-600 text-white hover:bg-emerald-600' };
    case 'nao_conforme':
      return { label: t.conformity.nao_conforme, className: 'bg-red-600 text-white hover:bg-red-600' };
    case 'na':
      return { label: t.conformity.na, className: 'bg-slate-500 text-white hover:bg-slate-500' };
    default:
      return { label: t.conformity.sem_resposta, className: 'bg-muted text-muted-foreground' };
  }
}

/** Status da VISITA (visit_conformity) → selo no cabeçalho do grupo de visita. */
function visitBadge(status: string | null, t: ExecutionHistoryT) {
  switch (status) {
    case 'conforme':
      return { label: t.visitConformity.conforme, className: 'bg-emerald-600 text-white hover:bg-emerald-600' };
    case 'nao_conforme':
      return { label: t.visitConformity.nao_conforme, className: 'bg-red-600 text-white hover:bg-red-600' };
    case 'na':
      return { label: t.visitConformity.na, className: 'bg-slate-500 text-white hover:bg-slate-500' };
    default:
      return null;
  }
}

interface VisitGroup {
  serviceOrderId: string;
  scheduledDate: string | null;
  orderNumber: number | null;
  visitConformity: string | null;
  /** equipamento (nome) → tarefas, na ordem original (sort_order). */
  equipments: Array<{
    equipmentId: string | null;
    equipmentName: string;
    tasks: ContractActivityExecutionRow[];
  }>;
}

interface PmocExecutionHistoryViewProps {
  rows: ContractActivityExecutionRow[];
  /**
   * `false` esconde o cabeçalho "Histórico PMOC" (o portal já tem o seu próprio
   * título de aba/seção). Default `true` (aba autenticada do contrato).
   */
  showHeader?: boolean;
}

/**
 * Renderiza o histórico de execução PMOC agrupado. As linhas DEVEM vir ordenadas
 * por scheduled_date desc (mais recente primeiro) — preservamos a ordem de chegada
 * pra montar os grupos de visita.
 */
export function PmocExecutionHistoryView({
  rows,
  showHeader = true,
}: PmocExecutionHistoryViewProps) {
  const t = useExecutionHistoryT();

  // Frequência M/T/S/A/E → rótulo no locale atual.
  const FREQ_LABELS: Record<string, string> = {
    M: t.freq.M,
    T: t.freq.T,
    S: t.freq.S,
    A: t.freq.A,
    E: t.freq.E,
  };

  // Filtro opcional por equipamento (multi-seleção; vazio = todos).
  const [selectedEquipments, setSelectedEquipments] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);

  // Opções do filtro = equipamentos distintos presentes na execução.
  const equipmentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      const key = r.equipment_id ?? `__noeq__${r.equipment_name ?? t.noEquipment}`;
      if (!seen.has(key)) seen.set(key, r.equipment_name ?? t.noEquipment);
    }
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [rows, t.noEquipment]);

  // Agrupamento visita → equipamento → tarefa. As linhas já vêm ordenadas por
  // scheduled_date desc (mais recente primeiro); preservamos essa ordem.
  const visitGroups = useMemo<VisitGroup[]>(() => {
    const filtered = selectedEquipments.length
      ? rows.filter((r) => {
          const key = r.equipment_id ?? `__noeq__${r.equipment_name ?? 'sem-equipamento'}`;
          return selectedEquipments.includes(key);
        })
      : rows;

    const byVisit = new Map<string, VisitGroup>();
    for (const r of filtered) {
      let visit = byVisit.get(r.service_order_id);
      if (!visit) {
        visit = {
          serviceOrderId: r.service_order_id,
          scheduledDate: r.scheduled_date,
          orderNumber: r.order_number,
          visitConformity: r.visit_conformity,
          equipments: [],
        };
        byVisit.set(r.service_order_id, visit);
      }
      const eqKey = r.equipment_id ?? `__noeq__${r.equipment_name ?? t.noEquipment}`;
      let eq = visit.equipments.find((e) =>
        (e.equipmentId ?? `__noeq__${e.equipmentName}`) === eqKey,
      );
      if (!eq) {
        eq = {
          equipmentId: r.equipment_id,
          equipmentName: r.equipment_name ?? t.noEquipment,
          tasks: [],
        };
        visit.equipments.push(eq);
      }
      eq.tasks.push(r);
    }

    // Ordena tarefas de cada equipamento por sort_order (estável).
    for (const visit of byVisit.values()) {
      for (const eq of visit.equipments) {
        eq.tasks.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      }
    }
    return Array.from(byVisit.values());
  }, [rows, selectedEquipments]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="h-full w-full" />}
        title={t.emptyTitle}
        description={t.emptyDesc}
      />
    );
  }

  const filterActive = selectedEquipments.length > 0;

  return (
    <div className="space-y-4 min-w-0 w-full">
      {/* Cabeçalho: total de visitas + filtro por equipamento (se vale a pena). */}
      {(showHeader || equipmentOptions.length > 1) && (
        <div className="flex items-center justify-between gap-2">
          {showHeader ? (
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold">{t.headerTitle}</h2>
              <p className="text-xs text-muted-foreground break-words">
                {t.headerDesc}
              </p>
            </div>
          ) : (
            <span className="min-w-0" />
          )}
          {equipmentOptions.length > 1 && (
            <Button
              variant={filterActive ? 'default' : 'outline'}
              size="sm"
              className="shrink-0 min-h-9 active:scale-95 transition-transform rounded-xl"
              onClick={() => setShowFilter(true)}
            >
              <Wrench className="h-4 w-4 mr-1" />
              {filterActive ? t.filterBtnActive.replace('{n}', String(selectedEquipments.length)) : t.filterBtn}
            </Button>
          )}
        </div>
      )}

      {filterActive && (
        <button
          type="button"
          onClick={() => setSelectedEquipments([])}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <FilterX className="h-3.5 w-3.5" /> {t.clearFilter}
        </button>
      )}

      {visitGroups.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<Wrench className="h-full w-full" />}
          title={t.noTasksTitle}
          description={t.noTasksDesc}
        />
      ) : (
        <div className="space-y-4 min-w-0">
          {visitGroups.map((visit) => {
            const vb = visitBadge(visit.visitConformity, t);
            return (
              <Card
                key={visit.serviceOrderId}
                className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm"
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <span className="font-semibold">
                      {formatDateOnlyBR(visit.scheduledDate, t.noDate)}
                    </span>
                    {visit.orderNumber != null && (
                      <Badge variant="secondary" className="shrink-0">OS #{visit.orderNumber}</Badge>
                    )}
                    {vb && (
                      <Badge className={cn('shrink-0 border-transparent', vb.className)}>{vb.label}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 min-w-0">
                  {visit.equipments.map((eq) => (
                    <div key={eq.equipmentId ?? eq.equipmentName} className="min-w-0 space-y-2">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="break-words">{eq.equipmentName}</span>
                        <span className="text-xs text-muted-foreground">
                          ({eq.tasks.length} {eq.tasks.length === 1 ? t.tasks_one : t.tasks_other})
                        </span>
                      </div>
                      <div className="space-y-2 min-w-0">
                        {eq.tasks.map((task) => {
                          const cb = conformityBadge(task.conformity_status, t);
                          const secLabel = sectionLabel(task.section);
                          const freqLabel = task.freq_code ? FREQ_LABELS[task.freq_code] ?? task.freq_code : null;
                          const respondedAt = formatBrtDateTime(task.responded_at);
                          return (
                            <div
                              key={task.activity_id}
                              className="rounded-xl border p-3 text-sm min-w-0 space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <div className="min-w-0 flex-1">
                                  {(secLabel || task.component) && (
                                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground break-words">
                                      {[secLabel, task.component].filter(Boolean).join(' · ')}
                                    </p>
                                  )}
                                  <p className="break-words font-medium leading-snug">{task.description}</p>
                                </div>
                                <Badge className={cn('shrink-0 border-transparent', cb.className)}>
                                  {cb.label}
                                </Badge>
                              </div>

                              {/* Medição (quando houver valor medido). */}
                              {task.is_measurement && task.measured_value != null && (
                                <p className="text-xs text-muted-foreground">
                                  {t.measured}: <span className="font-medium text-foreground">{task.measured_value}{task.unit ? ` ${task.unit}` : ''}</span>
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                {freqLabel && (
                                  <span className="inline-flex items-center gap-1">
                                    <span className="text-primary">●</span> {freqLabel}
                                  </span>
                                )}
                                {respondedAt && <span>{respondedAt}</span>}
                                {task.responded_by_name && (
                                  <span className="break-words">{t.respondedBy} {task.responded_by_name}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filtro de equipamento (multi-seleção, padrão do time). */}
      <ResponsiveModal open={showFilter} onOpenChange={setShowFilter} title={t.filterModalTitle}>
        <div className="p-1">
          <FilterCheckboxGroup
            label={t.filterLabel}
            options={equipmentOptions}
            selected={selectedEquipments}
            onChange={setSelectedEquipments}
            emptyLabel={t.filterEmptyLabel}
          />
        </div>
      </ResponsiveModal>
    </div>
  );
}
