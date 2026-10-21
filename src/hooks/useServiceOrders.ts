import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ServiceOrder, ServiceOrderScheduleSlot, OsStatus, OsType } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import {
  bookServiceOrderSchedule,
  isScheduleConflictError,
  normalizeScheduleBookingError,
  type BookServiceOrderScheduleInput,
  type ScheduleBookingOverride,
} from '@/lib/scheduleBooking';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDate } from '@/lib/format';
import {
  SERVICE_ORDER_BUDGET_KEY,
  SERVICE_ORDER_EQUIPMENT_SERVICES_KEY,
  SERVICE_ORDER_SERVICE_TYPES_KEY,
  syncServiceOrderBudget,
  syncServiceOrderServiceTypes,
} from '@/hooks/useServiceOrderBudget';
import type { ServiceOrderBudgetItem } from '@/lib/serviceOrderBudget';
import { normalizeServiceOrderSchedulePlan } from '@/lib/serviceOrderSchedule';

export interface ServiceOrderEquipmentItem {
  equipment_id?: string;
  form_template_id?: string;
  /** Serviços executados especificamente neste equipamento. */
  service_type_ids?: string[];
}

/** Linha plana do payload de escopo que chega do formulário de OS: uma linha
 * por par equipamento×template. Equipamento sem checklist vem com
 * `form_template_id` undefined; checklist avulso vem com `equipment_id`
 * undefined. */
export interface RawScopeItem {
  equipment_id?: string;
  form_template_id?: string;
  service_type_ids?: string[];
}

/** Formato aceito pela RPC `sync_service_order_scope` / `edit_service_order_scope`:
 * um item por equipamento (ou `null` para o grupo de avulsos), com a lista
 * deduplicada de templates daquele grupo. */
export interface GroupedScopeItem {
  equipment_id: string | null;
  form_template_ids: string[];
  service_type_ids: string[];
}

/**
 * Agrupa o payload plano de `equipment_items` (uma linha por par
 * equipamento×template) no formato esperado pelas RPCs de escopo de OS.
 * - Todos os itens avulsos (`equipment_id` ausente) colapsam em UM grupo
 *   `{ equipment_id: null, form_template_ids: [...] }`.
 * - Equipamento sem nenhum template vira `{ equipment_id: X, form_template_ids: [] }`.
 * - `form_template_ids` é deduplicado dentro de cada grupo.
 */
export function groupScopeItems(items: RawScopeItem[]): GroupedScopeItem[] {
  const order: Array<string | null> = [];
  const map = new Map<string | null, { templateIds: string[]; serviceTypeIds: string[] }>();
  for (const item of items) {
    const key = item.equipment_id ?? null;
    if (!map.has(key)) {
      map.set(key, { templateIds: [], serviceTypeIds: [] });
      order.push(key);
    }
    const group = map.get(key)!;
    if (item.form_template_id && !group.templateIds.includes(item.form_template_id)) {
      group.templateIds.push(item.form_template_id);
    }
    for (const serviceTypeId of item.service_type_ids ?? []) {
      if (!group.serviceTypeIds.includes(serviceTypeId)) {
        group.serviceTypeIds.push(serviceTypeId);
      }
    }
  }
  return order.map(key => ({
    equipment_id: key,
    form_template_ids: map.get(key)!.templateIds,
    service_type_ids: key === null ? [] : map.get(key)!.serviceTypeIds,
  }));
}

export interface ServiceOrderInput extends ScheduleBookingOverride {
  customer_id: string;
  equipment_id?: string;
  technician_id?: string;
  team_id?: string;
  os_type: OsType;
  service_type_id?: string;
  /** Relação completa; service_type_id continua espelhando o primeiro. */
  service_type_ids?: string[];
  /** Itens comerciais previstos. Não representam consumo real de estoque. */
  budget_items?: ServiceOrderBudgetItem[];
  status?: OsStatus;
  scheduled_date?: string;
  scheduled_time?: string;
  duration_minutes?: number;
  schedule_plan?: ServiceOrderScheduleSlot[];
  description?: string;
  notes?: string;
  form_template_id?: string;
  require_tech_signature?: boolean;
  require_client_signature?: boolean;
  /** null = herda o padrão da empresa (nps_settings.generate_on_finish). */
  generate_nps_survey?: boolean | null;
  // Endereço de serviço próprio da OS (opcional). Null = usa o do cliente.
  service_address?: string | null;
  service_address_number?: string | null;
  service_neighborhood?: string | null;
  service_city?: string | null;
  service_state?: string | null;
  service_zip_code?: string | null;
  service_latitude?: number | null;
  service_longitude?: number | null;
  equipment_items?: ServiceOrderEquipmentItem[];
  /** Confirma conscientemente a remoção de respostas de checklists fora do novo escopo. */
  confirm_scope_response_deletion?: boolean;
  assignee_user_ids?: string[];
  assignee_team_ids?: string[];
  // Onda E do overhaul do CRM — tarefa vinculada a uma oportunidade.
  // `lead_id` liga a tarefa ao card do CRM (null = tarefa nascida na Agenda,
  // relação de mão única). `show_in_schedule` é o checkbox "Mostrar na
  // agenda": false = a tarefa existe e aparece no card/aba Tarefas, mas não
  // no calendário. Ver migration 20260919100000_tarefa_do_crm_lead_id_e_show_in_schedule.sql.
  lead_id?: string | null;
  show_in_schedule?: boolean;
}

export interface ServiceOrderUpdate extends Partial<ServiceOrderInput> {
  id: string;
  diagnosis?: string;
  solution?: string;
  parts_used?: any[];
  labor_hours?: number;
  labor_value?: number;
  parts_value?: number;
  total_value?: number;
  check_in_time?: string;
  check_in_location?: { lat: number; lng: number };
  check_out_time?: string;
  check_out_location?: { lat: number; lng: number };
  client_signature?: string;
  // Recorrência de tarefas e de OS (entry_type='tarefa'|'os'). A regeneração
  // de ocorrências ("esta e as futuras") é orquestrada na agenda / no
  // formulário de OS; aqui só persistimos os campos.
  recurrence_type?: string | null;
  recurrence_interval?: number | null;
  recurrence_end_date?: string | null;
  recurrence_group_id?: string | null;
  // 0=domingo..6=sábado. `null` quando a frequência não usa dia da semana ou
  // nenhum foi marcado — nunca `[]` (ver `weekdaysToPersist` em
  // src/lib/taskRecurrence.ts). Campo era aceito só via `as any` antes disso;
  // declarado aqui pra tirar a necessidade do cast.
  recurrence_weekdays?: number[] | null;
}

export interface ResetServiceOrderInput {
  id: string;
  clearResponses: boolean;
}

export function useServiceOrders() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { locale, timezone } = useAppLocaleContext();

  const serviceOrdersQuery = useQuery({
    queryKey: ['service-orders'],
    queryFn: async () => {
      // Fetch all service orders (paginated to avoid 1000 row limit)
      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        // A FK explicita no embed de service_types evita ambiguidade com a
        // relacao N:N criada por service_order_service_types.
        const { data, error } = await supabase
          .from('service_orders')
          .select(`
            *,
            customer:customers(id, name, phone, celular, email, document, address, address_number, complement, neighborhood, city, state, zip_code, company_name, customer_type),
            equipment:equipment(id, name, brand, model),
            form_template:form_templates(id, name),
            service_type:service_types!service_orders_service_type_id_fkey(id, name, color, number_prefix),
            contract:contracts(id, name, is_pmoc)
          `)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        
        if (error) throw error;
        allData = allData.concat(data || []);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }

      // Fetch all assignees with pagination (Supabase has 1000 row default limit)
      const orderIds = allData.map((o: any) => o.id);
      let allAssignees: any[] = [];
      if (orderIds.length > 0) {
        // Paginate in chunks to avoid both URL length issues and the 1000 row limit
        const chunkSize = 200; // chunk of order IDs per query
        for (let i = 0; i < orderIds.length; i += chunkSize) {
          const chunk = orderIds.slice(i, i + chunkSize);
          let aFrom = 0;
          const aPageSize = 1000;
          while (true) {
            const { data: assignees, error: aErr } = await supabase
              .from('service_order_assignees')
              .select('service_order_id, user_id')
              .in('service_order_id', chunk)
              .range(aFrom, aFrom + aPageSize - 1);
            if (aErr) break;
            allAssignees = allAssignees.concat(assignees || []);
            if (!assignees || assignees.length < aPageSize) break;
            aFrom += aPageSize;
          }
        }
      }

      // Attach assignees to each order
      const assigneeMap = new Map<string, string[]>();
      allAssignees.forEach((a: any) => {
        const list = assigneeMap.get(a.service_order_id) || [];
        list.push(a.user_id);
        assigneeMap.set(a.service_order_id, list);
      });

      // Lookup batch dos perfis dos criadores (preenche `created_by_profile` no front
      // — usado pelo avatar da coluna "Criador" da lista de OS e pelo tooltip
      // do avatar dentro de cada card do kanban).
      const createdByIds = Array.from(
        new Set(allData.map((o: any) => o.created_by).filter(Boolean))
      );
      const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null; email: string | null }>();
      if (createdByIds.length > 0) {
        // `email` em profiles é populado por trigger a partir de auth.users (migration
        // aplicada em paralelo). Cast pra `any` no campo pra não quebrar tsc enquanto
        // o types.ts ainda não foi regenerado — comportamento estável após regen.
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url, email' as any)
          .in('user_id', createdByIds);
        (profiles || []).forEach((p: any) => {
          profileMap.set(p.user_id, {
            full_name: p.full_name,
            avatar_url: p.avatar_url,
            email: p.email ?? null,
          });
        });
      }

      allData.forEach((order: any) => {
        order._assignee_user_ids = assigneeMap.get(order.id) || [];
        order.created_by_profile = order.created_by ? profileMap.get(order.created_by) ?? null : null;
        // Apply snapshot fallback for deleted entities
        const snap = order.snapshot_data;
        if (!order.customer && snap?.customer) order.customer = snap.customer;
        if (!order.equipment && snap?.equipment) order.equipment = snap.equipment;
        if (!order.service_type && snap?.service_type) order.service_type = snap.service_type;
        if (!order.form_template && snap?.form_template) order.form_template = snap.form_template;
      });

      return allData as unknown as (ServiceOrder & { customer: any; equipment: any; form_template: any; _assignee_user_ids?: string[] })[];
    },
  });

  const createServiceOrder = useMutation({
    mutationFn: async (input: ServiceOrderInput) => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const {
        equipment_items,
        assignee_user_ids,
        assignee_team_ids,
        service_type_ids,
        budget_items,
        confirm_scope_response_deletion,
        ...restWithBooking
      } = input;
      const rest = { ...restWithBooking };
      delete rest.schedule_override;
      delete rest.schedule_override_reason;
      delete rest.schedule_request_id;

      // A reserva v1 possui um único recurso direto. Equipe tem precedência;
      // os demais usuários continuam como co-responsáveis na junction.
      if (rest.team_id) rest.technician_id = undefined;

      const sanitized = normalizeOptionalForeignKeys(
        {
          ...rest,
          created_by: user?.id,
          company_id,
        },
        ['technician_id', 'team_id', 'customer_id', 'equipment_id', 'service_type_id', 'form_template_id', 'lead_id']
      );

      if (input.schedule_override) {
        if ((input.schedule_override_reason?.trim().length ?? 0) < 10) {
          throw new Error('A justificativa do conflito deve ter pelo menos 10 caracteres.');
        }
        const orderPayload = normalizeOptionalForeignKeys(rest, [
          'technician_id',
          'team_id',
          'customer_id',
          'equipment_id',
          'service_type_id',
          'form_template_id',
          'lead_id',
        ]);
        const createOverrideRpc = input.schedule_plan?.length
          ? 'schedule_create_service_order_plan_with_override'
          : 'schedule_create_service_order_with_override';
        const { data, error } = await supabase.rpc(createOverrideRpc as never, {
          p_order: orderPayload,
          p_override_justification: input.schedule_override_reason?.trim(),
          p_equipment_items: equipment_items ?? [],
          p_assignee_user_ids: assignee_user_ids ?? [],
        } as never);
        if (error) throw normalizeScheduleBookingError(error);
        const createdId = (data as any)?.id;
        if (createdId && service_type_ids !== undefined) {
          await syncServiceOrderServiceTypes(createdId, service_type_ids);
        }
        if (createdId && equipment_items !== undefined) {
          const { error: scopeError } = await supabase.rpc('sync_service_order_scope_with_services' as any, {
            _service_order_id: createdId,
            _items: groupScopeItems(equipment_items) as any,
            _confirm_response_deletion: confirm_scope_response_deletion ?? false,
          });
          if (scopeError) throw scopeError;
        }
        if (createdId && budget_items !== undefined) {
          await syncServiceOrderBudget(createdId, budget_items);
        }
        return data;
      }

      const { data, error } = await supabase
        .from('service_orders')
        .insert(sanitized as any)
        .select()
        .single();
      
      if (error) throw normalizeScheduleBookingError(error);

      // Insert assignees into junction table
      if (assignee_user_ids && assignee_user_ids.length > 0) {
        const rows = assignee_user_ids.map(uid => ({
          service_order_id: data.id,
          user_id: uid,
        }));
        const { error: aErr } = await supabase
          .from('service_order_assignees')
          .insert(rows);
        // Falha aqui NÃO pode morrer no console: a OS já existe, o aviso de
        // sucesso aparece de qualquer jeito, e o gestor só descobre que a OS
        // ficou sem responsável quando ninguém aparece pra executar.
        if (aErr) {
          console.error('Error inserting assignees:', aErr);
          toast({
            variant: 'destructive',
            title: MESSAGES[locale].app.os.createdToast.warnTitle,
            description: MESSAGES[locale].app.os.createdToast.warnAssignees,
          });
        }
      }

      if (service_type_ids !== undefined) {
        await syncServiceOrderServiceTypes(data.id, service_type_ids);
      }
      if (equipment_items !== undefined) {
        const { error: scopeError } = await supabase.rpc('sync_service_order_scope_with_services' as any, {
          _service_order_id: data.id,
          _items: groupScopeItems(equipment_items) as any,
          _confirm_response_deletion: confirm_scope_response_deletion ?? false,
        });
        if (scopeError) throw scopeError;
      }
      if (budget_items !== undefined) {
        await syncServiceOrderBudget(data.id, budget_items);
      }

      return data;
    },
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: [SERVICE_ORDER_BUDGET_KEY] });
      queryClient.invalidateQueries({ queryKey: [SERVICE_ORDER_SERVICE_TYPES_KEY] });
      queryClient.invalidateQueries({ queryKey: [SERVICE_ORDER_EQUIPMENT_SERVICES_KEY] });
      // O aviso diz NÚMERO e DATA de propósito. O genérico "criada com sucesso"
      // era verdade e ainda assim virava reclamação de OS sumida: quem agendava
      // pra fora do período visível não via nada mudar na tela e concluía que
      // não tinha salvado. Dizendo a data, a pessoa sabe onde procurar.
      const tc = MESSAGES[locale].app.os.createdToast;
      const time = String((created as any)?.scheduled_time ?? '').slice(0, 5);
      toast({
        title: tc.title.replace('{n}', String((created as any)?.order_number ?? '')),
        description: (created as any)?.scheduled_date
          ? tc.scheduledFor
              .replace('{date}', formatDate((created as any).scheduled_date, locale, timezone))
              .replace('{time}', time)
          : tc.noDate,
      });
    },
    onError: (error: Error) => {
      if (isScheduleConflictError(error)) {
        toast({
          variant: 'destructive',
          title: 'Conflito de agenda',
          description: error.message,
        });
        return;
      }
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao criar OS', 
        description: getErrorMessage(error) 
      });
    },
  });

  const updateServiceOrder = useMutation({
    mutationFn: async ({
      id,
      assignee_user_ids,
      equipment_items,
      service_type_ids,
      budget_items,
      confirm_scope_response_deletion,
      schedule_override,
      schedule_override_reason,
      schedule_request_id,
      ...input
    }: ServiceOrderUpdate & { assignee_user_ids?: string[]; equipment_items?: Array<{ equipment_id?: string; form_template_id?: string }> }) => {
      const touchesSchedule = [
        'scheduled_date',
        'scheduled_time',
        'duration_minutes',
        'schedule_plan',
        'technician_id',
        'team_id',
      ].some(key => Object.prototype.hasOwnProperty.call(input, key)) || assignee_user_ids !== undefined;

      if (touchesSchedule) {
        const { data: current, error: currentError } = await supabase
          .from('service_orders')
          .select('scheduled_date, scheduled_time, duration_minutes, schedule_plan, technician_id, team_id')
          .eq('id', id)
          .single();
        if (currentError) throw currentError;

        const scheduledDate = input.scheduled_date ?? current.scheduled_date;
        const scheduledTime = input.scheduled_time ?? current.scheduled_time;
        const durationMinutes = input.duration_minutes ?? current.duration_minutes;
        const currentPlan = normalizeServiceOrderSchedulePlan({
          scheduled_date: current.scheduled_date ?? undefined,
          scheduled_time: current.scheduled_time ?? undefined,
          duration_minutes: current.duration_minutes ?? undefined,
          schedule_plan: Array.isArray(current.schedule_plan)
            ? current.schedule_plan as unknown as ServiceOrderScheduleSlot[]
            : undefined,
        });
        const schedulePlan = input.schedule_plan?.length
          ? input.schedule_plan
          : currentPlan.map((slot, index) => index === 0 ? {
              date: scheduledDate || slot.date,
              time: scheduledTime || slot.time,
              duration_minutes: durationMinutes || slot.duration_minutes,
            } : slot);
        const teamWasProvided = Object.prototype.hasOwnProperty.call(input, 'team_id');
        const technicianWasProvided = Object.prototype.hasOwnProperty.call(input, 'technician_id');
        const teamId = teamWasProvided ? (input.team_id || null) : current.team_id;
        const technicianId = teamId
          ? null
          : assignee_user_ids !== undefined
            ? (assignee_user_ids[0] ?? null)
            : technicianWasProvided
              ? (input.technician_id || null)
              : current.technician_id;

        if (scheduledDate && scheduledTime && durationMinutes && (teamId || technicianId)) {
          await bookServiceOrderSchedule({
            service_order_id: id,
            resource_type: teamId ? 'team' : 'technician',
            resource_id: teamId || technicianId!,
            scheduled_date: scheduledDate,
            scheduled_time: scheduledTime,
            duration_minutes: durationMinutes,
            schedule_plan: schedulePlan,
            timezone,
            schedule_override,
            schedule_override_reason,
            schedule_request_id,
          });

          // A reserva v1 aceita um único responsável direto e limpa o outro.
          // Mantemos co-responsáveis na junction, mas não reintroduzimos aqui o
          // técnico/equipe que o RPC acabou de limpar atomicamente.
          if (teamId) {
            input.team_id = teamId;
            input.technician_id = undefined;
          } else {
            input.technician_id = technicianId ?? undefined;
            input.team_id = undefined;
          }
        }
      }

      const sanitized = normalizeOptionalForeignKeys(input, [
        'technician_id',
        'team_id',
        'customer_id',
        'equipment_id',
        'service_type_id',
        'form_template_id',
        'contract_id',
        'lead_id',
      ] as Array<keyof typeof input>);

      const { data, error } = await supabase
        .from('service_orders')
        .update(sanitized as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Auto-create rating token and save snapshot when status changes to concluida
      if (input.status === 'concluida') {
        const { error: ratingError } = await supabase
          .from('service_ratings')
          .insert({ service_order_id: id })
          .select()
          .single();
        if (ratingError && ratingError.code !== '23505') {
          console.error('Error creating rating token:', ratingError);
        }

        // Save snapshot of related data for historical record
        try {
          const { data: fullOs } = await supabase
            .from('service_orders')
            .select(`
              *,
              customer:customers(id, name, phone, celular, email, document, address, address_number, complement, neighborhood, city, state, zip_code, company_name, customer_type),
              equipment:equipment(id, name, brand, model, serial_number, location, capacity),
              form_template:form_templates(id, name),
              service_type:service_types!service_orders_service_type_id_fkey(id, name, color, number_prefix)
            `)
            .eq('id', id)
            .single();

          if (fullOs) {
            // Fetch technician info
            let technicianSnapshot = null;
            const techId = fullOs.technician_id;
            if (techId) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('full_name, avatar_url')
                .eq('user_id', techId)
                .maybeSingle();
              if (profile) technicianSnapshot = { user_id: techId, full_name: profile.full_name, avatar_url: profile.avatar_url };
            }

            // Fetch assignees info
            const { data: assigneesData } = await supabase
              .from('service_order_assignees')
              .select('user_id')
              .eq('service_order_id', id);
            let assigneesSnapshot: any[] = [];
            if (assigneesData && assigneesData.length > 0) {
              const { data: profiles } = await supabase
                .from('profiles')
                .select('user_id, full_name, avatar_url')
                .in('user_id', assigneesData.map(a => a.user_id));
              assigneesSnapshot = profiles || [];
            }

            // Fetch contract info
            let contractSnapshot = null;
            if ((fullOs as any).contract_id) {
              const { data: contract } = await supabase
                .from('contracts')
                .select('id, name')
                .eq('id', (fullOs as any).contract_id)
                .maybeSingle();
              if (contract) contractSnapshot = contract;
            }

            const snapshot = {
              customer: fullOs.customer,
              equipment: fullOs.equipment,
              form_template: fullOs.form_template,
              service_type: fullOs.service_type,
              technician: technicianSnapshot,
              assignees: assigneesSnapshot,
              contract: contractSnapshot,
              snapshot_at: new Date().toISOString(),
            };

            await supabase
              .from('service_orders')
              .update({ snapshot_data: snapshot } as any)
              .eq('id', id);
          }
        } catch (snapshotError) {
          console.error('Error saving snapshot:', snapshotError);
        }
      }

      // Sync assignees if provided
      if (assignee_user_ids !== undefined) {
        await supabase.from('service_order_assignees').delete().eq('service_order_id', id);
        if (assignee_user_ids.length > 0) {
          await supabase.from('service_order_assignees').insert(
            assignee_user_ids.map(uid => ({ service_order_id: id, user_id: uid }))
          );
        }
      }

      // A lista global precisa existir antes do vínculo equipamento×serviço,
      // cuja FK garante que nenhum serviço estranho seja atribuído à OS.
      if (service_type_ids !== undefined) {
        await syncServiceOrderServiceTypes(id, service_type_ids);
      }

      // Sync equipment items if provided. Via RPC atômica (nunca delete+insert
      // direto do client): a RPC também limpa respostas órfãs em
      // `form_responses` quando um checklist sai do escopo — o delete+insert
      // antigo deixava respostas fantasma aparecendo no relatório/link público —
      // e agora persiste os serviços específicos de cada equipamento.
      // `[]` é um valor válido ("limpar o escopo inteiro"), não "não fazer nada".
      if (equipment_items !== undefined) {
        const scopeItems = groupScopeItems(equipment_items);
        const { error: scopeError } = await supabase.rpc('sync_service_order_scope_with_services' as any, {
          _service_order_id: id,
          _items: scopeItems as any,
          _confirm_response_deletion: confirm_scope_response_deletion ?? false,
        });
        if (scopeError) throw scopeError;
      }

      if (budget_items !== undefined) {
        await syncServiceOrderBudget(id, budget_items);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['paused-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['service-ratings'] });
      queryClient.invalidateQueries({ queryKey: [SERVICE_ORDER_BUDGET_KEY] });
      queryClient.invalidateQueries({ queryKey: [SERVICE_ORDER_SERVICE_TYPES_KEY] });
      queryClient.invalidateQueries({ queryKey: [SERVICE_ORDER_EQUIPMENT_SERVICES_KEY] });
      toast({ title: 'OS atualizada com sucesso!' });
    },
    onError: (error: Error) => {
      if (isScheduleConflictError(error)) {
        toast({
          variant: 'destructive',
          title: 'Conflito de agenda',
          description: error.message,
        });
        return;
      }
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao atualizar OS', 
        description: getErrorMessage(error) 
      });
    },
  });

  const deleteServiceOrder = useMutation({
    mutationFn: async (id: string) => {
      // Clear FK references in other tables
      await supabase
        .from('service_order_equipment')
        .delete()
        .eq('service_order_id', id);

      // Delete form responses
      await supabase
        .from('form_responses')
        .delete()
        .eq('service_order_id', id);

      // Delete OS photos
      await supabase
        .from('os_photos')
        .delete()
        .eq('service_order_id', id);

      // Delete service ratings
      await supabase
        .from('service_ratings')
        .delete()
        .eq('service_order_id', id);

      // Delete inventory movements
      await supabase
        .from('inventory_movements')
        .delete()
        .eq('service_order_id', id);

      // Delete PMOC schedules references
      await supabase
        .from('pmoc_schedules')
        .update({ service_order_id: null })
        .eq('service_order_id', id);

      // Now delete the OS
      const { error } = await supabase
        .from('service_orders')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({ title: 'OS excluída com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao excluir OS', 
        description: getErrorMessage(error) 
      });
    },
  });

  const resetServiceOrder = useMutation({
    mutationFn: async ({ id, clearResponses }: ResetServiceOrderInput) => {
      const { data, error } = await supabase.rpc('reset_service_order', {
        _service_order_id: id,
        _clear_responses: clearResponses,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['paused-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['service-ratings'] });
      toast({
        title: 'OS resetada com sucesso!',
        description: variables.clearResponses
          ? 'A OS voltou para Agendada e o preenchimento anterior foi apagado.'
          : 'A OS voltou para Agendada e o preenchimento anterior foi mantido.',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao resetar OS',
        description: getErrorMessage(error),
      });
    },
  });

  const rescheduleServiceOrder = useMutation({
    mutationFn: (input: Omit<BookServiceOrderScheduleInput, 'timezone'>) =>
      bookServiceOrderSchedule({ ...input, timezone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({ title: 'OS reagendada com sucesso!' });
    },
    onError: (error: Error) => {
      if (isScheduleConflictError(error)) {
        toast({
          variant: 'destructive',
          title: 'Conflito de agenda',
          description: error.message,
        });
        return;
      }
      toast({
        variant: 'destructive',
        title: 'Erro ao reagendar OS',
        description: getErrorMessage(error),
      });
    },
  });

  return {
    serviceOrders: serviceOrdersQuery.data ?? [],
    isLoading: serviceOrdersQuery.isLoading,
    error: serviceOrdersQuery.error,
    createServiceOrder,
    updateServiceOrder,
    rescheduleServiceOrder,
    deleteServiceOrder,
    resetServiceOrder,
  };
}
