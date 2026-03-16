import { useState, useMemo, useCallback } from 'react';
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, format, startOfMonth, endOfMonth, getYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { MonthlyCalendar } from '@/components/schedule/MonthlyCalendar';
import { WeeklyCalendar } from '@/components/schedule/WeeklyCalendar';
import { DailyCalendar } from '@/components/schedule/DailyCalendar';
import { MobileAgendaView } from '@/components/schedule/MobileAgendaView';
import { ScheduleHeader, type ViewMode } from '@/components/schedule/ScheduleHeader';
import { ScheduleDetailPanel } from '@/components/schedule/ScheduleDetailPanel';
import { ScheduleSkeleton } from '@/components/schedule/ScheduleSkeleton';
import { EntryTypeSelectorDialog } from '@/components/schedule/EntryTypeSelectorDialog';
import { TaskFormDialog, type TaskFormData } from '@/components/schedule/TaskFormDialog';
import { useServiceOrders, ServiceOrderInput } from '@/hooks/useServiceOrders';
import { useProfiles } from '@/hooks/useProfiles';
import { useCustomers } from '@/hooks/useCustomers';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useTeams } from '@/hooks/useTeams';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTouchDragDrop } from '@/hooks/useTouchDragDrop';
import { ServiceOrderFormDialog } from '@/components/service-orders/ServiceOrderFormDialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { ServiceOrder } from '@/types/database';
import { useFinancialScheduleEvents } from '@/hooks/useFinancialScheduleEvents';
import { useOrderAssignees } from '@/hooks/useOrderAssignees';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { getAllHolidays, buildHolidayMap, type Holiday } from '@/utils/holidays';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export default function Schedule() {
  const { serviceOrders, isLoading, createServiceOrder, updateServiceOrder, deleteServiceOrder } = useServiceOrders();
  const { data: allProfiles = [] } = useProfiles();
  const { customers } = useCustomers();
  const isMobile = useIsMobile();
  const { serviceTypes } = useServiceTypes();
  const { teamsWithMembers } = useTeams();
  const { user } = useAuth();
  const { settings: companySettings } = useCompanySettings();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [isTypeSelectorOpen, setIsTypeSelectorOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<(ServiceOrder & { customer: any; equipment: any }) | null>(null);
  const [summaryOrder, setSummaryOrder] = useState<(ServiceOrder & { customer: any; equipment: any }) | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();
  const [defaultTime, setDefaultTime] = useState<string | undefined>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filters
  const [technicianFilter, setTechnicianFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Get team IDs the current user belongs to
  const myTeamIds = useMemo(() => {
    if (!user?.id) return [];
    return teamsWithMembers
      .filter(t => t.members.some(m => m.user_id === user.id))
      .map(t => t.id);
  }, [teamsWithMembers, user?.id]);

  // Check if current user has technician role (only filter for tecnico role)
  const { hasRole } = useAuth();
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

  const filteredOrders = useMemo(() => {
    const osFiltered = serviceOrders.filter((order) => {
      if (isTechnician && user?.id) {
        const assigneeIds = (order as any)._assignee_user_ids as string[] | undefined;
        const isAssignedToMe = assigneeIds?.includes(user.id) || order.technician_id === user.id;
        const isAssignedToMyTeam = order.team_id && myTeamIds.includes(order.team_id);
        if (!isAssignedToMe && !isAssignedToMyTeam) return false;
      }

      if (technicianFilter !== 'all') {
        const assigneeIds = (order as any)._assignee_user_ids as string[] | undefined;
        const matchesTech = assigneeIds?.includes(technicianFilter) || order.technician_id === technicianFilter;
        if (!matchesTech) return false;
      }
      if (customerFilter !== 'all' && order.customer_id !== customerFilter) return false;
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      return true;
    }).map(order => {
      const { assignees, team } = getAssignees(order);
      return { ...order, _assignees: assignees, _team: team };
    });
    return [...osFiltered, ...financialEvents];
  }, [serviceOrders, technicianFilter, customerFilter, statusFilter, isTechnician, user?.id, myTeamIds, financialEvents, getAssignees]);

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

  const handleOrderSelect = useCallback((order: ServiceOrder & { customer: any; equipment: any }) => {
    setSummaryOrder(order);
  }, []);

  const handleClearSummary = useCallback(() => {
    setSummaryOrder(null);
  }, []);

  const handleEditFromSummary = () => {
    if (summaryOrder) {
      setSelectedOrder(summaryOrder);
      setSummaryOrder(null);
      setDefaultDate(undefined);
      setDefaultTime(undefined);
      setIsFormOpen(true);
    }
  };

  const handleDeleteFromSummary = (id: string) => {
    deleteServiceOrder.mutate(id);
    setSummaryOrder(null);
  };

  const handleFinalizeFromSummary = (id: string) => {
    updateServiceOrder.mutate({ id, status: 'concluida' as any });
    setSummaryOrder(null);
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
    const groupId = data.recurrence_type ? crypto.randomUUID() : undefined;

    // Generate dates for recurrence
    const dates: string[] = [data.scheduled_date || format(new Date(), 'yyyy-MM-dd')];
    if (data.recurrence_type && data.recurrence_end_date) {
      const endDate = new Date(data.recurrence_end_date + 'T12:00:00');

      if (data.recurrence_type === 'custom' && data.recurrence_weekdays && data.recurrence_weekdays.length > 0) {
        // Custom: generate dates for each selected weekday within range
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
          else break;
          if (current > endDate) break;
          dates.push(format(current, 'yyyy-MM-dd'));
        }
      }
    }

    // Create all task entries
    const inserts = dates.map(date => ({
      entry_type: 'tarefa',
      task_title: data.task_title,
      task_type_id: data.task_type_id || null,
      service_type_id: data.service_type_id || null,
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
    }));

    const { data: created, error } = await supabase.from('service_orders').insert(inserts as any).select('id');
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao criar tarefa', description: error.message });
    } else {
      // Insert assignees for each created task
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

  if (isLoading) {
    return (
      <div className="space-y-6 p-1">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-muted-foreground">Visualize e gerencie os agendamentos de ordens de serviço</p>
        </div>
        <ScheduleSkeleton />
      </div>
    );
  }

  // Mobile & Tablet layout
  if (isMobile) {
    return (
      <div className="flex flex-col gap-4">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-muted-foreground text-sm">Gerencie suas tarefas e compromissos</p>
        </div>

        {/* Navigation: arrows + month centered */}
        <div className="flex items-center justify-center gap-3">
          <button onClick={handlePrev} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-base font-semibold capitalize">
            {format(currentDate, viewMode === 'day' ? "dd 'de' MMMM yyyy" : 'MMM yyyy', { locale: ptBR })}
          </h2>
          <button onClick={handleNext} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* View mode tabs */}
        <div className="flex justify-center">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="day" className="px-5">Dia</TabsTrigger>
              <TabsTrigger value="week" className="px-5">Semana</TabsTrigger>
              <TabsTrigger value="month" className="px-5">Mês</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Moving indicator */}
        {touchDrag.movingOrderId && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/10 border border-primary/30">
            <span className="text-xs font-medium text-primary">Toque no horário para mover a OS</span>
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={touchDrag.cancel}>Cancelar</Button>
          </div>
        )}

        {/* Calendar */}
        <div className="rounded-xl border bg-card overflow-hidden">
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
              onTouchPickUp={touchDrag.pickUp}
              onTouchDrop={touchDrag.dropOn}
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
              movingOrderId={touchDrag.movingOrderId}
              onTouchPickUp={touchDrag.pickUp}
              onTouchDrop={touchDrag.dropOn}
              holidayMap={holidayMap}
            />
          )}
        </div>

        {/* Legend */}
        {serviceTypes.filter(t => t.is_active).length > 0 && (
          <div className="flex flex-wrap gap-3 items-center justify-center">
            <span className="text-xs text-muted-foreground font-medium">Legenda:</span>
            {serviceTypes.filter(t => t.is_active).map((st) => (
              <div key={st.id} className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                <span className="text-xs text-muted-foreground">{st.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Day description + New button */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold capitalize">
              {format(currentDate, "dd 'de' MMMM", { locale: ptBR })}
            </h3>
            <p className="text-xs text-muted-foreground capitalize">
              {format(currentDate, 'EEEE', { locale: ptBR })}
            </p>
          </div>
          <Button size="sm" onClick={handleNewOrder}>
            <Plus className="h-4 w-4 mr-1" />
            Nova Tarefa/OS
          </Button>
        </div>

        {/* Day orders list */}
        <MobileAgendaView
          currentDate={currentDate}
          orders={filteredOrders}
          onOrderSelect={handleOrderSelect}
          holidayMap={holidayMap}
        />

        {summaryOrder && (
          <div className="min-h-[200px]">
            <ScheduleDetailPanel
              selectedDate={currentDate}
              orders={filteredOrders}
              selectedOrder={summaryOrder}
              onOrderSelect={handleOrderSelect}
              onClearSelection={handleClearSummary}
              onEdit={handleEditFromSummary}
              onDelete={handleDeleteFromSummary}
              onFinalize={handleFinalizeFromSummary}
            />
          </div>
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
          onOpenChange={setIsTaskFormOpen}
          onSubmit={handleTaskSubmit}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
        />
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <p className="text-muted-foreground">Visualize e gerencie os agendamentos de ordens de serviço</p>
      </div>

      <ScheduleHeader
        currentDate={currentDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onNewOrder={handleNewOrder}
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
        <div className="flex-1 min-w-0 min-h-0">
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

        <div className="w-full lg:w-80 lg:shrink-0 min-h-[200px]">
          <ScheduleDetailPanel
            selectedDate={currentDate}
            orders={filteredOrders}
            selectedOrder={summaryOrder}
            onOrderSelect={handleOrderSelect}
            onClearSelection={handleClearSummary}
            onEdit={handleEditFromSummary}
            onDelete={handleDeleteFromSummary}
            onFinalize={handleFinalizeFromSummary}
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
        onOpenChange={setIsTaskFormOpen}
        onSubmit={handleTaskSubmit}
        defaultDate={defaultDate}
        defaultTime={defaultTime}
      />
    </div>
  );
}
