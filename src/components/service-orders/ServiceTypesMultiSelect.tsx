import { useMemo, useState } from 'react';
import { Check, Lock, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { fuzzyIncludes } from '@/lib/utils';

interface ServiceTypeOption {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
}

interface ServiceTypesMultiSelectProps {
  services: ServiceTypeOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Serviços usados no orçamento: só podem sair depois que a linha for removida. */
  lockedIds?: string[];
  onCreate?: () => void;
  disabled?: boolean;
}

/** Seleção explícita de vários tipos de serviço para uma única OS. */
export function ServiceTypesMultiSelect({
  services,
  selectedIds,
  onChange,
  lockedIds = [],
  onCreate,
  disabled,
}: ServiceTypesMultiSelectProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () => services.filter(service => fuzzyIncludes(service.name, search)),
    [services, search],
  );

  const toggle = (id: string, checked: boolean) => {
    onChange(
      checked
        ? [...selectedIds, id].filter((value, index, list) => list.indexOf(value) === index)
        : selectedIds.filter(selectedId => selectedId !== id),
    );
  };

  const selectedServices = selectedIds
    .map(id => services.find(service => service.id === id))
    .filter((service): service is ServiceTypeOption => !!service);

  const body = (
    <>
      <div className="border-b p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar tipo de serviço..."
            className="h-9 pl-8"
          />
        </div>
      </div>
      <ScrollArea className="max-h-[50vh]">
        <div className="p-1">
          {filtered.length === 0 ? (
            <p className="py-5 text-center text-sm text-muted-foreground">
              Nenhum serviço encontrado.
            </p>
          ) : filtered.map(service => {
            const checked = selectedIds.includes(service.id);
            return (
              <label
                key={service.id}
                className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 hover:bg-muted/50"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={value => toggle(service.id, !!value)}
                  className="mt-0.5"
                />
                <span
                  className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: service.color || '#64748b' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{service.name}</span>
                  {service.description && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {service.description}
                    </span>
                  )}
                </span>
                {checked && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
              </label>
            );
          })}
        </div>
      </ScrollArea>
    </>
  );

  const trigger = (
    <Button
      type="button"
      variant="outline"
      role="combobox"
      disabled={disabled}
      onClick={isMobile ? () => setOpen(true) : undefined}
      className={`h-10 w-full justify-center gap-2 border-dashed font-medium text-primary ${onCreate ? 'rounded-r-none' : ''}`}
    >
      <Plus className="h-4 w-4 shrink-0" />
      <span>{selectedIds.length === 0 ? 'Adicionar serviços' : 'Gerenciar serviços'}</span>
    </Button>
  );

  const createButton = onCreate && (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-10 w-10 shrink-0 rounded-l-none border-l-0 bg-muted hover:bg-primary hover:text-primary-foreground"
      onClick={onCreate}
      aria-label="Criar tipo de serviço"
      title="Criar tipo de serviço"
      disabled={disabled}
    >
      <Plus className="h-4 w-4" />
    </Button>
  );

  const selectedList = selectedServices.length > 0 && (
    <div className="space-y-2" aria-label="Serviços selecionados">
      {selectedServices.map(service => {
        const locked = lockedIds.includes(service.id);
        return (
          <div
            key={service.id}
            className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5 shadow-sm"
          >
            <span
              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: service.color || '#64748b' }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-5">{service.name}</p>
              {service.description && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{service.description}</p>
              )}
            </div>
            {locked ? (
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"
                title="Remova primeiro a linha deste serviço no orçamento"
              >
                <Lock className="h-3.5 w-3.5" />
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => toggle(service.id, false)}
                aria-label={`Remover ${service.name}`}
                title={`Remover ${service.name}`}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );

  if (isMobile) {
    return (
      <div className="space-y-2">
        {selectedList}
        <div className="flex">{trigger}{createButton}</div>
        <ResponsiveModal open={open} onOpenChange={setOpen} title="Tipos de serviço da OS">
          <div className="overflow-hidden rounded-lg border">{body}</div>
        </ResponsiveModal>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {selectedList}
      <div className="flex">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align="start" className="w-[360px] p-0">
            {body}
          </PopoverContent>
        </Popover>
        {createButton}
      </div>
    </div>
  );
}
