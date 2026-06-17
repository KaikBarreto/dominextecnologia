import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, format, startOfMonth, endOfMonth, getYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, PauseCircle, Calendar as CalendarIcon, Palette, Search as SearchIcon, X as XIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { MonthlyCalendar } from '@/components/schedule/MonthlyCalendar';
import { WeeklyCalendar } from '@/components/schedule/WeeklyCalendar';
import { DailyCalendar } from '@/components/schedule/DailyCalendar';
import { MobileAgendaView } from '@/components/schedule/MobileAgendaView';
import { ScheduleHeader, type ViewMode } from '@/components/schedule/ScheduleHeader';
import { PausedOrdersDialog } from '@/components/schedule/PausedOrdersDialog';
import { usePausedOrders } from '@/hooks/usePausedOrders';
import { ScheduleDetailPanel } from '@/components/schedule/ScheduleDetailPanel';
import { ScheduleLegend } from '@/components/schedule/ScheduleLegend';
import { OsSearchDialog } from '@/components/schedule/OsSearchDialog';
import { ScheduleSkeleton } from '@/components/schedule/ScheduleSkeleton';
import { EntryTypeSelectorDialog } from '@/components/schedule/EntryTypeSelectorDialog';
import { TaskFormDialog, type TaskFormData } from '@/components/schedule/TaskFormDialog';
import { useServiceOrders, ServiceOrderInput } from '@/hooks/useServiceOrders';
import { useProfiles } from '@/hooks/useProfiles';
import { useCustomers } from '@/hooks/useCustomers';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useTeams } from '@/hooks/useTeams';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useTouchDragDrop } from '@/hooks/useTouchDragDrop';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { ServiceOrderFormDialog } from '@/components/service-orders/ServiceOrderFormDialog';
import { Button } from '@/components/ui/button';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { cn } from '@/lib/utils';
import type { ServiceOrder } from '@/types/database';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { FABButton } from '@/components/mobile/FABButton';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useFinancialScheduleEvents } from '@/hooks/useFinancialScheduleEvents';
import { useOrderAssignees } from '@/hooks/useOrderAssignees';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { getAllHolidays, buildHolidayMap, type Holiday } from '@/utils/holidays';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';

export default function Schedule() {
  const { serviceOrders, isLoading, createServiceOrder, updateServiceOrder, deleteServiceOrder } = useServiceOrders();
  const { data: allProfiles = [] } = useProfiles();
  const { customers } = useCustomers();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { serviceTypes } = useServiceTypes();
  const { teamsWithMembers } = useTeams();
  const { user, hasRole, hasPermission, isAdminOrGestor, roles, permissions, hasPermissionRecord } = useAuth();
  const { settings: companySettings } = useCompanySettings();

  const canCreateOS = isAdminOrGestor() || hasPermission('fn:create_os');
  const canEditOS = isAdminOrGestor() || hasPermission('fn:edit_os');
  const canDeleteOS = isAdminOrGestor() || hasPermission('fn:delete_os');

  const [currentDate, setCurrentDate] = useState(new Date());

  // Preferência de visualização da Agenda persistida no banco, SEPARADA por aparelho.
  // 1º acesso (sem preferência): celular abre em "Dia", computador em "Mês".
  const {
    scheduleViewMode,
    isLoading: isPrefsLoading,
    setScheduleViewMode,
  } = useUserPreferences();
  const scheduleDevice: 'mobile' | 'desktop' = isMobile ? 'mobile' : 'desktop';

  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? 'day' : 'month');

  // Hidrata o viewMode a partir da preferência salva do aparelho atual. Também
  // reage ao redimensionamento que cruza o breakpoint (celular ↔ computador):
  // ao trocar de slot lógico, relê a view daquele aparelho.
  useEffect(() => {
    if (isPrefsLoading) return;
    const saved = scheduleViewMode?.[scheduleDevice];
    setViewMode(saved ?? (isMobile ? 'day' : 'month'));
    // scheduleViewMode é o objeto memoizado da query; scheduleDevice cobre o resize.
  }, [isPrefsLoading, scheduleViewMode, scheduleDevice, isMobile]);

  // Troca explícita do usuário: atualiza o estado local E persiste no slot do
  // aparelho atual. O default NÃO é gravado no load — só a escolha manual.
  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      setScheduleViewMode(scheduleDevice, mode);
    },
    [setScheduleViewMode, scheduleDevice],
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [isTypeSelectorOpen, setIsTypeSelectorOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<(ServiceOrder & { customer: any; equipment: any }) | null>(null);
  const [editingTask, setEditingTask] = useState<(ServiceOrder & { customer: any; equipment: any }) | null>(null);
  const [summaryOrder, setSummaryOrder] = useState<(ServiceOrder & { customer: any; equipment: any }) | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();
  const [defaultTime, setDefaultTime] = useState<string | undefined>();
  const [isPausedDialogOpen, setIsPausedDialogOpen] = useState(false);
  const { pausedOrders } = usePausedOrders();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filters — multi-select (vazio = todos)
  const [technicianFilter, setTechnicianFilter] = useState<string[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  // Busca inline na Agenda (mobile): lupa do header expande input no lugar do título
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Busca modal paginada (desktop) — ResponsiveModal com 10/página
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Foca o input quando a busca abre
  useEffect(() => {
    if (searchOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [searchOpen]);

  // Get team IDs the current user belongs to
  const myTeamIds = useMemo(() => {
    if (!user?.id) return [];
    return teamsWithMembers
      .filter(t => t.members.some(m => m.user_id === user.id))
      .map(t => t.id);
  }, [teamsWithMembers, user?.id]);

  // Check if current user has technician role (only filter for tecnico role)
  const isTechnician = hasRole('tecnico');

  const { financialEvents } = useFinancialScheduleEvents();

  // Holidays
  const showHolidays = useMemo(() => {
    try {
      const saved = localStorage.getItem('usability-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.showHolidays !== false; // default true
      }
    } catch {}
    return true;
  }, []);

  const holidayMap = useMemo(() => {
    if (!showHolidays) return {};
    const city = companySettings?.city || '';
    const state = companySettings?.state || '';
    const year = getYear(currentDate);
    const holidays = getAllHolidays(city, state, year);
    // Also get adjacent year if near boundary
    const prevYearHolidays = getAllHolidays(city, state, year - 1);
    const nextYearHolidays = getAllHolidays(city, state, year + 1);
    return buildHolidayMap([...prevYearHolidays, ...holidays, ...nextYearHolidays]);
  }, [showHolidays, companySettings?.city, companySettings?.state, currentDate]);

  const getAssignees = useOrderAssignees(allProfiles, teamsWithMembers);

  // Acesso total à agenda: admin/super_admin OU quem tem a permissão dedicada
  // (ou o curinga '*'). Lemos direto do array de permissões — e não via
  // hasPermission — de propósito: hasPermission, sem registro de permissões,
  // libera tudo pelo role. Aqui queremos o oposto para tarefas: sem o acesso
  // explícito, a tarefa só aparece pra quem é responsável por ela.
  const canViewAllSchedule =
    roles.includes('admin') || roles.includes('super_admin') ||
    (hasPermissionRecord && (permissions.includes('*') || permissions.includes('fn:view_all_schedule')));

  const filteredOrders = useMemo(() => {
    const osFiltered = serviceOrders.filter((order) => {
      // Visibilidade de TAREFAS (entry_type === 'tarefa'): vale pra TODOS os
      // viewers, não só técnico. Sem acesso total à agenda, uma tarefa só
      // aparece pra quem é responsável (assignee/técnico legado) ou pro time
      // dela. OS comuns (entry_type !== 'tarefa') não são afetadas.
      if (order.entry_type === 'tarefa' && !canViewAllSchedule) {
        const assigneeIds = (order as any)._assignee_user_ids as string[] | undefined;
        const isMine =
          (!!user?.id && (assigneeIds?.includes(user.id) || order.technician_id === user.id)) ||
          (!!order.team_id && myTeamIds.includes(order.team_id));
        if (!isMine) return false;
      }

      if (isTechnician && user?.id) {
        const assigneeIds = (order as any)._assignee_user_ids as string[] | undefined;
        const isAssignedToMe = assigneeIds?.includes(user.id) || order.technician_id === user.id;
        const isAssignedToMyTeam = order.team_id && myTeamIds.includes(order.team_id);
        if (!isAssignedToMe && !isAssignedToMyTeam) return false;
      }

      if (technicianFilter.length > 0) {
        const assigneeIds = (order as any)._assignee_user_ids as string[] | undefined;
        const matchesTech =
          (assigneeIds?.some((id) => technicianFilter.includes(id)) ?? false) ||
          (order.technician_id ? technicianFilter.includes(order.technician_id) : false);
        if (!matchesTech) return false;
      }
      if (customerFilter.length > 0 && (!order.customer_id || !customerFilter.includes(order.customer_id))) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(order.status)) return false;
      if (searchTerm.trim()) {
        const t = searchTerm.trim().toLowerCase();
        const matches =
          order.customer?.name?.toLowerCase().includes(t) ||
          (order as any).task_title?.toLowerCase().includes(t) ||
          (order as any).service_type?.name?.toLowerCase().includes(t) ||
          String(order.order_number).includes(t);
        if (!matches) return false;
      }
      return true;
    }).map(order => {
      const { assignees, team } = getAssignees(order);
      return { ...order, _assignees: assignees, _team: team };
    });

    // Expansão de OS retomadas: uma OS pausada e depois retomada precisa
    // aparecer também nas datas a partir da retomada (até ser concluída/cancelada),
    // sem perder a aparição na data original (scheduled_date).
    //
    // Critério B: status em [em_andamento, a_caminho, pendente]
    //   AND resumed_at preenchido AND scheduled_date < resumed_at::date
    //
    // Para cada OS que cumpre B, geramos instâncias adicionais com
    // scheduled_date sobrescrito para cada data entre resumed_at::date e hoje.
    // Status concluida/cancelada NÃO expande — finalizada não polui o "hoje".
    const expanded: typeof osFiltered = [];
    const todayKey = format(new Date(), 'yyyy-MM-dd');

    for (const order of osFiltered) {
      // Sempre inclui na data original (critério A)
      expanded.push(order);

      // Critério B
      const resumedAtRaw = (order as any).resumed_at as string | null | undefined;
      const status = order.status;
      const isActiveStatus = status === 'em_andamento' || status === 'a_caminho' || status === 'pendente';
      if (!resumedAtRaw || !isActiveStatus || !order.scheduled_date) continue;

      const resumedDate = new Date(resumedAtRaw);
      if (isNaN(resumedDate.getTime())) continue;
      const resumedKey = format(resumedDate, 'yyyy-MM-dd');

      // Só expande se a data original era anterior à retomada
      if (order.scheduled_date >= resumedKey) continue;

      // Gera entradas de resumedKey até hoje (inclusive)
      let cursor = new Date(resumedKey + 'T12:00:00');
      const todayDate = new Date(todayKey + 'T12:00:00');
      while (cursor <= todayDate) {
        const cursorKey = format(cursor, 'yyyy-MM-dd');
        // Evita duplicar se por acaso scheduled_date == cursorKey (defensivo)
        if (cursorKey !== order.scheduled_date) {
          expanded.push({
            ...order,
            scheduled_date: cursorKey,
            // Marcador pra UI distinguir esta instância como "Retomada"
            _resumedDisplay: true,
            _originalScheduledDate: order.scheduled_date,
          } as any);
        }
        cursor = addDays(cursor, 1);
      }
    }

    return [...expanded, ...financialEvents];
  }, [serviceOrders, technicianFilter, customerFilter, statusFilter, searchTerm, isTechnician, user?.id, myTeamIds, financialEvents, getAssignees, canViewAllSchedule]);

  const handlePrev = () => {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const handleNext = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const handleToday = () => setCurrentDate(new Date());

  // Swipe lateral (mobile) — varrer pra esquerda avança, pra direita volta.
  // Só anexado nas views Dia/Semana (Mês mantém navegação só pelos botões).
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
  });

  const summaryRef = useRef<HTMLDivElement>(null);

  const handleOrderSelect = useCallback((order: ServiceOrder & { customer: any; equipment: any }) => {
    setSummaryOrder(order);
    // No mobile, o detalhe aparece abaixo do calendário — rola pra ele suavemente
    // depois de um tick (espera o ScheduleDetailPanel renderizar com a OS selecionada).
    // No desktop o detalhe fica lado a lado, então não precisa rolar.
    if (isMobile) {
      setTimeout(() => {
        summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [isMobile]);

  const handleClearSummary = useCallback(() => {
    setSummaryOrder(null);
  }, []);

  // Resultado da busca: navega o calendário para a data da OS e abre detalhe
  const handleSearchResultSelect = useCallback(
    (order: ServiceOrder & { customer: any; equipment: any }) => {
      if (order.scheduled_date) {
        try {
          const parsed = new Date(order.scheduled_date + 'T12:00:00');
          if (!isNaN(parsed.getTime())) {
            setCurrentDate(parsed);
          }
        } catch {
          // ignore — mantém data atual se parsing falhar
        }
      }
      handleOrderSelect(order);
    },
    [handleOrderSelect],
  );

  const handleEditFromSummary = () => {
    if (summaryOrder) {
      // If it's a task, open the task form for editing
      if ((summaryOrder as any).entry_type === 'tarefa') {
        setEditingTask(summaryOrder);
        setSummaryOrder(null);
        setIsTaskFormOpen(true);
        return;
      }
      setSelectedOrder(summaryOrder);
      setSummaryOrder(null);
      setDefaultDate(undefined);
      setDefaultTime(undefined);
      setIsFormOpen(true);
    }
  };

  const handleDeleteFromSummary = (id: string) => {
    // For financial events, delete the financial transaction
    if ((summaryOrder as any)?._isFinancialEvent) {
      const realId = (summaryOrder as any)?._realFinancialId;
      if (realId) {
        supabase.from('financial_transactions').delete().eq('id', realId).then(() => {
          queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
          toast({ title: 'Transação financeira excluída' });
        });
      }
      setSummaryOrder(null);
      return;
    }
    deleteServiceOrder.mutate(id);
    setSummaryOrder(null);
  };

  const handleDeleteFinancialGroup = async (order: any) => {
    // Delete all transactions from the same contract or installment group
    const contractId = order._contractId;
    const installmentGroupId = order._installmentGroupId;
    
    let query = supabase.from('financial_transactions').delete();
    if (installmentGroupId) {
      query = query.eq('installment_group_id', installmentGroupId);
    } else if (contractId) {
      query = query.eq('contract_id', contractId);
    } else {
      // Single transaction
      const realId = order._realFinancialId;
      if (realId) query = query.eq('id', realId);
    }
    
    await query;
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    toast({ title: 'Transações financeiras excluídas' });
    setSummaryOrder(null);
  };

  const handleDeleteGroupFromSummary = async (groupId: string) => {
    // Delete all OS in the recurrence group
    const groupOrders = serviceOrders.filter((o: any) => o.recurrence_group_id === groupId);
    for (const o of groupOrders) {
      await deleteServiceOrder.mutateAsync(o.id);
    }
    setSummaryOrder(null);
  };

  const handleFinalizeFromSummary = (id: string) => {
    updateServiceOrder.mutate({ id, status: 'concluida' as any });
    setSummaryOrder(null);
  };

  const canReopenOS = isAdminOrGestor() || hasPermission('fn:reopen_os');

  const handleReopenFromSummary = (id: string) => {
    updateServiceOrder.mutate({ id, status: 'em_andamento' as any });
    setSummaryOrder(null);
  };

  const handleResolveBillingReminder = async (order: any) => {
    const realId = order?._realFinancialId;
    if (!realId) return;
    const { error } = await supabase.rpc('resolve_billing_reminder', { p_transaction_id: realId });
    if (error) { toast({ title: error.message || 'Não foi possível concluir a cobrança', variant: 'destructive' }); return; }
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    toast({ title: 'Cobrança concluída', description: 'A parcela continua em Contas a Receber.' });
    setSummaryOrder(null);
  };

  const handleReopenBillingReminder = async (order: any) => {
    const realId = order?._realFinancialId;
    if (!realId) return;
    const { error } = await supabase.rpc('unresolve_billing_reminder', { p_transaction_id: realId });
    if (error) { toast({ title: error.message || 'Não foi possível reabrir a cobrança', variant: 'destructive' }); return; }
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    toast({ title: 'Cobrança reaberta' });
    setSummaryOrder(null);
  };

  const handlePauseFromSummary = (id: string) => {
    updateServiceOrder.mutate({ id, status: 'pausada' as any });
    setSummaryOrder(null);
  };

  const handleResumeFromSummary = (id: string) => {
    updateServiceOrder.mutate({ id, status: 'em_andamento' as any });
    setSummaryOrder(null);
  };

  const handleViewPausedDetails = (order: ServiceOrder & { customer: any; equipment: any }) => {
    setSummaryOrder(order);
    setIsPausedDialogOpen(false);
  };

  const handleResumePaused = (order: ServiceOrder & { customer: any; equipment: any }) => {
    updateServiceOrder.mutate({ id: order.id, status: 'em_andamento' as any });
    setIsPausedDialogOpen(false);
    toast({ title: 'OS retomada', description: `OS #${order.order_number} voltou para a agenda.` });
  };

  const handleNewOrder = () => {
    setSelectedOrder(null);
    setDefaultDate(format(currentDate, 'yyyy-MM-dd'));
    setDefaultTime(undefined);
    setIsTypeSelectorOpen(true);
  };

  const handleSelectOS = () => {
    setIsFormOpen(true);
  };

  const handleSelectTask = () => {
    setIsTaskFormOpen(true);
  };

  const handleTaskSubmit = async (data: TaskFormData) => {
    // If editing an existing task, update it
    if (editingTask) {
      const updatePayload = normalizeOptionalForeignKeys({
        task_title: data.task_title,
        task_type_id: data.task_type_id || null,
        service_type_id: data.service_type_id || null,
        customer_id: data.customer_id || null,
        technician_id: data.technician_id || null,
        team_id: data.team_id || null,
        scheduled_date: data.scheduled_date || null,
        scheduled_time: data.scheduled_time || null,
        duration_minutes: data.duration_minutes || 60,
        description: data.description || null,
      } as any, ['task_type_id', 'service_type_id', 'customer_id', 'technician_id', 'team_id']);

      const { error } = await supabase.from('service_orders').update(updatePayload).eq('id', editingTask.id);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao atualizar tarefa', description: getErrorMessage(error) });
      } else {
        // Update assignees
        await supabase.from('service_order_assignees').delete().eq('service_order_id', editingTask.id);
        if (data.assignee_user_ids && data.assignee_user_ids.length > 0) {
          await supabase.from('service_order_assignees').insert(
            data.assignee_user_ids.map(uid => ({ service_order_id: editingTask.id, user_id: uid }))
          );
        }
        toast({ title: 'Tarefa atualizada!' });
        queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      }
      setEditingTask(null);
      return;
    }

    const groupId = data.recurrence_type ? crypto.randomUUID() : undefined;

    // Generate dates for recurrence
    const dates: string[] = [data.scheduled_date || format(new Date(), 'yyyy-MM-dd')];
    if (data.recurrence_type && data.recurrence_end_date) {
      const endDate = new Date(data.recurrence_end_date + 'T12:00:00');

      if (data.recurrence_type === 'custom' && data.recurrence_weekdays && data.recurrence_weekdays.length > 0) {
        let current = addDays(new Date(dates[0] + 'T12:00:00'), 1);
        while (current <= endDate) {
          if (data.recurrence_weekdays.includes(current.getDay())) {
            dates.push(format(current, 'yyyy-MM-dd'));
          }
          current = addDays(current, 1);
        }
      } else {
        let current = new Date(dates[0] + 'T12:00:00');
        const interval = data.recurrence_interval || 1;
        while (true) {
          if (data.recurrence_type === 'daily') current = addDays(current, interval);
          else if (data.recurrence_type === 'weekly') current = addWeeks(current, interval);
          else if (data.recurrence_type === 'biweekly') current = addWeeks(current, 2 * interval);
          else if (data.recurrence_type === 'monthly') current = addMonths(current, interval);
          else if (data.recurrence_type === 'yearly') current = addMonths(current, 12 * interval);
          else break;
          if (current > endDate) break;
          dates.push(format(current, 'yyyy-MM-dd'));
        }
      }
    }

    // Create all task entries
    const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
    const company_id = await getCurrentUserCompanyId();
    const inserts = dates.map(date => normalizeOptionalForeignKeys({
      entry_type: 'tarefa',
      task_title: data.task_title,
      task_type_id: data.task_type_id || null,
      service_type_id: data.service_type_id || null,
      customer_id: data.customer_id || null,
      technician_id: data.technician_id || null,
      team_id: data.team_id || null,
      scheduled_date: date,
      scheduled_time: data.scheduled_time || null,
      duration_minutes: data.duration_minutes || 60,
      description: data.description || null,
      os_type: 'visita_tecnica',
      status: 'pendente',
      recurrence_type: data.recurrence_type || null,
      recurrence_interval: data.recurrence_interval || null,
      recurrence_end_date: data.recurrence_end_date || null,
      recurrence_group_id: groupId || null,
      company_id,
    } as any, ['task_type_id', 'service_type_id', 'customer_id', 'technician_id', 'team_id']));

    const { data: created, error } = await supabase.from('service_orders').insert(inserts as any).select('id');
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao criar tarefa', description: getErrorMessage(error) });
    } else {
      if (created && data.assignee_user_ids && data.assignee_user_ids.length > 0) {
        const assigneeRows = created.flatMap((row: any) =>
          data.assignee_user_ids!.map(uid => ({
            service_order_id: row.id,
            user_id: uid,
          }))
        );
        await supabase.from('service_order_assignees').insert(assigneeRows);
      }
      toast({ title: `${dates.length} tarefa(s) criada(s)!` });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
    }
  };

  const handleSlotClick = (date: string, time: string) => {
    if (!canCreateOS) return;
    setSelectedOrder(null);
    setDefaultDate(date);
    setDefaultTime(time);
    setIsTypeSelectorOpen(true);
  };

  const handleDateSelect = (date: Date) => {
    setCurrentDate(date);
    setSummaryOrder(null);
  };

  const handleDateDoubleClick = (date: Date) => {
    if (!canCreateOS) return;
    setCurrentDate(date);
    setSummaryOrder(null);
    setSelectedOrder(null);
    setDefaultDate(format(date, 'yyyy-MM-dd'));
    setDefaultTime(undefined);
    setIsTypeSelectorOpen(true);
  };

  const handleDrop = async (orderId: string, newDate: string, newTime: string) => {
    await updateServiceOrder.mutateAsync({
      id: orderId,
      scheduled_date: newDate,
      scheduled_time: newTime,
    });
  };

  const touchDrag = useTouchDragDrop(handleDrop);

  const handleCloseForm = (open: boolean) => {
    if (!open) {
      setIsFormOpen(false);
      setSelectedOrder(null);
      setDefaultDate(undefined);
      setDefaultTime(undefined);
    }
  };

  const handleSubmit = async (data: ServiceOrderInput) => {
    if (selectedOrder) {
      await updateServiceOrder.mutateAsync({ id: selectedOrder.id, ...data });
    } else {
      await createServiceOrder.mutateAsync(data);
    }
  };

  // Anti-flicker: segura a tela no skeleton enquanto a preferência de view do
  // aparelho atual ainda não carregou — evita renderizar a view errada e "saltar".
  if (isLoading || isPrefsLoading) {
    return (
      <div className="space-y-6 p-1">
        <MobilePageHeader
          title="Agenda"
          subtitle="Visualize e gerencie os agendamentos de ordens de serviço"
          icon={CalendarIcon}
        />
        <ScheduleSkeleton />
      </div>
    );
  }

  // Mobile & Tablet layout
  if (isMobile) {
    const activeFilterCount =
      (technicianFilter.length > 0 ? 1 : 0) +
      (customerFilter.length > 0 ? 1 : 0) +
      (statusFilter.length > 0 ? 1 : 0);

    const clearFilters = () => {
      setTechnicianFilter([]);
      setCustomerFilter([]);
      setStatusFilter([]);
    };

    // Header actions: [Lupa → expande busca inline] + [PausadasOS]
    const headerActions = (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Buscar tarefa ou OS"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted/80 hover:text-foreground"
        >
          <SearchIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setIsPausedDialogOpen(true)}
          aria-label="Ver OS pausadas"
          className={cn(
            'relative inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted/80',
            pausedOrders.length > 0 && 'text-amber-600 hover:text-amber-700',
          )}
        >
          <PauseCircle className="h-5 w-5" />
          {pausedOrders.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
              {pausedOrders.length}
            </span>
          )}
        </button>
      </div>
    );

    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const currentKey = format(currentDate, 'yyyy-MM-dd');
    const isToday = todayKey === currentKey;

    return (
      <div className="flex flex-col gap-4 pb-24">
        {searchOpen ? (
          <div className="flex items-center gap-2 h-14 mb-3 animate-in slide-in-from-top-2 duration-200">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar tarefa, OS, cliente, equipamento..."
                className="pl-10 h-10"
              />
            </div>
            <button
              type="button"
              onClick={() => { setSearchOpen(false); setSearchTerm(''); }}
              aria-label="Fechar busca"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground active:bg-muted/80 transition-colors shrink-0"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <MobilePageHeader
            title="Agenda"
            subtitle="Gerencie suas tarefas e compromissos"
            icon={CalendarIcon}
            actions={headerActions}
          />
        )}

        {/* Navegação de período: prev / current / next + "Hoje" */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Anterior"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors active:bg-muted/80"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex flex-col items-center flex-1 min-w-0">
            <h2 className="text-base font-semibold capitalize truncate">
              {format(currentDate, viewMode === 'day' ? "dd 'de' MMMM yyyy" : 'MMM yyyy', { locale: ptBR })}
            </h2>
            {!isToday && (
              <button
                type="button"
                onClick={handleToday}
                className="text-[11px] text-primary font-medium leading-tight"
              >
                Voltar para hoje
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Próximo"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors active:bg-muted/80"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Toggle de visualização (Dia/Semana/Mês) + botão de filtros */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <MobilePillTabs
              tabs={[
                { value: 'day', label: 'Dia' },
                { value: 'week', label: 'Semana' },
                { value: 'month', label: 'Mês' },
              ]}
              activeTab={viewMode}
              onTabChange={(v) => handleViewModeChange(v as ViewMode)}
            />
          </div>
          <FilterSheet
            triggerLabel="Filtros"
            activeCount={activeFilterCount}
            onClear={clearFilters}
          >
            <div className="space-y-4">
              <FilterCheckboxGroup
                label="Técnico"
                options={allProfiles.map((t) => ({ value: t.user_id, label: t.full_name }))}
                selected={technicianFilter}
                onChange={setTechnicianFilter}
              />
              <FilterCheckboxGroup
                label="Cliente"
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                selected={customerFilter}
                onChange={setCustomerFilter}
              />
              <FilterCheckboxGroup
                label="Status"
                options={[
                  { value: 'pendente', label: 'Pendente' },
                  { value: 'em_andamento', label: 'Em andamento' },
                  { value: 'pausada', label: 'Pausada' },
                  { value: 'concluida', label: 'Concluída' },
                  { value: 'cancelada', label: 'Cancelada' },
                ]}
                selected={statusFilter}
                onChange={setStatusFilter}
              />
            </div>
          </FilterSheet>
        </div>

        {/* Moving indicator */}
        {touchDrag.movingOrderId && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/10 border border-primary/30">
            <span className="text-xs font-medium text-primary">Toque no horário para mover a OS</span>
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={touchDrag.cancel}>Cancelar</Button>
          </div>
        )}

        {/* Calendar — Dia/Semana ganham altura limitada com scroll interno no mobile.
            Swipe lateral só nas views Dia/Semana (Mês mantém só botões). */}
        <div
          className={cn(
            'rounded-xl border bg-card overflow-hidden',
            isMobile && (viewMode === 'day' || viewMode === 'week') && 'h-[60vh] max-h-[60vh] flex flex-col'
          )}
          {...(isMobile && (viewMode === 'day' || viewMode === 'week') ? swipeHandlers : {})}
        >
          {viewMode === 'month' && (
            <MonthlyCalendar
              currentDate={currentDate}
              serviceOrders={filteredOrders}
              onDateSelect={handleDateSelect}
              onDateDoubleClick={handleDateDoubleClick}
              onOrderSelect={handleOrderSelect}
              onDrop={handleDrop}
              holidayMap={holidayMap}
            />
          )}
          {viewMode === 'week' && (
            <WeeklyCalendar
              currentDate={currentDate}
              orders={filteredOrders}
              onOrderSelect={handleOrderSelect}
              onSlotClick={handleSlotClick}
              onDrop={handleDrop}
              movingOrderId={touchDrag.movingOrderId}
              // v1.9.35: removido onTouchPickUp — tap rola pro detalhe igual Daily.
              // Reagendamento via drag nativo (long-press no touch).
              onTouchDrop={touchDrag.dropOn}
              holidayMap={holidayMap}
            />
          )}
          {viewMode === 'day' && (
            // v1.9.35: DailyCalendar mobile não usa touch pickup — tap rola
            // pro detalhe abaixo e drag nativo move a OS. onTouchDrop é mantido
            // pra finalizar drops vindos de outras views, mas pickUp foi removido.
            <DailyCalendar
              currentDate={currentDate}
              orders={filteredOrders}
              onOrderSelect={handleOrderSelect}
              onSlotClick={handleSlotClick}
              onDrop={handleDrop}
              movingOrderId={touchDrag.movingOrderId}
              onTouchDrop={touchDrag.dropOn}
              holidayMap={holidayMap}
            />
          )}
        </div>

        {/* Legend — Sheet compacto no mobile, inline no desktop */}
        {serviceTypes.filter(t => t.is_active).length > 0 && (
          isMobile ? (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 h-8 self-start">
                  <Palette className="h-3.5 w-3.5" />
                  <span className="text-xs">Legenda</span>
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
                    {serviceTypes.filter(t => t.is_active).length}
                  </Badge>
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl p-0 flex flex-col">
                <SheetHeader className="px-4 pt-4 pb-2 border-b">
                  <SheetTitle>Legenda — Tipos de Serviço</SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-4 py-4 grid grid-cols-2 gap-x-3 gap-y-2.5">
                  {serviceTypes.filter(t => t.is_active).map((st) => (
                    <div key={st.id} className="flex items-center gap-2 min-w-0">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                      <span className="text-sm truncate">{st.name}</span>
                    </div>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          ) : (
            <div className="flex flex-wrap gap-3 items-center justify-center">
              <span className="text-xs text-muted-foreground font-medium">Legenda:</span>
              {serviceTypes.filter(t => t.is_active).map((st) => (
                <div key={st.id} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                  <span className="text-xs text-muted-foreground">{st.name}</span>
                </div>
              ))}
            </div>
          )
        )}

        {/* Resumo do Dia (v1.9.35): só aparece nas visões Semana e Mês.
            Na visão Dia o calendário acima já lista as OSs do dia, então mostrar
            de novo aqui era duplicação visual (feedback CEO). Em Semana/Mês continua
            servindo pra contextualizar a data selecionada. */}
        {viewMode !== 'day' && (
          <>
            <div>
              <h3 className="text-lg font-semibold">
                Resumo do Dia: {format(currentDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </h3>
              <p className="text-xs text-muted-foreground capitalize">
                {format(currentDate, 'EEEE', { locale: ptBR })}
              </p>
            </div>

            <MobileAgendaView
              currentDate={currentDate}
              orders={filteredOrders}
              onOrderSelect={handleOrderSelect}
              holidayMap={holidayMap}
            />
          </>
        )}

        {summaryOrder && (
          <div ref={summaryRef} className="min-h-[200px]">
            <ScheduleDetailPanel
              selectedDate={currentDate}
              orders={filteredOrders}
              selectedOrder={summaryOrder}
              onOrderSelect={handleOrderSelect}
              onClearSelection={handleClearSummary}
              onEdit={(summaryOrder as any)._isFinancialEvent || !canEditOS ? undefined : handleEditFromSummary}
              onDelete={!canDeleteOS ? undefined : handleDeleteFromSummary}
              onDeleteGroup={!canDeleteOS ? undefined : handleDeleteGroupFromSummary}
              onDeleteFinancialGroup={(summaryOrder as any)._isFinancialEvent ? () => handleDeleteFinancialGroup(summaryOrder) : undefined}
              onFinalize={(summaryOrder as any)._isFinancialEvent ? () => handleResolveBillingReminder(summaryOrder) : handleFinalizeFromSummary}
              onReopen={(summaryOrder as any)._isFinancialEvent ? () => handleReopenBillingReminder(summaryOrder) : (!canReopenOS ? undefined : handleReopenFromSummary)}
              onPause={(summaryOrder as any)._isFinancialEvent ? undefined : handlePauseFromSummary}
              onResume={(summaryOrder as any)._isFinancialEvent ? undefined : handleResumeFromSummary}
            />
          </div>
        )}

        {/* FAB Nova Tarefa/OS */}
        {canCreateOS && (
          <FABButton
            icon={<Plus className="h-5 w-5" />}
            label="Tarefa/OS"
            onClick={handleNewOrder}
          />
        )}

        <EntryTypeSelectorDialog
          open={isTypeSelectorOpen}
          onOpenChange={setIsTypeSelectorOpen}
          onSelectOS={handleSelectOS}
          onSelectTask={handleSelectTask}
        />
        <ServiceOrderFormDialog
          open={isFormOpen}
          onOpenChange={handleCloseForm}
          serviceOrder={selectedOrder}
          onSubmit={handleSubmit}
          isLoading={createServiceOrder.isPending || updateServiceOrder.isPending}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
        />
        <TaskFormDialog
          open={isTaskFormOpen}
          onOpenChange={(open) => { setIsTaskFormOpen(open); if (!open) setEditingTask(null); }}
          onSubmit={handleTaskSubmit}
          task={editingTask}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
        />
        <PausedOrdersDialog
          open={isPausedDialogOpen}
          onOpenChange={setIsPausedDialogOpen}
          onViewDetails={handleViewPausedDetails}
          onResume={handleResumePaused}
        />
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="flex flex-col lg:h-[calc(100vh-8rem)]">
      <PageHeader
        title="Agenda"
        subtitle="Visualize e gerencie os agendamentos de ordens de serviço"
        icon={CalendarIcon}
        className="mb-4"
      />

      <ScheduleHeader
        currentDate={currentDate}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onNewOrder={canCreateOS ? handleNewOrder : undefined}
        onOpenPaused={() => setIsPausedDialogOpen(true)}
        onOpenSearch={() => setIsSearchModalOpen(true)}
        pausedCount={pausedOrders.length}
        technicianFilter={technicianFilter}
        onTechnicianFilterChange={setTechnicianFilter}
        technicians={allProfiles}
        customerFilter={customerFilter}
        onCustomerFilterChange={setCustomerFilter}
        customers={customers}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 mt-4">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0">
            {viewMode === 'month' && (
              <MonthlyCalendar
                currentDate={currentDate}
                serviceOrders={filteredOrders}
                onDateSelect={handleDateSelect}
                onDateDoubleClick={handleDateDoubleClick}
                onOrderSelect={handleOrderSelect}
                onDrop={handleDrop}
                holidayMap={holidayMap}
              />
            )}
            {viewMode === 'week' && (
              <WeeklyCalendar
                currentDate={currentDate}
                orders={filteredOrders}
                onOrderSelect={handleOrderSelect}
                onSlotClick={handleSlotClick}
                onDrop={handleDrop}
                holidayMap={holidayMap}
              />
            )}
            {viewMode === 'day' && (
              <DailyCalendar
                currentDate={currentDate}
                orders={filteredOrders}
                onOrderSelect={handleOrderSelect}
                onSlotClick={handleSlotClick}
                onDrop={handleDrop}
                holidayMap={holidayMap}
              />
            )}
          </div>
          {/* Legenda abaixo do calendário no desktop (Onda UI-4) */}
          <ScheduleLegend />
        </div>

        <div className="w-full lg:w-80 lg:shrink-0 min-h-[200px]">
          <ScheduleDetailPanel
            selectedDate={currentDate}
            orders={filteredOrders}
            selectedOrder={summaryOrder}
            onOrderSelect={handleOrderSelect}
            onClearSelection={handleClearSummary}
            onEdit={summaryOrder && (summaryOrder as any)._isFinancialEvent || !canEditOS ? undefined : handleEditFromSummary}
            onDelete={!canDeleteOS ? undefined : handleDeleteFromSummary}
            onDeleteGroup={!canDeleteOS ? undefined : handleDeleteGroupFromSummary}
            onDeleteFinancialGroup={summaryOrder && (summaryOrder as any)._isFinancialEvent ? () => handleDeleteFinancialGroup(summaryOrder) : undefined}
            onFinalize={summaryOrder && (summaryOrder as any)._isFinancialEvent ? () => handleResolveBillingReminder(summaryOrder) : handleFinalizeFromSummary}
            onReopen={summaryOrder && (summaryOrder as any)._isFinancialEvent ? () => handleReopenBillingReminder(summaryOrder) : (!canReopenOS ? undefined : handleReopenFromSummary)}
            onPause={summaryOrder && (summaryOrder as any)._isFinancialEvent ? undefined : handlePauseFromSummary}
            onResume={summaryOrder && (summaryOrder as any)._isFinancialEvent ? undefined : handleResumeFromSummary}
          />
        </div>
      </div>

      <EntryTypeSelectorDialog
        open={isTypeSelectorOpen}
        onOpenChange={setIsTypeSelectorOpen}
        onSelectOS={handleSelectOS}
        onSelectTask={handleSelectTask}
      />
      <ServiceOrderFormDialog
        open={isFormOpen}
        onOpenChange={handleCloseForm}
        serviceOrder={selectedOrder}
        onSubmit={handleSubmit}
        isLoading={createServiceOrder.isPending || updateServiceOrder.isPending}
        defaultDate={defaultDate}
        defaultTime={defaultTime}
      />
      <TaskFormDialog
        open={isTaskFormOpen}
        onOpenChange={(open) => { setIsTaskFormOpen(open); if (!open) setEditingTask(null); }}
        onSubmit={handleTaskSubmit}
        task={editingTask}
        defaultDate={defaultDate}
        defaultTime={defaultTime}
      />
      <PausedOrdersDialog
        open={isPausedDialogOpen}
        onOpenChange={setIsPausedDialogOpen}
        onViewDetails={handleViewPausedDetails}
        onResume={handleResumePaused}
      />
      <OsSearchDialog
        open={isSearchModalOpen}
        onOpenChange={setIsSearchModalOpen}
        orders={filteredOrders as any}
        onSelect={(order) => handleSearchResultSelect(order as any)}
      />
    </div>
  );
}
