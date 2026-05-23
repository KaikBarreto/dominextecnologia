import { Star } from 'lucide-react';
import { useServiceTypes } from '@/hooks/useServiceTypes';

/**
 * Legenda de tipos de serviço (chips coloridos) usada no desktop da Agenda.
 *
 * Foi extraída do `ScheduleHeader` para poder ser renderizada
 * **após** o calendário (decisão de UX — Onda UI-4). No mobile a legenda
 * continua sendo apresentada via Sheet diretamente em `Schedule.tsx`.
 */
export function ScheduleLegend() {
  const { serviceTypes } = useServiceTypes();
  const activeTypes = serviceTypes.filter((t) => t.is_active);

  if (activeTypes.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 items-center pt-3 border-t mt-3">
      <span className="text-xs text-muted-foreground font-medium">Legenda:</span>
      {activeTypes.map((st) => (
        <span
          key={st.id}
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium text-white"
          style={{ backgroundColor: st.color }}
        >
          {st.name}
        </span>
      ))}
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-secondary-foreground">
        <Star className="h-2.5 w-2.5" />
        Feriado
      </span>
    </div>
  );
}
