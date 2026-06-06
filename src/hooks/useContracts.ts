import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { useAuth } from '@/contexts/AuthContext';
import { addDays, addMonths } from 'date-fns';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';

export interface Contract {
  id: string;
  company_id: string;
  name: string;
  customer_id: string;
  technician_id: string | null;
  service_type_id: string | null;
  form_template_id: string | null;
  status: string;
  notes: string | null;
  frequency_type: string;
  frequency_value: number;
  start_date: string;
  horizon_months: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // PMOC (Onda A — Lei Federal 13.589/2018). Quando `is_pmoc=true`, RT é obrigatório
  // e cada OS gerada herda o selo de conformidade.
  is_pmoc: boolean;
  responsible_technician_id: string | null;
  pmoc_legal_compliance_text: string | null;
  next_pmoc_generation_date: string | null;
  customers?: { id: string; name: string; document?: string | null; address?: string | null; city?: string | null; state?: string | null } | null;
  responsible_technicians?: { id: string; full_name: string; cft_crea: string | null; modality: string | null } | null;
  contract_items?: ContractItem[];
  // OSs do contrato — fonte única das "visitas". Embute via FK
  // service_orders.contract_id. A tabela-sombra de ocorrências foi aposentada:
  // cada OS recorrente JÁ é a visita (geração eager desde a v1.9.12).
  service_orders?: ContractServiceOrder[];
}

/**
 * OS de um contrato, na forma mínima usada pela listagem e pelas stats.
 * "Visita #N" é DERIVADA: ordenar por scheduled_date asc e usar index + 1
 * (não existe occurrence_number em service_orders).
 */
export interface ContractServiceOrder {
  id: string;
  order_number: number;
  status: string;
  scheduled_date: string | null;
}

export interface ContractItem {
  id: string;
  contract_id: string;
  equipment_id: string | null;
  item_name: string;
  item_description: string | null;
  form_template_id: string | null;
  sort_order: number;
  equipment?: { id: string; name: string; brand: string | null; model: string | null } | null;
}

// Status de OS que NÃO contam como "visita ativa". Tudo fora desse conjunto
// (agendada, pendente, a_caminho, em_andamento, pausada) é OS ativa/pendente.
const INACTIVE_OS_STATUSES = new Set(['concluida', 'cancelada']);

/** OS ativa = ainda vai/pode acontecer (não concluída nem cancelada). */
export function isActiveContractOS(os: { status?: string | null }): boolean {
  return !INACTIVE_OS_STATUSES.has(os.status ?? '');
}

/**
 * Próxima visita do contrato = OS ativa com menor scheduled_date.
 * Derivado 100% de service_orders (a OS recorrente É a visita).
 */
export function getNextContractOS<T extends { status?: string | null; scheduled_date?: string | null }>(
  oss: T[] | null | undefined,
): T | undefined {
  return (oss || [])
    .filter((os) => isActiveContractOS(os) && !!os.scheduled_date)
    .sort((a, b) => new Date(a.scheduled_date!).getTime() - new Date(b.scheduled_date!).getTime())[0];
}

export function generateOccurrences(
  startDate: Date,
  frequencyType: 'days' | 'months',
  frequencyValue: number,
  horizonMonths: number
): Date[] {
  const dates: Date[] = [];
  const endDate = addMonths(startDate, horizonMonths);
  let current = new Date(startDate);
  while (current <= endDate && dates.length < 120) {
    dates.push(new Date(current));
    if (frequencyType === 'months') {
      current = addMonths(current, frequencyValue);
    } else {
      current = addDays(current, frequencyValue);
    }
  }
  return dates;
}

export function getFrequencyLabel(type: string, value: number): string {
  if (type === 'months') {
    const labels: Record<number, string> = { 1: 'Mensal', 2: 'Bimestral', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' };
    return labels[value] || `A cada ${value} meses`;
  }
  const dayLabels: Record<number, string> = { 7: 'Semanal', 15: 'Quinzenal', 30: 'A cada 30 dias', 45: 'A cada 45 dias', 60: 'A cada 60 dias', 90: 'A cada 90 dias' };
  return dayLabels[value] || `A cada ${value} dias`;
}

export function useContracts() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          customers (id, name, document, address, city, state),
          responsible_technicians:responsible_technician_id (id, full_name, cft_crea, modality),
          contract_items (id, contract_id, equipment_id, item_name, item_description, form_template_id, sort_order, equipment:equipment(id, name, brand, model)),
          service_orders (id, order_number, status, scheduled_date)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as Contract[];
    },
  });

  const createContract = useMutation({
    mutationFn: async (input: {
      name: string;
      customer_id: string;
      technician_id?: string | null;
      team_id?: string | null;
      assignee_user_ids?: string[];
      billing_responsible_ids?: string[];
      service_type_id?: string | null;
      form_template_id?: string | null;
      status: string;
      notes?: string | null;
      frequency_type: string;
      frequency_value: number;
      start_date: string;
      horizon_months: number;
      // PMOC (Onda A). Quando true, `responsible_technician_id` é obrigatório (a UI valida antes
      // de chamar). `next_pmoc_generation_date` é calculado se vier vazio na criação.
      is_pmoc?: boolean;
      responsible_technician_id?: string | null;
      pmoc_legal_compliance_text?: string | null;
      next_pmoc_generation_date?: string | null;
      items: { equipment_id?: string | null; item_name: string; item_description?: string | null; form_template_id?: string | null }[];
    }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user?.id || '')
        .single();

      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      // Quando PMOC e a próxima geração não foi informada, calculamos a partir da
      // primeira ocorrência (start_date + frequência) — mesma lógica de generateOccurrences,
      // pegando a segunda data da série (ou a primeira se só tiver uma).
      let nextPmocGenerationDate = input.next_pmoc_generation_date ?? null;
      if (input.is_pmoc && !nextPmocGenerationDate) {
        const dates = generateOccurrences(
          new Date(input.start_date + 'T12:00:00'),
          input.frequency_type as 'days' | 'months',
          input.frequency_value,
          input.horizon_months
        );
        const target = dates[1] ?? dates[0];
        if (target) {
          const y = target.getFullYear();
          const m = String(target.getMonth() + 1).padStart(2, '0');
          const d = String(target.getDate()).padStart(2, '0');
          nextPmocGenerationDate = `${y}-${m}-${d}`;
        }
      }

      const contractPayload = normalizeOptionalForeignKeys(
        {
          company_id: profile.company_id,
          name: input.name,
          customer_id: input.customer_id,
          technician_id: input.technician_id,
          team_id: input.team_id,
          service_type_id: input.service_type_id,
          form_template_id: input.form_template_id,
          status: input.status,
          notes: input.notes || null,
          frequency_type: input.frequency_type,
          frequency_value: input.frequency_value,
          start_date: input.start_date,
          horizon_months: input.horizon_months,
          billing_responsible_ids: input.billing_responsible_ids || [],
          // PMOC
          is_pmoc: input.is_pmoc ?? false,
          responsible_technician_id: input.is_pmoc ? (input.responsible_technician_id ?? null) : null,
          pmoc_legal_compliance_text: input.is_pmoc
            ? (input.pmoc_legal_compliance_text ?? 'Conforme Lei Federal 13.589/2018')
            : null,
          next_pmoc_generation_date: input.is_pmoc ? nextPmocGenerationDate : null,
          created_by: user?.id || null,
        } as any,
        ['technician_id', 'team_id', 'service_type_id', 'form_template_id', 'responsible_technician_id']
      );

      const { data: contract, error } = await supabase
        .from('contracts')
        .insert(contractPayload)
        .select('id')
        .single();

      if (error) throw error;

      // Create items
      if (input.items.length > 0) {
        const { error: itemError } = await supabase.from('contract_items').insert(
          input.items.map((item, i) => ({
            contract_id: (contract as any).id,
            equipment_id: item.equipment_id || null,
            item_name: item.item_name,
            item_description: item.item_description || null,
            form_template_id: item.form_template_id || null,
            sort_order: i,
          })) as any
        );
        if (itemError) throw itemError;
      }

      let osCreatedCount = 0;
      let osErrorCount = 0;
      let expectedOsCount = 0;

      // Geração imediata de OSs para TODOS os contratos ativos (PMOC ou comum).
      // O cron `generate-pmoc-orders` foi desabilitado: PMOC agora gera as N OSs
      // no momento da criação, igual a um contrato comum. O campo
      // `next_pmoc_generation_date` permanece como informação legada/futuro
      // auto-renew, mas não dispara mais cron.
      // Generate OSs and occurrences
      if (input.status === 'active') {
        const occurrenceDates = generateOccurrences(
          new Date(input.start_date + 'T12:00:00'),
          input.frequency_type as 'days' | 'months',
          input.frequency_value,
          input.horizon_months
        );
        expectedOsCount = occurrenceDates.length;

        const equipmentIds = input.items
          .filter(i => i.equipment_id)
          .map(i => i.equipment_id!);

        // Determine all user IDs that should be assignees
        const assigneeUserIds = input.assignee_user_ids && input.assignee_user_ids.length > 0
          ? input.assignee_user_ids
          : (input.technician_id ? [input.technician_id] : []);

        for (let i = 0; i < occurrenceDates.length; i++) {
          const date = occurrenceDates[i];
          // Use date parts directly to avoid timezone shifting from toISOString()
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const d = String(date.getDate()).padStart(2, '0');
          const dateStr = `${y}-${m}-${d}`;

          const description = `${input.name} — Ocorrência ${i + 1}`;

          const osPayload = normalizeOptionalForeignKeys(
            {
              // RLS de service_orders exige company_id no INSERT
              // (WITH CHECK em get_user_company_id(auth.uid())). Sem isso,
              // todas as OSs do contrato eram rejeitadas silenciosamente
              // e o toast destrutivo do fim do loop era engolido pelo
              // toast de sucesso. Fix de produção v1.9.20.
              company_id: profile.company_id,
              customer_id: input.customer_id,
              equipment_id: equipmentIds.length === 1 ? equipmentIds[0] : null,
              technician_id: input.technician_id || null,
              team_id: input.team_id || null,
              os_type: 'manutencao_preventiva' as const,
              service_type_id: input.service_type_id || null,
              form_template_id: input.form_template_id || null,
              scheduled_date: dateStr,
              scheduled_time: '08:00',
              description,
              require_tech_signature: true,
              status: 'agendada' as const,
              contract_id: (contract as any).id,
              origin: 'contract',
              created_by: user?.id || null,
            } as any,
            ['technician_id', 'team_id', 'service_type_id', 'form_template_id', 'equipment_id']
          );

          const { data: os, error: osError } = await supabase
            .from('service_orders')
            .insert(osPayload)
            .select('id')
            .single();

          if (osError) {
            console.error(`Error creating OS #${i + 1}:`, osError);
            osErrorCount++;
            continue;
          }

          osCreatedCount++;

          // Link equipment via junction table
          if (equipmentIds.length > 0) {
            const { error: eqErr } = await supabase.from('service_order_equipment').insert(
              equipmentIds.map(eqId => ({
                service_order_id: os.id,
                equipment_id: eqId,
                form_template_id: input.form_template_id || null,
              }))
            );
            if (eqErr) console.error('Error linking equipment:', eqErr);
          }

          // Create assignees for ALL selected users
          if (assigneeUserIds.length > 0) {
            const { error: assignErr } = await supabase.from('service_order_assignees').insert(
              assigneeUserIds.map(uid => ({
                service_order_id: os.id,
                user_id: uid,
              }))
            );
            if (assignErr) console.error('Error creating assignees:', assignErr);
          }

          // A OS recorrente JÁ é a visita do contrato — não existe mais a
          // tabela-sombra de ocorrências. "Visita #N" é derivada da ordem
          // por scheduled_date na hora de exibir.
        }

        if (osErrorCount > 0) {
          toast({ variant: 'destructive', title: `${osErrorCount} OS(s) falharam ao ser criadas`, description: `${osCreatedCount} de ${occurrenceDates.length} criadas com sucesso.` });
        }
      }

      return {
        id: (contract as any).id,
        generatedOsCount: osCreatedCount,
        expectedOsCount,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast({ title: 'Contrato criado com sucesso!' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao criar contrato', description: getErrorMessage(e) }),
  });

  const updateContractStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('contracts').update({ status } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Status do contrato atualizado!' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao atualizar status', description: getErrorMessage(e) }),
  });

  /**
   * Atualiza campos editáveis do contrato (não inclui ocorrências/itens — esses têm fluxos próprios).
   * Inclui campos PMOC (Onda A). UI valida obrigatoriedade do RT quando `is_pmoc=true` antes de chamar.
   */
  const updateContract = useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      customer_id?: string;
      technician_id?: string | null;
      team_id?: string | null;
      service_type_id?: string | null;
      form_template_id?: string | null;
      status?: string;
      notes?: string | null;
      frequency_type?: string;
      frequency_value?: number;
      start_date?: string;
      horizon_months?: number;
      billing_responsible_ids?: string[];
      // PMOC
      is_pmoc?: boolean;
      responsible_technician_id?: string | null;
      pmoc_legal_compliance_text?: string | null;
      next_pmoc_generation_date?: string | null;
    }) => {
      const { id, ...rest } = input;
      // Se PMOC foi desligado nesta operação, limpamos os campos vinculados pra
      // evitar lixo (RT/selo/data-de-geração não fazem sentido sem o flag).
      const payload: any = { ...rest };
      if (input.is_pmoc === false) {
        payload.responsible_technician_id = null;
        payload.next_pmoc_generation_date = null;
      }
      const { error } = await supabase
        .from('contracts')
        .update(payload)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contrato atualizado!' });
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro ao atualizar contrato', description: getErrorMessage(e) }),
  });

  const executeDeleteContract = async (id: string): Promise<{ deletedOsCount: number; unlinkedOsCount: number }> => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Fonte única: service_orders do contrato (a tabela-sombra de ocorrências
    // foi aposentada). Futuras (scheduled_date >= hoje) são apagadas; passadas
    // são desvinculadas pra continuarem no histórico como OS avulsas.
    const { data: contractOss } = await supabase
      .from('service_orders')
      .select('id, scheduled_date')
      .eq('contract_id', id);

    const futureOsIds = (contractOss || [])
      .filter(o => (o.scheduled_date ?? '') >= todayStr)
      .map(o => o.id)
      .filter(Boolean) as string[];

    const pastOsIds = (contractOss || [])
      .filter(o => (o.scheduled_date ?? '') < todayStr)
      .map(o => o.id)
      .filter(Boolean) as string[];

    const deletedOsCount = futureOsIds.length;
    const unlinkedOsCount = pastOsIds.length;

    // Delete linked financial transactions
    await supabase.from('financial_transactions').delete().eq('contract_id', id);

    // Delete related records
    await supabase.from('contract_items').delete().eq('contract_id', id);

    // Delete future linked service orders (and their junction rows)
    if (futureOsIds.length > 0) {
      await supabase.from('service_order_assignees').delete().in('service_order_id', futureOsIds);
      await supabase.from('service_order_equipment').delete().in('service_order_id', futureOsIds);
      await supabase.from('form_responses').delete().in('service_order_id', futureOsIds);
      await supabase.from('os_photos').delete().in('service_order_id', futureOsIds);
      await supabase.from('service_ratings').delete().in('service_order_id', futureOsIds);
      await supabase.from('service_orders').delete().in('id', futureOsIds);
    }

    // Unlink past OS from this contract so they remain as standalone records
    if (pastOsIds.length > 0) {
      await supabase.from('service_orders').update({ contract_id: null } as any).in('id', pastOsIds);
    }

    const { error } = await supabase.from('contracts').delete().eq('id', id);
    if (error) throw error;

    return { deletedOsCount, unlinkedOsCount };
  };

  const deleteContractMutation = useMutation({
    mutationFn: async (id: string) => {
      return await executeDeleteContract(id);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['financial'] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      const { deletedOsCount, unlinkedOsCount } = result || { deletedOsCount: 0, unlinkedOsCount: 0 };
      const parts: string[] = [];
      if (deletedOsCount > 0) {
        parts.push(`${deletedOsCount} OS${deletedOsCount > 1 ? 's futuras apagadas' : ' futura apagada'}`);
      }
      if (unlinkedOsCount > 0) {
        parts.push(`${unlinkedOsCount} OS${unlinkedOsCount > 1 ? 's passadas mantidas no histórico' : ' passada mantida no histórico'}`);
      }
      toast({
        title: 'Contrato excluído com sucesso!',
        description: parts.length > 0 ? parts.join(' · ') : 'Sem OSs vinculadas.',
      });
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir contrato', description: getErrorMessage(e) });
    },
  });

  const deleteContract = {
    mutate: (id: string) => deleteContractMutation.mutate(id),
    mutateAsync: (id: string) => deleteContractMutation.mutateAsync(id),
  };

  const visibleContracts = contracts;

  // Stats
  const now = new Date();
  const activeContracts = visibleContracts.filter(c => c.status === 'active');
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Stats derivadas 100% de service_orders do contrato (fonte única).
  const osGeneratedThisMonth = visibleContracts.flatMap(c => c.service_orders || []).filter(os => {
    if (!os.scheduled_date) return false;
    const d = new Date(os.scheduled_date + 'T12:00:00');
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  const sevenDaysFromNow = addDays(now, 7);
  const upcomingOccurrences = visibleContracts.flatMap(c => c.service_orders || []).filter(os => {
    if (!isActiveContractOS(os) || !os.scheduled_date) return false;
    const d = new Date(os.scheduled_date + 'T12:00:00');
    return d >= now && d <= sevenDaysFromNow;
  }).length;

  const thirtyDaysFromNow = addDays(now, 30);
  const expiringContracts = activeContracts.filter(c => {
    // "Vencendo" = última OS do contrato (maior scheduled_date) cai dentro de 30 dias.
    const lastOs = (c.service_orders || [])
      .filter(os => !!os.scheduled_date)
      .sort((a, b) => new Date(b.scheduled_date!).getTime() - new Date(a.scheduled_date!).getTime())[0];
    if (!lastOs?.scheduled_date) return false;
    const lastDate = new Date(lastOs.scheduled_date + 'T12:00:00');
    return lastDate <= thirtyDaysFromNow;
  }).length;

  return {
    contracts: visibleContracts,
    isLoading,
    createContract,
    updateContract,
    updateContractStatus,
    deleteContract,
    stats: {
      active: activeContracts.length,
      osGeneratedThisMonth,
      upcomingOccurrences,
      expiringContracts,
    },
  };
}
