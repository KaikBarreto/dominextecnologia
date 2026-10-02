import { Phone, CalendarClock, CheckCircle2, DollarSign } from 'lucide-react';
import { StatCarousel, type StatCarouselItem } from '@/components/mobile/StatCarousel';
import type { ActivityCounters } from '@/utils/salespersonActivityStats';

interface Props {
  counters: ActivityCounters;
  loading?: boolean;
}

/**
 * Cards de totais do período — mobile vira carrossel, desktop vira grid.
 * Reusa `StatCarousel` (já usado nesta mesma página, aba "Vendedores"): card
 * branco com ícone saturado, que é a convenção do projeto pra este tipo de
 * número (não é um componente novo de UI, é o mesmo primitivo).
 */
export function ActivityTotalsCards({ counters, loading }: Props) {
  const items: StatCarouselItem[] = [
    {
      key: 'contacts',
      label: 'Contatos / Prospecções',
      count: counters.contacts,
      icon: <Phone className="h-4 w-4" />,
      accentColor: '#0EA5E9',
    },
    {
      key: 'meetings_scheduled',
      label: 'Reuniões agendadas',
      count: counters.meetings_scheduled,
      icon: <CalendarClock className="h-4 w-4" />,
      accentColor: '#8B5CF6',
    },
    {
      key: 'meetings_held',
      label: 'Reuniões realizadas',
      count: counters.meetings_held,
      icon: <CheckCircle2 className="h-4 w-4" />,
      accentColor: '#00C597',
    },
    {
      key: 'sales_count',
      label: 'Vendas',
      count: counters.sales_count,
      icon: <DollarSign className="h-4 w-4" />,
      accentColor: '#F97316',
    },
  ];

  return <StatCarousel items={items} loading={loading} />;
}
