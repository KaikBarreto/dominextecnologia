import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { generateOccurrences } from '@/hooks/useContracts';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Geração retroativa de OSs para um contrato que já existe mas não tem
 * ordens de serviço criadas (ex.: contratos PMOC criados antes da v1.9.12,
 * quando a geração automática ainda dependia do cron `generate-pmoc-orders`
 * que estava desabilitado).
 *
 * Idempotente: confere antes se o contrato já tem OSs vinculadas — se tiver,
 * aborta com toast informativo e NÃO duplica.
 *
 * Espelha fielmente o loop de geração de `useContracts.createContract`
 * (mesma frequência, mesmo horizonte, mesma estrutura de OS +
 * service_order_assignees + service_order_equipment). Único atalho: pega
 * assignees apenas a partir do `technician_id` do contrato — se o gestor
 * quiser ajustar time/responsáveis, edita as OSs depois ou usa o fluxo
 * normal de criação.
 *
 * Não atualiza `next_pmoc_generation_date` (esse campo é legado / informativo
 * desde a v1.9.12 que aposentou o cron).
 */
export function useGenerateRetroactiveContractOSs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contractId: string) => {
      // Carrega contrato + itens
      // `company_id` é OBRIGATÓRIO no payload da OS (RLS em service_orders
      // exige). Sem ele, o INSERT era rejeitado silenciosamente e o botão
      // "Gerar OSs agora" parecia funcionar mas não criava nada. Fix v1.9.20.
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
          horizon_months,
          is_pmoc,
          contract_items (id, equipment_id, form_template_id, sort_order)
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

      // Idempotência: se já existem OSs vinculadas, não gera de novo
      const { count: existingCount, error: countErr } = await supabase
        .from('service_orders')
        .select('id', { count: 'exact', head: true })
        .eq('contract_id', contractId);

      if (countErr) throw countErr;

      if ((existingCount ?? 0) > 0) {
        return { skipped: true, generated: 0, expected: 0 };
      }

      // Mesmo cálculo de datas usado em createContract
      const occurrenceDates = generateOccurrences(
        new Date(c.start_date + 'T12:00:00'),
        c.frequency_type as 'days' | 'months',
        c.frequency_value,
        c.horizon_months,
      );

      const equipmentIds: string[] = (c.contract_items || [])
        .map((item: any) => item.equipment_id)
        .filter((id: string | null): id is string => Boolean(id));

      const assigneeUserIds: string[] = c.technician_id ? [c.technician_id] : [];

      let created = 0;
      let errors = 0;

      for (let i = 0; i < occurrenceDates.length; i++) {
        const date = occurrenceDates[i];
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        const description = `${c.name} — Ocorrência ${i + 1}`;

        const osPayload = normalizeOptionalForeignKeys(
          {
            // Ver comentário no .select acima — company_id é mandatório
            // pra RLS de service_orders aceitar o INSERT.
            company_id: c.company_id,
            customer_id: c.customer_id,
            equipment_id: equipmentIds.length === 1 ? equipmentIds[0] : null,
            technician_id: c.technician_id || null,
            team_id: c.team_id || null,
            os_type: 'manutencao_preventiva' as const,
            service_type_id: c.service_type_id || null,
            form_template_id: c.form_template_id || null,
            scheduled_date: dateStr,
            scheduled_time: '08:00',
            description,
            require_tech_signature: true,
            status: 'agendada' as const,
            contract_id: contractId,
            origin: 'contract',
            created_by: user?.id || null,
          } as any,
          ['technician_id', 'team_id', 'service_type_id', 'form_template_id', 'equipment_id'],
        );

        const { data: os, error: osError } = await supabase
          .from('service_orders')
          .insert(osPayload)
          .select('id')
          .single();

        if (osError || !os) {
          console.error(`Erro criando OS retroativa #${i + 1}:`, osError);
          errors++;
          continue;
        }

        created++;

        // Vincula equipamentos (junction)
        if (equipmentIds.length > 0) {
          const { error: eqErr } = await supabase.from('service_order_equipment').insert(
            equipmentIds.map((eqId) => ({
              service_order_id: os.id,
              equipment_id: eqId,
              form_template_id: c.form_template_id || null,
            })),
          );
          if (eqErr) console.error('Erro vinculando equipamentos:', eqErr);
        }

        // Vincula assignees (junction)
        if (assigneeUserIds.length > 0) {
          const { error: assignErr } = await supabase.from('service_order_assignees').insert(
            assigneeUserIds.map((uid) => ({
              service_order_id: os.id,
              user_id: uid,
            })),
          );
          if (assignErr) console.error('Erro vinculando responsáveis:', assignErr);
        }

        // A OS recorrente JÁ é a visita do contrato — não há mais
        // tabela-sombra de ocorrências pra criar.
      }

      return {
        skipped: false,
        generated: created,
        expected: occurrenceDates.length,
        errors,
      };
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

      if (result.errors && result.errors > 0) {
        toast({
          variant: 'destructive',
          title: `${result.errors} OS(s) falharam ao ser geradas`,
          description: `${result.generated} de ${result.expected} criadas com sucesso.`,
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
