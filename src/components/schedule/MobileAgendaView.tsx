import { useMemo } from 'react';
import { format } from 'date-fns';
import { Clock } from 'lucide-react';
import { EventCard } from './EventCard';
import type { ServiceOrder } from '@/types/database';

interface MobileAgendaViewProps {
  currentDate: Date;
  orders: (ServiceOrder & { customer: any; equipment: any })[];
  onOrderSelect: (order: ServiceOrder & { customer: any; equipment: any }) => void;
}

const CASCADE_OFFSET = 60; // px vertical offset per overlapping card

type CascadeItem = {
  order: ServiceOrder & { customer: any; equipment: any };
  startMin: number;
  endMin: number;
  index: number; // cascade depth
  clusterSize: number;
};

function layoutCascade(
  dayOrders: (ServiceOrder & { customer: any; equipment: any })[]
): CascadeItem[] {
  const items = dayOrders.map((order) => {
    const [h, m] = (order.scheduled_time || '00:00').split(':').map(Number);
    const startMin = h * 60 + m;
    const duration = (order as any).duration_minutes || 120;
    return { order, startMin, endMin: startMin + duration, index: 0, clusterSize: 1 };
  }).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const clusters: CascadeItem[][] = [];
  for (const item of items) {
    let placed = false;
    for (const cluster of clusters) {
      if (cluster.some(c => c.startMin < item.endMin && item.startMin < c.endMin)) {
        item.index = cluster.length;
        cluster.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([item]);
  }

  for (const cluster of clusters) {
    for (const item of cluster) item.clusterSize = cluster.length;
  }

  return items;
}

export function MobileAgendaView({ currentDate, orders, onOrderSelect }: MobileAgendaViewProps) {
  const dateKey = format(currentDate, 'yyyy-MM-dd');

  const dayOrders = useMemo(() => {
    return orders
      .filter((o) => o.scheduled_date === dateKey)
      .sort((a, b) => (a.scheduled_time || '00:00').localeCompare(b.scheduled_time || '00:00'));
  }, [orders, dateKey]);

  const cascadeItems = useMemo(() => layoutCascade(dayOrders), [dayOrders]);

  // Check if there are any overlaps at all
  const hasOverlaps = cascadeItems.some(item => item.clusterSize > 1);

  if (dayOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-base font-medium">Nenhum agendamento</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Não há ordens de serviço para este dia
        </p>
      </div>
    );
  }

  // If no overlaps, simple list
  if (!hasOverlaps) {
    return (
      <div className="space-y-3">
        {dayOrders.map((order) => (
          <EventCard
            key={order.id}
            order={order}
            onClick={() => onOrderSelect(order)}
          />
        ))}
      </div>
    );
  }

  // With overlaps, render cascade groups
  // Group into clusters for rendering
  const clusters: CascadeItem[][] = [];
  for (const item of cascadeItems) {
    if (item.index === 0) {
      clusters.push([item]);
    } else {
      clusters[clusters.length - 1].push(item);
    }
  }

  return (
    <div className="space-y-3">
      {clusters.map((cluster, ci) => {
        if (cluster.length === 1) {
          return (
            <EventCard
              key={cluster[0].order.id}
              order={cluster[0].order}
              onClick={() => onOrderSelect(cluster[0].order)}
            />
          );
        }

        // Cascade stack
        const totalHeight = 120 + (cluster.length - 1) * CASCADE_OFFSET;
        return (
          <div key={ci} className="relative" style={{ height: totalHeight }}>
            {cluster.map((item) => (
              <div
                key={item.order.id}
                className="absolute left-0 right-0"
                style={{
                  top: item.index * CASCADE_OFFSET,
                  zIndex: item.index + 1,
                }}
              >
                <EventCard
                  order={item.order}
                  onClick={() => onOrderSelect(item.order)}
                  colorShift={item.index}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
