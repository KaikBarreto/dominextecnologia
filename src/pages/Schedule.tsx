import { useState, useMemo, useCallback } from 'react';
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
import { MonthlyCalendar } from '@/components/schedule/MonthlyCalendar';
import { WeeklyCalendar } from '@/components/schedule/WeeklyCalendar';
import { DailyCalendar } from '@/components/schedule/DailyCalendar';
import { MobileAgendaView } from '@/components/schedule/MobileAgendaView';
import { ScheduleHeader, type ViewMode } from '@/components/schedule/ScheduleHeader';
import { ScheduleDetailPanel } from '@/components/schedule/ScheduleDetailPanel';
import { ScheduleSkeleton } from '@/components/schedule/ScheduleSkeleton';
import { useServiceOrders, ServiceOrderInput } from '@/hooks/useServiceOrders';
import { useTechnicians } from '@/hooks/useProfiles';
import { useCustomers } from '@/hooks/useCustomers';
import { useIsMobile } from '@/hooks/use-mobile';
import { ServiceOrderFormDialog } from '@/components/service-orders/ServiceOrderFormDialog';
import { cn } from '@/lib/utils';
import type { ServiceOrder } from '@/types/database';

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
  }, []);

  const handleClearSummary = useCallback(() => {
    setSummaryOrder(null);
  }, []);

  const handleEditFromSummary = () => {
    if (summaryOrder) {
      setSelectedOrder(summaryOrder);
      setSummaryOrder(null);
      setIsFormOpen(true);
    }
  };

  const handleNewOrder = () => {
    setSelectedOrder(null);
    setIsFormOpen(true);
  };

  const handleSlotClick = (date: string, time: string) => {
    setSelectedOrder(null);
    setIsFormOpen(true);
  };

  const handleDateSelect = (date: Date) => {
    setCurrentDate(date);
    setSummaryOrder(null);
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

  // Mobile layout (phones only < 768px)
  if (isMobile) {
    return (
      <div className="flex flex-col gap-3 min-h-[calc(100vh-8rem)]">
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

        <div className={cn(
          "flex-1 overflow-hidden rounded-xl border bg-card",
          summaryOrder && "flex-none max-h-[40vh]"
        )}>
          <MobileAgendaView
            currentDate={currentDate}
            orders={filteredOrders}
            onOrderSelect={handleOrderSelect}
          />
        </div>

        {summaryOrder && (
          <div className="min-h-[200px]">
            <ScheduleDetailPanel
              selectedDate={currentDate}
              orders={filteredOrders}
              selectedOrder={summaryOrder}
              onOrderSelect={handleOrderSelect}
              onClearSelection={handleClearSummary}
              onEdit={handleEditFromSummary}
            />
          </div>
        )}

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

  // Desktop & Tablet layout
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
        technicians={technicians}
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
              onOrderSelect={handleOrderSelect}
              onDrop={handleDrop}
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

        <div className="w-full lg:w-80 lg:shrink-0 min-h-[200px]">
          <ScheduleDetailPanel
            selectedDate={currentDate}
            orders={filteredOrders}
            selectedOrder={summaryOrder}
            onOrderSelect={handleOrderSelect}
            onClearSelection={handleClearSummary}
            onEdit={handleEditFromSummary}
          />
        </div>
      </div>

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
