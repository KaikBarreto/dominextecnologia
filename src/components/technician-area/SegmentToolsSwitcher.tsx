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

interface SegmentToolsSwitcherProps {
  /** Nicho atualmente selecionado (pode diferir do da empresa). */
  selected: string;
  /** Segmento real da empresa — sempre aparece no topo e ganha o selo "Incluído". */
  companySegment: string;
  onSelect: (segment: string) => void;
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
  companySegment,
  onSelect,
}: SegmentToolsSwitcherProps) {
  const [open, setOpen] = useState(false);
  const selectedSeg = getSegment(selected);

  // Nichos do switcher = os 9 do site (com landing + ferramentas). "Outro" e os
  // legados não entram. Coloca o da empresa primeiro, demais na ordem do catálogo.
  const options = useMemo(() => {
    const list = getSiteSegments();
    return list.sort((a, b) => {
      if (a.value === companySegment) return -1;
      if (b.value === companySegment) return 1;
      return 0;
    });
  }, [companySegment]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {selectedSeg ? (
            <Badge
              className="cursor-pointer gap-1.5 border-0 text-white lg:px-3 lg:py-1.5 lg:text-sm"
              style={{ backgroundColor: selectedSeg.color }}
            >
              <selectedSeg.icon className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
              <span className="truncate">{selectedSeg.label}</span>
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
          <CommandInput placeholder="Buscar nicho..." />
          <CommandList>
            <CommandEmpty>Nenhum nicho encontrado.</CommandEmpty>
            <CommandGroup>
              {options.map((seg) => {
                const isSelected = seg.value === selected;
                const isCompany = seg.value === companySegment;
                return (
                  <CommandItem
                    key={seg.value}
                    value={seg.label}
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
                    <span className="flex-1 whitespace-normal break-words leading-snug">{seg.label}</span>
                    {isCompany && (
                      <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Incluído
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
