import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { MonthlyCalendar } from '@/components/schedule/MonthlyCalendar';
import { DaySchedule } from '@/components/schedule/DaySchedule';
import { useServiceOrders, ServiceOrderInput } from '@/hooks/useServiceOrders';
import { ServiceOrderFormDialog } from '@/components/service-orders/ServiceOrderFormDialog';
import type { ServiceOrder } from '@/types/database';

export default function Schedule() {
  const { serviceOrders, isLoading, createServiceOrder, updateServiceOrder } = useServiceOrders();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<(ServiceOrder & { customer: any; equipment: any }) | null>(null);

  const ordersForSelectedDate = useMemo(() => {
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return serviceOrders.filter((order) => order.scheduled_date === dateKey);
  }, [serviceOrders, selectedDate]);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const handleOrderSelect = (order: ServiceOrder & { customer: any; equipment: any }) => {
    setSelectedOrder(order);
    setIsFormOpen(true);
  };

  const handleNewOrder = () => {
    setSelectedOrder(null);
    setIsFormOpen(true);
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
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)]">
      <div>
        <h1 className="text-2xl font-bold">Agenda</h1>
        <p className="text-muted-foreground">
          Visualize e gerencie os agendamentos de ordens de serviço
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 h-[calc(100%-5rem)]">
        <div className="lg:col-span-2 min-h-[600px]">
          <MonthlyCalendar
            serviceOrders={serviceOrders}
            onDateSelect={handleDateSelect}
            onOrderSelect={handleOrderSelect}
            onNewOrder={handleNewOrder}
          />
        </div>

        <div className="lg:col-span-1 min-h-[400px]">
          <DaySchedule
            date={selectedDate}
            orders={ordersForSelectedDate}
            onOrderSelect={handleOrderSelect}
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
