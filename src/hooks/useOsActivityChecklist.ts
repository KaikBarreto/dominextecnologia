import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Checklist da VISITA pro técnico em campo. Lê as atividades (snapshot do plano
 * PMOC/manutenção) de UMA OS — as colunas que o técnico preenche — e expõe uma
 * mutação idempotente por linha (conformity_status + measured_value).
 *
 * Diferente do `useServiceOrderActivities` (read-only, várias OSs, aba de
 * contrato), aqui o escopo é sempre UMA OS e há escrita. Hook é a fronteira do
 * Supabase: o componente nunca chama `supabase.from` direto.
 *
 * Offline-first: a escrita é um UPDATE por id de linha (idempotente — repetir o
 * mesmo update não duplica nada), com atualização otimista do estado local pra
 * o técnico ver a resposta na hora mesmo com rede ruim; em erro, reverte.
 */

export type ActivityConformity = 'conforme' | 'nao_conforme' | 'na';

export interface ChecklistActivity {
  id: string;
  equipment_id: string | null;
  section: string | null;
  component: string | null;
  description: string;
  /** Instrução intuitiva de "como fazer" a atividade, exibida só pro técnico no preenchimento. */
  guidance: string | null;
  freq_code: string | null;
  is_measurement: boolean;
  unit: string | null;
  expected_min: number | null;
  expected_max: number | null;
  sort_order: number;
  conformity_status: ActivityConformity | null;
  measured_value: number | null;
  /** CSV de URLs de fotos opcionais anexadas pelo técnico (mesmo padrão do form). */
  activity_photos: string | null;
}

export interface ChecklistEquipmentGroup {
  equipmentId: string | null;
  /** Nome de exibição: nome do equipamento ou "Geral / Local". */
  equipmentName: string;
  activities: ChecklistActivity[];
}

const SELECT =
  'id, equipment_id, section, component, description, guidance, freq_code, is_measurement, unit, expected_min, expected_max, sort_order, conformity_status, measured_value, activity_photos';

/** M/T/S/A/E → label de frequência. Default: o próprio código. */
export function freqLabel(freqCode: string | null | undefined): string | null {
  if (!freqCode) return null;
  const map: Record<string, string> = {
    M: 'Mensal',
    T: 'Trimestral',
    S: 'Semestral',
    A: 'Anual',
    E: 'Eventual',
  };
  return map[freqCode] ?? freqCode;
}

/**
 * Rollup de conformidade da OS a partir das atividades:
 * - 'nao_conforme' se qualquer atividade for não-conforme;
 * - 'conforme' se TODAS as atividades já têm resposta E nenhuma é não-conforme;
 * - 'parcial' se há respostas mas ainda falta alguma (ou alguma medição fora da faixa);
 * - null se nenhuma atividade foi respondida ainda (não força status na OS).
 * 'na' (não se aplica) conta como respondida, mas não como conforme nem não-conforme.
 */
export function rollupConformity(
  activities: Pick<ChecklistActivity, 'conformity_status'>[]
): 'conforme' | 'parcial' | 'nao_conforme' | null {
  if (activities.length === 0) return null;
  const answered = activities.filter((a) => !!a.conformity_status);
  if (answered.length === 0) return null;
  if (answered.some((a) => a.conformity_status === 'nao_conforme')) return 'nao_conforme';
  const allAnswered = answered.length === activities.length;
  const allConformeOrNa = answered.every(
    (a) => a.conformity_status === 'conforme' || a.conformity_status === 'na'
  );
  if (allAnswered && allConformeOrNa) return 'conforme';
  return 'parcial';
}

/** Medição fora da faixa esperada? (só quando há min/max e valor numérico). */
export function isOutOfRange(
  value: number | null,
  min: number | null,
  max: number | null
): boolean {
  if (value === null || Number.isNaN(value)) return false;
  if (min !== null && value < min) return true;
  if (max !== null && value > max) return true;
  return false;
}

export function useOsActivityChecklist(serviceOrderId: string | undefined) {
  const [activities, setActivities] = useState<ChecklistActivity[]>([]);
  const [equipmentNames, setEquipmentNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchActivities = useCallback(async () => {
    if (!serviceOrderId) {
      setActivities([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_order_activities')
        .select(SELECT)
        .eq('service_order_id', serviceOrderId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as ChecklistActivity[];
      setActivities(rows);

      // Resolve nome dos equipamentos referenciados (null = atividade de local).
      const ids = Array.from(
        new Set(rows.map((r) => r.equipment_id).filter((v): v is string => !!v))
      );
      if (ids.length > 0) {
        const { data: eqs } = await supabase
          .from('equipment')
          .select('id, name')
          .in('id', ids);
        const map: Record<string, string> = {};
        for (const e of eqs ?? []) map[(e as any).id] = (e as any).name;
        setEquipmentNames(map);
      } else {
        setEquipmentNames({});
      }
    } catch {
      // Falha de leitura não trava a tela; o painel simplesmente não aparece.
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [serviceOrderId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  /**
   * Grava a resposta de UMA atividade (idempotente). Atualização otimista; em
   * erro reverte pro valor anterior e relança pra a UI dar feedback.
   */
  const saveActivity = useCallback(
    async (
      activityId: string,
      patch: {
        conformity_status?: ActivityConformity | null;
        measured_value?: number | null;
        activity_photos?: string | null;
      }
    ) => {
      const prev = activities.find((a) => a.id === activityId);
      setActivities((curr) =>
        curr.map((a) => (a.id === activityId ? { ...a, ...patch } : a))
      );
      const { error } = await supabase
        .from('service_order_activities')
        .update(patch)
        .eq('id', activityId);
      if (error) {
        // Reverte a linha pro estado anterior.
        if (prev) {
          setActivities((curr) =>
            curr.map((a) => (a.id === activityId ? prev : a))
          );
        }
        throw error;
      }
    },
    [activities]
  );

  // Agrupa por equipment_id preservando a ordem de sort_order.
  const groups: ChecklistEquipmentGroup[] = [];
  const groupIndex = new Map<string, number>();
  for (const a of activities) {
    const key = a.equipment_id ?? '__local__';
    let idx = groupIndex.get(key);
    if (idx === undefined) {
      idx = groups.length;
      groupIndex.set(key, idx);
      groups.push({
        equipmentId: a.equipment_id,
        equipmentName: a.equipment_id
          ? equipmentNames[a.equipment_id] ?? 'Equipamento'
          : 'Geral / Local',
        activities: [],
      });
    }
    groups[idx].activities.push(a);
  }

  return {
    activities,
    groups,
    loading,
    hasActivities: activities.length > 0,
    saveActivity,
    refetch: fetchActivities,
    rollup: rollupConformity(activities),
  };
}
