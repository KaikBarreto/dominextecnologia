import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Star, Layers } from 'lucide-react';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface OrderLike {
  service_type_id?: string | null;
}

interface ScheduleLegendProps {
  /** OSs do período visível no calendário (mês/semana/dia atual). Decide QUAIS
   *  chips aparecem sem precisar abrir nada — é o que está de fato na tela. */
  ordersInView: OrderLike[];
  /** Todas as OSs (sem recorte de data). Fallback quando o período visível
   *  ainda não tem nenhuma OS (ex: mês futuro vazio). */
  ordersAllTime: OrderLike[];
}

/**
 * Legenda de tipos de serviço (chips coloridos) da Agenda.
 *
 * Onda UI-5 (2026-09): empresa com catálogo grande (VS Project cadastrou 107
 * tipos de serviço, mas usa só 2-3 de fato nas OSs) fazia a legenda virar uma
 * parede de etiquetas que empurrava o calendário pra fora da tela — quanto
 * mais tipos cadastrados, pior. Agora a legenda é sempre UMA linha de altura
 * fixa (nunca cresce, não importa quantos tipos existam): mostra só os tipos
 * que aparecem no período visível (fallback: já usados alguma vez; fallback
 * final: amostra do catálogo pra empresa nova), rolável na horizontal com fade
 * nas bordas. O catálogo completo continua a um toque em "Ver todos".
 *
 * Empresa com poucos tipos (mediana do parque = 3) não perde nada: a linha
 * cabe inteira, sem scroll e sem botão "Ver todos" (não há o que esconder).
 */
export function ScheduleLegend({ ordersInView, ordersAllTime }: ScheduleLegendProps) {
  const { serviceTypes } = useServiceTypes();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.schedule.legend;
  const isMobile = useIsMobile();
  const [fullListOpen, setFullListOpen] = useState(false);

  const activeTypes = useMemo(() => serviceTypes.filter((st) => st.is_active), [serviceTypes]);

  const displayTypes = useMemo(() => {
    if (activeTypes.length === 0) return [];

    const inViewIds = new Set(ordersInView.map((o) => o.service_type_id).filter(Boolean));
    const usedInView = activeTypes.filter((st) => inViewIds.has(st.id));
    if (usedInView.length > 0) return usedInView;

    const allTimeIds = new Set(ordersAllTime.map((o) => o.service_type_id).filter(Boolean));
    const usedAllTime = activeTypes.filter((st) => allTimeIds.has(st.id));
    if (usedAllTime.length > 0) return usedAllTime;

    // Empresa nova, sem nenhuma OS ainda: mostra uma amostra do catálogo.
    return activeTypes.slice(0, 8);
  }, [activeTypes, ordersInView, ordersAllTime]);

  const hiddenCount = activeTypes.length - displayTypes.length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, clientWidth, scrollWidth } = el;
    setShowLeftFade(scrollLeft > 1);
    setShowRightFade(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateFades, { passive: true });
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);
    updateFades();
    return () => {
      el.removeEventListener('scroll', updateFades);
      ro.disconnect();
    };
  }, [updateFades, displayTypes.length, hiddenCount]);

  if (activeTypes.length === 0) return null;

  // Máscara de fade nas bordas — mesma técnica do MobilePillTabs (âncora à
  // esquerda, fade só aparece quando há conteúdo rolado pra aquele lado).
  const maskStyle: CSSProperties = (() => {
    if (showLeftFade && showRightFade) {
      return {
        WebkitMaskImage: 'linear-gradient(to right, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)',
        maskImage: 'linear-gradient(to right, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)',
      };
    }
    if (showLeftFade) {
      return {
        WebkitMaskImage: 'linear-gradient(to right, transparent 0, black 20px)',
        maskImage: 'linear-gradient(to right, transparent 0, black 20px)',
      };
    }
    if (showRightFade) {
      return {
        WebkitMaskImage: 'linear-gradient(to left, transparent 0, black 20px)',
        maskImage: 'linear-gradient(to left, transparent 0, black 20px)',
      };
    }
    return {};
  })();

  const fullList = (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      {activeTypes.map((st) => (
        <div key={st.id} className="flex items-center gap-2 min-w-0">
          <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
          <span className="text-sm truncate">{st.name}</span>
        </div>
      ))}
    </div>
  );

  const viewAllTrigger = (
    <button
      type="button"
      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
    >
      <Layers className="h-2.5 w-2.5" />
      {t.viewAll.replace('{count}', String(activeTypes.length))}
    </button>
  );

  return (
    <div className="flex items-center gap-2 pt-3 border-t mt-3 min-w-0">
      <span className="text-xs text-muted-foreground font-medium shrink-0">{t.label}</span>
      <div
        ref={scrollRef}
        style={maskStyle}
        className="flex flex-1 items-center gap-2 min-w-0 overflow-x-auto pb-0.5 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-[mask-image] duration-200"
      >
        {displayTypes.map((st) => (
          <span
            key={st.id}
            className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium text-white whitespace-nowrap"
            style={{ backgroundColor: st.color }}
          >
            {st.name}
          </span>
        ))}
        <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-secondary-foreground whitespace-nowrap">
          <Star className="h-2.5 w-2.5" />
          {t.holiday}
        </span>
        {hiddenCount > 0 && (
          isMobile ? (
            <Sheet open={fullListOpen} onOpenChange={setFullListOpen}>
              <SheetTrigger asChild>{viewAllTrigger}</SheetTrigger>
              <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl p-0 flex flex-col">
                <SheetHeader className="px-4 pt-4 pb-2 border-b">
                  <SheetTitle>{t.legendTitle}</SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-4 py-4">{fullList}</div>
              </SheetContent>
            </Sheet>
          ) : (
            <Popover open={fullListOpen} onOpenChange={setFullListOpen}>
              <PopoverTrigger asChild>{viewAllTrigger}</PopoverTrigger>
              <PopoverContent align="start" className="w-80 max-h-80 overflow-y-auto">
                {fullList}
              </PopoverContent>
            </Popover>
          )
        )}
      </div>
    </div>
  );
}
