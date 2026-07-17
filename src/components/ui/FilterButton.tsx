import { useState, type ReactNode } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatNumber } from '@/lib/format';

/**
 * `FilterButton` — botão de filtros reusável (pattern sistema-wide).
 *
 * Visual:
 * - Botão com ícone `<Filter />` + label "Filtros" + `Badge` com contador se
 *   `activeCount > 0`.
 * - Clique abre um `Sheet` que vem da direita no desktop e de baixo no mobile
 *   (padrão Dominex de modal mobile = drawer de baixo).
 * - Header do Sheet mostra o título "Filtros" e um botão "Limpar tudo" só
 *   quando há filtros ativos. Limpar dispara `onClear` (responsabilidade do
 *   caller — cada tela controla seu próprio estado).
 *
 * Onde usar:
 * - Qualquer tela de listagem com múltiplos filtros (CRM, OS, Agenda,
 *   Equipamentos, Funcionários etc). Cada Dev de domínio coloca os controles
 *   de filtro como `children`. O `FilterButton` só gerencia o trigger, o
 *   contador, o sheet e a ação de limpar — **não** sabe nada sobre os filtros
 *   em si.
 *
 * Por quê reusável:
 * - Garante visual e UX iguais em todas as telas (CEO requisito 2026-05-23).
 * - Mobile-first: drawer de baixo segue a memory `feedback_modais_mobile_sao_drawer`.
 */
interface FilterButtonProps {
  /** Quantos filtros estão ativos. Mostra `Badge` com este número se > 0. */
  activeCount: number;
  /** Disparado ao clicar "Limpar tudo". Caller reseta seu estado. */
  onClear: () => void;
  /** Selects / inputs / pickers de filtro renderizados dentro do sheet. */
  children: ReactNode;
  /** Label opcional do botão (default: "Filtros", traduzido pelo locale do app). */
  label?: string;
  /** className extra do botão trigger. */
  className?: string;
}

export function FilterButton({
  activeCount,
  onClear,
  children,
  label,
  className,
}: FilterButtonProps) {
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.common;
  const resolvedLabel = label ?? t.filters.title;
  const [open, setOpen] = useState(false);
  const hasActive = activeCount > 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'relative gap-2 h-9',
            hasActive && 'border-primary text-primary',
            className,
          )}
        >
          <Filter className="h-4 w-4" />
          <span>{resolvedLabel}</span>
          {hasActive && (
            <Badge
              variant="default"
              className="h-5 min-w-5 px-1.5 ml-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold"
            >
              {formatNumber(activeCount, locale)}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'p-0 flex flex-col',
          isMobile
            ? 'h-[85dvh] rounded-t-2xl border-t'
            : 'w-full sm:max-w-md',
        )}
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="text-base font-semibold flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              {resolvedLabel}
            </SheetTitle>
            {hasActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="h-8 text-xs gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <X className="h-3.5 w-3.5" />
                {t.filters.clearAll}
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {children}
        </div>

        <div className="px-5 py-3 border-t bg-background">
          <Button
            className="w-full"
            onClick={() => setOpen(false)}
          >
            {hasActive
              ? t.filters.applyCount.replace('{count}', formatNumber(activeCount, locale))
              : t.close}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
