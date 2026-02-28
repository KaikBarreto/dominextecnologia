import { useState, useMemo, useCallback } from 'react';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
import { MonthlyCalendar } from '@/components/schedule/MonthlyCalendar';
import { WeeklyCalendar } from '@/components/schedule/WeeklyCalendar';
import { DailyCalendar } from '@/components/schedule/DailyCalendar';
import { MobileAgendaView } from '@/components/schedule/MobileAgendaView';
import { ScheduleHeader, type ViewMode } from '@/components/schedule/ScheduleHeader';
import { OrderSummarySheet } from '@/components/schedule/OrderSummarySheet';
import { ScheduleSkeleton } from '@/components/schedule/ScheduleSkeleton';
import { useServiceOrders, ServiceOrderInput } from '@/hooks/useServiceOrders';
import { useTechnicians } from '@/hooks/useProfiles';
import { useCustomers } from '@/hooks/useCustomers';
import { useIsMobile } from '@/hooks/use-mobile';
import { ServiceOrderFormDialog } from '@/components/service-orders/ServiceOrderFormDialog';
import type { ServiceOrder, OsStatus } from '@/types/database';

export default function Schedule() {
  const { serviceOrders, isLoading, createServiceOrder, updateServiceOrder } = useServiceOrders();
  const { data: technicians = [] } = useTechnicians();
  const { customers } = useCustomers();
  const isMobile = useIsMobile();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<(ServiceOrder & { customer: any; equipment: any }) | null>(null);
  const [summaryOrder, setSummaryOrder] = useState<(ServiceOrder & { customer: any; equipment: any }) | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | undefined>();
  const [prefillTime, setPrefillTime] = useState<string | undefined>();

  // Filters
  const [technicianFilter, setTechnicianFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredOrders = useMemo(() => {
    return serviceOrders.filter((order) => {
      if (technicianFilter !== 'all' && order.technician_id !== technicianFilter) return false;
      if (customerFilter !== 'all' && order.customer_id !== customerFilter) return false;
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      return true;
    });
  }, [serviceOrders, technicianFilter, customerFilter, statusFilter]);

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
    setSummaryOpen(true);
  }, []);

  const handleEditFromSummary = () => {
    if (summaryOrder) {
      setSelectedOrder(summaryOrder);
      setSummaryOpen(false);
      setIsFormOpen(true);
    }
  };

  const handleNewOrder = () => {
    setSelectedOrder(null);
    setPrefillDate(undefined);
    setPrefillTime(undefined);
    setIsFormOpen(true);
  };

  const handleSlotClick = (date: string, time: string) => {
    setSelectedOrder(null);
    setPrefillDate(date);
    setPrefillTime(time);
    setIsFormOpen(true);
  };

  const handleDateSelect = (date: Date) => {
    setCurrentDate(date);
    if (viewMode === 'month') {
      // On month view, clicking a date switches to day view on mobile
      if (isMobile) setViewMode('day');
    }
  };

  const handleDrop = async (orderId: string, newDate: string, newTime: string) => {
    await updateServiceOrder.mutateAsync({
      id: orderId,
      scheduled_date: newDate,
      scheduled_time: newTime,
    });
  };

  const handleCloseForm = (open: boolean) => {
    if (!open) {
      setIsFormOpen(false);
      setSelectedOrder(null);
      setPrefillDate(undefined);
      setPrefillTime(undefined);
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

  // Mobile: show agenda list view
  if (isMobile) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)]">
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
          technicians={technicians}
          customerFilter={customerFilter}
          onCustomerFilterChange={setCustomerFilter}
          customers={customers}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
        <div className="flex-1 mt-3 overflow-hidden rounded-xl border bg-card">
          <MobileAgendaView
            currentDate={currentDate}
            orders={filteredOrders}
            onOrderSelect={handleOrderSelect}
            onNewOrder={handleNewOrder}
          />
        </div>

        <OrderSummarySheet
          order={summaryOrder}
          open={summaryOpen}
          onOpenChange={setSummaryOpen}
          onEdit={handleEditFromSummary}
        />

        <ServiceOrderFormDialog
          open={isFormOpen}
          onOpenChange={handleCloseForm}
          serviceOrder={selectedOrder}
          onSubmit={handleSubmit}
          isLoading={createServiceOrder.isPending || updateServiceOrder.isPending}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)]">
      <div>
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
        technicians={technicians}
        customerFilter={customerFilter}
        onCustomerFilterChange={setCustomerFilter}
        customers={customers}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      <div className="flex-1 min-h-0" style={{ height: 'calc(100% - 10rem)' }}>
        {viewMode === 'month' && (
          <MonthlyCalendar
            serviceOrders={filteredOrders}
            onDateSelect={handleDateSelect}
            onOrderSelect={handleOrderSelect}
            onNewOrder={handleNewOrder}
          />
        )}
        {viewMode === 'week' && (
          <WeeklyCalendar
            currentDate={currentDate}
            orders={filteredOrders}
            onOrderSelect={handleOrderSelect}
            onSlotClick={handleSlotClick}
            onDrop={handleDrop}
          />
        )}
        {viewMode === 'day' && (
          <DailyCalendar
            currentDate={currentDate}
            orders={filteredOrders}
            onOrderSelect={handleOrderSelect}
            onSlotClick={handleSlotClick}
            onDrop={handleDrop}
          />
        )}
      </div>

      <OrderSummarySheet
        order={summaryOrder}
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        onEdit={handleEditFromSummary}
      />

      <ServiceOrderFormDialog
        open={isFormOpen}
        onOpenChange={handleCloseForm}
        serviceOrder={selectedOrder}
        onSubmit={handleSubmit}
        isLoading={createServiceOrder.isPending || updateServiceOrder.isPending}
      />
    </div>
  );
}
