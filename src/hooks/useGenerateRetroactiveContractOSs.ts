import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  buildContractVisits,
  regenerateFutureVisits,
  machinesFromItemRows,
  effectiveItemTemplateIds,
  type ContractItemMachineRow,
  type PlanActivityInput,
} from '@/hooks/useContracts';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Geração retroativa de OSs para um contrato que já existe mas não tem nenhuma
 * ordem de serviço criada (ex.: contratos PMOC criados antes da v1.9.12, quando
 * a geração automática ainda dependia do cron `generate-pmoc-orders`, ou
 * contratos cujas OSs foram apagadas).
 *
 * ⚠️ FONTE ÚNICA: este caminho NÃO reimplementa a geração. Ele delega ao MESMO
 * motor de createContract/renewContract — `buildContractVisits` (que bifurca em
 * 3 caminhos: por-máquina PMOC, agrupado por frequência, e cadência única
 * legado) + `regenerateFutureVisits` → `persistContractVisit`. Com isso, a OS
 * retroativa sai IDÊNTICA à do fluxo normal:
 *   • plano por frequência (contract_plan_activities) vira snapshot de atividades;
 *   • múltiplos checklists por equipamento (contract_items.form_template_ids)
 *     viram N linhas de service_order_equipment (1 por equipamento × checklist);
 *   • exclusões da 1ª OS (contract_items.first_os_excluded_questions) NÃO são
 *     aplicadas aqui — elas vivem em contract_items e o RENDER da OS filtra por
 *     equipamento ancorando na 1ª visita real do contrato. Gerar as OSs com o
 *     conteúdo certo é suficiente; a visibilidade resolve sozinha.
 *
 * A ÚNICA diferença do fluxo normal é a JANELA de datas: a geração retroativa
 * cobre a série COMPLETA do contrato (do start_date até o horizonte), sem o
 * corte `fromMonthStr` que a edição/renovação usam pra mexer só no futuro.
 *
 * Idempotente: confere antes se o contrato já tem OSs vinculadas — se tiver,
 * aborta com toast informativo e NÃO duplica. Como `oldRegenerableIds=[]` e
 * `deleteOld=false`, nenhuma OS existente é apagada.
 *
 * Não atualiza `next_pmoc_generation_date` (legado/informativo desde a v1.9.12).
 */
export function useGenerateRetroactiveContractOSs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contractId: string) => {
      // Carrega o contrato. `company_id` é OBRIGATÓRIO no payload da OS (RLS de
      // service_orders bloqueia em silêncio sem ele — incidente v1.9.20).
      const { data: contract, error: contractErr } = await supabase
        .from('contracts')
        .select(`
          id,
          company_id,
          name,
          customer_id,
          technician_id,
          team_id,
          service_type_id,
          form_template_id,
          status,
          frequency_type,
          frequency_value,
          start_date,
          horizon_months
        `)
        .eq('id', contractId)
        .single();

      if (contractErr || !contract) {
        throw new Error('Contrato não encontrado.');
      }

      const c = contract as any;

      if (c.status !== 'active') {
        throw new Error('Apenas contratos ativos podem gerar OSs.');
      }

      // Idempotência: se já existem OSs vinculadas, não gera de novo.
      const { count: existingCount, error: countErr } = await supabase
        .from('service_orders')
        .select('id', { count: 'exact', head: true })
        .eq('contract_id', contractId);

      if (countErr) throw countErr;

      if ((existingCount ?? 0) > 0) {
        return { skipped: true, generated: 0, expected: 0 };
      }

      // ── Plano de serviços com frequência (contract_plan_activities) ─────────
      // Mesma forma que updateContractEquipment/renewContract leem. Vazio =
      // contrato sem plano → buildContractVisits cai na cadência única (legado).
      const { data: persisted } = await supabase
        .from('contract_plan_activities')
        .select('id, description, guidance, section, component, freq_code, freq_months, is_measurement, unit, expected_min, expected_max, contract_item_id, catalog_activity_id, applies_per_equipment, form_template_id')
        .eq('contract_id', contractId)
        .order('sort_order', { ascending: true });
      const effPlan: PlanActivityInput[] = (persisted ?? []).map((a: any) => ({
        description: a.description,
        guidance: a.guidance,
        section: a.section,
        component: a.component,
        freq_code: a.freq_code,
        freq_months: a.freq_months,
        is_measurement: a.is_measurement,
        unit: a.unit,
        expected_min: a.expected_min,
        expected_max: a.expected_max,
        contract_item_id: a.contract_item_id,
        catalog_activity_id: a.catalog_activity_id,
        applies_per_equipment: a.applies_per_equipment,
        form_template_id: a.form_template_id,
      }));
      const effPlanIds: (string | null)[] = (persisted ?? []).map((a: any) => a.id);
      const useGroupedEngine = effPlan.length > 0;

      // ── Itens do contrato (escopo + fase + checklists por equipamento) ──────
      // Inclui pmoc_scope/pmoc_start_visit (motor por máquina) e
      // form_template_id(s) (múltiplos checklists por equipamento — M5).
      const { data: contractItemsRows } = await supabase
        .from('contract_items')
        .select('id, equipment_id, pmoc_scope, pmoc_start_visit, sort_order, form_template_id, form_template_ids')
        .eq('contract_id', contractId);
      const itemRows = (contractItemsRows ?? []) as ContractItemMachineRow[];

      const equipmentIds = itemRows
        .map((i) => i.equipment_id)
        .filter(Boolean) as string[];

      // M5 — checklists EFETIVOS por equipamento: 1 linha de
      // service_order_equipment por (equipamento × checklist). Mesma regra do create.
      const equipmentTemplateMap: Record<string, string[]> = {};
      for (const it of itemRows) {
        if (!it.equipment_id) continue;
        equipmentTemplateMap[it.equipment_id] = effectiveItemTemplateIds(
          it.form_template_ids,
          it.form_template_id,
        );
      }

      // contract_item_id → equipment_id (resolve atividade amarrada a um item).
      const itemEquipmentMap: Record<string, string | null> = {};
      for (const it of itemRows) {
        itemEquipmentMap[it.id] = it.equipment_id ?? null;
      }

      // Máquinas (escopo + fase) → ativa o motor por máquina (PMOC) quando há plano.
      const machines = machinesFromItemRows(itemRows);

      // Série COMPLETA do contrato (sem corte de data — é a diferença do retroativo).
      const visits = buildContractVisits({
        startDate: new Date(c.start_date + 'T12:00:00'),
        frequencyType: c.frequency_type as 'days' | 'months',
        frequencyValue: c.frequency_value as number,
        horizonMonths: c.horizon_months as number,
        planActivities: effPlan,
        planActivityIds: effPlanIds,
        machines: machines.length > 0 ? machines : undefined,
      });

      const expected = visits.length;

      const effTechnicianId = (c.technician_id as string | null) ?? null;
      const effTeamId = (c.team_id as string | null) ?? null;
      const assigneeUserIds = effTechnicianId ? [effTechnicianId] : [];

      // Delega à fonte única de persistência. deleteOld=false e
      // oldRegenerableIds=[] → só GERA (nunca apaga). A validação
      // assertAllVisitsPersisted está embutida: se faltar visita, lança erro
      // PT-BR que o onError vira toast destrutivo.
      const { createdCount } = await regenerateFutureVisits({
        companyId: c.company_id,
        contractId,
        visits,
        oldRegenerableIds: [],
        deleteOld: false,
        contractName: (c.name as string | null) || 'Contrato',
        useGroupedEngine,
        customerId: c.customer_id as string,
        technicianId: effTechnicianId,
        teamId: effTeamId,
        serviceTypeId: (c.service_type_id as string | null) ?? null,
        formTemplateId: (c.form_template_id as string | null) ?? null,
        equipmentIds,
        itemEquipmentMap,
        equipmentTemplateMap,
        assigneeUserIds,
        createdBy: user?.id || null,
      });

      return { skipped: false, generated: createdCount, expected };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] });

      if (result.skipped) {
        toast({
          title: 'Contrato já possui OSs',
          description: 'Nada a fazer — as ordens já existem.',
        });
        return;
      }

      toast({
        title: `${result.generated} OS(s) geradas para o contrato.`,
        description: 'O cronograma agora reflete o calendário completo.',
      });
    },
    onError: (e: Error) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar OSs do contrato',
        description: getErrorMessage(e),
      });
    },
  });
}
