import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
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
  customers?: { id: string; name: string } | null;
  contract_items?: ContractItem[];
  contract_occurrences?: ContractOccurrence[];
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

export interface ContractOccurrence {
  id: string;
  contract_id: string;
  scheduled_date: string;
  service_order_id: string | null;
  status: string;
  occurrence_number: number;
  service_orders?: { id: string; order_number: number; status: string; scheduled_date: string | null } | null;
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
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          customers (id, name),
          contract_items (id, contract_id, equipment_id, item_name, item_description, form_template_id, sort_order, equipment:equipment(id, name, brand, model)),
          contract_occurrences (id, contract_id, scheduled_date, service_order_id, status, occurrence_number, service_orders:service_orders(id, order_number, status, scheduled_date))
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
      items: { equipment_id?: string | null; item_name: string; item_description?: string | null; form_template_id?: string | null }[];
    }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user?.id || '')
        .single();

      if (!profile?.company_id) throw new Error('Empresa não encontrada');

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
          created_by: user?.id || null,
        } as any,
        ['technician_id', 'team_id', 'service_type_id', 'form_template_id']
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

      // Generate OSs and occurrences
      if (input.status === 'active') {
        const occurrenceDates = generateOccurrences(
          new Date(input.start_date + 'T00:00:00'),
          input.frequency_type as 'days' | 'months',
          input.frequency_value,
          input.horizon_months
        );

        const equipmentIds = input.items
          .filter(i => i.equipment_id)
          .map(i => i.equipment_id!);

        // Determine all user IDs that should be assignees
        const assigneeUserIds = input.assignee_user_ids && input.assignee_user_ids.length > 0
          ? input.assignee_user_ids
          : (input.technician_id ? [input.technician_id] : []);

        for (let i = 0; i < occurrenceDates.length; i++) {
          const date = occurrenceDates[i];
          const dateStr = date.toISOString().split('T')[0];

          const description = `${input.name} — Ocorrência ${i + 1}`;

          const osPayload = normalizeOptionalForeignKeys(
            {
              customer_id: input.customer_id,
              equipment_id: equipmentIds.length === 1 ? equipmentIds[0] : null,
              technician_id: input.technician_id || null,
              team_id: input.team_id || null,
              os_type: 'manutencao_preventiva' as const,
              service_type_id: input.service_type_id || null,
              form_template_id: input.form_template_id || null,
              scheduled_date: dateStr,
              description,
              require_tech_signature: true,
              status: 'agendada' as const,
              contract_id: (contract as any).id,
              origin: 'contract',
            } as any,
            ['technician_id', 'team_id', 'service_type_id', 'form_template_id', 'equipment_id']
          );

          const { data: os, error: osError } = await supabase
            .from('service_orders')
            .insert(osPayload)
            .select('id')
            .single();

          if (osError) { console.error('Error creating OS:', osError); toast({ variant: 'destructive', title: `Erro ao criar OS #${i + 1}`, description: osError.message }); continue; }

          // Link equipment via junction table
          if (equipmentIds.length > 0) {
            await supabase.from('service_order_equipment').insert(
              equipmentIds.map(eqId => ({
                service_order_id: os.id,
                equipment_id: eqId,
                form_template_id: input.form_template_id || null,
              }))
            );
          }

          // Create assignees for ALL selected users
          if (assigneeUserIds.length > 0) {
            await supabase.from('service_order_assignees').insert(
              assigneeUserIds.map(uid => ({
                service_order_id: os.id,
                user_id: uid,
              }))
            );
          }

          await supabase.from('contract_occurrences').insert({
            contract_id: (contract as any).id,
            scheduled_date: dateStr,
            service_order_id: os.id,
            occurrence_number: i + 1,
            status: 'scheduled',
          } as any);
        }
      }

      return contract;
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

  const executeDeleteContract = async (id: string) => {
    // Collect service_order IDs linked to this contract (via occurrences)
    const { data: occurrences } = await supabase
      .from('contract_occurrences')
      .select('service_order_id')
      .eq('contract_id', id);

    const osIds = (occurrences || [])
      .map(o => o.service_order_id)
      .filter(Boolean) as string[];

    // Delete linked financial transactions
    await supabase.from('financial_transactions').delete().eq('contract_id', id);

    // Delete related records
    await supabase.from('contract_occurrences').delete().eq('contract_id', id);
    await supabase.from('contract_items').delete().eq('contract_id', id);

    // Delete linked service orders (and their junction rows)
    if (osIds.length > 0) {
      await supabase.from('service_order_assignees').delete().in('service_order_id', osIds);
      await supabase.from('service_order_equipment').delete().in('service_order_id', osIds);
      await supabase.from('form_responses').delete().in('service_order_id', osIds);
      await supabase.from('os_photos').delete().in('service_order_id', osIds);
      await supabase.from('service_ratings').delete().in('service_order_id', osIds);
      await supabase.from('service_orders').delete().in('id', osIds);
    }

    // Also delete any OS that references this contract directly but wasn't in occurrences
    await supabase.from('service_orders').delete().eq('contract_id', id);

    const { error } = await supabase.from('contracts').delete().eq('id', id);
    if (error) throw error;
  };

  const scheduleDeleteContract = useCallback((id: string) => {
    // Immediately hide from UI
    setPendingDeleteIds(prev => new Set(prev).add(id));

    const timer = setTimeout(async () => {
      pendingTimers.current.delete(id);
      try {
        await executeDeleteContract(id);
        queryClient.invalidateQueries({ queryKey: ['contracts'] });
        queryClient.invalidateQueries({ queryKey: ['financial'] });
        queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'Erro ao excluir contrato', description: getErrorMessage(e) });
      } finally {
        setPendingDeleteIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }, 5000);

    pendingTimers.current.set(id, timer);

    sonnerToast('Contrato excluído', {
      description: 'O contrato e seus dados serão removidos.',
      duration: 5000,
      action: {
        label: 'Desfazer',
        onClick: () => {
          clearTimeout(pendingTimers.current.get(id));
          pendingTimers.current.delete(id);
          setPendingDeleteIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          sonnerToast.success('Exclusão cancelada');
        },
      },
    });
  }, [queryClient, toast]);

  // Wrap in a fake mutation-like object for API compatibility
  const deleteContract = {
    mutate: scheduleDeleteContract,
    mutateAsync: async (id: string) => { scheduleDeleteContract(id); },
  };

  // Stats
  const now = new Date();
  const activeContracts = contracts.filter(c => c.status === 'active');
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const osGeneratedThisMonth = contracts.flatMap(c => c.contract_occurrences || []).filter(o => {
    if (!o.service_order_id) return false;
    const d = new Date(o.scheduled_date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  const sevenDaysFromNow = addDays(now, 7);
  const upcomingOccurrences = contracts.flatMap(c => c.contract_occurrences || []).filter(o => {
    if (o.status !== 'scheduled') return false;
    const d = new Date(o.scheduled_date);
    return d >= now && d <= sevenDaysFromNow;
  }).length;

  const thirtyDaysFromNow = addDays(now, 30);
  const expiringContracts = activeContracts.filter(c => {
    const lastOccurrence = (c.contract_occurrences || [])
      .sort((a, b) => b.occurrence_number - a.occurrence_number)[0];
    if (!lastOccurrence) return false;
    const lastDate = new Date(lastOccurrence.scheduled_date);
    return lastDate <= thirtyDaysFromNow;
  }).length;

  return {
    contracts,
    isLoading,
    createContract,
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
