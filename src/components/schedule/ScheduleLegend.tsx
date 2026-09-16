import { useState } from 'react';
import { Star } from 'lucide-react';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

// Clientes com muitos tipos de serviço cadastrados (ex: VS Project, ~15+ tipos
// com nomes longos) viravam um paredão de badges que roubava a altura do
// calendário no container `flex-1 min-h-0` da Agenda. Limita a exibição inicial
// e deixa o resto atrás de um chip expansível.
const VISIBLE_LIMIT = 8;

/**
 * Legenda de tipos de serviço (chips coloridos) usada no desktop da Agenda.
 *
 * Foi extraída do `ScheduleHeader` para poder ser renderizada
 * **após** o calendário (decisão de UX — Onda UI-4). No mobile a legenda
 * continua sendo apresentada via Sheet diretamente em `Schedule.tsx`.
 */
export function ScheduleLegend() {
  const { serviceTypes } = useServiceTypes();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.schedule.legend;
  const activeTypes = serviceTypes.filter((st) => st.is_active);
  const [expanded, setExpanded] = useState(false);

  if (activeTypes.length === 0) return null;

  const hasOverflow = activeTypes.length > VISIBLE_LIMIT;
  const visibleTypes = expanded || !hasOverflow ? activeTypes : activeTypes.slice(0, VISIBLE_LIMIT);
  const remainingCount = activeTypes.length - VISIBLE_LIMIT;

  return (
    <div className="flex flex-wrap gap-2 items-center pt-3 border-t mt-3">
      <span className="text-xs text-muted-foreground font-medium">{t.label}</span>
      {visibleTypes.map((st) => (
        <span
          key={st.id}
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium text-white"
          style={{ backgroundColor: st.color }}
        >
          {st.name}
        </span>
      ))}
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          {expanded ? t.showLess : t.showMore.replace('{count}', String(remainingCount))}
        </button>
      )}
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-secondary-foreground">
        <Star className="h-2.5 w-2.5" />
        {t.holiday}
      </span>
    </div>
  );
}
