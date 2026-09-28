import { Check, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCrmLabels, useLeadCardTools } from '@/hooks/useCrmCardTools';

interface LeadLabelsSectionProps {
  leadId: string;
  admin?: boolean;
}

export function LeadLabelsSection({ leadId, admin = false }: LeadLabelsSectionProps) {
  const { labels, isLoading } = useCrmLabels(admin);
  const { labelIds, updateCardTools } = useLeadCardTools(leadId, admin);
  const selected = labels.filter((label) => labelIds.includes(label.id));

  const toggle = (id: string) => {
    const next = labelIds.includes(id) ? labelIds.filter((item) => item !== id) : [...labelIds, id];
    updateCardTools.mutate({ labelIds: next });
  };

  return (
    <section className="space-y-2" aria-label="Etiquetas da oportunidade">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Etiquetas</h3>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5">
              <Tag className="h-3.5 w-3.5" /> Gerenciar
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(320px,calc(100vw-2rem))] p-2">
            <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Etiquetas da oportunidade</p>
            {isLoading ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">Carregando...</p>
            ) : labels.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">Crie etiquetas nas configurações do CRM/Kanban.</p>
            ) : labels.map((label) => {
              const active = labelIds.includes(label.id);
              return (
                <button
                  type="button"
                  key={label.id}
                  onClick={() => toggle(label.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="h-3 w-8 rounded-full" style={{ backgroundColor: label.color }} />
                  <span className="min-w-0 flex-1 truncate">{label.name}</span>
                  <Check className={cn('h-4 w-4 text-primary', !active && 'invisible')} />
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>
      {selected.length ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((label) => (
            <span key={label.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: label.color }}>
              <Tag className="h-3 w-3" /> {label.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma etiqueta aplicada.</p>
      )}
    </section>
  );
}
