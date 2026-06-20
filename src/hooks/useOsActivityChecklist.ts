import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { FormQuestion } from '@/types/database';

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
  /**
   * Checklist personalizado por máquina (PMOC por equipamento, Fase 3): quando
   * preenchido, esta atividade NÃO é um item de conformidade único e sim um
   * BLOCO de perguntas do `form_template` (renderizadas no checklist da visita).
   * As respostas vão em `form_responses` (por OS + equipamento + pergunta).
   */
  form_template_id: string | null;
}

/** Uma resposta de pergunta de checklist personalizado (form_responses). */
export interface ChecklistFormResponse {
  question_id: string;
  response_value: string | null;
  response_photo_url: string | null;
}

/** Chave de resposta: isola por equipamento + pergunta (mesma máquina, mesma OS). */
export function formResponseKey(
  equipmentId: string | null | undefined,
  questionId: string
): string {
  return `${equipmentId ?? '__null__'}::${questionId}`;
}

/** Categoria do equipamento (cor + nome), pro badge no header do grupo. */
export interface ChecklistEquipmentCategory {
  name: string;
  color: string | null;
}

/** Dados de exibição do equipamento resolvidos pra montar o header do grupo. */
export interface ChecklistEquipmentInfo {
  name: string;
  /** URL (path no bucket) da foto do equipamento — usada com SignedImg. */
  photo_url: string | null;
  brand: string | null;
  model: string | null;
  category: ChecklistEquipmentCategory | null;
}

export interface ChecklistEquipmentGroup {
  equipmentId: string | null;
  /** Nome de exibição: nome do equipamento ou "Geral / Local". */
  equipmentName: string;
  /** Foto/marca/modelo/categoria do equipamento (null em grupo "Geral / Local"). */
  equipment: ChecklistEquipmentInfo | null;
  activities: ChecklistActivity[];
}

const SELECT =
  'id, equipment_id, section, component, description, guidance, freq_code, is_measurement, unit, expected_min, expected_max, sort_order, conformity_status, measured_value, activity_photos, form_template_id';

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

/** Uma resposta de form_response "vale" (tem valor não-vazio ou foto). */
export function isFormResponseAnswered(
  resp: Pick<ChecklistFormResponse, 'response_value' | 'response_photo_url'> | undefined | null
): boolean {
  if (!resp) return false;
  const val = typeof resp.response_value === 'string' ? resp.response_value.trim() : '';
  const hasValue = val !== '' && val !== '-';
  return hasValue || !!resp.response_photo_url;
}

/**
 * Atividade de checklist personalizado (`form_template_id`) está "feita" quando
 * TODAS as perguntas OBRIGATÓRIAS do template foram respondidas (valor ou foto).
 * Perguntas opcionais não travam. Sem perguntas obrigatórias → conta como feita
 * assim que existir ao menos uma pergunta (template carregado).
 */
export function isTemplateActivityComplete(
  questions: Pick<FormQuestion, 'id' | 'is_required'>[],
  getResponse: (questionId: string) => ChecklistFormResponse | undefined
): boolean {
  const required = questions.filter((q) => q.is_required);
  return required.every((q) => isFormResponseAnswered(getResponse(q.id)));
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
  const [equipmentInfo, setEquipmentInfo] = useState<Record<string, ChecklistEquipmentInfo>>({});
  const [loading, setLoading] = useState(true);
  // Checklists personalizados por máquina (Fase 3): perguntas por template_id e
  // respostas existentes da OS, indexadas por `formResponseKey(equipmentId, questionId)`.
  const [formQuestionsByTemplate, setFormQuestionsByTemplate] = useState<
    Record<string, FormQuestion[]>
  >({});
  const [formResponses, setFormResponses] = useState<Record<string, ChecklistFormResponse>>({});

  const fetchActivities = useCallback(async () => {
    if (!serviceOrderId) {
      setActivities([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // PostgREST limita `.select()` a 1000 linhas por padrão. Uma OS PMOC com
      // muitos equipamentos/atividades passa disso → sem paginar, o técnico veria
      // o checklist TRUNCADO em 1000. Lê em páginas de 1000 via `.range()` até
      // esgotar (página menor que o tamanho = fim).
      const PAGE = 1000;
      const rows: ChecklistActivity[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('service_order_activities')
          .select(SELECT)
          .eq('service_order_id', serviceOrderId)
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as ChecklistActivity[];
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      setActivities(rows);

      // Resolve nome dos equipamentos referenciados (null = atividade de local).
      const ids = Array.from(
        new Set(rows.map((r) => r.equipment_id).filter((v): v is string => !!v))
      );
      if (ids.length > 0) {
        const { data: eqs } = await supabase
          .from('equipment')
          .select('id, name, photo_url, brand, model, category:equipment_categories(name, color)')
          .in('id', ids);
        const map: Record<string, ChecklistEquipmentInfo> = {};
        for (const e of eqs ?? []) {
          const row = e as any;
          map[row.id] = {
            name: row.name,
            photo_url: row.photo_url ?? null,
            brand: row.brand ?? null,
            model: row.model ?? null,
            category: row.category
              ? { name: row.category.name, color: row.category.color ?? null }
              : null,
          };
        }
        setEquipmentInfo(map);
      } else {
        setEquipmentInfo({});
      }

      // Checklists personalizados por máquina: para as atividades que apontam um
      // `form_template_id`, carrega as PERGUNTAS de cada template (uma vez por id)
      // e as RESPOSTAS já dadas nesta OS (pra pré-preencher). Tudo paginado em
      // 1000 (teto do PostgREST) — uma OS PMOC grande pode passar disso.
      const templateIds = Array.from(
        new Set(rows.map((r) => r.form_template_id).filter((v): v is string => !!v))
      );
      if (templateIds.length > 0) {
        // Perguntas dos templates (ordenadas por position).
        const qById: Record<string, FormQuestion[]> = {};
        const allQuestionIds: string[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data: qData, error: qErr } = await supabase
            .from('form_questions')
            .select('*')
            .in('template_id', templateIds)
            .order('position', { ascending: true })
            .range(from, from + PAGE - 1);
          if (qErr) throw qErr;
          const qPage = (qData ?? []) as FormQuestion[];
          for (const q of qPage) {
            (qById[q.template_id] ??= []).push(q);
            allQuestionIds.push(q.id);
          }
          if (qPage.length < PAGE) break;
        }
        setFormQuestionsByTemplate(qById);

        // Respostas existentes desta OS, restritas às perguntas desses templates.
        const respMap: Record<string, ChecklistFormResponse> = {};
        if (allQuestionIds.length > 0) {
          for (let from = 0; ; from += PAGE) {
            const { data: rData, error: rErr } = await supabase
              .from('form_responses')
              .select('question_id, equipment_id, response_value, response_photo_url')
              .eq('service_order_id', serviceOrderId)
              .in('question_id', allQuestionIds)
              .range(from, from + PAGE - 1);
            if (rErr) throw rErr;
            const rPage = (rData ?? []) as any[];
            for (const r of rPage) {
              respMap[formResponseKey(r.equipment_id, r.question_id)] = {
                question_id: r.question_id,
                response_value: r.response_value ?? null,
                response_photo_url: r.response_photo_url ?? null,
              };
            }
            if (rPage.length < PAGE) break;
          }
        }
        setFormResponses(respMap);
      } else {
        setFormQuestionsByTemplate({});
        setFormResponses({});
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

  /**
   * Grava/atualiza a resposta de UMA pergunta de checklist personalizado
   * (form_responses), isolada por OS + equipamento + pergunta. Upsert manual:
   * atualiza se já existe a linha (mesma tripla), senão insere. Idempotente
   * (repetir o mesmo save não duplica). Atualização otimista; erro reverte e
   * relança pra a UI dar feedback.
   */
  const saveFormResponse = useCallback(
    async (
      equipmentId: string | null,
      questionId: string,
      patch: { response_value?: string | null; response_photo_url?: string | null }
    ) => {
      if (!serviceOrderId) return;
      const key = formResponseKey(equipmentId, questionId);
      const prev = formResponses[key];
      const next: ChecklistFormResponse = {
        question_id: questionId,
        response_value:
          patch.response_value !== undefined ? patch.response_value : prev?.response_value ?? null,
        response_photo_url:
          patch.response_photo_url !== undefined
            ? patch.response_photo_url
            : prev?.response_photo_url ?? null,
      };
      setFormResponses((curr) => ({ ...curr, [key]: next }));
      try {
        // Procura a linha existente pra essa tripla (equipment_id pode ser null).
        let q = supabase
          .from('form_responses')
          .select('id')
          .eq('service_order_id', serviceOrderId)
          .eq('question_id', questionId);
        q = equipmentId ? q.eq('equipment_id', equipmentId) : q.is('equipment_id', null);
        const { data: existing } = await q.maybeSingle();

        const respondedAt = new Date().toISOString();
        const { data: userData } = await supabase.auth.getUser();
        const respondedBy = userData?.user?.id ?? null;

        if (existing) {
          const { error } = await supabase
            .from('form_responses')
            .update({
              response_value: next.response_value,
              response_photo_url: next.response_photo_url,
              responded_at: respondedAt,
              responded_by: respondedBy,
            } as any)
            .eq('id', (existing as any).id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('form_responses').insert({
            service_order_id: serviceOrderId,
            equipment_id: equipmentId,
            question_id: questionId,
            response_value: next.response_value,
            response_photo_url: next.response_photo_url,
            responded_at: respondedAt,
            responded_by: respondedBy,
          } as any);
          if (error) throw error;
        }
      } catch (error) {
        // Reverte pro estado anterior (remove a chave se não existia antes).
        setFormResponses((curr) => {
          const copy = { ...curr };
          if (prev) copy[key] = prev;
          else delete copy[key];
          return copy;
        });
        throw error;
      }
    },
    [serviceOrderId, formResponses]
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
      const info = a.equipment_id ? equipmentInfo[a.equipment_id] ?? null : null;
      groups.push({
        equipmentId: a.equipment_id,
        equipmentName: a.equipment_id
          ? info?.name ?? 'Equipamento'
          : 'Geral / Local',
        equipment: info,
        activities: [],
      });
    }
    groups[idx].activities.push(a);
  }

  /** Lê uma resposta de checklist personalizado (helper p/ a UI e contagem). */
  const getFormResponse = useCallback(
    (equipmentId: string | null, questionId: string): ChecklistFormResponse | undefined =>
      formResponses[formResponseKey(equipmentId, questionId)],
    [formResponses]
  );

  return {
    activities,
    groups,
    loading,
    hasActivities: activities.length > 0,
    saveActivity,
    refetch: fetchActivities,
    // Conformidade só considera atividades de conformidade (sem template). As
    // atividades de checklist personalizado têm completude própria (perguntas).
    rollup: rollupConformity(activities.filter((a) => !a.form_template_id)),
    // Checklists personalizados por máquina.
    formQuestionsByTemplate,
    formResponses,
    getFormResponse,
    saveFormResponse,
  };
}
