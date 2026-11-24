import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getSiteSegments, getSegment } from '@/utils/companySegments';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface SegmentToolsSwitcherProps {
  /** Nicho atualmente selecionado (pode diferir do da empresa). */
  selected: string;
  /** Segmentos contratados — aparecem primeiro e ganham o selo "Incluído". */
  companySegments: string[];
  onSelect: (segment: string) => void;
  /** Ferramenta aberta: mantém a troca de segmento em uma única faixa no celular. */
  compactOnMobile?: boolean;
}

/**
 * Seletor de nichos no header das Área do Técnico™. O trigger é o badge
 * colorido do nicho selecionado (mesma cara do SegmentBadge) + chevron. Abre um
 * Popover + Command listando todos os nichos (menos "Outro"), com o nicho da
 * empresa no topo. Trocar pra um nicho que não é o da empresa dispara o upsell
 * na tela (a renderização condicional fica no container).
 */
export function SegmentToolsSwitcher({
  selected,
  companySegments,
  onSelect,
  compactOnMobile = false,
}: SegmentToolsSwitcherProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools.home;
  const segmentLabels = MESSAGES[locale].app.technicianTools.segments;
  const [open, setOpen] = useState(false);
  const selectedSeg = getSegment(selected);
  const selectedLabel = selectedSeg
    ? segmentLabels[selectedSeg.value as keyof typeof segmentLabels] ?? selectedSeg.label
    : t.segmentSearch;

  // Nichos do switcher = os 9 do site (com landing + ferramentas). "Outro" e os
  // legados não entram. Coloca o da empresa primeiro, demais na ordem do catálogo.
  const options = useMemo(() => {
    const list = getSiteSegments();
    return list.sort((a, b) => {
      const aIndex = companySegments.indexOf(a.value);
      const bIndex = companySegments.indexOf(b.value);
      if (aIndex >= 0 && bIndex < 0) return -1;
      if (bIndex >= 0 && aIndex < 0) return 1;
      if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
      return 0;
    });
  }, [companySegments]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t.segmentSearch}: ${selectedLabel}`}
          title={selectedLabel}
          className="inline-flex min-h-11 max-w-full shrink-0 items-center rounded-full transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {selectedSeg ? (
            <Badge
              className={cn('max-w-full cursor-pointer gap-1.5 border-0 px-3 py-1.5 text-sm text-white', compactOnMobile && 'h-9 w-[52px] justify-center px-2 sm:h-auto sm:w-auto sm:px-3')}
              style={{ backgroundColor: selectedSeg.color }}
            >
              <selectedSeg.icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className={cn('truncate', compactOnMobile && 'hidden sm:inline')}>
                {selectedLabel}
              </span>
              <ChevronDown className="h-3 w-3 opacity-80 lg:h-3.5 lg:w-3.5" />
            </Badge>
          ) : null}
        </button>
      </PopoverTrigger>
      {/* z-[70]: o overlay embutido das Ferramentas (na OS) é `fixed z-[60]` e
          opaco. O PopoverContent é portado pro <body> (fora do stacking do
          overlay), então no z-50 padrão ele abre ATRÁS do overlay e o dropdown
          some. Subir pra z-[70] o coloca acima do overlay. No modo rota não há
          overlay, então é inofensivo (não regride). */}
      <PopoverContent align="start" className="z-[70] w-[260px] p-0 sm:w-[320px]">
        <Command>
          <CommandInput placeholder={t.segmentSearch} />
          <CommandList>
            <CommandEmpty>{t.segmentNotFound}</CommandEmpty>
            <CommandGroup>
              {options.map((seg) => {
                const isSelected = seg.value === selected;
                const isCompany = companySegments.includes(seg.value);
                return (
                  <CommandItem
                    key={seg.value}
                    value={segmentLabels[seg.value as keyof typeof segmentLabels] ?? seg.label}
                    onSelect={() => {
                      onSelect(seg.value);
                      setOpen(false);
                    }}
                    className="items-start gap-2"
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: seg.color }}
                    >
                      <seg.icon className="h-3 w-3 text-white" />
                    </span>
                    <span className="flex-1 whitespace-normal break-words leading-snug">
                      {segmentLabels[seg.value as keyof typeof segmentLabels] ?? seg.label}
                    </span>
                    {isCompany && (
                      <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t.segmentIncluded}
                      </span>
                    )}
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isCompany ? 'ml-2' : 'ml-auto',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
