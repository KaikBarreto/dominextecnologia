import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface ServiceOption {
  id: string;
  name: string;
  color?: string | null;
}

interface ServicesMultiSelectProps {
  services: ServiceOption[];
  /** IDs vinculados. Vazio = aplica a TODOS os serviços. */
  selectedIds: string[];
  /** Persiste a nova seleção (mesma lógica de salvar do chamador). */
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

/**
 * Combobox multi (busca + checkboxes) pra escolher em quais serviços o checklist
 * aparece. "Todos" no topo marca/desmarca tudo; vazio = aplica a todos (regra do
 * checklist). Discreto, encostado à direita, sem card/borda em volta. No mobile
 * abre como drawer (ResponsiveModal).
 */
export function ServicesMultiSelect({ services, selectedIds, onChange, disabled }: ServicesMultiSelectProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.servicesMultiSelect;
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const activeServices = services;
  const appliesToAll = selectedIds.length === 0;

  const filtered = useMemo(() => {
    if (!search) return activeServices;
    const q = search.toLowerCase();
    return activeServices.filter(s => s.name.toLowerCase().includes(q));
  }, [activeServices, search]);

  // "Todos marcados" pra UI = aplica a todos (vazio) OU tem todos os ids.
  const allChecked = appliesToAll || (activeServices.length > 0 && selectedIds.length >= activeServices.length);

  // Marcar/desmarcar "Todos": marcado → vazio (aplica a todos);
  // desmarcado → seleciona o primeiro serviço (sai do estado "todos").
  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      onChange([]); // aplica a todos
    } else {
      const first = activeServices[0];
      onChange(first ? [first.id] : []);
    }
  };

  const toggleService = (id: string, checked: boolean) => {
    if (appliesToAll) {
      // Estava em "todos": desmarcar UM = selecionar todos menos esse.
      if (!checked) {
        onChange(activeServices.filter(s => s.id !== id).map(s => s.id));
      }
      return;
    }
    const next = checked ? [...selectedIds, id] : selectedIds.filter(sid => sid !== id);
    // Se sobrou nenhum, mantém vazio = aplica a todos (sem checklist órfão).
    onChange(next);
  };

  const isServiceChecked = (id: string) => appliesToAll || selectedIds.includes(id);

  const summary = appliesToAll
    ? t.allServices
    : selectedIds.length === 1
      ? activeServices.find(s => s.id === selectedIds[0])?.name ?? t.summaryOne.replace('{name}', '')
      : t.summaryN.replace('{n}', String(selectedIds.length));

  const body = (
    <>
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>
      <ScrollArea className="max-h-[50vh]">
        <div className="p-1">
          {/* Todos */}
          <label className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-muted/50 cursor-pointer font-medium">
            <Checkbox checked={allChecked} onCheckedChange={(c) => handleToggleAll(!!c)} />
            <span className="text-sm">{t.allServices}</span>
          </label>
          <div className="my-1 h-px bg-border" />
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t.noneFound}</p>
          ) : (
            filtered.map(s => (
              <label
                key={s.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox
                  checked={isServiceChecked(s.id)}
                  onCheckedChange={(c) => toggleService(s.id, !!c)}
                />
                {s.color && (
                  <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                )}
                <span className="text-sm">{s.name}</span>
                {isServiceChecked(s.id) && <Check className="ml-auto h-4 w-4 text-primary shrink-0" />}
              </label>
            ))
          )}
        </div>
      </ScrollArea>
    </>
  );

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      role="combobox"
      disabled={disabled}
      className="h-8 justify-between font-normal max-w-[220px] text-muted-foreground"
      onClick={isMobile ? () => setOpen(true) : undefined}
    >
      <span className="truncate">{summary}</span>
      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <ResponsiveModal open={open} onOpenChange={setOpen} title={t.modalTitle}>
          <div className="rounded-lg border overflow-hidden">{body}</div>
        </ResponsiveModal>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-0">
        {body}
      </PopoverContent>
    </Popover>
  );
}
